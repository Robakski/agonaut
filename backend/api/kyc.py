"""
KYC API — identity verification endpoints.

Public endpoints:
- GET /kyc/status?wallet=0x...  → check KYC status (NONE/PENDING/VERIFIED/REJECTED)
- POST /kyc/submit              → submit KYC data for review

Admin endpoints (require ADMIN_KEY):
- GET /kyc/pending              → list pending submissions
- GET /kyc/detail/{id}          → view decrypted submission
- POST /kyc/review              → approve/reject submission
- GET /kyc/audit/{wallet}       → full audit trail
"""

import logging
from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field
from typing import Optional

from services.kyc import (
    get_kyc_status,
    submit_kyc,
    review_kyc,
    list_pending,
    get_submission_detail,
    get_audit_log,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/kyc", tags=["KYC"])


# ── Models ─────────────────────────────────────────────────────────

class KycSubmitRequest(BaseModel):
    wallet: str = Field(..., min_length=42, max_length=42)
    full_name: str = Field(..., min_length=2, max_length=200)
    country: str = Field(..., min_length=2, max_length=3)  # ISO 3166-1 alpha-2/3
    document_type: str = Field(..., pattern="^(passport|national_id|drivers_license)$")
    document_id: str = Field(..., min_length=4, max_length=50)
    email: str = Field(..., min_length=5, max_length=254)


class KycReviewRequest(BaseModel):
    submission_id: int = Field(..., ge=1)
    approved: bool
    reason: str = Field("", max_length=500)


# ── Public Endpoints ───────────────────────────────────────────────

@router.get("/status")
async def kyc_status(wallet: str = Query(..., min_length=42, max_length=42)):
    """
    Check KYC verification status for a wallet.
    Returns: NONE (never submitted), PENDING, VERIFIED, or REJECTED.
    """
    if not wallet.startswith("0x"):
        raise HTTPException(status_code=400, detail="Invalid wallet address")

    status = get_kyc_status(wallet)
    return status


@router.post("/submit")
async def kyc_submit(req: KycSubmitRequest, request: Request):
    """
    Submit KYC data for admin review. PII is encrypted at rest.
    Requires wallet to not already have a PENDING or VERIFIED submission.
    """
    if not req.wallet.startswith("0x"):
        raise HTTPException(status_code=400, detail="Invalid wallet address")

    # Basic email validation
    if "@" not in req.email or "." not in req.email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")

    result = submit_kyc(
        wallet=req.wallet,
        full_name=req.full_name,
        country=req.country,
        document_type=req.document_type,
        document_id=req.document_id,
        email=req.email,
        ip_address=ip,
        user_agent=ua,
    )

    if "error" in result:
        raise HTTPException(status_code=409, detail=result["error"])

    logger.info(f"KYC submitted for {req.wallet} from {req.country}")
    return result


# ── Admin Endpoints ────────────────────────────────────────────────
# Auth handled by SecurityMiddleware (ADMIN_KEY check on /api/v1/kyc/pending etc.)

@router.get("/pending")
async def kyc_pending_list(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List pending KYC submissions for admin review."""
    return {"submissions": list_pending(limit, offset)}


@router.get("/detail/{submission_id}")
async def kyc_detail(submission_id: int):
    """View full decrypted KYC submission (admin only)."""
    detail = get_submission_detail(submission_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Submission not found")
    return detail


@router.post("/review")
async def kyc_review(req: KycReviewRequest, request: Request):
    """Approve or reject a KYC submission (admin only)."""
    admin = request.headers.get("x-admin-key", "admin")
    result = review_kyc(req.submission_id, req.approved, admin, req.reason)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    action = "approved" if req.approved else "rejected"
    logger.info(f"KYC {action} for submission {req.submission_id}")
    return result


@router.get("/audit/{wallet}")
async def kyc_audit(wallet: str):
    """Get full audit trail for a wallet (admin only)."""
    if not wallet.startswith("0x") or len(wallet) != 42:
        raise HTTPException(status_code=400, detail="Invalid wallet address")
    return {"wallet": wallet, "audit_log": get_audit_log(wallet)}
