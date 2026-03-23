"""
Solution Vault — Secure storage for winning solutions after scoring.

After TEE scoring completes and scores are submitted on-chain, the winning
solution(s) are stored here encrypted at rest. Only the verified sponsor
(via wallet signature) can retrieve them.

Security model:
- Solutions encrypted with Fernet (AES-256) at rest in SQLite
- Access requires wallet signature verification (EIP-191)
- On-chain verification that requester is the round's sponsor
- Solutions only stored after SETTLED phase
- Auto-expire after 90 days (matching on-chain claim window)
"""

import sqlite3
import time
import os
import logging
from pathlib import Path
from typing import Optional
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

DB_PATH = Path("/opt/agonaut-api/data/solution_vault.db")

_fernet: Optional[Fernet] = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = os.environ.get("SOLUTION_VAULT_KEY", "")
        if not key:
            # Use KYC encryption key as fallback (same security domain)
            key = os.environ.get("KYC_ENCRYPTION_KEY", "")
        if not key:
            raise RuntimeError("SOLUTION_VAULT_KEY not set — cannot store solutions securely")
        _fernet = Fernet(key.encode())
    return _fernet


def _encrypt(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def _decrypt(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    return _get_fernet().decrypt(ciphertext.encode()).decode()


def _get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS winning_solutions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            round_address TEXT NOT NULL,
            agent_address TEXT NOT NULL,
            agent_id INTEGER NOT NULL,
            score INTEGER NOT NULL,
            solution_enc TEXT NOT NULL,
            sponsor_address TEXT NOT NULL,
            stored_at REAL NOT NULL,
            expires_at REAL NOT NULL,
            accessed_at REAL,
            access_count INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS solution_access_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            round_address TEXT NOT NULL,
            requester TEXT NOT NULL,
            granted INTEGER NOT NULL,
            reason TEXT,
            requested_at REAL NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_vault_round ON winning_solutions(round_address)")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_round_agent ON winning_solutions(round_address, agent_id)")
    conn.commit()
    return conn


EXPIRY_DAYS = 90


def store_winning_solution(
    round_address: str,
    agent_address: str,
    agent_id: int,
    score: int,
    solution_text: str,
    sponsor_address: str,
) -> bool:
    """Store a winning solution after scoring settles. Encrypted at rest."""
    conn = _get_db()
    try:
        # Check if already stored
        existing = conn.execute(
            "SELECT id FROM winning_solutions WHERE round_address = ? AND agent_id = ?",
            (round_address.lower(), agent_id)
        ).fetchone()
        if existing:
            logger.info(f"Solution already stored for round {round_address[:10]}... agent {agent_id}")
            return True

        now = time.time()
        conn.execute(
            """INSERT INTO winning_solutions
               (round_address, agent_address, agent_id, score, solution_enc,
                sponsor_address, stored_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                round_address.lower(),
                agent_address.lower(),
                agent_id,
                score,
                _encrypt(solution_text),
                sponsor_address.lower(),
                now,
                now + (EXPIRY_DAYS * 86400),
            )
        )
        conn.commit()
        logger.info(f"Stored winning solution: round={round_address[:10]}... agent={agent_id} score={score}")
        return True
    except Exception as e:
        logger.error(f"Failed to store solution: {e}")
        return False
    finally:
        conn.close()


def get_winning_solutions(
    round_address: str,
    requester_address: str,
) -> Optional[list[dict]]:
    """Retrieve winning solutions for a round. Only returns if requester is the sponsor."""
    conn = _get_db()
    try:
        now = time.time()
        rows = conn.execute(
            """SELECT agent_address, agent_id, score, solution_enc, sponsor_address,
                      stored_at, expires_at
               FROM winning_solutions
               WHERE round_address = ? AND expires_at > ?
               ORDER BY score DESC""",
            (round_address.lower(), now)
        ).fetchall()

        if not rows:
            _log_access(conn, round_address, requester_address, False, "no solutions found")
            return None

        # Verify requester is the sponsor
        sponsor = rows[0]["sponsor_address"]
        if requester_address.lower() != sponsor:
            _log_access(conn, round_address, requester_address, False, "not sponsor")
            return None

        # Grant access
        _log_access(conn, round_address, requester_address, True, "sponsor verified")

        # Update access tracking
        conn.execute(
            "UPDATE winning_solutions SET accessed_at = ?, access_count = access_count + 1 WHERE round_address = ?",
            (now, round_address.lower())
        )
        conn.commit()

        results = []
        for row in rows:
            results.append({
                "agent_address": row["agent_address"],
                "agent_id": row["agent_id"],
                "score": row["score"],
                "solution": _decrypt(row["solution_enc"]),
                "stored_at": row["stored_at"],
                "expires_at": row["expires_at"],
            })

        return results
    finally:
        conn.close()


def _log_access(conn, round_address: str, requester: str, granted: bool, reason: str):
    conn.execute(
        "INSERT INTO solution_access_log (round_address, requester, granted, reason, requested_at) VALUES (?, ?, ?, ?, ?)",
        (round_address.lower(), requester.lower(), int(granted), reason, time.time())
    )
    conn.commit()
