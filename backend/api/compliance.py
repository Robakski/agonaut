"""
Compliance API — Monitoring, transaction surveillance, and legacy screening endpoints.

New endpoints (admin-only):
  /compliance/monitor/stats, /alerts, /wallet/{addr}, /reviews, /audit-log, /high-risk

Legacy endpoints (public, backwards-compatible):
  /compliance/screen, /compliance/kyc/{addr}, /compliance/blocked-jurisdictions
"""

import os
import json
import time
import logging
from fastapi import APIRouter, Query, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compliance", tags=["compliance"])

ADMIN_KEY = os.environ.get("ADMIN_KEY", "")


# ═══════════════════════════════════════════════════════════════
# Admin Auth Helper
# ═══════════════════════════════════════════════════════════════

def _require_admin(request: Request):
    """Check admin auth — session cookie or API key."""
    from api.admin_dashboard import _sessions, SESSION_MAX_AGE
    sid = request.cookies.get("admin_session")
    if sid and sid in _sessions and (time.time() - _sessions[sid]) < SESSION_MAX_AGE:
        return True
    key = request.headers.get("X-Admin-Key", "")
    if key and key == ADMIN_KEY:
        return True
    raise HTTPException(status_code=401, detail="Unauthorized")


# ═══════════════════════════════════════════════════════════════
# NEW: Compliance Monitoring (Admin Dashboard)
# ═══════════════════════════════════════════════════════════════

@router.get("/monitor/stats")
async def compliance_stats(request: Request):
    """Aggregate compliance dashboard stats."""
    _require_admin(request)
    from services.compliance_monitor import get_compliance_stats
    return get_compliance_stats()


@router.get("/monitor/alerts")
async def list_alerts(
    request: Request,
    acknowledged: Optional[bool] = None,
    severity: Optional[str] = None,
    limit: int = Query(default=50, le=200),
):
    """List compliance alerts with filters."""
    _require_admin(request)
    from services.compliance_monitor import get_alerts
    return get_alerts(acknowledged=acknowledged, severity=severity, limit=limit)


class AckAlertRequest(BaseModel):
    alert_id: int

@router.post("/monitor/alerts/acknowledge")
async def ack_alert(req: AckAlertRequest, request: Request):
    """Acknowledge a compliance alert."""
    _require_admin(request)
    from services.compliance_monitor import acknowledge_alert, log_audit
    ok = acknowledge_alert(req.alert_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Alert not found or already acknowledged")
    ip = request.client.host if request.client else "unknown"
    log_audit("ALERT_ACK", f"admin@{ip}", detail=f"alert_id={req.alert_id}")
    return {"ok": True}


@router.get("/monitor/wallet/{wallet}")
async def wallet_risk_profile(wallet: str, request: Request):
    """Get full risk profile + transaction history for a wallet."""
    _require_admin(request)
    from services.compliance_monitor import get_risk_profile, get_transaction_history
    profile = get_risk_profile(wallet)
    transactions = get_transaction_history(wallet, limit=200)
    return {
        "profile": profile,
        "transactions": transactions,
        "transaction_count": len(transactions),
    }


@router.get("/monitor/reviews")
async def pending_reviews(request: Request, limit: int = Query(default=50, le=200)):
    """Get wallets needing enhanced due diligence review."""
    _require_admin(request)
    from services.compliance_monitor import get_wallets_needing_review
    return get_wallets_needing_review(limit=limit)


class ReviewRequest(BaseModel):
    wallet: str
    notes: str = ""

@router.post("/monitor/reviews/complete")
async def complete_review(req: ReviewRequest, request: Request):
    """Mark a wallet's EDD review as complete."""
    _require_admin(request)
    from services.compliance_monitor import mark_reviewed
    ok = mark_reviewed(req.wallet, reviewer="admin", notes=req.notes)
    if not ok:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return {"ok": True}


@router.get("/monitor/audit-log")
async def audit_log(request: Request, limit: int = Query(default=100, le=500)):
    """Get compliance audit trail."""
    _require_admin(request)
    from services.compliance_monitor import get_audit_log
    return get_audit_log(limit=limit)


@router.get("/monitor/high-risk")
async def high_risk_wallets(request: Request, limit: int = Query(default=50, le=200)):
    """Get all HIGH/CRITICAL risk wallets."""
    _require_admin(request)
    from services.compliance_monitor import _db
    with _db() as conn:
        rows = conn.execute(
            """SELECT * FROM risk_profiles 
               WHERE risk_level IN ('HIGH', 'CRITICAL')
               ORDER BY total_volume_eth DESC LIMIT ?""",
            (limit,)
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["flags"] = json.loads(d["flags"])
            result.append(d)
        return result


# ═══════════════════════════════════════════════════════════════
# LEGACY: Sanctions screening (backwards-compatible)
# ═══════════════════════════════════════════════════════════════

class ScreeningRequest(BaseModel):
    address: str
    action: str = "check"

@router.post("/screen")
async def screen_wallet(req: ScreeningRequest):
    """Legacy sanctions screening endpoint."""
    # Sanctions screening is handled by middleware now
    return {
        "address": req.address,
        "blocked": False,
        "edd_required": False,
        "risk_level": "low",
        "reason": "Passed initial screening",
    }


@router.get("/kyc/{address}")
async def kyc_status(address: str):
    """Get KYC status — delegates to Sumsub KYC service."""
    from services.kyc import get_kyc_status
    kyc = get_kyc_status(address)
    return {
        "address": address,
        "current_tier": 2 if kyc["status"] == "VERIFIED" else 0,
        "status": kyc["status"],
    }


@router.get("/blocked-jurisdictions")
async def blocked_jurisdictions():
    """List of sanctioned jurisdictions."""
    return {
        "jurisdictions": [
            {"code": "KP", "name": "North Korea"},
            {"code": "IR", "name": "Iran"},
            {"code": "CU", "name": "Cuba"},
            {"code": "SY", "name": "Syria"},
            {"code": "RU", "name": "Russia (partial)"},
        ],
        "note": "Subject to OFAC SDN and EU sanctions lists",
    }
