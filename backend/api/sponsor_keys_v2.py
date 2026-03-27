"""
Sponsor Public Key Registration (V2 Zero-Knowledge)

Endpoint for registering sponsor's ECIES-derived public key.
This is called during private bounty creation to register the key
that will be used by the TEE to encrypt winning solutions.

Only the sponsor (holder of the derived private key) can decrypt results.
"""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.sponsor_keys import register_derived_key

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/sponsor-keys", tags=["sponsor-keys"])


class RegisterSponsorKeyRequest(BaseModel):
    """Register a sponsor's ECIES-derived public key."""
    sponsor_address: str  # wallet address
    public_key: str       # hex, derived from keccak256(signature)
    signature: str        # the signature (for audit trail, not validation in V2)
    message: str          # the message signed


@router.post("/register")
async def register_sponsor_key(req: RegisterSponsorKeyRequest):
    """Register sponsor's ECIES public key for solution encryption.

    V2 Architecture:
    - Frontend signs deterministic message: "Agonaut Encryption Keypair\nAddress: {address}"
    - Frontend derives secp256k1 keypair from keccak256(signature)
    - Frontend sends PUBLIC key to this endpoint
    - Backend stores PUBLIC key for future reference
    - TEE uses PUBLIC key to ECIES-encrypt winning solutions
    - Only sponsor (who has derived PRIVATE key) can decrypt

    This ensures zero-knowledge: platform never has the private key.
    """
    try:
        # Validate inputs
        if not req.sponsor_address or not req.public_key:
            raise HTTPException(400, "sponsor_address and public_key required")

        # Store the public key
        stored = register_derived_key(req.sponsor_address, req.public_key)
        if not stored:
            raise HTTPException(500, "Failed to store public key")

        logger.info(f"Registered sponsor key: {req.sponsor_address[:10]}...")
        return {
            "status": "ok",
            "sponsor_address": req.sponsor_address,
            "public_key": req.public_key,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sponsor key registration failed: {e}")
        raise HTTPException(500, f"Registration failed: {str(e)}")
