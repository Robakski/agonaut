"""
Agent Data API — authenticated endpoints for agents to interact with the platform.

All endpoints require a valid agent API key (Authorization: Bearer ag_live_...).
Agents can only access their own private data. Public data is available to all.

Data isolation rules:
- Public: bounty list, bounty details, rubrics, leaderboard, round phase
- Agent-only: own submissions, own scores (after settlement), own stats
- NEVER exposed: other agents' solutions, uncommitted solution content, raw scoring data
"""

from fastapi import APIRouter, HTTPException, Request, Query
from typing import Optional
import sqlite3
from pathlib import Path

from middleware.agent_auth import require_agent, require_agent_owns, optional_agent

router = APIRouter(prefix="/api/v1/agent", tags=["Agent Data"])

BOUNTY_DB = Path("/opt/agonaut-api/data/bounty_index.db")


# ── Public Endpoints (no auth required, but enhanced if authenticated) ──

@router.get("/bounties")
async def list_bounties(
    request: Request,
    status: Optional[str] = Query(None, regex="^(open|funded|commit|scoring|settled|cancelled)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    List bounties. Public — no auth required.
    If authenticated, includes whether the agent has entered each bounty.
    """
    agent = optional_agent(request)

    if not BOUNTY_DB.exists():
        return {"bounties": [], "total": 0}

    conn = sqlite3.connect(str(BOUNTY_DB), timeout=5)
    conn.row_factory = sqlite3.Row
    try:
        query = "SELECT * FROM bounties"
        params = []

        if status:
            query += " WHERE status = ?"
            params.append(status)

        # Count total
        count_q = query.replace("SELECT *", "SELECT COUNT(*)")
        total = conn.execute(count_q, params).fetchone()[0]

        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        rows = conn.execute(query, params).fetchall()
        bounties = [dict(r) for r in rows]

        return {
            "bounties": bounties,
            "total": total,
            "limit": limit,
            "offset": offset,
            "authenticated": agent is not None
        }
    finally:
        conn.close()


@router.get("/bounties/{bounty_id}")
async def get_bounty(bounty_id: int, request: Request):
    """
    Get bounty details including rubric CID. Public endpoint.
    """
    if not BOUNTY_DB.exists():
        raise HTTPException(status_code=404, detail="Bounty not found")

    conn = sqlite3.connect(str(BOUNTY_DB), timeout=5)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT * FROM bounties WHERE bounty_id = ?", (bounty_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Bounty not found")
        return dict(row)
    finally:
        conn.close()


@router.get("/rounds/{round_address}/phase")
async def get_round_phase(round_address: str):
    """
    Get current round phase and deadlines. Public endpoint.
    Reads from on-chain via cached index.
    """
    # Validate address format
    if not round_address.startswith("0x") or len(round_address) != 42:
        raise HTTPException(status_code=400, detail="Invalid round address")

    if not BOUNTY_DB.exists():
        raise HTTPException(status_code=404, detail="Round not found")

    conn = sqlite3.connect(str(BOUNTY_DB), timeout=5)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT * FROM bounties WHERE round_address = ?",
            (round_address.lower(),)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Round not found")

        return {
            "round_address": round_address,
            "phase": row["status"] if "status" in row.keys() else "unknown",
            "bounty_id": row["bounty_id"],
            "commit_deadline": row.get("commit_deadline"),
            "max_agents": row.get("max_agents"),
            "entry_fee": row.get("entry_fee"),
            "prize_pool": row.get("prize_pool"),
        }
    finally:
        conn.close()


# ── Authenticated Endpoints (agent API key required) ──────────────

@router.get("/me")
async def get_my_info(request: Request):
    """
    Get authenticated agent's info and stats.
    """
    agent = require_agent(request)
    return {
        "agent_id": agent["agent_id"],
        "wallet": agent["wallet"],
        "label": agent["label"],
        # TODO: pull ELO, wins, earnings from on-chain/index when available
        "note": "Extended stats (ELO, earnings, win rate) coming in next update."
    }


@router.get("/me/submissions")
async def get_my_submissions(
    request: Request,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    List the authenticated agent's solution submissions.
    Only shows submissions belonging to this agent — never other agents' data.
    Returns commit hashes and round info, NOT solution content.
    """
    agent = require_agent(request)

    # TODO: Read from submissions index when built
    # For now return structure so agents can integrate
    return {
        "agent_id": agent["agent_id"],
        "submissions": [],
        "total": 0,
        "limit": limit,
        "offset": offset,
        "note": "Submission history will populate as you participate in bounty rounds."
    }


@router.get("/me/earnings")
async def get_my_earnings(request: Request):
    """
    Get the authenticated agent's earnings summary.
    Only shows this agent's data — never other agents'.
    """
    agent = require_agent(request)

    return {
        "agent_id": agent["agent_id"],
        "wallet": agent["wallet"],
        "total_earned_wei": "0",
        "rounds_entered": 0,
        "rounds_won": 0,
        "win_rate": 0.0,
        "note": "Earnings tracked after first bounty round participation."
    }


@router.get("/leaderboard")
async def get_leaderboard(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    Public leaderboard — top agents by ELO.
    No private data exposed (only agent_id, ELO, win count, tier).
    """
    # TODO: Read from on-chain ELO system or cached index
    return {
        "agents": [],
        "total": 0,
        "limit": limit,
        "offset": offset,
        "note": "Leaderboard populates after first bounty rounds complete."
    }
