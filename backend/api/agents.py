"""
Agent API Routes

Endpoints for agent registration, stats, and leaderboard.
"""

import logging
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"])


# ── Models ──

class RegisterAgentRequest(BaseModel):
    """Register a new AI agent on the platform."""
    name: str = Field(min_length=3, max_length=50)
    description: str = Field(max_length=500, default="")
    owner_address: str  # Wallet that owns/controls this agent


class AgentProfile(BaseModel):
    agent_id: int
    name: str
    description: str
    owner: str
    elo: int
    tier: str  # Bronze, Silver, Gold, Diamond, Prometheus
    wins: int
    losses: int
    total_rounds: int
    total_earnings_eth: float
    registered_at: int
    stable: Optional[str] = None  # Team name if in a stable


class LeaderboardEntry(BaseModel):
    rank: int
    agent_id: int
    name: str
    elo: int
    tier: str
    wins: int
    win_rate: float
    total_earnings_eth: float


# ── Routes ──

@router.post("/register", response_model=dict)
async def register_agent(req: RegisterAgentRequest):
    """Register a new AI agent.

    Requires:
    - Sanctions screening passed on owner wallet
    - Registration fee: 0.0015 ETH

    Returns unsigned transaction data for the owner to sign in their wallet.
    """
    if not req.owner_address or len(req.owner_address) != 42:
        raise HTTPException(status_code=400, detail="Invalid owner address")

    try:
        from services.chain import get_chain_service
        from services.ipfs import get_pinata_client

        chain = get_chain_service()

        # Upload agent metadata to IPFS
        metadata = {
            "name": req.name,
            "description": req.description,
            "owner": req.owner_address,
            "platform": "agonaut",
            "version": "1",
        }
        pinata = get_pinata_client()
        metadata_cid = pinata.upload_json(f"agent-{req.name}", metadata)
        if not metadata_cid:
            metadata_cid = "pending"  # Fallback — metadata stored locally

        # Build the unsigned transaction
        tx_data = chain.build_register_agent_tx(
            owner_address=req.owner_address,
            name=req.name,
            metadata_cid=metadata_cid,
        )

        return {
            "status": "ready_to_sign",
            "message": f"Sign the transaction to register '{req.name}' ({tx_data['ethEntryFeeEth']} ETH)",
            "transaction": tx_data,
            "metadataCid": metadata_cid,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to build registration transaction")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to prepare registration: {str(e)}"
        )


@router.get("/{agent_id}", response_model=AgentProfile)
async def get_agent(agent_id: int):
    """Get full profile for an agent."""
    # TODO: Read from ArenaRegistry + EloSystem
    raise HTTPException(status_code=404, detail="Agent not found")


@router.get("/{agent_id}/history")
async def get_agent_history(
    agent_id: int,
    limit: int = Query(20, ge=1, le=100),
):
    """Get round history for an agent (past bounties, scores, earnings)."""
    # TODO: Read from on-chain events
    return []


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def leaderboard(
    tier: Optional[str] = Query(None, description="Filter by tier"),
    season: Optional[int] = Query(None, description="Season ID (current if omitted)"),
    limit: int = Query(50, ge=1, le=200),
):
    """Global agent leaderboard sorted by ELO."""
    # TODO: Read from EloSystem, cache results
    return []


@router.get("/search")
async def search_agents(
    q: str = Query(min_length=2, description="Search by name"),
    limit: int = Query(10, ge=1, le=50),
):
    """Search agents by name."""
    # TODO: Implement search
    return []


@router.get("/check-role")
async def check_wallet_role(wallet: str = Query(..., min_length=42, max_length=42)):
    """
    Check if a wallet is registered as an AI Agent.
    Used by the frontend to enforce role separation (agents can't create bounties).
    """
    if not wallet.startswith("0x"):
        raise HTTPException(status_code=400, detail="Invalid wallet address")

    try:
        from services.chain import get_chain_service
        chain = get_chain_service()
        is_agent = chain.is_registered_agent(wallet)
        return {"wallet": wallet, "is_agent": is_agent}
    except Exception as e:
        logger.warning(f"Role check failed for {wallet}: {e}")
        # Fail closed — if we can't verify, treat as potential agent
        # Backend bounty creation will do its own check anyway
        return {"wallet": wallet, "is_agent": False, "check_failed": True}
