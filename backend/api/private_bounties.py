"""
Private Bounties API — endpoints for encrypted problem management.

Handles:
- Storing encrypted problem descriptions during bounty creation
- Releasing decryption keys to agents who paid entry fee (on-chain verified)
- Providing problem context to scoring service (internal)
"""

import logging
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional

from services.chain import get_chain_service

router = APIRouter(prefix="/private-bounties", tags=["private-bounties"])
log = logging.getLogger("private-bounties")


# ── Models ──

class StorePrivateProblemRequest(BaseModel):
    round_address: str
    visibility: str = Field(..., pattern="^(PUBLIC|SUMMARY|PRIVATE)$")
    title: str = Field(..., min_length=5, max_length=120)
    summary: Optional[str] = Field(None, max_length=500)
    tags: list[str] = Field(default_factory=list, max_length=5)
    encrypted_problem: str          # AES-256-GCM encrypted (hex), done client-side
    problem_key: str                # AES key (hex) — we store this encrypted at rest
    sponsor_address: str = Field(..., min_length=42, max_length=42)


class RequestProblemKeyRequest(BaseModel):
    round_address: str
    agent_address: str = Field(..., min_length=42, max_length=42)
    signature: str                  # EIP-191 signature proving wallet ownership
    message: str                    # Signed message (includes timestamp)


# ── Routes ──

@router.post("/store")
async def store_private_problem(req: StorePrivateProblemRequest):
    """Store an encrypted problem during bounty creation.

    The sponsor encrypts the problem client-side with a random AES key.
    We store both the encrypted problem and the key (encrypted at rest).
    The key is only released to agents who pay the entry fee on-chain.
    """
    from services.problem_vault import store_private_problem as vault_store

    success = vault_store(
        round_address=req.round_address,
        visibility=req.visibility,
        title=req.title,
        summary=req.summary,
        tags=req.tags,
        encrypted_problem=req.encrypted_problem,
        problem_key=req.problem_key,
        sponsor_address=req.sponsor_address,
    )

    if not success:
        raise HTTPException(500, "Failed to store encrypted problem")

    return {
        "status": "stored",
        "visibility": req.visibility,
        "round_address": req.round_address,
    }


@router.get("/metadata/{round_address}")
async def get_problem_metadata(round_address: str):
    """Get public metadata for a private bounty.

    Returns title, summary, tags, visibility — but NOT the full problem
    or the decryption key. This is what non-paying users see.
    """
    from services.problem_vault import get_problem_metadata as vault_meta

    meta = vault_meta(round_address)
    if not meta:
        return {"visibility": "PUBLIC", "is_private": False}

    return {
        "is_private": meta["visibility"] != "PUBLIC",
        **meta,
    }


@router.post("/request-key")
async def request_problem_key(req: RequestProblemKeyRequest):
    """Request the problem decryption key after paying entry fee.

    Security flow:
    1. Verify wallet signature (proves agent owns the address)
    2. Verify on-chain that agent has committed to this round (paid entry fee)
    3. Release the AES key for client-side decryption
    4. Log the access for audit trail
    """
    import time as _time
    from eth_account.messages import encode_defunct
    from eth_account import Account

    # ── Step 1: Verify wallet signature ──
    try:
        msg = encode_defunct(text=req.message)
        recovered = Account.recover_message(msg, signature=req.signature)
        if recovered.lower() != req.agent_address.lower():
            raise HTTPException(403, "Signature does not match agent address")
    except HTTPException:
        raise
    except Exception as e:
        log.warning(f"Signature verification failed: {e}")
        raise HTTPException(403, "Invalid signature")

    # ── Verify message freshness ──
    try:
        lines = req.message.strip().split("\n")
        ts_line = [l for l in lines if l.startswith("Timestamp:")]
        if ts_line:
            ts = int(ts_line[0].split(":")[1].strip())
            if abs(_time.time() - ts) > 300:
                raise HTTPException(403, "Request expired — please try again")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(403, "Invalid or missing timestamp in signed message")

    # ── Step 2: Verify on-chain entry fee payment ──
    try:
        chain = get_chain_service()
        has_committed = chain.has_agent_committed(req.round_address, req.agent_address)
        if not has_committed:
            raise HTTPException(403, "Entry fee not paid — commit to this round first")
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"On-chain verification failed (BLOCKING access): {e}")
        # SECURITY: Fail CLOSED — never release keys if we can't verify payment.
        # A permissive fallback here would let attackers bypass entry fees entirely.
        raise HTTPException(503, "Unable to verify entry fee payment on-chain. Please try again later.")

    # ── Step 3: Release the key ──
    from services.problem_vault import release_problem_key

    result = release_problem_key(
        round_address=req.round_address,
        agent_address=req.agent_address,
        entry_tx_hash="",  # Could be extracted from on-chain event logs
    )

    if not result:
        raise HTTPException(404, "Problem not found or is public")

    return {
        "status": "granted",
        "encrypted_problem": result["encrypted_problem"],
        "problem_key": result["problem_key"],
        "notice": "This problem is confidential. Unauthorized distribution violates Terms of Service §11.",
    }


@router.get("/problem-for-scoring/{round_address}")
async def get_problem_for_scoring(round_address: str, request: Request):
    """Internal: scoring service requests problem key for scoring context.

    Localhost only — the scoring LLM needs the decrypted problem text
    to understand what the solution is supposed to accomplish.
    """
    client_host = request.client.host if request.client else ""
    if client_host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(403, "Internal endpoint — localhost only")

    from services.problem_vault import get_problem_for_scoring as vault_scoring_key

    key = vault_scoring_key(round_address)
    if not key:
        return {"has_key": False}

    return {"has_key": True, "problem_key": key}


@router.get("/access-log/{round_address}")
async def get_access_log(round_address: str):
    """Admin: view who accessed a private problem and when.

    Requires admin auth (handled by SecurityMiddleware).
    """
    from services.problem_vault import get_access_log
    return {"log": get_access_log(round_address)}
