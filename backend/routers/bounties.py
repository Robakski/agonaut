"""
Bounty endpoints — list, create, fund, get details.
"""

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from typing import Optional

router = APIRouter()


# ════════════════════════════════════════════
#  Models
# ════════════════════════════════════════════

class BountyListItem(BaseModel):
    bounty_id: int
    problem_cid: str
    status: str  # OPEN, FUNDED, COMMIT, SCORING, SETTLED, CANCELLED
    bounty_deposit_eth: float
    entry_fee_eth: float = 0.003
    agent_count: int = 0
    created_at: int
    creator: str


class BountyDetail(BaseModel):
    bounty_id: int
    problem_cid: str
    status: str
    bounty_deposit_eth: float
    entry_fee_eth: float
    commit_duration: int
    max_agents: int
    required_tier: int
    acceptance_threshold: int
    graduated_payouts: bool
    prize_distribution: list[int]
    agents: list[str] = []
    created_at: int
    creator: str
    rubric: Optional[dict] = None


class CreateBountyRequest(BaseModel):
    problem_cid: str = Field(..., description="IPFS CID of the problem description")
    commit_duration: int = Field(86400, ge=3600, le=604800, description="Commit phase duration in seconds")
    max_agents: int = Field(0, ge=0, le=255, description="Max agents (0=unlimited)")
    required_tier: int = Field(0, ge=0, le=4, description="Min agent tier (0=Bronze)")
    acceptance_threshold: int = Field(7000, ge=1000, le=9500, description="Min score for full payout (BPS)")
    graduated_payouts: bool = Field(True, description="Enable graduated payouts below threshold")
    prize_distribution: list[int] = Field([5000, 3000, 2000], description="Prize split in BPS (must sum to 10000)")
    rubric: Optional[dict] = Field(None, description="Custom scoring rubric for TEE")


class ContributeRequest(BaseModel):
    """For crowdfunded bounties via BountyMarketplace."""
    proposal_id: int
    amount_eth: float = Field(..., gt=0)


# ════════════════════════════════════════════
#  Endpoints
# ════════════════════════════════════════════

@router.get("/", response_model=list[BountyListItem])
async def list_bounties(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """List all bounties, optionally filtered by status."""
    # TODO: Read from BountyFactory on-chain + cache
    return []


@router.get("/{bounty_id}", response_model=BountyDetail)
async def get_bounty(bounty_id: int):
    """Get full details for a specific bounty."""
    # TODO: Read from BountyFactory.getBounty(bountyId) on-chain
    raise HTTPException(status_code=404, detail="Bounty not found")


@router.post("/", response_model=dict)
async def create_bounty(
    req: CreateBountyRequest,
    x_wallet_address: str = Header(..., alias="X-Wallet-Address"),
):
    """Create a new bounty.

    Requires:
    - KYC Tier 1+ (wallet must be verified)
    - Bounty deposit sent via separate on-chain transaction
    """
    # TODO:
    # 1. Check KYC tier (must be >= BASIC for bounty creation)
    # 2. Validate rubric if provided
    # 3. Store rubric off-chain (IPFS or database) for scoring service
    # 4. Return transaction data for user to sign (bounty creation on-chain)
    return {
        "status": "pending",
        "message": "Sign the bounty creation transaction with your wallet",
        "tx_data": {},  # Populated with encoded calldata
    }


@router.get("/{bounty_id}/rubric")
async def get_rubric(bounty_id: int):
    """Get the scoring rubric for a bounty (public — agents see what they're graded on)."""
    # TODO: Load rubric from storage
    raise HTTPException(status_code=404, detail="Rubric not found")


@router.get("/{bounty_id}/rounds")
async def list_rounds(bounty_id: int):
    """List all rounds for a bounty."""
    # TODO: Read from BountyFactory.bountyRounds
    return []


@router.get("/{bounty_id}/rounds/{round_index}")
async def get_round(bounty_id: int, round_index: int):
    """Get details for a specific round."""
    # TODO: Read from BountyRound contract at the clone address
    raise HTTPException(status_code=404, detail="Round not found")
