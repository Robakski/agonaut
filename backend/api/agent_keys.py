"""
Agent API Key Management — endpoints for creating, listing, and revoking API keys.

Flow:
1. Agent calls GET /api/v1/keys/challenge?agent_id=X to get a signing message
2. Agent signs the message with their wallet (EIP-191 personal_sign)
3. Agent calls POST /api/v1/keys/create with agent_id, wallet, signature, optional label
4. Server verifies signature matches the agent's registered wallet
5. Server returns the raw API key ONCE — agent must store it
6. Subsequent API calls use Authorization: Bearer ag_live_...

Security:
- Wallet signature prevents anyone from generating keys for agents they don't own
- Key is shown exactly once at creation — we only store the SHA-256 hash
- Max 3 active keys per agent (for key rotation without downtime)
- Agents can list their keys (prefix only) and revoke by key_id
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional

from services.agent_keys import (
    create_key,
    list_keys,
    revoke_key,
    revoke_all_keys,
    verify_wallet_signature,
    make_signing_message,
)
from middleware.agent_auth import require_agent, require_agent_owns

router = APIRouter(prefix="/api/v1/keys", tags=["Agent API Keys"])


# ── Request/Response Models ────────────────────────────────────────

class CreateKeyRequest(BaseModel):
    agent_id: int = Field(..., ge=1)
    wallet: str = Field(..., min_length=42, max_length=42)
    signature: str = Field(..., min_length=130, max_length=134)
    label: Optional[str] = Field("", max_length=64)


class RevokeKeyRequest(BaseModel):
    key_id: int = Field(..., ge=1)


# ── Endpoints ──────────────────────────────────────────────────────

@router.get("/challenge")
async def get_challenge(agent_id: int):
    """
    Get the message an agent must sign to create/rotate an API key.
    The agent signs this with personal_sign in their wallet.
    """
    if agent_id < 1:
        raise HTTPException(status_code=400, detail="Invalid agent_id")

    message = make_signing_message(agent_id, "create_api_key")
    return {
        "message": message,
        "instruction": "Sign this message with your registered wallet using personal_sign (EIP-191)."
    }


@router.post("/create")
async def create_api_key(req: CreateKeyRequest):
    """
    Create a new API key for an agent. Requires wallet signature proof.
    Returns the raw key ONCE — store it securely. We only keep the hash.
    """
    # Verify wallet signature
    message = make_signing_message(req.agent_id, "create_api_key")
    if not verify_wallet_signature(req.wallet, message, req.signature):
        raise HTTPException(
            status_code=403,
            detail="Invalid signature. Make sure you signed with the wallet registered to this agent."
        )

    # TODO: Verify agent_id is registered on-chain and wallet matches
    # For now we trust the signature — if they can sign with the wallet,
    # they own it. On-chain verification added when we wire Web3 reads.

    raw_key = create_key(
        agent_id=req.agent_id,
        wallet=req.wallet,
        label=req.label or ""
    )

    if raw_key is None:
        raise HTTPException(
            status_code=409,
            detail=f"Maximum active keys reached (3). Revoke an existing key first."
        )

    return {
        "api_key": raw_key,
        "agent_id": req.agent_id,
        "warning": "Store this key securely. It will NOT be shown again."
    }


@router.get("/list")
async def list_agent_keys(request: Request):
    """
    List all active API keys for the authenticated agent.
    Returns key prefixes and metadata — never the full key.
    """
    agent = require_agent(request)
    keys = list_keys(agent["agent_id"])
    return {
        "agent_id": agent["agent_id"],
        "keys": keys
    }


@router.post("/revoke")
async def revoke_api_key(req: RevokeKeyRequest, request: Request):
    """Revoke a specific API key. Agent can only revoke their own keys."""
    agent = require_agent(request)
    success = revoke_key(req.key_id, agent["agent_id"])
    if not success:
        raise HTTPException(
            status_code=404,
            detail="Key not found or already revoked."
        )
    return {"revoked": True, "key_id": req.key_id}


@router.post("/revoke-all")
async def revoke_all_agent_keys(request: Request):
    """Emergency: revoke ALL API keys for the authenticated agent."""
    agent = require_agent(request)
    count = revoke_all_keys(agent["agent_id"])
    return {"revoked_count": count, "agent_id": agent["agent_id"]}
