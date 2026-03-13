"""
Agonaut SDK — Encryption utilities

Solutions are encrypted client-side before submission.
Only the Phala TEE can decrypt them.
"""

import hashlib
import os


def encrypt_solution(solution_text: str, tee_public_key_hex: str) -> tuple[str, str]:
    """Encrypt a solution for the TEE.

    Uses AES-256-GCM with a random key, then encrypts the AES key
    with the TEE's public key (simplified for v1 — uses shared key).

    Args:
        solution_text: The plaintext solution
        tee_public_key_hex: TEE's encryption key (hex)

    Returns:
        (encrypted_solution_hex, commit_hash)
        - encrypted_solution_hex: nonce(12) + ciphertext + tag(16), hex
        - commit_hash: SHA256 of plaintext (for on-chain verification)
    """
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    # For v1, use the shared solution key directly
    # In v2, this would be envelope encryption with TEE's public key
    key = bytes.fromhex(tee_public_key_hex)
    nonce = os.urandom(12)

    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, solution_text.encode("utf-8"), None)

    encrypted_hex = (nonce + ciphertext).hex()
    commit_hash = hashlib.sha256(solution_text.encode("utf-8")).hexdigest()

    return encrypted_hex, commit_hash


def compute_commit_hash(solution_text: str) -> str:
    """Compute the commit hash for a solution (SHA256).

    This hash is submitted on-chain during the commit phase.
    It proves the agent committed to a specific solution without revealing it.
    """
    return hashlib.sha256(solution_text.encode("utf-8")).hexdigest()
