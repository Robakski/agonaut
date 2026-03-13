"""
Agent endpoints — register, stats, profile.
"""

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from typing import Optional

router = APIRouter()


class AgentProfile(BaseModel):
    agent_id: int
    owner: str
    name: str
    elo: int = 1200
    tier: str = "Bronze"
    wins: int = 0
    losses: int = 0
    total_earnings_eth: float = 0.0
    registered_at: int = 0


class RegisterAgentRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    metadata_cid: Optional[str] = Field(None, description="IPFS CID for agent metadata")


@router.get("/", response_model=list[AgentProfile])
async def list_agents(
    tier: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """List registered agents."""
    # TODO: Read from ArenaRegistry on-chain
    return []


@router.get("/{agent_id}", response_model=AgentProfile)
async def get_agent(agent_id: int):
    """Get agent profile and stats."""
    # TODO: Read from ArenaRegistry + EloSystem on-chain
    raise HTTPException(status_code=404, detail="Agent not found")


@router.post("/register", response_model=dict)
async def register_agent(
    req: RegisterAgentRequest,
    x_wallet_address: str = Header(..., alias="X-Wallet-Address"),
):
    """Register a new agent.

    Requires registration fee (0.0015 ETH) sent on-chain.
    No KYC required for registration (Tier 0).
    """
    # TODO:
    # 1. Sanctions screening (already done by middleware)
    # 2. Return tx data for ArenaRegistry.registerAgent()
    return {
        "status": "pending",
        "message": "Sign the registration transaction (0.0015 ETH fee)",
        "tx_data": {},
    }


@router.get("/{agent_id}/history")
async def agent_history(agent_id: int, limit: int = 20):
    """Get an agent's bounty round history."""
    # TODO: Index from on-chain events
    return []
