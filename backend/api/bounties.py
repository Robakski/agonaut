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

import config
from services.chain import get_chain_service
from services.storage import store_rubric, load_rubric, compute_problem_cid
from services.ipfs import get_pinata_client
from services import bounty_index

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
    maxAgents: int = Field(ge=0, le=50, default=0)  # MAX_AGENTS_PER_ROUND = 50 (gas safety)
    threshold: int = Field(ge=1000, le=9500, default=7000)
    graduated: bool = True
    rubric: dict  # { criteria: [{ name, checks: [{ description, weight, required }] }] }
    sponsorAddress: str
    isPrivate: bool = False  # Private bounties: encrypted problem, 2.5% fee


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
    is_private: bool = False


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

    # ── KYC Enforcement: bounty creation requires verified identity ──
    # Any wallet (agent, sponsor, or both) CAN create bounties — but only
    # after completing KYC. This is the compliance guardrail.
    from services.kyc import get_kyc_status
    kyc = get_kyc_status(req.sponsorAddress)
    if kyc["status"] != "VERIFIED":
        status_msg = {
            "NONE": "KYC verification required before creating bounties. Please complete identity verification first.",
            "PENDING": "Your KYC submission is under review. You'll be able to create bounties once verified.",
            "REJECTED": "Your KYC submission was rejected. Please resubmit with valid documentation.",
        }
        raise HTTPException(
            status_code=403,
            detail=status_msg.get(kyc["status"], "KYC verification required."),
            headers={"X-KYC-Status": kyc["status"]},
        )

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
            is_private=req.isPrivate,
        )

        # Store rubric
        # SECURITY: Private bounty rubrics MUST NOT go to IPFS or local plaintext storage.
        # IPFS is public and immutable — uploading would be an irrecoverable data breach.
        # Private bounty data is ONLY stored encrypted in the problem vault (frontend handles this).
        rubric_metadata = {
            "bounty_eth": req.bountyEth,
            "commit_hours": req.commitHours,
            "max_agents": req.maxAgents,
            "threshold": req.threshold,
            "graduated": req.graduated,
            "sponsor": req.sponsorAddress,
            "round_address": result.round_address,
            "is_private": req.isPrivate,
        }

        ipfs_cid = None
        if not req.isPrivate:
            # PUBLIC bounties: store full problem data on IPFS + locally
            rubric_metadata.update(problem_data)
            pinata = get_pinata_client()
            ipfs_cid = pinata.upload_rubric(result.bounty_id, rubric_metadata)
            if ipfs_cid:
                logger.info(f"Bounty {result.bounty_id} rubric uploaded to IPFS: {ipfs_cid}")
                rubric_metadata["ipfs_cid"] = ipfs_cid
            # Local storage (plaintext OK for public bounties)
            store_rubric(result.bounty_id, rubric_metadata)
        else:
            # PRIVATE bounties: store ONLY non-sensitive metadata locally
            # Title is public (shown on listing), but description + rubric are NOT stored here
            rubric_metadata["title"] = req.title
            rubric_metadata["tags"] = req.tags
            store_rubric(result.bounty_id, rubric_metadata)
            logger.info(f"Bounty {result.bounty_id} is PRIVATE — rubric NOT uploaded to IPFS")

        # Index for fast listing
        bounty_index.index_bounty(
            bounty_id=result.bounty_id,
            title=req.title,
            description=req.description,
            tags=req.tags,
            sponsor=req.sponsorAddress,
            bounty_eth=float(req.bountyEth),
            max_agents=req.maxAgents,
            commit_hours=req.commitHours,
            threshold=req.threshold,
            graduated=req.graduated,
            round_address=result.round_address,
            problem_cid=result.problem_cid,
            rubric_cid=ipfs_cid,
            is_private=req.isPrivate,
        )

        # ── Compliance monitoring ──
        try:
            from services.compliance_monitor import record_transaction
            record_transaction(
                wallet=req.sponsorAddress,
                tx_type="bounty_deposit",
                amount_eth=float(req.bountyEth),
                tx_hash=result.create_tx_hash,
                chain_id=config.CHAIN_ID,
                round_address=result.round_address,
                metadata={"bounty_id": result.bounty_id, "title": req.title},
            )
        except Exception as e:
            logger.warning(f"Compliance recording failed (non-blocking): {e}")

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
    phase: Optional[str] = Query(None, description="Filter by phase: CREATED, FUNDED, COMMIT, SCORING, SETTLED"),
    sponsor: Optional[str] = Query(None, description="Filter by sponsor wallet address"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List bounties with optional phase/sponsor filter. Fast indexed queries."""
    try:
        # Refresh on-chain phase for bounties (lazy update)
        # For small sets, refresh directly. For large sets, return cached.
        total, bounties = bounty_index.list_bounties(
            phase=phase,
            sponsor=sponsor,
            limit=limit,
            offset=offset,
        )
        # For small result sets (≤20), refresh on-chain phase
        if len(bounties) <= 20:
            chain = get_chain_service()
            for b in bounties:
                ra = b.get("round_address")
                if ra:
                    try:
                        details = chain.get_round_details(ra)
                        b["phase"] = details["phase"]
                        b["agent_count"] = details["agent_count"]
                        b["deposit_eth"] = details["deposit_eth"]
                        # Update index (fire-and-forget)
                        bounty_index.update_bounty_phase(
                            b["bounty_id"], details["phase"],
                            agent_count=details["agent_count"],
                            deposit_eth=details["deposit_eth"],
                        )
                    except Exception:
                        pass  # Use cached phase

        return [
            BountyResponse(
                bounty_id=b["bounty_id"],
                problem_title=b["title"],
                problem_cid=b.get("problem_cid", ""),
                sponsor=b.get("sponsor", ""),
                total_bounty_eth=b.get("deposit_eth", b.get("bounty_eth", 0)),
                entry_fee_eth=b.get("entry_fee_eth", 0.003),
                agents_entered=b.get("agent_count", 0),
                max_agents=b.get("max_agents", 0),
                phase=b.get("phase", "CREATED"),
                created_at=b.get("created_at", 0),
                is_private=bool(b.get("is_private", 0)),
            )
            for b in bounties
        ]
    except Exception as e:
        logger.warning(f"Failed to list bounties: {e}")
        return []


@router.get("/agent/{agent_address}")
async def get_agent_bounties(agent_address: str, limit: int = Query(50, ge=1, le=100)):
    """Get all bounties an agent has participated in (submitted solutions to).

    Returns bounty info with on-chain phase refresh for active bounties.
    Used by the agent dashboard to show active submissions and history.
    """
    try:
        bounties = bounty_index.get_agent_bounties(agent_address, limit=limit)
        chain = get_chain_service()

        results = []
        for b in bounties:
            # Refresh on-chain phase for active bounties
            ra = b.get("round_address")
            if ra and b.get("phase") not in ("SETTLED", "CANCELLED"):
                try:
                    details = chain.get_round_details(ra)
                    b["phase"] = details["phase"]
                    b["agent_count"] = details["agent_count"]
                    b["deposit_eth"] = details["deposit_eth"]
                except Exception:
                    pass

            # Try to get agent's score if settled
            score = None
            rank = None
            total_scored = 0
            if b.get("phase") == "SETTLED" and ra:
                try:
                    scored_agent_ids, scores = chain.get_scores(ra)
                    total_scored = len(scored_agent_ids)
                    # Find this agent's score — use agent_id from participation record
                    participant_agent_id = b.get("agent_id", -1)
                    for aid, s in zip(scored_agent_ids, scores):
                        if aid == participant_agent_id:
                            score = s
                            sorted_scores = sorted(scores, reverse=True)
                            rank = sorted_scores.index(s) + 1
                            break
                except Exception:
                    pass

            results.append({
                "bounty_id": b.get("bounty_id"),
                "title": b.get("title", "Untitled"),
                "phase": b.get("phase", "CREATED"),
                "bounty_eth": b.get("deposit_eth", b.get("bounty_eth", 0)),
                "entry_fee_eth": b.get("entry_fee_eth", 0.003),
                "agent_count": b.get("agent_count", 0),
                "max_agents": b.get("max_agents", 0),
                "round_address": ra,
                "is_private": bool(b.get("is_private", 0)),
                "agent_action": b.get("agent_action", "submitted"),
                "participated_at": b.get("participated_at"),
                "score": score,
                "rank": rank,
                "total_agents": total_scored if total_scored > 0 else b.get("agent_count", 0),
            })

        return results
    except Exception as e:
        logger.warning(f"Failed to get agent bounties: {e}")
        return []


@router.get("/by-round/{round_address}")
async def get_bounty_by_round(round_address: str):
    """Look up a bounty by its round contract address.

    More efficient than fetching all bounties and filtering client-side.
    """
    bounty_data = bounty_index.find_by_round(round_address)
    if not bounty_data:
        raise HTTPException(status_code=404, detail="No bounty found for this round address")

    bounty_id = bounty_data["bounty_id"]
    stored = load_rubric(bounty_id)
    result = {"bounty_id": bounty_id, **(stored or bounty_data)}
    # Always include the round_address (frontend needs it for on-chain reads)
    result["round_address"] = round_address

    # Strip private fields
    if result.get("is_private"):
        result.pop("description", None)
        result.pop("rubric", None)
        result["is_private"] = True
        result["privacy_notice"] = "This is a private bounty. Pay the entry fee to access the full description."

    # Read fresh on-chain phase
    try:
        chain = get_chain_service()
        details = chain.get_round_details(round_address)
        result["phase"] = details["phase"]
        result["phase_id"] = details["phase_id"]
        result["agents_entered"] = details["agent_count"]
        result["agent_count"] = details["agent_count"]
        result["total_bounty_eth"] = details["deposit_eth"]
        result["commit_deadline"] = details["commit_deadline"]
    except Exception as e:
        logger.warning(f"Failed to read on-chain state: {e}")

    return result


@router.get("/{bounty_id}")
async def get_bounty(bounty_id: int):
    """Get details of a specific bounty."""
    stored = load_rubric(bounty_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Bounty not found")

    # SECURITY: Strip sensitive fields from private bounties
    result = {"bounty_id": bounty_id, **stored}
    if stored.get("is_private"):
        result.pop("description", None)
        result.pop("rubric", None)
        result["is_private"] = True
        result["privacy_notice"] = "This is a private bounty. Pay the entry fee to access the full description."

    # Read fresh on-chain phase and update index (BUG-3 fix)
    round_address = stored.get("round_address")
    if round_address:
        try:
            chain = get_chain_service()
            details = chain.get_round_details(round_address)
            result["phase"] = details["phase"]
            result["phase_id"] = details["phase_id"]
            result["agents_entered"] = details["agent_count"]
            result["agent_count"] = details["agent_count"]
            result["total_bounty_eth"] = details["deposit_eth"]
            result["commit_deadline"] = details["commit_deadline"]
            result["entry_fee_eth"] = stored.get("entry_fee_eth", 0.003)
            # Update index so listing stays current
            bounty_index.update_bounty_phase(
                bounty_id, details["phase"],
                agent_count=details["agent_count"],
                deposit_eth=details["deposit_eth"],
            )
        except Exception as e:
            logger.warning(f"Failed to read on-chain state for bounty {bounty_id}: {e}")

    return result


@router.get("/{bounty_id}/rubric")
async def get_rubric(bounty_id: int):
    """Get the scoring rubric for a bounty. Agents see this BEFORE competing."""
    stored = load_rubric(bounty_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Rubric not found")

    # SECURITY: Private bounty rubrics are NOT available via this endpoint.
    # Agents must pay entry fee and use /private-bounties/request-key to decrypt.
    if stored.get("is_private"):
        raise HTTPException(
            status_code=403,
            detail="This is a private bounty. Pay the entry fee to access the rubric via /bounties/{round}/problem"
        )

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
    """Get scoring results after round settlement.

    Reads scores from ScoringOracle on-chain + agent metadata from ArenaRegistry.
    """
    # 1. Find the round address for this bounty
    stored = load_rubric(bounty_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Bounty not found")

    round_address = stored.get("round_address")
    if not round_address:
        # Try bounty index
        indexed = bounty_index.get_bounty(bounty_id)
        if indexed:
            round_address = indexed.get("round_address")

    if not round_address:
        raise HTTPException(status_code=404, detail="Round address not found for this bounty")

    # 2. Read scores from ScoringOracle on-chain
    try:
        chain = get_chain_service()
        is_verified = chain.is_result_verified(round_address)
        if not is_verified:
            raise HTTPException(status_code=404, detail="Scoring not yet complete for this bounty")

        agent_ids, scores = chain.get_scores(round_address)

        # 3. Build results with agent metadata
        results = []
        for i, (agent_id, score) in enumerate(zip(agent_ids, scores)):
            agent_info = {}
            try:
                agent_info = chain.get_agent(agent_id)
            except Exception:
                pass

            results.append({
                "rank": i + 1,
                "agent_id": agent_id,
                "name": f"Agent #{agent_id}",
                "wallet": agent_info.get("wallet", ""),
                "score": score,
                "score_pct": round(score / 100, 2),  # BPS → percentage
                "elo": agent_info.get("eloRating", 1200),
            })

        # Sort by score descending
        results.sort(key=lambda r: r["score"], reverse=True)
        for i, r in enumerate(results):
            r["rank"] = i + 1

        return {
            "bounty_id": bounty_id,
            "round_address": round_address,
            "verified": True,
            "results": results,
            "total_agents": len(results),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch results for bounty {bounty_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch scoring results")
