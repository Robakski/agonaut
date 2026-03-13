"""
Compliance API Routes

KYC verification status, sanctions check, and compliance endpoints.
"""

import sys
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

# Add compliance module
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "compliance"))

from sanctions import screen_user
from kyc_tiers import KYCManager, KYCTier

router = APIRouter(prefix="/compliance", tags=["compliance"])

kyc_manager = KYCManager()


# ── Models ──

class ScreeningRequest(BaseModel):
    address: str
    action: str = "check"


class ScreeningResponse(BaseModel):
    address: str
    blocked: bool
    edd_required: bool
    risk_level: str
    reason: str


class KYCStatusResponse(BaseModel):
    address: str
    current_tier: int
    tier_name: str
    verified: bool
    cumulative_volume_eur: float
    cumulative_payouts_eur: float


class KYCCheckResponse(BaseModel):
    address: str
    action: str
    allowed: bool
    reason: str
    required_tier: int
    current_tier: int


# ── Routes ──

@router.post("/screen", response_model=ScreeningResponse)
async def screen_wallet(req: ScreeningRequest):
    """Screen a wallet address against sanctions lists.

    Returns blocked status, EDD requirement, and risk level.
    Every wallet interaction on the platform runs this automatically
    via middleware — this endpoint is for explicit pre-checks.
    """
    result = screen_user(req.address, req.action)
    return ScreeningResponse(
        address=req.address,
        blocked=result.blocked,
        edd_required=result.edd_required,
        risk_level=result.risk_level,
        reason=result.reason,
    )


@router.get("/kyc/{address}", response_model=KYCStatusResponse)
async def get_kyc_status(address: str):
    """Get KYC verification status for a wallet."""
    status = kyc_manager.get_status(address)
    tier_names = {0: "None", 1: "Basic", 2: "Enhanced", 3: "Entity"}
    return KYCStatusResponse(
        address=address,
        current_tier=status.current_tier,
        tier_name=tier_names.get(status.current_tier, "Unknown"),
        verified=status.current_tier > 0,
        cumulative_volume_eur=status.cumulative_volume_eur,
        cumulative_payouts_eur=status.cumulative_payouts_eur,
    )


@router.post("/kyc/check", response_model=KYCCheckResponse)
async def check_kyc_for_action(address: str, action: str, amount_eur: float = 0):
    """Check if a wallet's KYC tier allows a specific action.

    Actions: register, create_bounty, create_large_bounty, claim_payout_small,
    claim_payout_large, enter_bounty
    """
    allowed, reason = kyc_manager.check_action(address, action, amount_eur)
    required = kyc_manager.required_tier(address, action, amount_eur)
    status = kyc_manager.get_status(address)

    return KYCCheckResponse(
        address=address,
        action=action,
        allowed=allowed,
        reason=reason,
        required_tier=required,
        current_tier=status.current_tier,
    )


@router.get("/blocked-jurisdictions")
async def list_blocked_jurisdictions():
    """List all blocked and EDD-required jurisdictions.

    Transparency: users can see which countries are blocked before connecting.
    """
    from sanctions import BLOCKED_JURISDICTIONS, EDD_JURISDICTIONS
    return {
        "blocked": [
            {"code": k, "name": v} for k, v in BLOCKED_JURISDICTIONS.items()
        ],
        "enhanced_due_diligence": [
            {"code": k, "name": v} for k, v in EDD_JURISDICTIONS.items()
        ],
    }
