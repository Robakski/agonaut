"""
Problem Vault — Encrypted storage for private bounty descriptions.

Visibility tiers:
  PUBLIC  — Full problem visible to everyone (existing behavior)
  SUMMARY — Title + tags visible, full spec encrypted (decrypt after entry fee)
  PRIVATE — Only title visible, everything else encrypted (decrypt after entry fee)

Key management (V1 — platform-custodied):
  - Sponsor encrypts problem client-side with a random AES-256 key
  - Problem key stored encrypted at rest (Fernet) on backend
  - Released to agents ONLY after on-chain entry fee verification
  - Every key release is audit-logged (who, when, on-chain tx proof)

Trust model:
  - Non-payers: cryptographically locked out ✅
  - Paying agents: full access (they need it to solve) ✅
  - Platform: technically could access (key custodied) — mitigated by encryption at rest + audit log
  - Solutions: zero-knowledge (ECIES, sponsor-only) ✅

V2 upgrade path: TEE-based key escrow (platform never sees key)
"""

import sqlite3
import os
import json
import time
import hashlib
import logging
from pathlib import Path
from typing import Optional
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

DB_PATH = Path("/opt/agonaut-api/data/problem_vault.db")

_fernet: Optional[Fernet] = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = os.environ.get("PROBLEM_VAULT_KEY", "")
        if not key:
            key = os.environ.get("KYC_ENCRYPTION_KEY", "")
        if not key:
            raise RuntimeError("PROBLEM_VAULT_KEY not set")
        _fernet = Fernet(key.encode())
    return _fernet


def _get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS private_problems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            round_address TEXT NOT NULL UNIQUE,
            visibility TEXT NOT NULL DEFAULT 'PUBLIC',
            title TEXT NOT NULL,
            summary TEXT,
            tags TEXT,
            encrypted_problem TEXT NOT NULL,
            problem_key_enc TEXT NOT NULL,
            sponsor_address TEXT NOT NULL,
            created_at REAL NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS problem_access_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            round_address TEXT NOT NULL,
            agent_address TEXT NOT NULL,
            entry_tx_hash TEXT,
            key_released INTEGER NOT NULL DEFAULT 0,
            reason TEXT,
            requested_at REAL NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_priv_round ON private_problems(round_address)")
    conn.commit()
    return conn


def store_private_problem(
    round_address: str,
    visibility: str,
    title: str,
    summary: str,
    tags: list[str],
    encrypted_problem: str,
    problem_key: str,
    sponsor_address: str,
) -> bool:
    """Store an encrypted problem description.

    Args:
        encrypted_problem: AES-256-GCM encrypted problem (hex, encrypted client-side)
        problem_key: The AES key used to encrypt (we store it encrypted at rest)
    """
    conn = _get_db()
    try:
        # Encrypt the problem key at rest
        key_enc = _get_fernet().encrypt(problem_key.encode()).decode()

        conn.execute(
            """INSERT INTO private_problems
               (round_address, visibility, title, summary, tags,
                encrypted_problem, problem_key_enc, sponsor_address, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(round_address) DO UPDATE SET
                encrypted_problem = ?, problem_key_enc = ?""",
            (
                round_address.lower(), visibility, title, summary or "",
                json.dumps(tags), encrypted_problem, key_enc,
                sponsor_address.lower(), time.time(),
                encrypted_problem, key_enc,
            )
        )
        conn.commit()
        logger.info(f"Stored {visibility} problem for round {round_address[:10]}...")
        return True
    except Exception as e:
        logger.error(f"Failed to store private problem: {e}")
        return False
    finally:
        conn.close()


def get_problem_metadata(round_address: str) -> Optional[dict]:
    """Get public metadata for a private bounty (no key, no full problem)."""
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT visibility, title, summary, tags, sponsor_address, created_at FROM private_problems WHERE round_address = ?",
            (round_address.lower(),)
        ).fetchone()
        if not row:
            return None
        return {
            "visibility": row["visibility"],
            "title": row["title"],
            "summary": row["summary"],
            "tags": json.loads(row["tags"]) if row["tags"] else [],
            "sponsor_address": row["sponsor_address"],
            "created_at": row["created_at"],
        }
    finally:
        conn.close()


def release_problem_key(
    round_address: str,
    agent_address: str,
    entry_tx_hash: str,
) -> Optional[dict]:
    """Release the problem decryption key to an agent who paid entry fee.

    Returns {encrypted_problem, problem_key} or None if denied.
    The caller MUST verify on-chain that the agent paid before calling this.
    """
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT encrypted_problem, problem_key_enc, visibility FROM private_problems WHERE round_address = ?",
            (round_address.lower(),)
        ).fetchone()
        if not row:
            _log_access(conn, round_address, agent_address, entry_tx_hash, False, "round not found")
            return None

        if row["visibility"] == "PUBLIC":
            _log_access(conn, round_address, agent_address, entry_tx_hash, False, "public bounty — no key needed")
            return None

        # Decrypt the problem key from our vault
        problem_key = _get_fernet().decrypt(row["problem_key_enc"].encode()).decode()

        # Log the release
        _log_access(conn, round_address, agent_address, entry_tx_hash, True, "entry fee verified")

        logger.info(f"Released problem key: round={round_address[:10]}... agent={agent_address[:10]}...")

        return {
            "encrypted_problem": row["encrypted_problem"],
            "problem_key": problem_key,
        }
    except Exception as e:
        logger.error(f"Failed to release problem key: {e}")
        _log_access(conn, round_address, agent_address, entry_tx_hash, False, f"error: {e}")
        return None
    finally:
        conn.close()


def get_problem_for_scoring(round_address: str) -> Optional[str]:
    """Get the problem key for TEE scoring. Internal use only.

    The scoring service needs the decrypted problem to provide context
    to the scoring LLM. This returns the raw key.
    """
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT problem_key_enc, visibility FROM private_problems WHERE round_address = ?",
            (round_address.lower(),)
        ).fetchone()
        if not row or row["visibility"] == "PUBLIC":
            return None
        return _get_fernet().decrypt(row["problem_key_enc"].encode()).decode()
    finally:
        conn.close()


def get_access_log(round_address: str) -> list[dict]:
    """Admin: see who accessed a private problem."""
    conn = _get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM problem_access_log WHERE round_address = ? ORDER BY requested_at DESC LIMIT 100",
            (round_address.lower(),)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _log_access(conn, round_address, agent_address, tx_hash, granted, reason):
    conn.execute(
        "INSERT INTO problem_access_log (round_address, agent_address, entry_tx_hash, key_released, reason, requested_at) VALUES (?, ?, ?, ?, ?, ?)",
        (round_address.lower(), agent_address.lower(), tx_hash or "", int(granted), reason, time.time())
    )
    conn.commit()
