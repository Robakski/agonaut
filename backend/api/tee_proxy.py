"""
TEE Proxy Endpoints — Backend relays requests to/from the TEE scoring service.

The backend NEVER sees plaintext. It forwards encrypted blobs between
the frontend and TEE. This is a dumb pipe — no decryption capability.

Endpoints:
  GET  /tee/public-key     → Returns TEE's ECIES public key
  POST /tee/store-problem   → Forward encrypted problem to TEE
  POST /tee/agent-problem   → Forward agent's request to TEE, return encrypted problem
"""

import logging
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(tags=["tee"])

SCORING_URL = "http://127.0.0.1:8001"


@router.get("/tee/public-key")
async def get_tee_public_key():
    """Proxy: Return TEE's ECIES public key.

    Frontend fetches this to encrypt problems and solutions FOR the TEE.
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{SCORING_URL}/tee/public-key", timeout=5)
            if resp.status_code != 200:
                raise HTTPException(503, "TEE service unavailable")
            return resp.json()
    except httpx.ConnectError:
        raise HTTPException(503, "TEE service not running")
    except Exception as e:
        logger.error(f"Failed to fetch TEE public key: {e}")
        raise HTTPException(503, f"TEE service error: {str(e)}")


class StoreProblemProxyRequest(BaseModel):
    round_address: str
    encrypted_problem: dict
    encrypted_rubric: dict | None = None
    sponsor_public_key: str
    problem_window_hours: int = 48


@router.post("/tee/store-problem")
async def store_problem_proxy(req: StoreProblemProxyRequest):
    """Proxy: Forward encrypted problem to TEE for storage.

    Backend stores nothing — just relays the encrypted blob to TEE.
    TEE decrypts inside enclave and holds plaintext.
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{SCORING_URL}/tee/store-problem",
                json=req.model_dump(),
                timeout=10,
            )
            if resp.status_code != 200:
                raise HTTPException(resp.status_code, resp.text)
            return resp.json()
    except httpx.ConnectError:
        raise HTTPException(503, "TEE service not running")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to store problem in TEE: {e}")
        raise HTTPException(503, f"TEE service error: {str(e)}")


class AgentProblemProxyRequest(BaseModel):
    round_address: str
    agent_public_key: str
    agent_address: str


@router.post("/tee/agent-problem")
async def agent_problem_proxy(req: AgentProblemProxyRequest):
    """Proxy: Forward agent's problem request to TEE.

    TEE re-encrypts problem FOR this specific agent.
    Backend sees only encrypted blobs (can't decrypt).
    """
    # TODO: Verify agent paid entry fee on-chain before forwarding
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{SCORING_URL}/tee/agent-problem",
                json=req.model_dump(),
                timeout=10,
            )
            if resp.status_code != 200:
                raise HTTPException(resp.status_code, resp.text)
            return resp.json()
    except httpx.ConnectError:
        raise HTTPException(503, "TEE service not running")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get problem for agent: {e}")
        raise HTTPException(503, f"TEE service error: {str(e)}")
