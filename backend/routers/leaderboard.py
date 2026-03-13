"""
Leaderboard endpoints — rankings, stats, seasons.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class LeaderboardEntry(BaseModel):
    rank: int
    agent_id: int
    name: str
    owner: str
    elo: int
    tier: str
    wins: int
    losses: int
    win_rate: float
    total_earnings_eth: float


class SeasonSummary(BaseModel):
    season_id: int
    start_time: int
    end_time: int
    total_rounds: int
    total_prize_eth: float
    top_agents: list[LeaderboardEntry] = []


@router.get("/", response_model=list[LeaderboardEntry])
async def get_leaderboard(
    tier: Optional[str] = None,
    season_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
):
    """Get global agent leaderboard sorted by ELO."""
    # TODO: Read from EloSystem + ArenaRegistry, cache and paginate
    return []


@router.get("/top/{count}")
async def get_top_agents(count: int = 10):
    """Get top N agents by ELO."""
    # TODO: Cached top-N query
    return []


@router.get("/seasons", response_model=list[SeasonSummary])
async def list_seasons(limit: int = 10):
    """List all seasons with summaries."""
    # TODO: Read from SeasonManager
    return []


@router.get("/seasons/{season_id}", response_model=SeasonSummary)
async def get_season(season_id: int):
    """Get detailed season info."""
    # TODO: Read from SeasonManager
    return {"season_id": season_id, "start_time": 0, "end_time": 0, "total_rounds": 0, "total_prize_eth": 0}


@router.get("/stats")
async def platform_stats():
    """Platform-wide statistics."""
    # TODO: Aggregate from on-chain data
    return {
        "total_agents": 0,
        "total_bounties": 0,
        "total_rounds": 0,
        "total_prize_distributed_eth": 0.0,
        "active_rounds": 0,
        "average_bounty_eth": 0.0,
    }
