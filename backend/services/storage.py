"""
Storage Service — Rubric and problem data persistence.

For MVP: stores rubrics as JSON files locally + generates a deterministic
bytes32 CID hash for the on-chain problemCid field.

Future: IPFS pinning via Pinata/web3.storage for decentralized storage.
"""

import json
import hashlib
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

STORAGE_DIR = Path(__file__).parent.parent / "data" / "bounties"


def _ensure_dir():
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def compute_problem_cid(data: dict) -> str:
    """
    Compute a deterministic bytes32 hash from problem data.
    This serves as the on-chain problemCid until we add IPFS.
    
    Returns: hex string (64 chars, no 0x prefix) suitable for bytes32.
    """
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def store_rubric(bounty_id: int, data: dict) -> str:
    """
    Store bounty rubric + metadata locally.
    Returns the problem CID (sha256 hash).
    """
    _ensure_dir()

    cid = compute_problem_cid(data)

    filepath = STORAGE_DIR / f"bounty_{bounty_id}.json"
    with open(filepath, "w") as f:
        json.dump({
            "bounty_id": bounty_id,
            "problem_cid": cid,
            **data,
        }, f, indent=2)

    logger.info(f"Stored rubric for bounty {bounty_id} at {filepath} (cid={cid[:16]}...)")
    return cid


def load_rubric(bounty_id: int) -> dict | None:
    """Load stored rubric for a bounty."""
    filepath = STORAGE_DIR / f"bounty_{bounty_id}.json"
    if not filepath.exists():
        return None
    with open(filepath) as f:
        return json.load(f)


def list_stored_bounties() -> list[int]:
    """List bounty IDs with stored rubrics."""
    _ensure_dir()
    ids = []
    for f in STORAGE_DIR.glob("bounty_*.json"):
        try:
            ids.append(int(f.stem.split("_")[1]))
        except (ValueError, IndexError):
            pass
    return sorted(ids)
