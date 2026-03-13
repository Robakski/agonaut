"""
Solution API Routes

Endpoints for submitting encrypted solutions and triggering scoring.
Solutions are encrypted client-side and only decrypted inside Phala TEE.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/solutions", tags=["solutions"])


# ── Models ──

class SubmitSolutionRequest(BaseModel):
    """Submit an encrypted solution for a bounty round."""
    round_address: str          # BountyRound contract address
    agent_id: int               # Agent's on-chain ID
    commit_hash: str            # Must match on-chain commit (keccak256)
    encrypted_solution: str     # Hex-encoded AES-256-GCM encrypted solution
    agent_address: str          # Wallet that committed on-chain


class SubmitSolutionResponse(BaseModel):
    status: str                 # "accepted", "rejected"
    message: str
    round_address: str
    agent_id: int


class ScoringStatusResponse(BaseModel):
    round_address: str
    phase: str                  # "pending", "scoring", "submitted", "error"
    solutions_received: int
    solutions_expected: int
    scores_submitted: bool
    scoring_started_at: int | None = None
    scoring_completed_at: int | None = None


class SponsorSolutionRequest(BaseModel):
    """Sponsor requests access to winning solutions after settlement."""
    round_address: str
    sponsor_address: str
    sponsor_public_key: str     # Solutions will be re-encrypted for this key


# ── Routes ──

@router.post("/submit", response_model=SubmitSolutionResponse)
async def submit_solution(req: SubmitSolutionRequest):
    """Submit an encrypted solution after committing on-chain.

    Flow:
    1. Agent commits hash on-chain (BountyRound.commitSolution)
    2. Agent encrypts solution with TEE public key
    3. Agent submits encrypted solution here
    4. We verify commit hash matches on-chain commitment
    5. We store encrypted solution until scoring phase

    Solutions are NEVER decrypted by the backend. They go straight
    to Phala TEE during scoring.

    Requires:
    - On-chain commit must exist and match
    - Round must be in COMMIT phase
    - Sanctions screening on agent wallet
    """
    # TODO: Verify on-chain commit exists for this agent+round
    # TODO: Verify commit hash matches keccak256 of encrypted solution
    # TODO: Store encrypted solution (not decrypted - we CAN'T decrypt it)
    # TODO: Verify round is in COMMIT phase

    return SubmitSolutionResponse(
        status="accepted",
        message="Solution received. It will be scored after the commit phase closes.",
        round_address=req.round_address,
        agent_id=req.agent_id,
    )


@router.get("/scoring/{round_address}", response_model=ScoringStatusResponse)
async def scoring_status(round_address: str):
    """Check the scoring status for a round.

    After commit phase closes, scoring begins automatically:
    1. Encrypted solutions forwarded to Phala TEE
    2. TEE decrypts, runs rubric + deep reasoning scoring
    3. Scores submitted to ScoringOracle on-chain
    4. BountyRound transitions to SETTLED
    """
    # TODO: Check scoring service status for this round
    # TODO: Check ScoringOracle.isResultVerified(round_address)
    return ScoringStatusResponse(
        round_address=round_address,
        phase="pending",
        solutions_received=0,
        solutions_expected=0,
        scores_submitted=False,
    )


@router.post("/trigger-scoring/{round_address}")
async def trigger_scoring(round_address: str):
    """Manually trigger scoring for a round (admin/operator only).

    Normally scoring starts automatically when commit phase closes.
    This endpoint is for retries or manual intervention.
    """
    # TODO: Auth check (operator role)
    # TODO: Verify round is in SCORING phase
    # TODO: Trigger scoring service
    return {"status": "scoring_triggered", "round_address": round_address}


@router.post("/sponsor-access", response_model=dict)
async def request_sponsor_access(req: SponsorSolutionRequest):
    """Sponsor requests access to winning solutions after settlement.

    Solutions are re-encrypted inside the TEE for the sponsor's public key.
    Only works after on-chain settlement is confirmed.

    Requires:
    - Round must be in SETTLED phase
    - Requester must be a verified sponsor/contributor for this round
    - Sanctions screening on sponsor wallet
    """
    # TODO: Verify on-chain: round is SETTLED
    # TODO: Verify sponsor is a contributor (BountyMarketplace.isContributor or sponsor address)
    # TODO: Request TEE to re-encrypt solutions for sponsor's public key
    # TODO: Return encrypted solutions or delivery mechanism

    return {
        "status": "processing",
        "message": "Solutions are being prepared for delivery. You will be notified when ready.",
    }
