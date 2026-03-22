"""
Bounty API Routes

Endpoints for creating, listing, and managing bounties.
Includes the relay endpoint that the frontend calls to create bounties
via the operator wallet.
"""

import logging
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional

from services.chain import get_chain_service
from services.storage import store_rubric, load_rubric, compute_problem_cid
from services.ipfs import get_pinata_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bounties", tags=["bounties"])

# ── Constants ──
ENTRY_FEE_WEI = 3_000_000_000_000_000  # 0.003 ETH
DEFAULT_PRIZE_DISTRIBUTION = [10000]     # 100% to winner (single-winner default)


# ── Request/Response Models ──

class RubricCheck(BaseModel):
    description: str
    weight: int = Field(ge=0, le=10000)
    required: bool = False


class RubricCriterion(BaseModel):
    name: str
    checks: list[RubricCheck]


class CreateBountyRequest(BaseModel):
    """Frontend relay request — creates bounty + spawns round via operator."""
    title: str = Field(min_length=5, max_length=120)
    description: str = Field(min_length=20, max_length=5000)
    tags: list[str] = Field(default=[], max_length=5)
    bountyEth: str  # ETH amount as string (e.g., "0.125")
    commitHours: int = Field(ge=1, le=168)
    maxAgents: int = Field(ge=0, le=255, default=0)
    threshold: int = Field(ge=1000, le=9500, default=7000)
    graduated: bool = True
    rubric: dict  # { criteria: [{ name, checks: [{ description, weight, required }] }] }
    sponsorAddress: str


class CreateBountyResponse(BaseModel):
    bountyId: int
    roundAddress: str
    problemCid: str
    rubricCid: Optional[str] = None  # IPFS CID from Pinata
    status: str = "pending_deposit"
    createTxHash: str
    spawnTxHash: str


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


# ── Routes ──

@router.post("/create", response_model=CreateBountyResponse)
async def create_bounty_relay(req: CreateBountyRequest):
    """
    Relay endpoint: frontend sends bounty config, backend creates it on-chain.
    
    Flow:
    1. Validate rubric weights sum to 10000
    2. Compute problem CID from title + description + rubric
    3. Store rubric locally (future: IPFS)
    4. Call BountyFactory.createBounty() via operator wallet
    5. Call BountyFactory.spawnRound() via operator wallet
    6. Return bountyId + roundAddress → frontend prompts sponsor deposit
    """
    # Validate rubric
    criteria = req.rubric.get("criteria", [])
    total_weight = sum(
        check.get("weight", 0)
        for criterion in criteria
        for check in criterion.get("checks", [])
    )
    if total_weight != 10000:
        raise HTTPException(
            status_code=400,
            detail=f"Rubric weights must sum to 10000 BPS, got {total_weight}"
        )

    # Validate sponsor address
    if not req.sponsorAddress or len(req.sponsorAddress) != 42:
        raise HTTPException(status_code=400, detail="Invalid sponsor address")

    # Compute problem CID from content
    problem_data = {
        "title": req.title,
        "description": req.description,
        "tags": req.tags,
        "rubric": req.rubric,
    }
    problem_cid = compute_problem_cid(problem_data)

    # Convert commit hours to seconds
    commit_duration_sec = req.commitHours * 3600

    try:
        chain = get_chain_service()

        # Check operator balance
        balance = chain.get_operator_balance()
        if balance < 0.005:
            logger.error(f"Operator balance too low: {balance} ETH")
            raise HTTPException(
                status_code=503,
                detail="Service temporarily unavailable. Please try again later."
            )

        # Create bounty + spawn round on-chain
        result = chain.create_bounty_and_spawn(
            problem_cid_hex=problem_cid,
            entry_fee_wei=ENTRY_FEE_WEI,
            commit_duration_sec=commit_duration_sec,
            prize_distribution=DEFAULT_PRIZE_DISTRIBUTION,
            max_agents=req.maxAgents,
            tier=0,  # Bronze minimum for now
            acceptance_threshold=req.threshold,
            graduated_payouts=req.graduated,
            sponsor_address=req.sponsorAddress,
        )

        # Store rubric on IPFS via Pinata
        pinata = get_pinata_client()
        rubric_metadata = {
            **problem_data,
            "bounty_eth": req.bountyEth,
            "commit_hours": req.commitHours,
            "max_agents": req.maxAgents,
            "threshold": req.threshold,
            "graduated": req.graduated,
            "sponsor": req.sponsorAddress,
            "round_address": result.round_address,
        }

        ipfs_cid = pinata.upload_rubric(result.bounty_id, rubric_metadata)
        if ipfs_cid:
            logger.info(f"Bounty {result.bounty_id} rubric uploaded to IPFS: {ipfs_cid}")
            rubric_metadata["ipfs_cid"] = ipfs_cid

        # Also store locally for quick access (fallback)
        store_rubric(result.bounty_id, rubric_metadata)

        logger.info(
            f"Bounty created: id={result.bounty_id}, "
            f"round={result.round_address}, "
            f"sponsor={req.sponsorAddress}"
        )

        return CreateBountyResponse(
            bountyId=result.bounty_id,
            roundAddress=result.round_address,
            problemCid=result.problem_cid,
            rubricCid=ipfs_cid,
            createTxHash=result.create_tx_hash,
            spawnTxHash=result.spawn_tx_hash,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to create bounty on-chain")
        raise HTTPException(
            status_code=500,
            detail=f"On-chain transaction failed: {str(e)}"
        )


@router.get("/", response_model=list[BountyResponse])
async def list_bounties(
    phase: Optional[str] = Query(None, description="Filter by phase: OPEN, FUNDED, COMMIT, SCORING, SETTLED"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List active bounties with optional phase filter."""
    # Read stored bounties and enrich with on-chain data
    try:
        chain = get_chain_service()
        total = chain.get_bounty_count()

        bounties = []
        start = max(1, total - offset - limit + 1)
        end = max(1, total - offset + 1)

        for bounty_id in range(min(end, total + 1), max(start - 1, 0), -1):
            stored = load_rubric(bounty_id)
            if stored:
                bounties.append(BountyResponse(
                    bounty_id=bounty_id,
                    problem_title=stored.get("title", f"Bounty #{bounty_id}"),
                    problem_cid=stored.get("problem_cid", ""),
                    sponsor=stored.get("sponsor", ""),
                    total_bounty_eth=float(stored.get("bounty_eth", 0)),
                    entry_fee_eth=0.003,
                    agents_entered=0,  # TODO: read from round contract
                    max_agents=stored.get("max_agents", 0),
                    phase="OPEN",  # TODO: read from round contract
                    created_at=0,  # TODO: read from chain
                ))

        return bounties[:limit]

    except Exception as e:
        logger.warning(f"Failed to list bounties: {e}")
        return []


@router.get("/{bounty_id}")
async def get_bounty(bounty_id: int):
    """Get details of a specific bounty."""
    stored = load_rubric(bounty_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Bounty not found")

    return {
        "bounty_id": bounty_id,
        **stored,
    }


@router.get("/{bounty_id}/rubric")
async def get_rubric(bounty_id: int):
    """Get the scoring rubric for a bounty. Agents see this BEFORE competing."""
    stored = load_rubric(bounty_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Rubric not found")

    # Prefer IPFS if available (immutable source of truth)
    if "ipfs_cid" in stored:
        pinata = get_pinata_client()
        ipfs_rubric = pinata.retrieve_rubric(stored["ipfs_cid"])
        if ipfs_rubric:
            return ipfs_rubric.get("rubric", stored.get("rubric", {}))

    # Fallback to local
    if "rubric" not in stored:
        raise HTTPException(status_code=404, detail="Rubric not found")
    return stored["rubric"]


@router.get("/{bounty_id}/results")
async def get_results(bounty_id: int):
    """Get scoring results after settlement."""
    # TODO: Read from ScoringOracle.getScores() + off-chain metadata
    raise HTTPException(status_code=404, detail="Results not available")
