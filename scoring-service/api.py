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

# ── Request signing (HMAC-SHA256) ──
# The backend signs requests with a shared secret. This prevents:
# 1. Unauthorized scoring requests even from localhost
# 2. Request tampering in transit
# 3. Replay attacks (timestamp in signature)
import hmac as _hmac
import time as _time

SCORING_HMAC_SECRET = os.environ.get("SCORING_HMAC_SECRET", "")
HMAC_MAX_AGE_SECONDS = 300  # 5-minute replay window


def _verify_hmac(request_body: bytes, timestamp: str, signature: str) -> bool:
    """Verify HMAC-SHA256 signature: HMAC(secret, timestamp + body)."""
    if not SCORING_HMAC_SECRET:
        return False
    try:
        ts = int(timestamp)
        if abs(_time.time() - ts) > HMAC_MAX_AGE_SECONDS:
            return False  # Expired — replay protection
    except (ValueError, TypeError):
        return False
    msg = f"{timestamp}".encode() + request_body
    expected = _hmac.new(SCORING_HMAC_SECRET.encode(), msg, hashlib.sha256).hexdigest()
    return _hmac.compare_digest(expected, signature)


class ScoringAuthMiddleware(BaseHTTPMiddleware):
    """Require HMAC signature OR API key for all endpoints except /health.

    Priority:
    1. HMAC signature (X-Scoring-Timestamp + X-Scoring-Signature) — preferred
    2. API key (X-Scoring-Key) — fallback
    3. Reject
    """

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/health":
            return await call_next(request)

        # Require at least one auth method configured
        if not SCORING_API_KEY and not SCORING_HMAC_SECRET:
            log.error("CRITICAL: Neither SCORING_API_KEY nor SCORING_HMAC_SECRET set — rejecting ALL requests")
            return JSONResponse(status_code=503, content={"detail": "Scoring service not configured"})

        # Try HMAC first (preferred — replay-resistant)
        timestamp = request.headers.get("X-Scoring-Timestamp", "")
        signature = request.headers.get("X-Scoring-Signature", "")
        if timestamp and signature and SCORING_HMAC_SECRET:
            body = await request.body()
            if _verify_hmac(body, timestamp, signature):
                return await call_next(request)
            else:
                log.warning(f"Invalid HMAC from {request.client.host}: {request.url.path}")
                return JSONResponse(status_code=403, content={"detail": "Invalid signature"})

        # Fallback to API key
        auth = request.headers.get("X-Scoring-Key", "")
        if SCORING_API_KEY and _hmac.compare_digest(auth, SCORING_API_KEY):
            return await call_next(request)

        log.warning(f"Unauthorized scoring request from {request.client.host}: {request.url.path}")
        return JSONResponse(status_code=403, content={"detail": "Forbidden"})


app.add_middleware(ScoringAuthMiddleware)

# ── Persistent round state (SQLite-backed for crash recovery) ──
# Solutions and round status survive restarts. Results stay in memory
# during scoring but are persisted after completion.

import sqlite3

_SCORING_DB = Path(os.environ.get("SCORING_DB_PATH", "/opt/agonaut-scoring/data/scoring.db"))
_rounds: dict[str, dict] = {}


def _get_scoring_db() -> sqlite3.Connection:
    _SCORING_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_SCORING_DB), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS round_state (
            round_address TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            problem_text TEXT,
            expected_agents INTEGER,
            rubric TEXT,
            solution_key TEXT,
            sponsor_address TEXT DEFAULT '',
            created_at REAL
        )
    """)
    # Migration: add sponsor_address if missing (existing DBs)
    try:
        conn.execute("ALTER TABLE round_state ADD COLUMN sponsor_address TEXT DEFAULT ''")
    except Exception:
        pass  # Column already exists
    conn.execute("""
        CREATE TABLE IF NOT EXISTS round_solutions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            round_address TEXT NOT NULL,
            agent_id INTEGER NOT NULL,
            encrypted_solution TEXT NOT NULL,
            commit_hash TEXT,
            agent_address TEXT DEFAULT '',
            received_at REAL,
            UNIQUE(round_address, agent_id)
        )
    """)
    # Migration: add agent_address if missing
    try:
        conn.execute("ALTER TABLE round_solutions ADD COLUMN agent_address TEXT DEFAULT ''")
    except Exception:
        pass
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rs_round ON round_solutions(round_address)")
    conn.commit()
    return conn


def _persist_round(round_address: str, rnd: dict):
    """Save round metadata to SQLite."""
    try:
        conn = _get_scoring_db()
        conn.execute(
            """INSERT OR REPLACE INTO round_state
               (round_address, status, problem_text, expected_agents, rubric, solution_key, sponsor_address, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (round_address, rnd.get("status", ""), rnd.get("problem_text", ""),
             rnd.get("expected_agents", 0), json.dumps(rnd.get("rubric")),
             rnd.get("solution_key", ""), rnd.get("sponsor_address", ""), time.time())
        )
        conn.commit()
        conn.close()
    except Exception as e:
        log.warning(f"Failed to persist round state: {e}")


def _persist_solution(round_address: str, agent_id: int, encrypted: str, commit_hash: str, agent_address: str = ""):
    """Save a received solution to SQLite."""
    try:
        conn = _get_scoring_db()
        conn.execute(
            """INSERT OR REPLACE INTO round_solutions
               (round_address, agent_id, encrypted_solution, commit_hash, agent_address, received_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (round_address, agent_id, encrypted, commit_hash, agent_address, time.time())
        )
        conn.commit()
        conn.close()
    except Exception as e:
        log.warning(f"Failed to persist solution: {e}")


def _recover_rounds():
    """On startup, recover any in-progress rounds from SQLite."""
    try:
        conn = _get_scoring_db()
        rows = conn.execute(
            "SELECT * FROM round_state WHERE status IN ('receiving', 'scoring')"
        ).fetchall()
        for row in rows:
            addr = row["round_address"]
            sols = conn.execute(
                "SELECT agent_id, encrypted_solution, commit_hash, agent_address FROM round_solutions WHERE round_address = ?",
                (addr,)
            ).fetchall()
            _rounds[addr] = {
                "status": row["status"],
                "problem_text": row["problem_text"],
                "expected_agents": row["expected_agents"],
                "rubric": json.loads(row["rubric"]) if row["rubric"] else None,
                "solution_key": row["solution_key"] or "",
                "sponsor_address": row["sponsor_address"] if "sponsor_address" in row.keys() else "",
                "solutions": {
                    s["agent_id"]: {
                        "encrypted": s["encrypted_solution"],
                        "commit_hash": s["commit_hash"],
                        "agent_address": s["agent_address"] if "agent_address" in s.keys() else "",
                    }
                    for s in sols
                },
                "results": None,
                "scoring_started_at": None,
                "scoring_completed_at": None,
                "error": None,
            }
            log.info(f"Recovered round {addr[:10]}... with {len(sols)} solutions (status: {row['status']})")
        conn.close()
    except Exception as e:
        log.warning(f"Round recovery failed (starting fresh): {e}")


# Recover on startup
_recover_rounds()


# ═══════════════════════════════════════════════════════════════
#  MODELS
# ═══════════════════════════════════════════════════════════════

# ── Input limits (DoS prevention) ──
MAX_SOLUTION_SIZE = 1_000_000   # 1MB hex = 500KB plaintext — generous for any solution
MAX_SOLUTIONS_PER_ROUND = 50    # Matches MAX_AGENTS_PER_ROUND in Constants.sol
MAX_PROBLEM_TEXT_SIZE = 100_000  # 100KB problem description


class SolutionInput(BaseModel):
    agent_id: int
    encrypted_solution: str = Field(..., max_length=MAX_SOLUTION_SIZE)
    commit_hash: str = Field(..., min_length=64, max_length=64)


class ScoreRoundRequest(BaseModel):
    round_address: str
    problem_text: str
    solutions: list[SolutionInput]
    rubric: Optional[dict] = None  # Sponsor rubric JSON, or None for defaults
    solution_key: str = ""         # AES key (hex), or uses env var
    sponsor_address: str = ""      # BUG-5 fix: needed for ECIES solution storage


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
    agent_address: str = ""  # Wallet address (for solution vault storage)


class InitRoundRequest(BaseModel):
    """Initialize a round for solution collection."""
    round_address: str
    problem_text: str
    expected_agents: int
    rubric: Optional[dict] = None
    solution_key: str = ""
    sponsor_address: str = ""  # Needed for ECIES encryption of winning solutions


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
        "sponsor_address": req.sponsor_address,  # BUG-1 fix: needed for ECIES solution storage
        "solutions": {},
        "results": None,
        "scoring_started_at": None,
        "scoring_completed_at": None,
        "error": None,
    }

    _persist_round(req.round_address, _rounds[req.round_address])
    log.info(f"Round {req.round_address[:10]}... initialized, expecting {req.expected_agents} solutions, sponsor={req.sponsor_address[:10] if req.sponsor_address else 'none'}...")
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
        "agent_address": req.agent_address,
    }
    _persist_solution(req.round_address, req.agent_id, req.encrypted_solution, req.commit_hash, req.agent_address)

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
        agent_ids = payload.get("agent_ids", [])

        # Get wallet addresses from solution submission data
        solutions = rnd.get("solutions", {})
        # Build agent_id -> address mapping from received solutions
        id_to_addr = {
            aid: sol.get("agent_address", "") for aid, sol in solutions.items()
        }
        agents = [id_to_addr.get(aid, "") for aid in agent_ids]
        decrypted_by_id = rnd.get("decrypted_solutions_by_id", {})
        sponsor = rnd.get("sponsor_address", "")

        if not agents or not decrypted_by_id or not sponsor:
            log.warning(f"Cannot store solutions — agents={len(agents)}, decrypted={len(decrypted_by_id)}, sponsor={'yes' if sponsor else 'no'}")
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
            agent_id = agent_ids[i] if i < len(agent_ids) else 0
            if score > 0 and agent_id in decrypted_by_id:
                solution_text = decrypted_by_id[agent_id]

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

        # Store results + decrypted solutions for vault storage
        payload = to_onchain_payload(results)
        # Save decrypted solutions keyed by agent_id (for ECIES re-encryption)
        rnd["decrypted_solutions_by_id"] = {
            r.agent_id: r.plaintext for r in results if r.plaintext and r.final_score > 0
        }
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
    existing = _rounds.get(req.round_address)
    if existing and existing["status"] == "scoring":
        raise HTTPException(400, "Scoring already in progress for this round")

    # Build new solutions from request
    new_solutions = {
        s.agent_id: {"encrypted": s.encrypted_solution, "commit_hash": s.commit_hash}
        for s in req.solutions
    }

    # Merge with any previously received solutions (from receive-solution endpoint)
    # This ensures trigger-scoring with solutions=[] doesn't wipe stored solutions
    if existing and existing.get("solutions"):
        merged_solutions = {**existing["solutions"], **new_solutions}
    else:
        merged_solutions = new_solutions

    # Also recover solutions from SQLite if we have none
    if not merged_solutions:
        try:
            conn = _get_scoring_db()
            db_sols = conn.execute(
                "SELECT agent_id, encrypted_solution, commit_hash, agent_address FROM round_solutions WHERE round_address = ?",
                (req.round_address,)
            ).fetchall()
            for s in db_sols:
                merged_solutions[s["agent_id"]] = {
                    "encrypted": s["encrypted_solution"],
                    "commit_hash": s["commit_hash"],
                    "agent_address": s["agent_address"] if "agent_address" in s.keys() else "",
                }
            conn.close()
            if merged_solutions:
                log.info(f"Recovered {len(merged_solutions)} solutions from SQLite for scoring")
        except Exception as e:
            log.warning(f"Failed to recover solutions from SQLite: {e}")

    if not merged_solutions:
        raise HTTPException(400, "No solutions available for scoring")

    # Initialize/update round state
    _rounds[req.round_address] = {
        "status": "scoring",
        "problem_text": req.problem_text or (existing.get("problem_text", "") if existing else ""),
        "expected_agents": len(merged_solutions),
        "rubric": req.rubric or (existing.get("rubric") if existing else None),
        "solution_key": req.solution_key or (existing.get("solution_key", "") if existing else ""),
        "sponsor_address": req.sponsor_address or (existing.get("sponsor_address", "") if existing else ""),
        "solutions": merged_solutions,
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
        "scoring_model": "configured" if os.environ.get("SCORING_MODEL") or os.environ.get("PHALA_API_KEY") else "not configured",
        "phala_api": "configured" if phala_key else "not configured",
        "active_rounds": len(_rounds),
        "rounds_scoring": sum(1 for r in _rounds.values() if r["status"] == "scoring"),
        "rounds_completed": sum(1 for r in _rounds.values() if r["status"] == "completed"),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="127.0.0.1", port=8001, reload=True)
