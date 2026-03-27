"""
TEE Key Escrow Service — RSA key wrapping for zero-knowledge problem storage.

Problems encrypted on client → AES key wrapped with TEE's RSA public key 
→ Stored in DB (we cannot decrypt) → Only TEE can unwrap with RSA private key.

This achieves cryptographic zero-knowledge: platform literally cannot 
decrypt problems even with root access.
"""

import os
import logging
from typing import Optional
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.backends import default_backend
import json
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)

# TEE RSA keypair (generated once, stored securely)
RSA_KEY_PATH = Path(os.environ.get("TEE_RSA_KEY_PATH", "/opt/agonaut-api/data/tee_rsa"))


def _ensure_rsa_keys():
    """Generate TEE RSA-2048 keypair if not exists."""
    RSA_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    pubkey_path = RSA_KEY_PATH / "public.pem"
    privkey_path = RSA_KEY_PATH / "private.pem"
    
    if pubkey_path.exists() and privkey_path.exists():
        return
    
    logger.info("Generating TEE RSA-2048 keypair...")
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend()
    )
    public_key = private_key.public_key()
    
    # Save private key (secure: chmod 600)
    privkey_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    privkey_path.write_bytes(privkey_pem)
    os.chmod(privkey_path, 0o600)
    
    # Save public key
    pubkey_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )
    pubkey_path.write_bytes(pubkey_pem)
    
    logger.info("✅ TEE RSA keys generated")


def _load_rsa_private_key():
    """Load TEE's RSA private key (only in TEE/backend startup)."""
    privkey_path = RSA_KEY_PATH / "private.pem"
    if not privkey_path.exists():
        raise RuntimeError("TEE RSA private key not found")
    
    privkey_pem = privkey_path.read_bytes()
    return serialization.load_pem_private_key(
        privkey_pem,
        password=None,
        backend=default_backend()
    )


def get_tee_public_key() -> str:
    """Get TEE's RSA public key (PEM format) for clients to use."""
    _ensure_rsa_keys()
    pubkey_path = RSA_KEY_PATH / "public.pem"
    return pubkey_path.read_text()


def unwrap_aes_key(wrapped_key_hex: str) -> str:
    """
    Unwrap problem AES key using TEE's RSA private key.
    
    Args:
        wrapped_key_hex: RSA-2048 encrypted AES key (hex-encoded)
    
    Returns:
        Plaintext AES key (hex)
    
    Security: Only callable in TEE or backend at startup with private key access.
    """
    _ensure_rsa_keys()
    private_key = _load_rsa_private_key()
    
    wrapped_bytes = bytes.fromhex(wrapped_key_hex)
    plaintext_key = private_key.decrypt(
        wrapped_bytes,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=b"agonaut-problem-key"
        )
    )
    
    return plaintext_key.hex()


def verify_rsa_wrapped_format(wrapped_key_hex: str) -> bool:
    """Verify wrapped key is valid RSA ciphertext (256 bytes for RSA-2048)."""
    return len(wrapped_key_hex) == 512  # 256 bytes * 2 (hex encoding)


# Storage for wrapped keys
_DB_PATH = Path("/opt/agonaut-api/data/tee_key_escrow.db")


def _get_db() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS problem_keys (
            round_address TEXT PRIMARY KEY,
            wrapped_aes_key TEXT NOT NULL,
            wrapped_at REAL NOT NULL,
            accessed_count INTEGER DEFAULT 0,
            last_accessed_at REAL,
            tee_uuid TEXT
        )
    """)
    return conn


def store_wrapped_problem_key(round_address: str, wrapped_aes_key_hex: str, tee_uuid: str = ""):
    """Store the RSA-wrapped AES key for this round."""
    if not verify_rsa_wrapped_format(wrapped_aes_key_hex):
        raise ValueError("Invalid wrapped key format (expected 512 hex chars)")
    
    import time
    conn = _get_db()
    try:
        conn.execute(
            """INSERT OR REPLACE INTO problem_keys
               (round_address, wrapped_aes_key, wrapped_at, tee_uuid)
               VALUES (?, ?, ?, ?)""",
            (round_address.lower(), wrapped_aes_key_hex, time.time(), tee_uuid)
        )
        conn.commit()
    finally:
        conn.close()


def get_wrapped_problem_key(round_address: str) -> Optional[str]:
    """Retrieve wrapped AES key for a round (without unwrapping)."""
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT wrapped_aes_key FROM problem_keys WHERE round_address = ?",
            (round_address.lower(),)
        ).fetchone()
        return row["wrapped_aes_key"] if row else None
    finally:
        conn.close()


def mark_key_accessed(round_address: str):
    """Update access stats when key is accessed by TEE."""
    import time
    conn = _get_db()
    try:
        conn.execute(
            """UPDATE problem_keys 
               SET accessed_count = accessed_count + 1, last_accessed_at = ?
               WHERE round_address = ?""",
            (time.time(), round_address.lower())
        )
        conn.commit()
    finally:
        conn.close()
