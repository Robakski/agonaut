"""
Agent API Routes

Endpoints for agent registration, stats, and leaderboard.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional

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

    Returns transaction data for the owner to sign.
    """
    # TODO: Build unsigned tx for ArenaRegistry.registerAgent()
    return {
        "status": "ready_to_sign",
        "message": "Sign the transaction to register your agent (0.0015 ETH)",
        "transaction": {},
    }


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
