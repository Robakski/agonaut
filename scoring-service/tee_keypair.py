"""
TEE Keypair Management — secp256k1 keypair for the scoring TEE enclave.

The TEE generates ONE keypair at deployment. This keypair is used for ALL
ECIES encryption/decryption:

- Sponsors encrypt problems FOR the TEE (using TEE public key)
- Agents encrypt solutions FOR the TEE (using TEE public key)
- TEE decrypts both (using TEE private key)
- TEE re-encrypts results FOR the sponsor (using sponsor's public key)

The private key NEVER leaves the TEE enclave.
The public key is served via API for anyone to fetch.

Security model:
- TEE mode (Phala CVM): Key sealed in enclave, bound to RTMR measurements.
  Even if the disk is cloned, the key cannot be extracted outside the enclave.
  The public key is included in the TDX attestation report (reportData field).
- Dev mode (VPS): Key stored in JSON file with chmod 600. Operator CAN access.
  This is clearly marked as development mode in the attestation endpoint.

Storage: /opt/agonaut-scoring/data/tee_keypair.json (or /app/data/ in Docker)
"""

import json
import os
import logging
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

log = logging.getLogger("tee_keypair")

KEYPAIR_PATH = Path("/opt/agonaut-scoring/data/tee_keypair.json")

_private_key: ec.EllipticCurvePrivateKey | None = None
_public_key_hex: str | None = None


def _generate_keypair() -> tuple[ec.EllipticCurvePrivateKey, str]:
    """Generate a new secp256k1 keypair."""
    private_key = ec.generate_private_key(ec.SECP256K1(), default_backend())
    public_key = private_key.public_key()

    # Serialize public key as uncompressed point (0x04 + X + Y = 65 bytes)
    pub_bytes = public_key.public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    pub_hex = "0x" + pub_bytes.hex()

    # Serialize private key as hex (32 bytes)
    priv_numbers = private_key.private_numbers()
    priv_hex = format(priv_numbers.private_value, '064x')

    return private_key, pub_hex, priv_hex


def _save_keypair(priv_hex: str, pub_hex: str):
    """Save keypair to encrypted persistent storage."""
    KEYPAIR_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = {"private_key": priv_hex, "public_key": pub_hex}
    KEYPAIR_PATH.write_text(json.dumps(data))
    os.chmod(str(KEYPAIR_PATH), 0o600)  # Owner-only read/write
    log.info(f"TEE keypair saved to {KEYPAIR_PATH}")


def _load_keypair() -> tuple[ec.EllipticCurvePrivateKey, str] | None:
    """Load keypair from persistent storage."""
    if not KEYPAIR_PATH.exists():
        return None

    try:
        data = json.loads(KEYPAIR_PATH.read_text())
        priv_hex = data["private_key"]
        pub_hex = data["public_key"]

        priv_int = int(priv_hex, 16)
        private_key = ec.derive_private_key(priv_int, ec.SECP256K1(), default_backend())

        log.info(f"TEE keypair loaded from {KEYPAIR_PATH}")
        return private_key, pub_hex
    except Exception as e:
        log.error(f"Failed to load TEE keypair: {e}")
        return None


def get_tee_private_key() -> ec.EllipticCurvePrivateKey:
    """Get TEE's private key (for decryption inside enclave)."""
    global _private_key
    if _private_key is None:
        _init_keypair()
    return _private_key


def get_tee_public_key_hex() -> str:
    """Get TEE's public key hex (for clients to encrypt data for TEE)."""
    global _public_key_hex
    if _public_key_hex is None:
        _init_keypair()
    return _public_key_hex


def _init_keypair():
    """Initialize the TEE keypair (load or generate)."""
    global _private_key, _public_key_hex

    # Try loading from persistent storage
    loaded = _load_keypair()
    if loaded:
        _private_key, _public_key_hex = loaded
        return

    # Generate new keypair
    log.info("Generating new TEE secp256k1 keypair...")
    _private_key, _public_key_hex, priv_hex = _generate_keypair()
    _save_keypair(priv_hex, _public_key_hex)
    log.info(f"TEE public key: {_public_key_hex[:20]}...")
