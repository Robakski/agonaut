"""
Agonaut Scoring Service API

FastAPI wrapper around the scoring engine. Receives encrypted solutions,
forwards to Phala TEE for scoring, and submits results on-chain.

This service runs alongside the backend. In production, it runs inside
or communicates with a Phala TEE instance.

Endpoints:
  POST /score/round          — Score all solutions for a round
  POST /score/solution       — Score a single solution (testing)
  GET  /score/status/{round} — Check scoring progress
  POST /score/submit-onchain — Submit scores to ScoringOracle on Base
  GET  /health               — Health check

Run:
    uvicorn api:app --host 0.0.0.0 --port 8001
"""

import asyncio
import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, Field

from scorer import (
    ScoringEngine, Check, ScoredSolution,
    build_full_rubric, parse_sponsor_rubric,
    score_round, to_onchain_payload,
    DEFAULT_SPONSOR_CHECKS,
)

logging.basicConfig(level=logging.INFO, format="%(name)s | %(message)s")
log = logging.getLogger("scoring-api")

app = FastAPI(
    title="Agonaut Scoring Service",
    description="TEE-backed AI scoring for Agonaut bounty rounds",
    version="0.1.0",
)

# ── Authentication ──
# Only the backend API (port 8000) should communicate with this service.
# SCORING_API_KEY must match between backend and scoring service .env files.

SCORING_API_KEY = os.environ.get("SCORING_API_KEY", "")


class ScoringAuthMiddleware(BaseHTTPMiddleware):
    """Require API key for all endpoints except /health."""

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/health":
            return await call_next(request)

        if not SCORING_API_KEY:
            log.warning("SCORING_API_KEY not set — scoring service is UNPROTECTED")
            return await call_next(request)

        auth = request.headers.get("X-Scoring-Key", "")
        if auth != SCORING_API_KEY:
            log.warning(f"Unauthorized scoring request from {request.client.host}: {request.url.path}")
            return JSONResponse(status_code=403, content={"detail": "Forbidden"})

        return await call_next(request)


app.add_middleware(ScoringAuthMiddleware)

# ── In-memory state (replace with Redis/DB in production) ──

# round_address -> { status, solutions, results, ... }
_rounds: dict[str, dict] = {}


# ═══════════════════════════════════════════════════════════════
#  MODELS
# ═══════════════════════════════════════════════════════════════

class SolutionInput(BaseModel):
    agent_id: int
    encrypted_solution: str  # Hex-encoded AES-256-GCM
    commit_hash: str         # SHA256 of plaintext (for verification)


class ScoreRoundRequest(BaseModel):
    round_address: str
    problem_text: str
    solutions: list[SolutionInput]
    rubric: Optional[dict] = None  # Sponsor rubric JSON, or None for defaults
    solution_key: str = ""         # AES key (hex), or uses env var


class ScoreSingleRequest(BaseModel):
    problem_text: str
    encrypted_solution: str
    agent_id: int = 1
    rubric: Optional[dict] = None
    solution_key: str = ""


class SubmitOnchainRequest(BaseModel):
    round_address: str
    # Scorer private key from env, not passed in request


class RoundStatusResponse(BaseModel):
    round_address: str
    status: str  # pending, receiving, scoring, completed, submitted, error
    solutions_received: int
    solutions_expected: int
    scoring_started_at: Optional[float] = None
    scoring_completed_at: Optional[float] = None
    results: Optional[list[dict]] = None
    error: Optional[str] = None


# ═══════════════════════════════════════════════════════════════
#  SOLUTION COLLECTION
# ═══════════════════════════════════════════════════════════════

class ReceiveSolutionRequest(BaseModel):
    round_address: str
    agent_id: int
    encrypted_solution: str
    commit_hash: str


class InitRoundRequest(BaseModel):
    """Initialize a round for solution collection."""
    round_address: str
    problem_text: str
    expected_agents: int
    rubric: Optional[dict] = None
    solution_key: str = ""


@app.post("/score/init-round")
async def init_round(req: InitRoundRequest):
    """Initialize a round for accepting solutions.

    Call this when commit phase closes. Then agents submit solutions
    via /score/receive-solution. When all are received, call /score/round.
    """
    if req.round_address in _rounds:
        raise HTTPException(400, "Round already initialized")

    _rounds[req.round_address] = {
        "status": "receiving",
        "problem_text": req.problem_text,
        "expected_agents": req.expected_agents,
        "rubric": req.rubric,
        "solution_key": req.solution_key,
        "solutions": {},
        "results": None,
        "scoring_started_at": None,
        "scoring_completed_at": None,
        "error": None,
    }

    log.info(f"Round {req.round_address[:10]}... initialized, expecting {req.expected_agents} solutions")
    return {"status": "initialized", "round_address": req.round_address}


@app.post("/score/receive-solution")
async def receive_solution(req: ReceiveSolutionRequest, background_tasks: BackgroundTasks):
    """Receive an encrypted solution from an agent.

    Solutions are stored until scoring is triggered.
    If all expected solutions are received, scoring starts automatically.
    """
    rnd = _rounds.get(req.round_address)
    if not rnd:
        raise HTTPException(404, "Round not initialized. Call /score/init-round first.")

    if rnd["status"] != "receiving":
        raise HTTPException(400, f"Round is in '{rnd['status']}' status, not accepting solutions")

    rnd["solutions"][req.agent_id] = {
        "encrypted": req.encrypted_solution,
        "commit_hash": req.commit_hash,
    }

    received = len(rnd["solutions"])
    expected = rnd["expected_agents"]
    log.info(f"Round {req.round_address[:10]}...: received {received}/{expected} solutions")

    # Auto-trigger scoring when all solutions received
    if received >= expected:
        log.info(f"Round {req.round_address[:10]}...: all solutions received, auto-triggering scoring")
        background_tasks.add_task(_score_round_async, req.round_address)

    return {
        "status": "received",
        "agent_id": req.agent_id,
        "solutions_received": received,
        "solutions_expected": expected,
    }


# ── Solution vault helper (zero-knowledge ECIES) ──
def _store_solutions(round_address: str, rnd: dict, payload: dict):
    """Encrypt winning solutions with sponsor's public key and store.

    The TEE has access to the decrypted solution in memory. We encrypt it
    with the sponsor's secp256k1 public key using ECIES before storing.
    After this function, the plaintext solution is gone — only the sponsor
    can decrypt it with their wallet's private key.
    """
    import httpx as _httpx
    try:
        scores = payload.get("scores", [])
        agents = payload.get("agent_addresses", [])
        agent_ids = payload.get("agent_ids", [])
        decrypted = rnd.get("decrypted_solutions", {})
        sponsor = rnd.get("sponsor_address", "")

        if not agents or not decrypted or not sponsor:
            log.warning("Cannot store solutions — missing agent addresses, decrypted solutions, or sponsor")
            return

        # Fetch sponsor's public key from backend
        resp = _httpx.get(
            f"http://127.0.0.1:8000/api/v1/solutions/sponsor-key/{sponsor}",
            timeout=5,
        )
        if resp.status_code != 200 or not resp.json().get("has_key"):
            log.warning(f"Sponsor {sponsor[:10]}... has no registered public key — cannot encrypt solutions")
            return

        # Get full public key
        key_resp = _httpx.get(
            f"http://127.0.0.1:8000/api/v1/solutions/sponsor-pubkey-internal/{sponsor}",
            timeout=5,
        )
        if key_resp.status_code != 200:
            log.warning("Failed to fetch sponsor public key from backend")
            return
        sponsor_pubkey = key_resp.json().get("public_key")
        if not sponsor_pubkey:
            log.warning("Sponsor public key is empty")
            return

        # ECIES encrypt each winning solution with sponsor's public key
        from ecies_encrypt import encrypt_for_wallet
        stored = 0
        for i, (addr, score) in enumerate(zip(agents, scores)):
            if score > 0 and addr.lower() in decrypted:
                agent_id = agent_ids[i] if i < len(agent_ids) else 0
                solution_text = decrypted[addr.lower()]

                # Encrypt — after this, we can't read it anymore
                encrypted_blob = encrypt_for_wallet(solution_text, sponsor_pubkey)

                _httpx.post(
                    "http://127.0.0.1:8000/api/v1/solutions/store-winning",
                    json={
                        "round_address": round_address,
                        "agent_address": addr,
                        "agent_id": agent_id,
                        "score": score,
                        "encrypted_solution": encrypted_blob,
                        "sponsor_address": sponsor,
                    },
                    timeout=10,
                )
                stored += 1

        log.info(f"Stored {stored} ECIES-encrypted winning solutions (only sponsor can decrypt)")
    except Exception as e:
        log.warning(f"Solution vault storage failed (non-critical): {e}")


# ── Activity tracking helper ──
def _track_winners(round_address: str, payload: dict, tx_hash: str):
    """Fire-and-forget activity events for winning agents."""
    import httpx as _httpx
    try:
        scores = payload.get("scores", [])
        agents = payload.get("agent_addresses", [])
        if not agents or len(agents) != len(scores):
            return
        for addr, score in zip(agents, scores):
            if score > 0:
                _httpx.post(
                    "http://127.0.0.1:8000/api/v1/activity/track",
                    json={"wallet": addr, "event": "bounty_won", "metadata": {
                        "round": round_address, "score": score, "tx_hash": tx_hash
                    }},
                    timeout=5,
                )
    except Exception as e:
        log.warning(f"Activity tracking failed (non-critical): {e}")


# ═══════════════════════════════════════════════════════════════
#  SCORING
# ═══════════════════════════════════════════════════════════════

async def _score_round_async(round_address: str):
    """Background task: score all solutions for a round."""
    rnd = _rounds.get(round_address)
    if not rnd:
        return

    rnd["status"] = "scoring"
    rnd["scoring_started_at"] = time.time()

    try:
        # Parse rubric
        sponsor_checks = None
        if rnd.get("rubric"):
            sponsor_checks = parse_sponsor_rubric(rnd["rubric"])

        # Build solution list
        solutions = [
            {"agent_id": agent_id, "encrypted": sol["encrypted"]}
            for agent_id, sol in rnd["solutions"].items()
        ]

        # Run scoring (this calls the LLM via Phala TEE)
        results = score_round(
            problem_text=rnd["problem_text"],
            encrypted_solutions=solutions,
            sponsor_checks=sponsor_checks,
            solution_key=rnd.get("solution_key", ""),
        )

        # Store results
        payload = to_onchain_payload(results)
        rnd["results"] = payload
        rnd["status"] = "completed"
        rnd["scoring_completed_at"] = time.time()

        duration = rnd["scoring_completed_at"] - rnd["scoring_started_at"]
        log.info(f"Round {round_address[:10]}...: scoring complete in {duration:.1f}s")

        # Auto-submit scores on-chain
        try:
            from onchain import submit_scores
            result = submit_scores(
                round_address=round_address,
                agent_ids=payload["agent_ids"],
                scores=payload["scores"],
            )
            if result["status"] == "success":
                rnd["status"] = "submitted"
                log.info(f"Round {round_address[:10]}...: auto-submitted on-chain tx={result['tx_hash']}")
                # Track bounty_won events for agents with scores above threshold
                _track_winners(round_address, payload, result["tx_hash"])
                # Store winning solutions in vault for sponsor access
                _store_solutions(round_address, rnd, payload)
            else:
                log.error(f"Round {round_address[:10]}...: on-chain submission reverted")
        except Exception as e:
            log.error(f"Round {round_address[:10]}...: auto-submit failed: {e} — use /score/submit-onchain to retry")

    except Exception as e:
        log.error(f"Round {round_address[:10]}...: scoring failed: {e}")
        rnd["status"] = "error"
        rnd["error"] = str(e)


@app.post("/score/round")
async def score_round_endpoint(req: ScoreRoundRequest, background_tasks: BackgroundTasks):
    """Score all solutions for a round (one-shot).

    Alternative to init-round + receive-solution flow.
    Pass all solutions at once for immediate scoring.
    """
    if req.round_address in _rounds and _rounds[req.round_address]["status"] == "scoring":
        raise HTTPException(400, "Scoring already in progress for this round")

    # Initialize round state
    _rounds[req.round_address] = {
        "status": "scoring",
        "problem_text": req.problem_text,
        "expected_agents": len(req.solutions),
        "rubric": req.rubric,
        "solution_key": req.solution_key,
        "solutions": {
            s.agent_id: {"encrypted": s.encrypted_solution, "commit_hash": s.commit_hash}
            for s in req.solutions
        },
        "results": None,
        "scoring_started_at": time.time(),
        "scoring_completed_at": None,
        "error": None,
    }

    # Score in background
    background_tasks.add_task(_score_round_async, req.round_address)

    return {
        "status": "scoring_started",
        "round_address": req.round_address,
        "solutions_count": len(req.solutions),
    }


@app.post("/score/solution")
async def score_single(req: ScoreSingleRequest):
    """Score a single solution synchronously (for testing).

    Returns the full scoring breakdown immediately.
    """
    sponsor_checks = None
    if req.rubric:
        sponsor_checks = parse_sponsor_rubric(req.rubric)

    engine = ScoringEngine(solution_key=req.solution_key)
    result = engine.score_solution(
        agent_id=req.agent_id,
        encrypted_solution=req.encrypted_solution,
        problem_text=req.problem_text,
        sponsor_checks=sponsor_checks,
    )

    if result.error:
        return {
            "agent_id": req.agent_id,
            "error": result.error,
            "final_score": 0,
        }

    b = result.breakdown
    return {
        "agent_id": req.agent_id,
        "final_score": b.final_score,
        "base_score": b.base_score,
        "max_possible": b.max_possible,
        "verdict": b.verdict,
        "verdict_adjustment": b.verdict_adjustment,
        "checks_passed": b.checks_passed,
        "checks_total": b.checks_total,
        "checks": b.checks_detail,
        "baseline_passed": b.baseline_passed,
        "unskippable_passed": b.unskippable_passed,
        "failed_unskippable": b.failed_unskippable,
        "reasoning": b.reasoning,
        "injection_detected": b.injection_detected,
    }


# ═══════════════════════════════════════════════════════════════
#  STATUS & ON-CHAIN SUBMISSION
# ═══════════════════════════════════════════════════════════════

@app.get("/score/status/{round_address}", response_model=RoundStatusResponse)
async def round_status(round_address: str):
    """Check scoring status for a round."""
    rnd = _rounds.get(round_address)
    if not rnd:
        raise HTTPException(404, "Round not found")

    return RoundStatusResponse(
        round_address=round_address,
        status=rnd["status"],
        solutions_received=len(rnd.get("solutions", {})),
        solutions_expected=rnd.get("expected_agents", 0),
        scoring_started_at=rnd.get("scoring_started_at"),
        scoring_completed_at=rnd.get("scoring_completed_at"),
        results=rnd.get("results", {}).get("metadata", {}).get("results") if rnd.get("results") else None,
        error=rnd.get("error"),
    )


@app.post("/score/submit-onchain")
async def submit_onchain(req: SubmitOnchainRequest):
    """Submit scoring results to ScoringOracle on Base L2.

    Reads results from completed scoring, builds the transaction,
    and submits via the scorer wallet.

    Requires SCORER_PRIVATE_KEY and SCORING_ORACLE env vars.
    """
    from onchain import submit_scores

    rnd = _rounds.get(req.round_address)
    if not rnd:
        raise HTTPException(404, "Round not found")
    if rnd["status"] != "completed":
        raise HTTPException(400, f"Round is '{rnd['status']}', not 'completed'")

    payload = rnd["results"]

    try:
        result = submit_scores(
            round_address=req.round_address,
            agent_ids=payload["agent_ids"],
            scores=payload["scores"],
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        log.error(f"On-chain submission failed: {e}")
        rnd["error"] = str(e)
        raise HTTPException(500, f"On-chain submission failed: {e}")

    if result["status"] == "success":
        rnd["status"] = "submitted"
        log.info(f"Round {req.round_address[:10]}...: scores submitted on-chain tx={result['tx_hash']}")
    else:
        rnd["status"] = "error"
        rnd["error"] = f"Transaction reverted: {result['tx_hash']}"

    return {
        "status": result["status"],
        "round_address": req.round_address,
        "tx_hash": result["tx_hash"],
        "block_number": result["block_number"],
        "gas_used": result["gas_used"],
        "agent_ids": payload["agent_ids"],
        "scores": payload["scores"],
    }


# ═══════════════════════════════════════════════════════════════
#  HEALTH & INFO
# ═══════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    """Health check."""
    phala_key = os.environ.get("PHALA_API_KEY", "")
    return {
        "status": "healthy",
        "scoring_model": os.environ.get("SCORING_MODEL", "deepseek/deepseek-chat-v3-0324"),
        "phala_api": "configured" if phala_key else "not configured",
        "active_rounds": len(_rounds),
        "rounds_scoring": sum(1 for r in _rounds.values() if r["status"] == "scoring"),
        "rounds_completed": sum(1 for r in _rounds.values() if r["status"] == "completed"),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8001, reload=True)
