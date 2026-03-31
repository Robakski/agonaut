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
                is_private INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_bounties_phase ON bounties(phase);
            CREATE INDEX IF NOT EXISTS idx_bounties_sponsor ON bounties(sponsor);
            CREATE INDEX IF NOT EXISTS idx_bounties_created ON bounties(created_at);

            CREATE TABLE IF NOT EXISTS agent_participations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                round_address TEXT NOT NULL,
                agent_address TEXT NOT NULL,
                agent_id INTEGER NOT NULL,
                bounty_id INTEGER,
                action TEXT DEFAULT 'entered',
                created_at INTEGER NOT NULL,
                UNIQUE(round_address, agent_address)
            );
            CREATE INDEX IF NOT EXISTS idx_ap_agent ON agent_participations(agent_address);
            CREATE INDEX IF NOT EXISTS idx_ap_round ON agent_participations(round_address);
        """)
        # Migration: add is_private if missing
        try:
            db.execute("ALTER TABLE bounties ADD COLUMN is_private INTEGER DEFAULT 0")
        except Exception:
            pass
        # Migration: add agent_participations if missing (idempotent via IF NOT EXISTS above)
        try:
            db.execute("""CREATE TABLE IF NOT EXISTS agent_participations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                round_address TEXT NOT NULL,
                agent_address TEXT NOT NULL,
                agent_id INTEGER NOT NULL,
                bounty_id INTEGER,
                action TEXT DEFAULT 'entered',
                created_at INTEGER NOT NULL,
                UNIQUE(round_address, agent_address)
            )""")
        except Exception:
            pass


@contextmanager
def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        try:
            conn.commit()
        except sqlite3.OperationalError:
            pass  # Read-only queries don't need commit
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
    is_private: bool = False,
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
                problem_cid, rubric_cid, phase, is_private, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (bounty_id, title, description, json.dumps(tags), sponsor.lower(),
             bounty_eth, max_agents, commit_hours, threshold, int(graduated),
             round_address.lower() if round_address else round_address,
             problem_cid, rubric_cid, "CREATED", int(is_private), now, now),
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
    # Don't call _ensure_db() for read-only queries — it tries to set WAL which requires write access
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
    with _get_db() as db:
        row = db.execute("SELECT * FROM bounties WHERE bounty_id = ?", (bounty_id,)).fetchone()
    return dict(row) if row else None


def find_by_round(round_address: str) -> Optional[dict]:
    """Find a bounty by its round address."""

    with _get_db() as db:
        row = db.execute("SELECT * FROM bounties WHERE round_address = ?", (round_address.lower(),)).fetchone()
    return dict(row) if row else None


def get_sponsor_bounties(sponsor: str, limit: int = 50) -> list[dict]:
    """Get all bounties for a sponsor wallet."""

    with _get_db() as db:
        rows = db.execute(
            "SELECT * FROM bounties WHERE sponsor = ? ORDER BY created_at DESC LIMIT ?",
            (sponsor.lower(), limit),
        ).fetchall()
    return [dict(r) for r in rows]


def record_participation(round_address: str, agent_address: str, agent_id: int, bounty_id: Optional[int] = None, action: str = "submitted"):
    """Record that an agent participated in a bounty round."""
    _ensure_db()
    now = int(time.time())
    with _get_db() as db:
        db.execute(
            """INSERT OR REPLACE INTO agent_participations
               (round_address, agent_address, agent_id, bounty_id, action, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (round_address.lower(), agent_address.lower(), agent_id, bounty_id, action, now),
        )


def get_participation(round_address: str, agent_id: int) -> Optional[dict]:
    """Get participation record for an agent in a round."""

    with _get_db() as db:
        row = db.execute(
            "SELECT * FROM agent_participations WHERE round_address = ? AND agent_id = ?",
            (round_address.lower(), agent_id),
        ).fetchone()
    return dict(row) if row else None


def get_agent_bounties(agent_address: str, limit: int = 50) -> list[dict]:
    """Get all bounties an agent has participated in."""

    with _get_db() as db:
        rows = db.execute(
            """SELECT b.*, ap.agent_id as agent_id, ap.action as agent_action, ap.created_at as participated_at
               FROM agent_participations ap
               JOIN bounties b ON LOWER(b.round_address) = ap.round_address
               WHERE ap.agent_address = ?
               ORDER BY ap.created_at DESC
               LIMIT ?""",
            (agent_address.lower(), limit),
        ).fetchall()
    return [dict(r) for r in rows]
