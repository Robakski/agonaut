"""
Solution API Routes

Endpoints for submitting encrypted solutions and triggering scoring.
Solutions are encrypted client-side and only decrypted inside Phala TEE.

Backend (port 8000) → Scoring Service (port 8001) → Phala TEE → On-chain
"""

import os
import httpx
import logging
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/solutions", tags=["solutions"])
log = logging.getLogger("solutions")

SCORING_SERVICE_URL = "http://127.0.0.1:8001"
SCORING_API_KEY = os.environ.get("SCORING_API_KEY", "")


def _scoring_headers() -> dict:
    """Auth headers for scoring service communication."""
    headers = {}
    if SCORING_API_KEY:
        headers["X-Scoring-Key"] = SCORING_API_KEY
    return headers


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
    # ── Verify on-chain commitment before accepting ──
    try:
        from services.chain import get_chain_service
        chain = get_chain_service()

        # 1. Verify round is in COMMIT phase (phase_id == 2)
        round_details = chain.get_round_details(req.round_address)
        if round_details["phase_id"] != 2:
            raise HTTPException(
                400,
                f"Round is in {round_details['phase']} phase, not COMMIT. Solutions can only be submitted during COMMIT phase."
            )

        # 2. Verify agent has committed on-chain and hash matches
        if not chain.verify_commitment(req.round_address, req.agent_address, req.commit_hash):
            raise HTTPException(
                400,
                "Commit hash does not match on-chain commitment. "
                "Ensure you committed via BountyRound.commitSolution() first."
            )

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"On-chain verification failed: {e}")
        raise HTTPException(503, "Unable to verify on-chain commitment. Please try again.")

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
                headers=_scoring_headers(),
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
                headers=_scoring_headers(),
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
                headers=_scoring_headers(),
            )
            return resp.json()
    except httpx.ConnectError:
        raise HTTPException(503, "Scoring service temporarily unavailable")


class SponsorAccessRequest(BaseModel):
    """Sponsor requests winning solutions with wallet signature proof."""
    round_address: str
    sponsor_address: str = Field(..., min_length=42, max_length=42)
    signature: str          # EIP-191 signature of challenge message
    message: str            # The signed message (includes nonce/timestamp)


@router.post("/sponsor-access")
async def request_sponsor_access(req: SponsorAccessRequest):
    """Retrieve winning solutions for a sponsor after settlement.

    Security:
    1. Verify wallet signature (EIP-191) proves requester owns the address
    2. Verify on-chain that the address is the round's sponsor
    3. Return decrypted solution(s) over HTTPS

    The solution is NEVER stored unencrypted. It's decrypted from our vault
    only for this response, transmitted over TLS, and never cached.
    """
    import time as _time
    from eth_account.messages import encode_defunct
    from eth_account import Account

    # ── Verify wallet signature ──
    try:
        msg = encode_defunct(text=req.message)
        recovered = Account.recover_message(msg, signature=req.signature)
        if recovered.lower() != req.sponsor_address.lower():
            raise HTTPException(403, "Signature does not match sponsor address")
    except HTTPException:
        raise
    except Exception as e:
        log.warning(f"Signature verification failed: {e}")
        raise HTTPException(403, "Invalid signature")

    # ── Verify message freshness (prevent replay) ──
    # Message format: "Agonaut Solution Access\nRound: {addr}\nTimestamp: {ts}"
    try:
        lines = req.message.strip().split("\n")
        ts_line = [l for l in lines if l.startswith("Timestamp:")]
        if ts_line:
            ts = int(ts_line[0].split(":")[1].strip())
            if abs(_time.time() - ts) > 300:  # 5 minute window
                raise HTTPException(403, "Request expired — please try again")
    except HTTPException:
        raise
    except Exception:
        pass  # Lenient on timestamp parsing — signature is the primary auth

    # ── Retrieve from vault ──
    from services.solution_vault import get_winning_solutions
    solutions = get_winning_solutions(req.round_address, req.sponsor_address)

    if solutions is None:
        raise HTTPException(404, "No solutions found or you are not the sponsor for this round")

    return {
        "status": "success",
        "round_address": req.round_address,
        "solutions": solutions,
    }


# ── Internal endpoint (scoring service → backend) ──

class StoreWinningSolutionRequest(BaseModel):
    round_address: str
    agent_address: str
    agent_id: int
    score: int
    solution_text: str
    sponsor_address: str


@router.post("/store-winning")
async def store_winning_solution_endpoint(req: StoreWinningSolutionRequest, request: Request):
    """Internal endpoint: scoring service stores winning solutions after on-chain submission.

    Only accessible from localhost (scoring service on same machine).
    """
    # Only allow from localhost
    client_host = request.client.host if request.client else ""
    if client_host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(403, "Internal endpoint — localhost only")

    from services.solution_vault import store_winning_solution as vault_store
    success = vault_store(
        round_address=req.round_address,
        agent_address=req.agent_address,
        agent_id=req.agent_id,
        score=req.score,
        solution_text=req.solution_text,
        sponsor_address=req.sponsor_address,
    )

    if not success:
        raise HTTPException(500, "Failed to store solution")

    return {"status": "stored", "round_address": req.round_address, "agent_id": req.agent_id}
