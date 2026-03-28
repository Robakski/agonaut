"""
TEE Proxy Endpoints — Backend relays requests to/from the TEE scoring service.

The backend NEVER sees plaintext. It forwards encrypted blobs between
the frontend and TEE. This is a dumb pipe — no decryption capability.

Security:
  - G2: Entry fee verification (on-chain isParticipant check) before serving problems
  - G3: TEE restart recovery (re-store problem from sponsor if TEE lost it)
  - G4: Rate limiting on TEE proxy endpoints (stricter than default)

Endpoints:
  GET  /tee/public-key     → Returns TEE's ECIES public key
  POST /tee/store-problem   → Forward encrypted problem to TEE
  POST /tee/agent-problem   → Forward agent's request to TEE, return encrypted problem
"""

import hashlib
import hmac as _hmac
import logging
import os
import time
from collections import defaultdict

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(tags=["tee"])

SCORING_URL = os.environ.get("SCORING_SERVICE_URL", "http://127.0.0.1:8001")
SCORING_HMAC_SECRET = os.environ.get("SCORING_HMAC_SECRET", "")


def _sign_request(body: bytes = b"") -> dict:
    """Generate HMAC-SHA256 auth headers for scoring service requests."""
    if not SCORING_HMAC_SECRET:
        return {}
    timestamp = str(int(time.time()))
    msg = timestamp.encode() + body
    signature = _hmac.new(SCORING_HMAC_SECRET.encode(), msg, hashlib.sha256).hexdigest()
    return {"X-Scoring-Timestamp": timestamp, "X-Scoring-Signature": signature}


# ── G4: Simple in-memory rate limiting for TEE endpoints ──
# Stricter than the global 60/min: 10/min for store, 20/min for agent-problem
_rate_buckets: dict[str, list[float]] = defaultdict(list)

def _check_rate(key: str, limit: int, window: int = 60) -> bool:
    """Return True if within rate limit, False if exceeded."""
    now = time.time()
    bucket = _rate_buckets.get(key, [])
    # Prune old entries
    bucket = [t for t in bucket if now - t < window]
    if len(bucket) >= limit:
        _rate_buckets[key] = bucket
        return False
    bucket.append(now)
    _rate_buckets[key] = bucket

    # Periodic cleanup: remove empty buckets (every ~100 calls)
    if len(_rate_buckets) > 200:
        empty_keys = [k for k, v in _rate_buckets.items() if not v]
        for k in empty_keys:
            del _rate_buckets[k]

    return True

def _get_client_ip(request: Request) -> str:
    """Get client IP from CF header or fallback."""
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


@router.get("/tee/attestation")
async def get_tee_attestation():
    """Proxy: Return TEE remote attestation report.

    This is the root of trust for zero-knowledge claims. Anyone can verify:
    1. mode = "tdx" → hardware TEE (cryptographically guaranteed)
    2. mode = "development" → VPS (trust-the-operator, NOT zero-knowledge)
    3. For "tdx": submit tdx_quote to Phala Trust Center for full verification
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{SCORING_URL}/tee/attestation", timeout=10, headers=_sign_request())
            if resp.status_code != 200:
                raise HTTPException(503, "TEE attestation unavailable")
            return resp.json()
    except httpx.ConnectError:
        raise HTTPException(503, "TEE service not running")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch TEE attestation: {e}")
        raise HTTPException(503, f"TEE service error: {str(e)}")


@router.get("/tee/public-key")
async def get_tee_public_key():
    """Proxy: Return TEE's ECIES public key.

    Frontend fetches this to encrypt problems and solutions FOR the TEE.
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{SCORING_URL}/tee/public-key", timeout=5, headers=_sign_request())
            if resp.status_code != 200:
                raise HTTPException(503, "TEE service unavailable")
            return resp.json()
    except httpx.ConnectError:
        raise HTTPException(503, "TEE service not running")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch TEE public key: {e}")
        raise HTTPException(503, f"TEE service error: {str(e)}")


class StoreProblemProxyRequest(BaseModel):
    round_address: str
    encrypted_problem: dict
    encrypted_rubric: dict | None = None
    sponsor_public_key: str
    problem_window_hours: int = 48


@router.post("/tee/store-problem")
async def store_problem_proxy(req: StoreProblemProxyRequest, request: Request):
    """Proxy: Forward encrypted problem to TEE for storage.

    Backend stores nothing — just relays the encrypted blob to TEE.
    TEE decrypts inside enclave and holds plaintext.

    Security:
    - A7-5: Verify round exists in bounty index (prevents arbitrary round injection)
    - G4: Rate limited to 10/min per IP (creating private bounties is infrequent)
    """
    # G4: Rate limit
    ip = _get_client_ip(request)
    if not _check_rate(f"store:{ip}", limit=10, window=60):
        raise HTTPException(429, "Rate limit exceeded for problem storage")

    # A7-5: Verify round exists and is a legitimate bounty
    try:
        from services.bounty_index import find_by_round
        bounty = find_by_round(req.round_address)
        if not bounty:
            raise HTTPException(404, "Round address not found in bounty index")
        if bounty.get("phase") not in ("CREATED", "FUNDED", None):
            raise HTTPException(400, "Problem can only be stored for rounds in CREATED or FUNDED phase (before agents enter)")
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Bounty index check failed: {e}")
        # Fail-open for index issues (TEE itself is the security boundary)

    try:
        async with httpx.AsyncClient() as client:
            import json as _json
            body_bytes = _json.dumps(req.model_dump()).encode()
            resp = await client.post(
                f"{SCORING_URL}/tee/store-problem",
                content=body_bytes,
                headers={**_sign_request(body_bytes), "Content-Type": "application/json"},
                timeout=10,
            )
            if resp.status_code != 200:
                raise HTTPException(resp.status_code, resp.text)
            return resp.json()
    except httpx.ConnectError:
        raise HTTPException(503, "TEE service not running")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to store problem in TEE: {e}")
        raise HTTPException(503, f"TEE service error: {str(e)}")


class AgentProblemProxyRequest(BaseModel):
    round_address: str
    agent_public_key: str
    agent_address: str


@router.post("/tee/agent-problem")
async def agent_problem_proxy(req: AgentProblemProxyRequest, request: Request):
    """Proxy: Forward agent's problem request to TEE.

    TEE re-encrypts problem FOR this specific agent.
    Backend sees only encrypted blobs (can't decrypt).

    G2: Verifies agent paid entry fee on-chain (isParticipant) before forwarding.
    G4: Rate limited to 20/min per IP.
    """
    # G4: Rate limit
    ip = _get_client_ip(request)
    if not _check_rate(f"agent-problem:{ip}", limit=20, window=60):
        raise HTTPException(429, "Rate limit exceeded for problem requests")

    # G2: Verify agent has entered the round (paid entry fee) on-chain
    try:
        from services.chain import get_chain_service
        chain = get_chain_service()
        is_participant = chain.has_agent_committed(req.round_address, req.agent_address)
        if not is_participant:
            logger.warning(
                f"Agent {req.agent_address[:10]}... requested problem for "
                f"round {req.round_address[:10]}... but is NOT a participant"
            )
            raise HTTPException(
                403,
                "Access denied: you must enter this round (pay entry fee) "
                "before accessing the problem. Call BountyRound.enter() first."
            )
    except HTTPException:
        raise
    except Exception as e:
        # G2: Fail-closed — if we can't verify, deny access
        logger.error(f"On-chain participation check failed: {e}")
        raise HTTPException(
            503,
            "Unable to verify on-chain participation. Please try again later."
        )

    # Forward to TEE
    try:
        async with httpx.AsyncClient() as client:
            import json as _json
            body_bytes = _json.dumps(req.model_dump()).encode()
            resp = await client.post(
                f"{SCORING_URL}/tee/agent-problem",
                content=body_bytes,
                headers={**_sign_request(body_bytes), "Content-Type": "application/json"},
                timeout=10,
            )

            # G3: If TEE returns 404 (problem not found — possible restart),
            # return a clear error so the frontend can prompt the sponsor to re-store
            if resp.status_code == 404:
                logger.warning(
                    f"TEE has no problem for round {req.round_address[:10]}... "
                    f"(possible TEE restart). Agent: {req.agent_address[:10]}..."
                )
                raise HTTPException(
                    404,
                    "Problem not available in TEE. The problem may have expired "
                    "or the TEE was restarted. The sponsor may need to re-encrypt "
                    "and re-submit the problem."
                )

            if resp.status_code != 200:
                raise HTTPException(resp.status_code, resp.text)
            return resp.json()
    except httpx.ConnectError:
        raise HTTPException(503, "TEE service not running")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get problem for agent: {e}")
        raise HTTPException(503, f"TEE service error: {str(e)}")
