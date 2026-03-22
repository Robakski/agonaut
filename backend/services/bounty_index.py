"""
Bounty Index — SQLite-backed index for fast bounty listing.

Writes on bounty creation, reads for listing/filtering.
Source of truth remains on-chain; this is a read-optimized cache.
"""

import sqlite3
import time
import os
from contextlib import contextmanager
from typing import Optional

DB_PATH = os.environ.get("BOUNTY_INDEX_DB", "/opt/agonaut-api/data/bounty_index.db")


def _ensure_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with _get_db() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA busy_timeout=5000")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS bounties (
                bounty_id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                tags TEXT DEFAULT '[]',
                sponsor TEXT NOT NULL,
                bounty_eth REAL NOT NULL,
                entry_fee_eth REAL DEFAULT 0.003,
                max_agents INTEGER DEFAULT 0,
                commit_hours INTEGER,
                threshold INTEGER DEFAULT 7000,
                graduated INTEGER DEFAULT 1,
                round_address TEXT,
                problem_cid TEXT,
                rubric_cid TEXT,
                phase TEXT DEFAULT 'CREATED',
                agent_count INTEGER DEFAULT 0,
                deposit_eth REAL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_bounties_phase ON bounties(phase);
            CREATE INDEX IF NOT EXISTS idx_bounties_sponsor ON bounties(sponsor);
            CREATE INDEX IF NOT EXISTS idx_bounties_created ON bounties(created_at);
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


def index_bounty(
    bounty_id: int,
    title: str,
    description: str,
    tags: list[str],
    sponsor: str,
    bounty_eth: float,
    max_agents: int,
    commit_hours: int,
    threshold: int,
    graduated: bool,
    round_address: str,
    problem_cid: str,
    rubric_cid: Optional[str] = None,
):
    """Write a new bounty to the index."""
    _ensure_db()
    now = int(time.time())
    import json
    with _get_db() as db:
        db.execute(
            """INSERT OR REPLACE INTO bounties
               (bounty_id, title, description, tags, sponsor, bounty_eth,
                max_agents, commit_hours, threshold, graduated, round_address,
                problem_cid, rubric_cid, phase, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (bounty_id, title, description, json.dumps(tags), sponsor.lower(),
             bounty_eth, max_agents, commit_hours, threshold, int(graduated),
             round_address, problem_cid, rubric_cid, "CREATED", now, now),
        )


def update_bounty_phase(bounty_id: int, phase: str, agent_count: int = 0, deposit_eth: float = 0):
    """Update cached phase/agent count from on-chain state."""
    _ensure_db()
    with _get_db() as db:
        db.execute(
            "UPDATE bounties SET phase=?, agent_count=?, deposit_eth=?, updated_at=? WHERE bounty_id=?",
            (phase, agent_count, deposit_eth, int(time.time()), bounty_id),
        )


def list_bounties(
    phase: Optional[str] = None,
    sponsor: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[int, list[dict]]:
    """List bounties with optional filters. Returns (total_count, bounties)."""
    _ensure_db()
    where, params = [], []
    if phase:
        where.append("phase = ?")
        params.append(phase)
    if sponsor:
        where.append("sponsor = ?")
        params.append(sponsor.lower())
    w = f"WHERE {' AND '.join(where)}" if where else ""

    with _get_db() as db:
        total = db.execute(f"SELECT COUNT(*) FROM bounties {w}", params).fetchone()[0]
        rows = db.execute(
            f"SELECT * FROM bounties {w} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()

    return total, [dict(r) for r in rows]


def get_bounty(bounty_id: int) -> Optional[dict]:
    """Get a single bounty by ID."""
    _ensure_db()
    with _get_db() as db:
        row = db.execute("SELECT * FROM bounties WHERE bounty_id = ?", (bounty_id,)).fetchone()
    return dict(row) if row else None


def get_sponsor_bounties(sponsor: str, limit: int = 50) -> list[dict]:
    """Get all bounties for a sponsor wallet."""
    _ensure_db()
    with _get_db() as db:
        rows = db.execute(
            "SELECT * FROM bounties WHERE sponsor = ? ORDER BY created_at DESC LIMIT ?",
            (sponsor.lower(), limit),
        ).fetchall()
    return [dict(r) for r in rows]
