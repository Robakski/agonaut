"""
Sumsub KYC Integration — automated identity verification.

Flow:
1. Frontend calls POST /api/v1/kyc/sumsub/token with wallet address
2. Backend creates an applicant in Sumsub (or retrieves existing)
3. Backend generates an access token for the WebSDK
4. Frontend renders Sumsub WebSDK with the token
5. User completes verification in the embedded widget
6. Sumsub sends webhook to POST /api/v1/kyc/sumsub/webhook
7. Backend updates KYC status in our DB

Requires in .env:
  SUMSUB_APP_TOKEN=<your app token>
  SUMSUB_SECRET_KEY=<your secret key>
  SUMSUB_WEBHOOK_SECRET=<webhook secret for signature verification>
  SUMSUB_LEVEL_NAME=basic-kyc-level  (or your configured level name)
"""

import hashlib
import hmac
import json
import logging
import os
import time
from typing import Optional

import requests

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────
SUMSUB_APP_TOKEN = os.environ.get("SUMSUB_APP_TOKEN", "")
SUMSUB_SECRET_KEY = os.environ.get("SUMSUB_SECRET_KEY", "")
SUMSUB_WEBHOOK_SECRET = os.environ.get("SUMSUB_WEBHOOK_SECRET", "")
SUMSUB_LEVEL_NAME = os.environ.get("SUMSUB_LEVEL_NAME", "id-and-liveness")
SUMSUB_BASE_URL = "https://api.sumsub.com"

# For sandbox/testing, use:
# SUMSUB_BASE_URL = "https://api.sumsub.com"  (same URL, sandbox controlled by dashboard settings)


def _sign_request(method: str, url: str, body: bytes = b"") -> dict:
    """
    Generate Sumsub API request headers with HMAC signature.
    Sumsub uses a time-based HMAC-SHA256 signature scheme.
    """
    ts = str(int(time.time()))
    # The signature payload is: ts + method + url_path + body
    # url_path = everything after the host
    path = url.replace(SUMSUB_BASE_URL, "")
    sig_payload = ts.encode() + method.upper().encode() + path.encode() + body
    signature = hmac.new(
        SUMSUB_SECRET_KEY.encode(),
        sig_payload,
        hashlib.sha256
    ).hexdigest()

    return {
        "X-App-Token": SUMSUB_APP_TOKEN,
        "X-App-Access-Sig": signature,
        "X-App-Access-Ts": ts,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def is_configured() -> bool:
    """Check if Sumsub credentials are configured."""
    return bool(SUMSUB_APP_TOKEN and SUMSUB_SECRET_KEY)


# ── Applicant Management ───────────────────────────────────────────

def create_applicant(wallet_address: str) -> Optional[dict]:
    """
    Create a Sumsub applicant for a wallet address.
    Uses the wallet address as the externalUserId (unique identifier).
    Returns the applicant object or None on failure.
    """
    if not is_configured():
        logger.error("Sumsub not configured")
        return None

    url = f"{SUMSUB_BASE_URL}/resources/applicants?levelName={SUMSUB_LEVEL_NAME}"
    body = json.dumps({
        "externalUserId": wallet_address.lower(),
        "type": "individual",
    }).encode()

    headers = _sign_request("POST", url, body)

    try:
        resp = requests.post(url, data=body, headers=headers, timeout=15)
        if resp.status_code == 200 or resp.status_code == 201:
            data = resp.json()
            logger.info(f"Sumsub applicant created: {data.get('id')} for {wallet_address}")
            return data
        elif resp.status_code == 409:
            # Applicant already exists — retrieve it
            logger.info(f"Sumsub applicant already exists for {wallet_address}, retrieving...")
            return get_applicant(wallet_address)
        else:
            logger.error(f"Sumsub create applicant failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        logger.error(f"Sumsub API error: {e}")
        return None


def get_applicant(wallet_address: str) -> Optional[dict]:
    """Get an existing applicant by external user ID (wallet address)."""
    if not is_configured():
        return None

    url = f"{SUMSUB_BASE_URL}/resources/applicants/-;externalUserId={wallet_address.lower()}/one"
    headers = _sign_request("GET", url)

    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code == 200:
            return resp.json()
        logger.warning(f"Sumsub get applicant failed: {resp.status_code}")
        return None
    except Exception as e:
        logger.error(f"Sumsub API error: {e}")
        return None


def get_applicant_status(wallet_address: str) -> Optional[str]:
    """
    Get the review status of an applicant.
    Returns: 'init', 'pending', 'queued', 'completed', 'onHold', or None.
    """
    applicant = get_applicant(wallet_address)
    if not applicant:
        return None

    review = applicant.get("review", {})
    return review.get("reviewStatus", "init")


# ── Access Token for WebSDK ────────────────────────────────────────

def generate_access_token(wallet_address: str) -> Optional[dict]:
    """
    Generate a time-limited access token for the Sumsub WebSDK.
    The frontend uses this token to render the verification widget.
    Returns {"token": "...", "userId": "..."} or None on failure.
    """
    if not is_configured():
        logger.error("Sumsub not configured")
        return None

    # Ensure applicant exists
    applicant = create_applicant(wallet_address)
    if not applicant:
        return None

    user_id = wallet_address.lower()
    url = f"{SUMSUB_BASE_URL}/resources/accessTokens?userId={user_id}&levelName={SUMSUB_LEVEL_NAME}"
    headers = _sign_request("POST", url)

    try:
        resp = requests.post(url, headers=headers, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            logger.info(f"Sumsub access token generated for {wallet_address}")
            return {
                "token": data.get("token"),
                "userId": user_id,
            }
        else:
            logger.error(f"Sumsub access token failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        logger.error(f"Sumsub API error: {e}")
        return None


# ── Webhook Verification ───────────────────────────────────────────

def verify_webhook_signature(body: bytes, signature: str) -> bool:
    """
    Verify the webhook signature from Sumsub.
    Sumsub signs webhooks with HMAC-SHA1 using the webhook secret.
    """
    if not SUMSUB_WEBHOOK_SECRET:
        logger.warning("Sumsub webhook secret not configured — accepting all webhooks (UNSAFE)")
        return True

    expected = hmac.new(
        SUMSUB_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


def parse_webhook(payload: dict) -> Optional[dict]:
    """
    Parse a Sumsub webhook payload and extract relevant KYC status info.
    
    Key event types:
    - applicantReviewed: verification complete (approved or rejected)
    - applicantPending: submitted, awaiting review
    - applicantCreated: applicant first created
    - applicantOnHold: needs manual review
    
    Returns: {"wallet": "0x...", "status": "VERIFIED|REJECTED|PENDING", "reason": "..."}
    """
    event_type = payload.get("type", "")
    applicant_id = payload.get("applicantId", "")
    external_user_id = payload.get("externalUserId", "")
    review_result = payload.get("reviewResult", {})
    review_status = payload.get("reviewStatus", "")

    wallet = external_user_id  # We use wallet address as externalUserId

    if not wallet:
        logger.warning(f"Sumsub webhook missing externalUserId: {payload}")
        return None

    if event_type == "applicantReviewed":
        label = review_result.get("reviewAnswer", "")
        if label == "GREEN":
            return {"wallet": wallet, "status": "VERIFIED", "reason": ""}
        else:
            reject_labels = review_result.get("rejectLabels", [])
            reason = ", ".join(reject_labels) if reject_labels else "Verification failed"
            return {"wallet": wallet, "status": "REJECTED", "reason": reason}

    elif event_type == "applicantPending":
        return {"wallet": wallet, "status": "PENDING", "reason": ""}

    elif event_type == "applicantOnHold":
        return {"wallet": wallet, "status": "PENDING", "reason": "Manual review required"}

    else:
        logger.info(f"Sumsub webhook event ignored: {event_type}")
        return None
