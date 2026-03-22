"""
Solution API Routes

Endpoints for submitting encrypted solutions and triggering scoring.
Solutions are encrypted client-side and only decrypted inside Phala TEE.

Backend (port 8000) → Scoring Service (port 8001) → Phala TEE → On-chain
"""

import httpx
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/solutions", tags=["solutions"])
log = logging.getLogger("solutions")

SCORING_SERVICE_URL = "http://127.0.0.1:8001"


# ── Models ──

class SubmitSolutionRequest(BaseModel):
    """Submit an encrypted solution for a bounty round."""
    round_address: str          # BountyRound contract address
    agent_id: int               # Agent's on-chain ID
    commit_hash: str            # Must match on-chain commit (keccak256)
    encrypted_solution: str     # Hex-encoded AES-256-GCM encrypted solution
    agent_address: str          # Wallet that committed on-chain


class SubmitSolutionResponse(BaseModel):
    status: str                 # "accepted", "rejected"
    message: str
    round_address: str
    agent_id: int


class ScoringStatusResponse(BaseModel):
    round_address: str
    phase: str                  # "pending", "scoring", "submitted", "error"
    solutions_received: int
    solutions_expected: int
    scores_submitted: bool
    scoring_started_at: int | None = None
    scoring_completed_at: int | None = None


class SponsorSolutionRequest(BaseModel):
    """Sponsor requests access to winning solutions after settlement."""
    round_address: str
    sponsor_address: str
    sponsor_public_key: str     # Solutions will be re-encrypted for this key


# ── Routes ──

@router.post("/submit", response_model=SubmitSolutionResponse)
async def submit_solution(req: SubmitSolutionRequest):
    """Submit an encrypted solution after committing on-chain.

    Flow:
    1. Agent commits hash on-chain (BountyRound.commitSolution)
    2. Agent encrypts solution with TEE public key
    3. Agent submits encrypted solution here
    4. We verify commit hash matches on-chain commitment
    5. We store encrypted solution until scoring phase

    Solutions are NEVER decrypted by the backend. They go straight
    to Phala TEE during scoring.

    Requires:
    - On-chain commit must exist and match
    - Round must be in COMMIT phase
    - Sanctions screening on agent wallet
    """
    # Forward to scoring service for storage
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{SCORING_SERVICE_URL}/score/receive-solution",
                json={
                    "round_address": req.round_address,
                    "agent_id": req.agent_id,
                    "encrypted_solution": req.encrypted_solution,
                    "commit_hash": req.commit_hash,
                },
                timeout=10.0,
            )
            if resp.status_code >= 400:
                detail = resp.json().get("detail", resp.text)
                raise HTTPException(resp.status_code, detail)
            scoring_resp = resp.json()
    except httpx.ConnectError:
        log.error("Scoring service unreachable at %s", SCORING_SERVICE_URL)
        raise HTTPException(503, "Scoring service temporarily unavailable")

    return SubmitSolutionResponse(
        status="accepted",
        message=f"Solution received ({scoring_resp.get('solutions_received', '?')}/{scoring_resp.get('solutions_expected', '?')} for this round).",
        round_address=req.round_address,
        agent_id=req.agent_id,
    )


@router.get("/scoring/{round_address}", response_model=ScoringStatusResponse)
async def scoring_status(round_address: str):
    """Check the scoring status for a round.

    After commit phase closes, scoring begins automatically:
    1. Encrypted solutions forwarded to Phala TEE
    2. TEE decrypts, runs rubric + deep reasoning scoring
    3. Scores submitted to ScoringOracle on-chain
    4. BountyRound transitions to SETTLED
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{SCORING_SERVICE_URL}/score/status/{round_address}",
                timeout=10.0,
            )
            if resp.status_code == 404:
                return ScoringStatusResponse(
                    round_address=round_address,
                    phase="pending",
                    solutions_received=0,
                    solutions_expected=0,
                    scores_submitted=False,
                )
            data = resp.json()
            return ScoringStatusResponse(
                round_address=round_address,
                phase=data.get("status", "pending"),
                solutions_received=data.get("solutions_received", 0),
                solutions_expected=data.get("solutions_expected", 0),
                scores_submitted=data.get("status") == "submitted",
                scoring_started_at=data.get("scoring_started_at"),
                scoring_completed_at=data.get("scoring_completed_at"),
            )
    except httpx.ConnectError:
        return ScoringStatusResponse(
            round_address=round_address,
            phase="service_unavailable",
            solutions_received=0,
            solutions_expected=0,
            scores_submitted=False,
        )


@router.post("/trigger-scoring/{round_address}")
async def trigger_scoring(round_address: str):
    """Manually trigger scoring for a round (admin/operator only).

    Normally scoring starts automatically when commit phase closes.
    This endpoint is for retries or manual intervention.
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{SCORING_SERVICE_URL}/score/round",
                json={
                    "round_address": round_address,
                    "problem_text": "",  # TODO: fetch from IPFS/on-chain
                    "solutions": [],     # TODO: collect from stored solutions
                },
                timeout=10.0,
            )
            return resp.json()
    except httpx.ConnectError:
        raise HTTPException(503, "Scoring service temporarily unavailable")


@router.post("/sponsor-access", response_model=dict)
async def request_sponsor_access(req: SponsorSolutionRequest):
    """Sponsor requests access to winning solutions after settlement.

    Solutions are re-encrypted inside the TEE for the sponsor's public key.
    Only works after on-chain settlement is confirmed.

    Requires:
    - Round must be in SETTLED phase
    - Requester must be a verified sponsor/contributor for this round
    - Sanctions screening on sponsor wallet
    """
    # TODO: Verify on-chain that round is SETTLED and requester is sponsor
    # This requires Phala TEE to re-encrypt solutions for sponsor's public key
    # Implementation depends on Phala's key management API
    return {
        "status": "not_implemented",
        "message": "Sponsor solution access will be available after Phala TEE key management integration.",
    }
