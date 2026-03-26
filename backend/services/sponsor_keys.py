"""
Sponsor Public Key Registry — stores ECDH public keys for solution re-encryption.

During bounty creation, the sponsor signs a message. We recover their
secp256k1 public key from the signature and store it. This key is later
given to the Phala TEE so it can re-encrypt winning solutions such that
ONLY the sponsor can decrypt them.

Security model:
- Public keys are... public. No encryption needed for storage.
- But we verify the signature to ensure it really belongs to the sponsor.
- The private key never leaves the sponsor's wallet.
- We cannot decrypt solutions encrypted with these public keys.
"""

import sqlite3
import time
import logging
from pathlib import Path
from typing import Optional

from eth_account.messages import encode_defunct
from eth_account import Account

logger = logging.getLogger(__name__)

DB_PATH = Path("/opt/agonaut-api/data/sponsor_keys.db")


def _get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sponsor_pubkeys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet TEXT NOT NULL,
            public_key_hex TEXT NOT NULL,
            registered_at REAL NOT NULL
        )
    """)
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_sponsor_wallet ON sponsor_pubkeys(wallet)")
    conn.commit()
    return conn


def recover_public_key(message: str, signature: str) -> tuple[str, str]:
    """
    Recover the secp256k1 public key from a signed message.

    Returns (address, uncompressed_public_key_hex).
    The public key is 65 bytes: 0x04 + 32 bytes X + 32 bytes Y.
    """
    from eth_keys import keys as eth_keys

    msg = encode_defunct(text=message)
    # Recover address first to verify
    address = Account.recover_message(msg, signature=signature)

    # Recover the full public key
    # eth_account doesn't directly expose the public key, so we use eth_keys
    from eth_account._utils.signing import to_standard_v
    from eth_utils import decode_hex

    sig_bytes = decode_hex(signature)
    if len(sig_bytes) == 65:
        r = int.from_bytes(sig_bytes[:32], "big")
        s = int.from_bytes(sig_bytes[32:64], "big")
        v = sig_bytes[64]
        if v >= 27:
            v -= 27

        # Hash the message the same way eth_account does
        import hashlib
        from eth_account._utils.signing import hash_of_signed_message
        msg_hash = hash_of_signed_message(msg)

        # Recover public key using eth_keys
        sig = eth_keys.Signature(vrs=(v, r, s))
        pubkey = sig.recover_public_key_from_msg_hash(msg_hash)
        pubkey_hex = "0x" + pubkey.to_bytes().hex()

        # Verify it matches the address
        recovered_addr = pubkey.to_checksum_address()
        if recovered_addr.lower() != address.lower():
            raise ValueError(f"Public key mismatch: {recovered_addr} != {address}")

        return address, pubkey_hex
    else:
        raise ValueError(f"Invalid signature length: {len(sig_bytes)}")


def store_public_key(wallet: str, public_key_hex: str) -> bool:
    """Store a sponsor's public key. Upserts if already exists."""
    conn = _get_db()
    try:
        conn.execute(
            """INSERT INTO sponsor_pubkeys (wallet, public_key_hex, registered_at)
               VALUES (?, ?, ?)
               ON CONFLICT(wallet) DO UPDATE SET public_key_hex = ?, registered_at = ?""",
            (wallet.lower(), public_key_hex, time.time(), public_key_hex, time.time())
        )
        conn.commit()
        logger.info(f"Stored public key for sponsor {wallet[:10]}...")
        return True
    except Exception as e:
        logger.error(f"Failed to store public key: {e}")
        return False
    finally:
        conn.close()


def get_public_key(wallet: str) -> Optional[str]:
    """Get a sponsor's public key. Returns hex string or None."""
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT public_key_hex FROM sponsor_pubkeys WHERE wallet = ?",
            (wallet.lower(),)
        ).fetchone()
        return row["public_key_hex"] if row else None
    finally:
        conn.close()


def register_derived_key(wallet: str, derived_public_key_hex: str) -> bool:
    """Store a derived encryption public key for a sponsor.

    V2 approach: The frontend derives a keypair from keccak256(signature).
    The derived PUBLIC key is what the TEE uses for ECIES encryption.
    The derived PRIVATE key is re-derived by the frontend for decryption.

    This ensures compatibility because wallets don't expose raw private keys.
    """
    stored = store_public_key(wallet, derived_public_key_hex)
    if not stored:
        raise RuntimeError("Failed to store derived public key")
    logger.info(f"Stored derived encryption key for {wallet[:10]}...")
    return stored


def register_from_signature(message: str, signature: str) -> dict:
    """
    One-shot: verify signature, recover public key, store it.
    Returns {"address": "0x...", "public_key": "0x04..."} or raises.
    """
    address, pubkey_hex = recover_public_key(message, signature)
    stored = store_public_key(address, pubkey_hex)
    if not stored:
        raise RuntimeError("Failed to store public key")
    return {"address": address, "public_key": pubkey_hex}
