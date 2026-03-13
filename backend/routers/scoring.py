"""
Scoring endpoints — submit encrypted solutions, trigger scoring, get results.

This is the bridge between agents and the TEE scoring service.
"""

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from typing import Optional

router = APIRouter()


class SubmitSolutionRequest(BaseModel):
    round_address: str = Field(..., description="BountyRound contract address")
    agent_id: int = Field(..., description="On-chain agent ID")
    commit_hash: str = Field(..., description="Commit hash (must match on-chain commitment)")
    encrypted_solution: str = Field(..., description="Hex-encoded AES-256-GCM encrypted solution")


class ScoringResult(BaseModel):
    agent_id: int
    final_score: int  # 0-10000 BPS
    base_score: int
    verdict: str
    checks_passed: int
    checks_total: int
    reasoning: str
    injection_detected: bool


class RoundResults(BaseModel):
    round_address: str
    status: str  # pending, scoring, complete, error
    results: list[ScoringResult] = []
    scored_at: Optional[int] = None


@router.post("/submit")
async def submit_solution(
    req: SubmitSolutionRequest,
    x_wallet_address: str = Header(..., alias="X-Wallet-Address"),
):
    """Submit an encrypted solution for scoring.

    Flow:
    1. Agent commits hash on-chain (before calling this)
    2. Agent calls this endpoint with encrypted solution
    3. We verify commit hash matches on-chain commitment
    4. We store encrypted solution for batch scoring when commit phase closes
    5. When commit closes → batch all solutions → send to TEE → submit scores on-chain

    The encrypted solution is stored temporarily and forwarded to the TEE
    for scoring. We CANNOT read it (encrypted for TEE public key only).
    """
    # TODO:
    # 1. Verify agent_id belongs to x_wallet_address
    # 2. Verify commit_hash matches on-chain BountyRound.commits(agentId)
    # 3. Verify round is in COMMIT phase
    # 4. Store encrypted solution in pending queue
    # 5. Return confirmation
    return {
        "status": "accepted",
        "message": "Solution queued for scoring when commit phase closes",
        "round_address": req.round_address,
        "agent_id": req.agent_id,
    }


@router.get("/results/{round_address}", response_model=RoundResults)
async def get_results(round_address: str):
    """Get scoring results for a round.

    Results are available after scoring is complete and submitted on-chain.
    Includes per-agent breakdown (checks, verdict, reasoning).
    """
    # TODO: Read from ScoringOracle.getScores(roundAddress) + stored metadata
    raise HTTPException(status_code=404, detail="Results not found")


@router.post("/trigger/{round_address}")
async def trigger_scoring(
    round_address: str,
    x_wallet_address: str = Header(..., alias="X-Wallet-Address"),
):
    """Manually trigger scoring for a round (admin/operator only).

    Normally scoring is triggered automatically when commit phase closes.
    This endpoint is for manual intervention if auto-trigger fails.
    """
    # TODO:
    # 1. Verify caller is operator
    # 2. Verify round is past commit phase
    # 3. Collect all encrypted solutions for this round
    # 4. Send to TEE scoring service
    # 5. Submit scores on-chain via ScoringOracle
    return {"status": "scoring_triggered", "round_address": round_address}


@router.get("/rubric/default")
async def get_default_rubric():
    """Get the default scoring rubric (used when sponsor doesn't provide custom)."""
    # Import from scoring service
    try:
        from scoring_service.scorer import DEFAULT_RUBRIC, BASELINE_CHECKS
        return {
            "baseline_checks": [
                {"id": c.id, "description": c.description, "unskippable": True}
                for c in BASELINE_CHECKS
            ],
            "default_rubric": {
                criterion: checks
                for criterion, checks in DEFAULT_RUBRIC.items()
            },
        }
    except ImportError:
        return {"error": "Scoring service not available"}
