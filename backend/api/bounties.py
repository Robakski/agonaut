"""
Bounty API Routes

Endpoints for creating, listing, and managing bounties.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional

router = APIRouter(prefix="/bounties", tags=["bounties"])


# ── Request/Response Models ──

class RubricCheck(BaseModel):
    description: str
    weight: int = Field(ge=0, le=10000)
    unskippable: bool = False


class RubricCriterion(BaseModel):
    name: str
    checks: list[RubricCheck]


class CreateBountyRequest(BaseModel):
    """Sponsor creates a new bounty."""
    problem_title: str = Field(min_length=10, max_length=200)
    problem_description: str = Field(min_length=50, max_length=10000)
    problem_cid: Optional[str] = None  # IPFS CID if already uploaded
    rubric: list[RubricCriterion]
    entry_fee_eth: float = 0.003
    commit_duration_hours: int = Field(ge=1, le=168)  # 1h to 7 days
    prize_distribution: list[int]  # BPS, must sum to 10000
    max_agents: int = Field(ge=0, le=255, default=0)  # 0 = unlimited
    min_tier: int = Field(ge=0, le=4, default=0)
    acceptance_threshold: int = Field(ge=1000, le=9500, default=7000)
    graduated_payouts: bool = True
    sponsor_address: str  # Wallet address of the sponsor


class BountyResponse(BaseModel):
    bounty_id: int
    problem_title: str
    problem_cid: str
    sponsor: str
    total_bounty_eth: float
    entry_fee_eth: float
    agents_entered: int
    max_agents: int
    phase: str
    commit_deadline: Optional[int] = None
    rubric: Optional[list[RubricCriterion]] = None
    created_at: int


class LeaderboardEntry(BaseModel):
    agent_id: int
    agent_name: str
    elo: int
    tier: str
    wins: int
    total_rounds: int
    total_earnings_eth: float


# ── Routes ──

@router.get("/", response_model=list[BountyResponse])
async def list_bounties(
    phase: Optional[str] = Query(None, description="Filter by phase: OPEN, FUNDED, COMMIT, SCORING, SETTLED"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List active bounties with optional phase filter."""
    # TODO: Read from chain via Web3 + cache
    return []


@router.get("/{bounty_id}", response_model=BountyResponse)
async def get_bounty(bounty_id: int):
    """Get details of a specific bounty."""
    # TODO: Read from BountyFactory.getBounty()
    raise HTTPException(status_code=404, detail="Bounty not found")


@router.post("/", response_model=dict)
async def create_bounty(req: CreateBountyRequest):
    """Create a new bounty.

    Requires:
    - KYC Tier 1 (basic ID verification)
    - Sanctions screening passed
    - Sufficient ETH for bounty deposit + protocol fee

    Returns transaction data for the sponsor to sign.
    """
    # Validate rubric weights sum to 10000
    total_weight = sum(
        check.weight
        for criterion in req.rubric
        for check in criterion.checks
    )
    if total_weight != 10000:
        raise HTTPException(
            status_code=400,
            detail=f"Rubric weights must sum to 10000, got {total_weight}"
        )

    # Validate prize distribution sums to 10000
    if sum(req.prize_distribution) != 10000:
        raise HTTPException(
            status_code=400,
            detail="Prize distribution must sum to 10000 BPS"
        )

    # TODO: KYC tier check
    # TODO: Build unsigned transaction for BountyFactory.createBounty()
    # TODO: Upload problem to IPFS if no CID provided
    # TODO: Store rubric off-chain (IPFS or database) for scoring service

    return {
        "status": "ready_to_sign",
        "message": "Sign the transaction with your wallet to create the bounty",
        "transaction": {},  # Unsigned tx data
    }


@router.get("/{bounty_id}/rubric", response_model=list[RubricCriterion])
async def get_rubric(bounty_id: int):
    """Get the scoring rubric for a bounty.

    Agents see this BEFORE competing — full transparency.
    """
    # TODO: Fetch from IPFS or database
    raise HTTPException(status_code=404, detail="Rubric not found")


@router.get("/{bounty_id}/results")
async def get_results(bounty_id: int):
    """Get scoring results after settlement.

    Returns scores, verdicts, and reasoning for each agent.
    Does NOT return solutions (those go only to the sponsor).
    """
    # TODO: Read from ScoringOracle.getScores() + off-chain metadata
    raise HTTPException(status_code=404, detail="Results not available")
