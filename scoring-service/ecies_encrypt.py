"""
ECIES Encryption — Encrypt data for a specific Ethereum wallet.

Uses secp256k1 ECIES (Elliptic Curve Integrated Encryption Scheme):
1. Generate ephemeral keypair
2. ECDH shared secret with recipient's public key
3. Derive AES-256-GCM key from shared secret (HKDF)
4. Encrypt plaintext with AES-256-GCM
5. Output: ephemeral_pubkey + iv + ciphertext + tag

Only the holder of the recipient's private key can decrypt.
The platform CANNOT decrypt — we never have the sponsor's private key.

Compatible with eth-crypto / eccrypto JS libraries for browser-side decryption.
"""

import os
import hashlib
import struct
import logging
from typing import Optional

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.backends import default_backend

log = logging.getLogger("ecies")


def _hex_to_pubkey(pubkey_hex: str) -> ec.EllipticCurvePublicKey:
    """Convert an uncompressed secp256k1 public key hex to a key object.

    Input format: 0x04 + 32 bytes X + 32 bytes Y (65 bytes total)
    """
    raw = bytes.fromhex(pubkey_hex.replace("0x", ""))
    if len(raw) == 65 and raw[0] == 0x04:
        # Uncompressed format — construct from X, Y coordinates
        x = int.from_bytes(raw[1:33], "big")
        y = int.from_bytes(raw[33:65], "big")
        return ec.EllipticCurvePublicNumbers(x, y, ec.SECP256K1()).public_key(default_backend())
    elif len(raw) == 64:
        # Raw X, Y without prefix
        x = int.from_bytes(raw[:32], "big")
        y = int.from_bytes(raw[32:64], "big")
        return ec.EllipticCurvePublicNumbers(x, y, ec.SECP256K1()).public_key(default_backend())
    else:
        raise ValueError(f"Invalid public key format: length={len(raw)}, first_byte={raw[0] if raw else 'empty'}")


def encrypt_for_wallet(plaintext: str, recipient_pubkey_hex: str) -> dict:
    """
    Encrypt plaintext so only the holder of recipient_pubkey's private key can decrypt.

    Returns:
        {
            "ephemeral_pubkey": "0x04...",  # 65 bytes hex
            "iv": "...",                     # 16 bytes hex
            "ciphertext": "...",             # hex
            "mac": "...",                    # 16 bytes hex (GCM tag)
        }
    """
    # Parse recipient public key
    recipient_key = _hex_to_pubkey(recipient_pubkey_hex)

    # Generate ephemeral keypair
    ephemeral_private = ec.generate_private_key(ec.SECP256K1(), default_backend())
    ephemeral_public = ephemeral_private.public_key()

    # ECDH shared secret
    shared_secret = ephemeral_private.exchange(ec.ECDH(), recipient_key)

    # Derive AES key using HKDF
    aes_key = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=b"agonaut-ecies-v1",
        backend=default_backend(),
    ).derive(shared_secret)

    # Encrypt with AES-256-GCM
    iv = os.urandom(16)
    aesgcm = AESGCM(aes_key)
    ct_and_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    # GCM appends the 16-byte tag to the ciphertext
    ciphertext = ct_and_tag[:-16]
    mac = ct_and_tag[-16:]

    # Serialize ephemeral public key (uncompressed)
    ephem_bytes = ephemeral_public.public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )

    return {
        "ephemeral_pubkey": "0x" + ephem_bytes.hex(),
        "iv": iv.hex(),
        "ciphertext": ciphertext.hex(),
        "mac": mac.hex(),
    }


def decrypt_with_private_key(encrypted: dict, private_key_hex: str) -> str:
    """
    Decrypt ECIES-encrypted data using a private key.

    This function exists for TESTING ONLY — in production, decryption
    happens in the sponsor's browser using their wallet.
    """
    # Parse private key
    private_int = int(private_key_hex.replace("0x", ""), 16)
    private_key = ec.derive_private_key(private_int, ec.SECP256K1(), default_backend())

    # Parse ephemeral public key
    ephem_key = _hex_to_pubkey(encrypted["ephemeral_pubkey"])

    # ECDH shared secret
    shared_secret = private_key.exchange(ec.ECDH(), ephem_key)

    # Derive AES key
    aes_key = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=b"agonaut-ecies-v1",
        backend=default_backend(),
    ).derive(shared_secret)

    # Decrypt
    iv = bytes.fromhex(encrypted["iv"])
    ciphertext = bytes.fromhex(encrypted["ciphertext"])
    mac = bytes.fromhex(encrypted["mac"])
    aesgcm = AESGCM(aes_key)

    plaintext_bytes = aesgcm.decrypt(iv, ciphertext + mac, None)
    return plaintext_bytes.decode("utf-8")
