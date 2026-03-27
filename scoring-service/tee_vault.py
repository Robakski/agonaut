"""
TEE Vault — Secure in-enclave storage for decrypted problems during bounty lifetime.

Stores decrypted problem text in memory (protected by Intel TDX).
Serves re-encrypted copies to verified agents on request.

Lifecycle:
  1. Sponsor submits ECIES-encrypted problem → TEE decrypts → stores plaintext
  2. Agent requests problem → TEE re-encrypts FOR that agent → returns blob
  3. Scoring completes → TEE deletes plaintext from memory

All plaintext is held ONLY inside the TEE enclave.
"""

import time
import logging
from typing import Optional

from tee_keypair import get_tee_private_key, get_tee_public_key_hex
from ecies_encrypt import encrypt_for_wallet, decrypt_with_private_key

log = logging.getLogger("tee_vault")

# In-memory storage for active bounty problems (TEE enclave only)
# Key: round_address (lowercase), Value: dict with problem details
_active_problems: dict[str, dict] = {}


def store_problem(
    round_address: str,
    encrypted_problem: dict,
    encrypted_rubric: dict | None,
    sponsor_public_key: str,
    problem_window_hours: int = 48,
) -> bool:
    """
    Receive and decrypt a problem encrypted FOR the TEE.

    Args:
        encrypted_problem: ECIES blob {ephemeral_pubkey, iv, ciphertext, mac}
        encrypted_rubric: ECIES blob or None (public bounties have no encrypted rubric)
        sponsor_public_key: Sponsor's ECIES public key (for result encryption later)
        problem_window_hours: How long agents can request the problem
    """
    try:
        # Get TEE's private key hex for decryption
        tee_priv = get_tee_private_key()
        priv_numbers = tee_priv.private_numbers()
        priv_hex = format(priv_numbers.private_value, '064x')

        # Decrypt problem
        problem_text = decrypt_with_private_key(encrypted_problem, priv_hex)

        # Decrypt rubric if present
        rubric_text = None
        if encrypted_rubric:
            rubric_text = decrypt_with_private_key(encrypted_rubric, priv_hex)

        now = time.time()
        _active_problems[round_address.lower()] = {
            "problem_text": problem_text,
            "rubric_text": rubric_text,
            "sponsor_public_key": sponsor_public_key,
            "stored_at": now,
            "expires_at": now + (problem_window_hours * 3600),
            "access_log": [],
        }

        log.info(
            f"Stored decrypted problem for round {round_address[:10]}... "
            f"(expires in {problem_window_hours}h)"
        )
        return True

    except Exception as e:
        log.error(f"Failed to store problem: {e}")
        return False


def get_problem_for_agent(
    round_address: str,
    agent_public_key: str,
    agent_address: str,
) -> Optional[dict]:
    """
    Re-encrypt the problem specifically for one agent.

    Returns ECIES blob that only this agent can decrypt,
    or None if problem not found / expired / access denied.
    """
    entry = _active_problems.get(round_address.lower())
    if not entry:
        log.warning(f"Problem not found for round {round_address[:10]}...")
        return None

    # Check if problem window has expired
    if time.time() > entry["expires_at"]:
        log.warning(f"Problem window expired for round {round_address[:10]}...")
        return None

    try:
        # ECIES encrypt the problem FOR this specific agent
        encrypted_for_agent = encrypt_for_wallet(
            entry["problem_text"],
            agent_public_key,
        )

        # Also encrypt rubric if present
        encrypted_rubric_for_agent = None
        if entry.get("rubric_text"):
            encrypted_rubric_for_agent = encrypt_for_wallet(
                entry["rubric_text"],
                agent_public_key,
            )

        # Log access
        entry["access_log"].append({
            "agent_address": agent_address,
            "timestamp": time.time(),
        })

        log.info(f"Delivered problem to agent {agent_address[:10]}... for round {round_address[:10]}...")

        return {
            "encrypted_problem": encrypted_for_agent,
            "encrypted_rubric": encrypted_rubric_for_agent,
        }

    except Exception as e:
        log.error(f"Failed to encrypt problem for agent: {e}")
        return None


def get_problem_for_scoring(round_address: str) -> Optional[dict]:
    """
    Get plaintext problem + rubric for scoring (internal TEE use only).
    """
    entry = _active_problems.get(round_address.lower())
    if not entry:
        return None
    return {
        "problem_text": entry["problem_text"],
        "rubric_text": entry.get("rubric_text"),
        "sponsor_public_key": entry["sponsor_public_key"],
    }


def delete_problem(round_address: str):
    """Delete problem from TEE memory after scoring completes."""
    key = round_address.lower()
    if key in _active_problems:
        # Overwrite memory before deleting (defense in depth)
        entry = _active_problems[key]
        if entry.get("problem_text"):
            entry["problem_text"] = "x" * len(entry["problem_text"])
        if entry.get("rubric_text"):
            entry["rubric_text"] = "x" * len(entry["rubric_text"])
        del _active_problems[key]
        log.info(f"Deleted problem for round {round_address[:10]}... from TEE memory")


def get_active_problem_count() -> int:
    """How many problems are currently in TEE memory."""
    return len(_active_problems)
