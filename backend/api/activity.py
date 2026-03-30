"""
Activity Tracker — Wallet activity logging for airdrop eligibility.

Tracks every meaningful user action with timestamps.
Stored in SQLite for simplicity (migrate to Postgres before mainnet).
"""

import sqlite3
import time
import os
import json
import logging

log = logging.getLogger("activity")
from contextlib import contextmanager
from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/activity", tags=["activity"])

DB_PATH = os.environ.get("ACTIVITY_DB", "/opt/agonaut-api/data/activity.db")


def _ensure_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with _get_db() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA busy_timeout=5000")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS wallets (
                address TEXT PRIMARY KEY,
                first_seen INTEGER NOT NULL,
                last_seen INTEGER NOT NULL,
                total_sessions INTEGER DEFAULT 0,
                total_duration_sec INTEGER DEFAULT 0,
                role TEXT DEFAULT 'visitor',
                bounties_created INTEGER DEFAULT 0,
                total_deposited_wei TEXT DEFAULT '0',
                agent_registered INTEGER DEFAULT 0,
                agent_registered_at INTEGER,
                solutions_submitted INTEGER DEFAULT 0,
                total_entry_fees_wei TEXT DEFAULT '0',
                wins INTEGER DEFAULT 0,
                total_earned_wei TEXT DEFAULT '0',
                pages_visited INTEGER DEFAULT 0,
                unique_pages TEXT DEFAULT '[]',
                streak_days INTEGER DEFAULT 0,
                last_active_date TEXT,
                referral_code TEXT,
                referred_by TEXT,
                ens_name TEXT,
                notes TEXT DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                wallet TEXT NOT NULL,
                event TEXT NOT NULL,
                detail TEXT,
                page TEXT,
                ts INTEGER NOT NULL,
                session_id TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_events_wallet ON events(wallet);
            CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
            CREATE INDEX IF NOT EXISTS idx_events_event ON events(event);
        """)


@contextmanager
def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# ── Event types ──
# connect          — wallet connected
# disconnect       — wallet disconnected (session end)
# page_view        — visited a page
# bounty_created   — created a bounty
# bounty_deposited — deposited ETH to bounty
# agent_registered — registered an agent
# solution_submit  — submitted a solution
# entry_fee_paid   — paid entry fee for a round
# bounty_won       — won a bounty round
# referral_used    — used someone's referral code


VALID_EVENTS = {
    "connect", "disconnect", "page_view", "bounty_created", "bounty_deposited",
    "agent_registered", "solution_submit", "entry_fee_paid", "bounty_won", "referral_used",
}


class TrackEventRequest(BaseModel):
    wallet: str = Field(min_length=42, max_length=42, pattern=r"^0x[a-fA-F0-9]{40}$")
    event: str = Field(min_length=1, max_length=30)
    detail: Optional[str] = Field(None, max_length=200)
    page: Optional[str] = Field(None, max_length=200)
    session_id: Optional[str] = Field(None, max_length=50)
    amount_wei: Optional[str] = Field(None, max_length=30)


class TrackEventResponse(BaseModel):
    ok: bool


def track_activity_direct(wallet: str, event: str, metadata: dict = None):
    """Direct function call for internal activity tracking (no HTTP round-trip)."""
    try:
        if event not in VALID_EVENTS:
            log.warning(f"Invalid activity event: {event}")
            return
        _ensure_db()
        now = int(time.time())
        wallet = wallet.lower()
        detail = json.dumps(metadata) if metadata else None

        with _get_db() as db:
            existing = db.execute("SELECT * FROM wallets WHERE address = ?", (wallet,)).fetchone()
            if not existing:
                db.execute(
                    "INSERT INTO wallets (address, first_seen, last_seen) VALUES (?, ?, ?)",
                    (wallet, now, now),
                )
            else:
                db.execute("UPDATE wallets SET last_seen = ? WHERE address = ?", (now, wallet))
            db.execute(
                "INSERT INTO events (wallet, event, detail, page, ts, session_id) VALUES (?, ?, ?, ?, ?, ?)",
                (wallet, event, detail, None, now, None),
            )
        log.info(f"Activity tracked: {wallet} → {event}")
    except Exception as e:
        log.warning(f"Activity tracking failed (non-blocking): {e}")


@router.post("/track", response_model=TrackEventResponse)
async def track_event(req: TrackEventRequest):
    """Log a wallet activity event."""
    if req.event not in VALID_EVENTS:
        raise HTTPException(400, f"Invalid event type: {req.event}")
    _ensure_db()
    now = int(time.time())
    wallet = req.wallet.lower()

    with _get_db() as db:
        # Upsert wallet
        existing = db.execute("SELECT * FROM wallets WHERE address = ?", (wallet,)).fetchone()
        if not existing:
            db.execute(
                "INSERT INTO wallets (address, first_seen, last_seen) VALUES (?, ?, ?)",
                (wallet, now, now),
            )
        else:
            db.execute("UPDATE wallets SET last_seen = ? WHERE address = ?", (now, wallet))

        # Log event
        db.execute(
            "INSERT INTO events (wallet, event, detail, page, ts, session_id) VALUES (?, ?, ?, ?, ?, ?)",
            (wallet, req.event, req.detail, req.page, now, req.session_id),
        )

        # Update aggregates based on event type
        if req.event == "connect":
            db.execute(
                "UPDATE wallets SET total_sessions = total_sessions + 1 WHERE address = ?",
                (wallet,),
            )
            _update_streak(db, wallet, now)

        elif req.event == "page_view" and req.page:
            db.execute(
                "UPDATE wallets SET pages_visited = pages_visited + 1 WHERE address = ?",
                (wallet,),
            )
            # Track unique pages
            row = db.execute("SELECT unique_pages FROM wallets WHERE address = ?", (wallet,)).fetchone()
            import json
            pages = json.loads(row["unique_pages"]) if row else []
            if req.page not in pages:
                pages.append(req.page)
                db.execute(
                    "UPDATE wallets SET unique_pages = ? WHERE address = ?",
                    (json.dumps(pages), wallet),
                )

        elif req.event == "bounty_created":
            db.execute(
                "UPDATE wallets SET bounties_created = bounties_created + 1, role = CASE WHEN role = 'agent' THEN 'both' WHEN role = 'visitor' THEN 'sponsor' ELSE role END WHERE address = ?",
                (wallet,),
            )

        elif req.event == "bounty_deposited" and req.amount_wei:
            db.execute(
                "UPDATE wallets SET total_deposited_wei = CAST(CAST(total_deposited_wei AS INTEGER) + ? AS TEXT) WHERE address = ?",
                (int(req.amount_wei), wallet),
            )

        elif req.event == "agent_registered":
            db.execute(
                "UPDATE wallets SET agent_registered = 1, agent_registered_at = ?, role = CASE WHEN role = 'sponsor' THEN 'both' WHEN role = 'visitor' THEN 'agent' ELSE role END WHERE address = ?",
                (now, wallet),
            )

        elif req.event == "solution_submit":
            db.execute(
                "UPDATE wallets SET solutions_submitted = solutions_submitted + 1 WHERE address = ?",
                (wallet,),
            )

        elif req.event == "entry_fee_paid" and req.amount_wei:
            db.execute(
                "UPDATE wallets SET total_entry_fees_wei = CAST(CAST(total_entry_fees_wei AS INTEGER) + ? AS TEXT) WHERE address = ?",
                (int(req.amount_wei), wallet),
            )

        elif req.event == "bounty_won":
            db.execute(
                "UPDATE wallets SET wins = wins + 1 WHERE address = ?",
                (wallet,),
            )
            if req.amount_wei:
                db.execute(
                    "UPDATE wallets SET total_earned_wei = CAST(CAST(total_earned_wei AS INTEGER) + ? AS TEXT) WHERE address = ?",
                    (int(req.amount_wei), wallet),
                )

        elif req.event == "disconnect" and req.detail:
            # detail = session duration in seconds
            try:
                dur = int(req.detail)
                db.execute(
                    "UPDATE wallets SET total_duration_sec = total_duration_sec + ? WHERE address = ?",
                    (dur, wallet),
                )
            except ValueError:
                pass

    return TrackEventResponse(ok=True)


def _update_streak(db, wallet: str, now: int):
    """Update consecutive-day streak."""
    import datetime
    today = datetime.date.fromtimestamp(now).isoformat()
    yesterday = datetime.date.fromtimestamp(now - 86400).isoformat()
    row = db.execute("SELECT last_active_date, streak_days FROM wallets WHERE address = ?", (wallet,)).fetchone()
    if row:
        last = row["last_active_date"]
        streak = row["streak_days"] or 0
        if last == today:
            return  # Already counted today
        elif last == yesterday:
            streak += 1
        else:
            streak = 1
        db.execute(
            "UPDATE wallets SET streak_days = ?, last_active_date = ? WHERE address = ?",
            (streak, today, wallet),
        )
    else:
        db.execute(
            "UPDATE wallets SET streak_days = 1, last_active_date = ? WHERE address = ?",
            (today, wallet),
        )


# ── Admin endpoints (protected by API key in production) ──

@router.get("/wallets")
async def list_wallets(
    sort: str = Query("first_seen", description="Sort field"),
    order: str = Query("desc"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    role: Optional[str] = Query(None),
    min_sessions: Optional[int] = Query(None),
):
    """Admin: list all tracked wallets with airdrop metrics."""
    _ensure_db()
    allowed_sorts = {
        "first_seen", "last_seen", "total_sessions", "bounties_created",
        "solutions_submitted", "wins", "streak_days", "pages_visited",
        "total_duration_sec",
    }
    sort = sort if sort in allowed_sorts else "first_seen"
    order = "DESC" if order.lower() == "desc" else "ASC"

    where_clauses = []
    params: list = []
    if role:
        where_clauses.append("role = ?")
        params.append(role)
    if min_sessions:
        where_clauses.append("total_sessions >= ?")
        params.append(min_sessions)

    where = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    with _get_db() as db:
        total = db.execute(f"SELECT COUNT(*) FROM wallets {where}", params).fetchone()[0]
        rows = db.execute(
            f"SELECT * FROM wallets {where} ORDER BY {sort} {order} LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()

    return {
        "total": total,
        "wallets": [dict(r) for r in rows],
    }


@router.get("/wallets/{address}")
async def get_wallet(address: str):
    """Admin: get detailed activity for a specific wallet."""
    _ensure_db()
    wallet = address.lower()
    with _get_db() as db:
        row = db.execute("SELECT * FROM wallets WHERE address = ?", (wallet,)).fetchone()
        if not row:
            return {"error": "Wallet not found"}

        events = db.execute(
            "SELECT * FROM events WHERE wallet = ? ORDER BY ts DESC LIMIT 100",
            (wallet,),
        ).fetchall()

    return {
        "wallet": dict(row),
        "recent_events": [dict(e) for e in events],
    }


@router.get("/stats")
async def airdrop_stats():
    """Admin: aggregate stats for airdrop planning."""
    _ensure_db()
    with _get_db() as db:
        total = db.execute("SELECT COUNT(*) FROM wallets").fetchone()[0]
        sponsors = db.execute("SELECT COUNT(*) FROM wallets WHERE role IN ('sponsor', 'both')").fetchone()[0]
        agents = db.execute("SELECT COUNT(*) FROM wallets WHERE role IN ('agent', 'both')").fetchone()[0]
        dual = db.execute("SELECT COUNT(*) FROM wallets WHERE role = 'both'").fetchone()[0]
        with_submissions = db.execute("SELECT COUNT(*) FROM wallets WHERE solutions_submitted > 0").fetchone()[0]
        with_bounties = db.execute("SELECT COUNT(*) FROM wallets WHERE bounties_created > 0").fetchone()[0]
        with_wins = db.execute("SELECT COUNT(*) FROM wallets WHERE wins > 0").fetchone()[0]
        total_events = db.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        avg_sessions = db.execute("SELECT AVG(total_sessions) FROM wallets WHERE total_sessions > 0").fetchone()[0] or 0
        avg_streak = db.execute("SELECT AVG(streak_days) FROM wallets WHERE streak_days > 0").fetchone()[0] or 0

    return {
        "total_wallets": total,
        "sponsors": sponsors,
        "agents": agents,
        "dual_role": dual,
        "with_submissions": with_submissions,
        "with_bounties": with_bounties,
        "with_wins": with_wins,
        "total_events": total_events,
        "avg_sessions": round(avg_sessions, 1),
        "avg_streak_days": round(avg_streak, 1),
    }


@router.get("/export")
async def export_airdrop_csv(
    min_sessions: int = Query(1, description="Minimum sessions to qualify"),
    min_actions: int = Query(0, description="Minimum total actions"),
):
    """Admin: export airdrop-eligible wallets as JSON (CSV conversion client-side)."""
    _ensure_db()
    with _get_db() as db:
        rows = db.execute(
            """SELECT address, first_seen, last_seen, total_sessions, total_duration_sec,
                      role, bounties_created, total_deposited_wei, agent_registered,
                      solutions_submitted, total_entry_fees_wei, wins, total_earned_wei,
                      streak_days, pages_visited, ens_name
               FROM wallets
               WHERE total_sessions >= ?
                 AND (bounties_created + solutions_submitted + wins) >= ?
               ORDER BY first_seen ASC""",
            (min_sessions, min_actions),
        ).fetchall()

    return {"count": len(rows), "eligible": [dict(r) for r in rows]}
