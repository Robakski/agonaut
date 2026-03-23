"""
Solution Vault — Zero-knowledge storage for winning solutions.

After TEE scoring, winning solutions are ECIES-encrypted with the sponsor's
secp256k1 public key. We store the encrypted blob. We CANNOT decrypt it —
only the sponsor's wallet private key can.

This is the core trust guarantee of Agonaut:
"Not even the platform can see your solution after scoring."

Storage format: JSON blob containing {ephemeral_pubkey, iv, ciphertext, mac}
All hex-encoded. The sponsor's browser decrypts using ECDH + AES-256-GCM.
"""

import sqlite3
import json
import time
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DB_PATH = Path("/opt/agonaut-api/data/solution_vault.db")


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
            encrypted_blob TEXT NOT NULL,
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
    encrypted_solution: dict,
    sponsor_address: str,
) -> bool:
    """Store an ECIES-encrypted winning solution. We CANNOT decrypt this."""
    conn = _get_db()
    try:
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
               (round_address, agent_address, agent_id, score, encrypted_blob,
                sponsor_address, stored_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                round_address.lower(),
                agent_address.lower(),
                agent_id,
                score,
                json.dumps(encrypted_solution),
                sponsor_address.lower(),
                now,
                now + (EXPIRY_DAYS * 86400),
            )
        )
        conn.commit()
        logger.info(f"Stored ECIES-encrypted solution: round={round_address[:10]}... agent={agent_id} score={score}")
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
    """Retrieve encrypted winning solutions. Only returns if requester is the sponsor.

    The returned blobs are ECIES-encrypted — the requester must decrypt
    them client-side using their wallet's private key.
    """
    conn = _get_db()
    try:
        now = time.time()
        rows = conn.execute(
            """SELECT agent_address, agent_id, score, encrypted_blob, sponsor_address,
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

        # Grant access — return encrypted blobs (we can't read them)
        _log_access(conn, round_address, requester_address, True, "sponsor verified")

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
                "encrypted_solution": json.loads(row["encrypted_blob"]),
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
