"""
Agent API Key Service — secure key generation, hashing, and validation.

Security model:
- Keys are prefixed `ag_live_` for easy identification in logs/configs
- Only SHA-256 hash stored in DB — plaintext never persists
- Each key is scoped to a single agentId
- Max 3 active keys per agent (allows rotation without downtime)
- Wallet signature (EIP-191) required to create/rotate keys
"""

import hashlib
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Optional

from eth_account.messages import encode_defunct
from web3 import Web3

# ── Constants ──────────────────────────────────────────────────────
KEY_PREFIX = "ag_live_"
KEY_BYTES = 32  # 256-bit entropy
MAX_KEYS_PER_AGENT = 3
DB_PATH = Path("/opt/agonaut-api/data/agent_keys.db")

# ── Database ───────────────────────────────────────────────────────

def _get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id INTEGER NOT NULL,
            wallet TEXT NOT NULL,
            key_hash TEXT NOT NULL UNIQUE,
            key_prefix TEXT NOT NULL,
            label TEXT DEFAULT '',
            created_at REAL NOT NULL,
            last_used_at REAL,
            revoked_at REAL,
            is_active INTEGER NOT NULL DEFAULT 1
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_keys_agent ON api_keys(agent_id, is_active)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_keys_hash ON api_keys(key_hash)")
    conn.commit()
    return conn


def _hash_key(raw_key: str) -> str:
    """SHA-256 hash of the raw API key. One-way — cannot recover the key."""
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


# ── Key Generation ─────────────────────────────────────────────────

def generate_key() -> str:
    """Generate a new API key with prefix. Returns the raw key (show once)."""
    token = secrets.token_hex(KEY_BYTES)
    return f"{KEY_PREFIX}{token}"


# ── Signature Verification ─────────────────────────────────────────

def verify_wallet_signature(wallet: str, message: str, signature: str) -> bool:
    """
    Verify an EIP-191 personal_sign signature.
    Returns True if the signature was produced by the given wallet.
    """
    try:
        w3 = Web3()
        msg = encode_defunct(text=message)
        recovered = w3.eth.account.recover_message(msg, signature=signature)
        return recovered.lower() == wallet.lower()
    except Exception:
        return False


def make_signing_message(agent_id: int, action: str = "create_api_key") -> str:
    """
    Deterministic message for the agent to sign.
    Includes action + agent_id + timestamp window (1-hour granularity)
    to prevent replay across different time windows.
    """
    # 1-hour window: floor to nearest hour
    hour_ts = int(time.time()) // 3600 * 3600
    return (
        f"Agonaut API Key Request\n"
        f"Action: {action}\n"
        f"Agent ID: {agent_id}\n"
        f"Timestamp: {hour_ts}"
    )


# ── CRUD Operations ────────────────────────────────────────────────

def create_key(agent_id: int, wallet: str, label: str = "") -> Optional[str]:
    """
    Create a new API key for an agent. Returns the raw key (show ONCE to user).
    Returns None if max keys reached.
    """
    conn = _get_db()
    try:
        # Check active key count
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM api_keys WHERE agent_id = ? AND is_active = 1",
            (agent_id,)
        ).fetchone()
        if row["cnt"] >= MAX_KEYS_PER_AGENT:
            return None

        raw_key = generate_key()
        key_hash = _hash_key(raw_key)
        # Store first 12 chars for identification (ag_live_xxxx)
        key_prefix = raw_key[:16]

        conn.execute(
            """INSERT INTO api_keys (agent_id, wallet, key_hash, key_prefix, label, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (agent_id, wallet.lower(), key_hash, key_prefix, label, time.time())
        )
        conn.commit()
        return raw_key
    finally:
        conn.close()


def validate_key(raw_key: str) -> Optional[dict]:
    """
    Validate an API key. Returns agent info dict if valid, None if invalid/revoked.
    Updates last_used_at on successful validation.
    """
    if not raw_key.startswith(KEY_PREFIX):
        return None

    key_hash = _hash_key(raw_key)
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1",
            (key_hash,)
        ).fetchone()
        if not row:
            return None

        # Update last_used_at (fire-and-forget, don't fail on this)
        try:
            conn.execute(
                "UPDATE api_keys SET last_used_at = ? WHERE id = ?",
                (time.time(), row["id"])
            )
            conn.commit()
        except Exception:
            pass

        return {
            "agent_id": row["agent_id"],
            "wallet": row["wallet"],
            "key_id": row["id"],
            "label": row["label"],
        }
    finally:
        conn.close()


def list_keys(agent_id: int) -> list[dict]:
    """List all active keys for an agent (without hashes — only prefix + metadata)."""
    conn = _get_db()
    try:
        rows = conn.execute(
            """SELECT id, key_prefix, label, created_at, last_used_at
               FROM api_keys WHERE agent_id = ? AND is_active = 1
               ORDER BY created_at DESC""",
            (agent_id,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def revoke_key(key_id: int, agent_id: int) -> bool:
    """Revoke a specific key. Agent can only revoke their own keys."""
    conn = _get_db()
    try:
        result = conn.execute(
            """UPDATE api_keys SET is_active = 0, revoked_at = ?
               WHERE id = ? AND agent_id = ? AND is_active = 1""",
            (time.time(), key_id, agent_id)
        )
        conn.commit()
        return result.rowcount > 0
    finally:
        conn.close()


def revoke_all_keys(agent_id: int) -> int:
    """Revoke all keys for an agent. Returns count revoked."""
    conn = _get_db()
    try:
        result = conn.execute(
            "UPDATE api_keys SET is_active = 0, revoked_at = ? WHERE agent_id = ? AND is_active = 1",
            (time.time(), agent_id)
        )
        conn.commit()
        return result.rowcount
    finally:
        conn.close()
