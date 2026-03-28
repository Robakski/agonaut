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

SCORING_SERVICE_URL = os.environ.get("SCORING_SERVICE_URL", "http://127.0.0.1:8001")
SCORING_API_KEY = os.environ.get("SCORING_API_KEY", "")
SCORING_HMAC_SECRET = os.environ.get("SCORING_HMAC_SECRET", "")


def _scoring_headers(body: bytes = b"") -> dict:
    """Auth headers for scoring service communication.

    Uses HMAC-SHA256 signing (preferred) with API key fallback.
    HMAC includes timestamp for replay protection.
    """
    import hmac
    import hashlib
    import time

    headers = {}

    # Prefer HMAC signing (replay-resistant)
    if SCORING_HMAC_SECRET:
        timestamp = str(int(time.time()))
        msg = timestamp.encode() + body
        signature = hmac.new(SCORING_HMAC_SECRET.encode(), msg, hashlib.sha256).hexdigest()
        headers["X-Scoring-Timestamp"] = timestamp
        headers["X-Scoring-Signature"] = signature
    elif SCORING_API_KEY:
        headers["X-Scoring-Key"] = SCORING_API_KEY

    return headers


# ── Models ──

class SubmitSolutionRequest(BaseModel):
    """Submit an encrypted solution for a bounty round."""
    round_address: str          # BountyRound contract address
    agent_id: int               # Agent's on-chain ID
    commit_hash: str            # Must match on-chain commit (keccak256)
    encrypted_solution: str     # ECIES-encrypted solution (hex)
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



# ── Helpers ──

async def _auto_init_round(client: httpx.AsyncClient, round_address: str, round_details: dict):
    """Auto-initialize a round in the scoring service.

    Fetches problem text + sponsor from local storage/chain, then calls
    /score/init-round so solutions can be received.
    """
    import json as _json
    from services import bounty_index
    from services.storage import load_rubric

    # Get bounty data from index
    bounty_data = bounty_index.find_by_round(round_address)
    sponsor_address = round_details.get("sponsor", "")
    problem_text = ""
    rubric = None
    is_private = False

    # Try problem vault first (private bounties)
    try:
        from services.problem_vault import get_problem_for_scoring
        vault_result = get_problem_for_scoring(round_address)
        if vault_result and isinstance(vault_result, dict):
            problem_text = vault_result.get("problem_text", "")
            is_private = True
    except Exception as e:
        log.warning(f"Problem vault read failed: {e}")

    # For public bounties, get from local storage
    if not problem_text and not is_private and bounty_data:
        stored = load_rubric(bounty_data["bounty_id"])
        if stored:
            problem_text = stored.get("description", "")
            rubric = stored.get("rubric")

    if not sponsor_address and bounty_data:
        sponsor_address = bounty_data.get("sponsor", "")

    expected_agents = round_details.get("agent_count", 0) or 1

    init_body = _json.dumps({
        "round_address": round_address,
        "problem_text": problem_text,
        "expected_agents": expected_agents,
        "rubric": rubric,
        "sponsor_address": sponsor_address,
    }).encode()

    init_resp = await client.post(
        f"{SCORING_SERVICE_URL}/score/init-round",
        content=init_body,
        timeout=10.0,
        headers={**_scoring_headers(init_body), "Content-Type": "application/json"},
    )
    if init_resp.status_code < 400:
        log.info(f"Round {round_address[:10]}... auto-initialized (sponsor={sponsor_address[:10]}...)")
    else:
        log.error(f"Failed to auto-initialize round: {init_resp.text}")


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
    # Auto-initialize the round if this is the first solution (BUG-2 fix)
    try:
        import json as _json
        async with httpx.AsyncClient() as client:
            # Try to receive the solution
            body = _json.dumps({
                "round_address": req.round_address,
                "agent_id": req.agent_id,
                "encrypted_solution": req.encrypted_solution,
                "commit_hash": req.commit_hash,
                "agent_address": req.agent_address,
            }).encode()
            resp = await client.post(
                f"{SCORING_SERVICE_URL}/score/receive-solution",
                content=body,
                timeout=10.0,
                headers={**_scoring_headers(body), "Content-Type": "application/json"},
            )

            # If round not initialized, auto-init then retry
            if resp.status_code == 404:
                log.info(f"Round {req.round_address[:10]}... not initialized, auto-initializing...")
                await _auto_init_round(client, req.round_address, round_details)

                # Retry receive-solution
                resp = await client.post(
                    f"{SCORING_SERVICE_URL}/score/receive-solution",
                    content=body,
                    timeout=10.0,
                    headers={**_scoring_headers(body), "Content-Type": "application/json"},
                )

            if resp.status_code >= 400:
                detail = resp.json().get("detail", resp.text)
                raise HTTPException(resp.status_code, detail)
            scoring_resp = resp.json()
    except httpx.ConnectError:
        log.error("Scoring service unreachable at %s", SCORING_SERVICE_URL)
        raise HTTPException(503, "Scoring service temporarily unavailable")

    # Record participation in bounty index for agent dashboard
    try:
        from services.bounty_index import record_participation, find_by_round
        bounty = find_by_round(req.round_address)
        bounty_id = bounty["bounty_id"] if bounty else None
        record_participation(req.round_address, req.agent_address, req.agent_id, bounty_id, "submitted")
    except Exception as e:
        log.warning(f"Failed to record participation: {e}")  # non-blocking

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
    """Trigger scoring for a round — ALWAYS uses V2 unified pipeline.

    Unified pipeline for BOTH public and private bounties:
    - Solutions are always ECIES-encrypted for the TEE
    - TEE decrypts solutions using its own private key
    - Results re-encrypted for sponsor using their ECIES public key

    For private bounties: TEE vault already holds the problem (nothing extra needed).
    For public bounties: We pass problem_text + sponsor_public_key to V2 endpoint.
    """
    try:
        async with httpx.AsyncClient() as client:
            # ── Resolve problem text (public bounties only — private is in TEE vault) ──
            problem_text = ""
            sponsor_public_key = ""
            sponsor_address = ""

            # Get bounty metadata from index
            try:
                from services import bounty_index
                bounty_data = bounty_index.find_by_round(round_address)
                if bounty_data:
                    sponsor_address = bounty_data.get("sponsor", "")
            except Exception:
                pass

            # Fallback: get sponsor from chain
            if not sponsor_address:
                try:
                    chain_svc = get_chain_service()
                    rd = chain_svc.get_round_details(round_address)
                    sponsor_address = rd.get("sponsor", "")
                except Exception:
                    pass

            # Get sponsor's ECIES public key (needed for result encryption)
            if sponsor_address:
                try:
                    from services.sponsor_keys import get_public_key
                    sponsor_public_key = get_public_key(sponsor_address) or ""
                except Exception as e:
                    log.warning(f"Failed to get sponsor public key: {e}")

            # For public bounties: load problem text from local storage
            # (Private bounties: TEE vault has the problem, V2 endpoint will find it there)
            if bounty_data and not bounty_data.get("is_private"):
                try:
                    from services.storage import load_rubric
                    rubric = load_rubric(bounty_data["bounty_id"])
                    if rubric:
                        problem_text = rubric.get("description", "")
                except Exception:
                    pass

            if not sponsor_public_key:
                log.warning(
                    f"No sponsor ECIES key for round {round_address[:10]}... "
                    f"(sponsor: {sponsor_address[:10]}...). "
                    "Winning solutions will not be encrypted for sponsor."
                )

            # ── Call unified V2 scoring endpoint ──
            import json as _json
            trigger_body = _json.dumps({
                "round_address": round_address,
                "solutions": [],  # Already stored via receive-solution
                "problem_text": problem_text,  # Public bounty fallback
                "sponsor_public_key": sponsor_public_key,  # For result encryption
            }).encode()
            resp = await client.post(
                f"{SCORING_SERVICE_URL}/score/round-v2",
                content=trigger_body,
                timeout=10.0,
                headers={**_scoring_headers(trigger_body), "Content-Type": "application/json"},
            )
            result = resp.json()

        # Start background task to pull results when scoring completes
        import asyncio
        asyncio.create_task(_pull_results_when_ready(round_address, sponsor_address))

        return result
    except httpx.ConnectError:
        raise HTTPException(503, "Scoring service temporarily unavailable")


async def _pull_results_when_ready(round_address: str, sponsor_address: str):
    """Background: poll scoring service until results are ready, then pull and store.

    Pull-based architecture — no callbacks from TEE to backend needed.
    Polls every 15s for up to 10 minutes.
    """
    import asyncio
    import json as _json

    max_attempts = 40  # 40 × 15s = 10 minutes
    for attempt in range(max_attempts):
        await asyncio.sleep(15)

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{SCORING_SERVICE_URL}/score/results/{round_address}",
                    timeout=10.0,
                    headers=_scoring_headers(),
                )
                if resp.status_code == 404:
                    log.warning(f"Results pull: round {round_address[:10]}... not found")
                    return

                data = resp.json()
                status = data.get("status")

                if status == "scoring":
                    continue  # Still in progress

                if status in ("completed", "submitted"):
                    encrypted_solutions = data.get("encrypted_solutions", [])
                    agent_ids = data.get("agent_ids", [])
                    scores = data.get("scores", [])
                    tx_hash = data.get("tx_hash", "")

                    if encrypted_solutions:
                        from services.solution_vault import store_winning_solution as vault_store
                        stored = 0
                        for sol in encrypted_solutions:
                            try:
                                vault_store(
                                    round_address=round_address,
                                    agent_address="",
                                    agent_id=sol["agent_id"],
                                    score=sol["score"],
                                    encrypted_solution=sol["encrypted_solution"],
                                    sponsor_address=sponsor_address,
                                )
                                stored += 1
                            except Exception as e:
                                log.error(f"Failed to store solution for agent {sol['agent_id']}: {e}")
                        log.info(
                            f"Pulled and stored {stored} encrypted solutions for round "
                            f"{round_address[:10]}... (sponsor: {sponsor_address[:10]}...)"
                        )

                    # Track activity events for airdrop eligibility
                    _track_scoring_results(round_address, agent_ids, scores, tx_hash)

                    if not encrypted_solutions:
                        log.info(f"Round {round_address[:10]}... completed with no winning solutions")
                    return

                if status == "error":
                    log.error(f"Scoring failed for round {round_address[:10]}...: {data.get('error')}")
                    return

        except Exception as e:
            log.warning(f"Results pull attempt {attempt+1} failed: {e}")

    log.error(f"Results pull timed out after 10 minutes for round {round_address[:10]}...")


def _track_scoring_results(round_address: str, agent_ids: list, scores: list, tx_hash: str):
    """Track bounty_won activity events for airdrop eligibility.

    Called by _pull_results_when_ready after scoring completes.
    Previously done by scoring service callback — now backend-side.
    """
    if not agent_ids or len(agent_ids) != len(scores):
        return

    try:
        from services import bounty_index
        bounty = bounty_index.find_by_round(round_address)

        # Resolve agent addresses from participation records
        for i, agent_id in enumerate(agent_ids):
            score = scores[i]
            if score > 0:
                # Look up agent address from participation index
                agent_address = ""
                try:
                    participation = bounty_index.get_participation(round_address, agent_id)
                    if participation:
                        agent_address = participation.get("agent_address", "")
                except Exception:
                    pass

                if agent_address:
                    try:
                        import httpx as _httpx
                        _httpx.post(
                            "http://127.0.0.1:8000/api/v1/activity/track",
                            json={
                                "wallet": agent_address,
                                "event": "bounty_won",
                                "metadata": {
                                    "round": round_address,
                                    "score": score,
                                    "tx_hash": tx_hash,
                                    "bounty_id": bounty.get("bounty_id", "") if bounty else "",
                                },
                            },
                            timeout=5,
                        )
                    except Exception as e:
                        log.warning(f"Failed to track bounty_won for {agent_address[:10]}...: {e}")
    except Exception as e:
        log.warning(f"Activity tracking failed (non-critical): {e}")


# ── Sponsor Public Key Registration ──

class RegisterSponsorKeyRequest(BaseModel):
    """Sponsor registers their derived encryption public key."""
    message: str
    signature: str
    derived_public_key: str = ""  # If provided, use this instead of recovered Ethereum pubkey


@router.post("/register-sponsor-key")
async def register_sponsor_key(req: RegisterSponsorKeyRequest):
    """Register a sponsor's secp256k1 public key for zero-knowledge solution delivery.

    Two modes:
    1. (V2 — preferred) Frontend derives a keypair from the wallet signature and sends
       the derived public key. This ensures the frontend can re-derive the matching
       private key for decryption (wallets don't expose raw private keys).
    2. (V1 — legacy) We recover the Ethereum public key from the signature. This only
       works if the frontend can perform ECDH with the wallet's actual private key.

    The derived key approach (V2) uses: keccak256(signature) → private key → public key.
    Both frontend and TEE use the same derived public key for encrypt/decrypt.
    """
    try:
        from services.sponsor_keys import register_from_signature, register_derived_key
        from eth_account.messages import encode_defunct
        from eth_account import Account

        # Verify signature is valid and recover address
        msg = encode_defunct(text=req.message)
        address = Account.recover_message(msg, signature=req.signature)

        if req.derived_public_key:
            # V2: Store the derived public key (frontend computed it from keccak256(sig))
            # Validate it looks like an uncompressed secp256k1 key
            pk = req.derived_public_key.replace("0x", "")
            if len(pk) != 130 or not pk.startswith("04"):
                raise ValueError("Invalid derived public key format (expected 65-byte uncompressed)")
            register_derived_key(address, req.derived_public_key)
            return {
                "status": "registered",
                "address": address,
                "public_key_preview": req.derived_public_key[:20] + "...",
                "key_type": "derived",
            }
        else:
            # V1 legacy: recover Ethereum public key from signature
            result = register_from_signature(req.message, req.signature)
            return {
                "status": "registered",
                "address": result["address"],
                "public_key_preview": result["public_key"][:20] + "...",
                "key_type": "recovered",
            }
    except ValueError as e:
        raise HTTPException(400, f"Invalid signature: {e}")
    except Exception as e:
        log.error(f"Sponsor key registration failed: {e}")
        raise HTTPException(500, "Failed to register public key")


@router.get("/sponsor-key/{wallet}")
async def get_sponsor_key(wallet: str):
    """Check if a sponsor has a registered public key (public endpoint, no secrets)."""
    if not wallet.startswith("0x") or len(wallet) != 42:
        raise HTTPException(400, "Invalid wallet address")
    from services.sponsor_keys import get_public_key
    pubkey = get_public_key(wallet)
    return {"wallet": wallet, "has_key": pubkey is not None}


# ── Sponsor Solution Access ──

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
    encrypted_solution: dict   # ECIES blob: {ephemeral_pubkey, iv, ciphertext, mac}
    sponsor_address: str


# ── DEPRECATED V1 Endpoints ──────────────────────────────────────────────
# These were used by the V1 push-based scoring pipeline where the TEE
# scoring service would callback to the backend to store results.
# In V2 (Architecture B / pull-based), the backend pulls results from
# GET /score/results/{round_address} on the scoring service instead.
# Kept for backward compatibility but should not be called.
# TODO: Remove in v3.0

@router.post("/store-winning", deprecated=True)
async def store_winning_solution_endpoint(req: StoreWinningSolutionRequest, request: Request):
    """DEPRECATED: V1 push-based solution storage. Use pull-based flow instead.

    V2 Architecture B: backend polls GET /score/results/{round} on scoring service.
    This endpoint is no longer called by the scoring service.
    """
    raise HTTPException(410, "Deprecated — V2 uses pull-based scoring (GET /score/results/{round})")


@router.get("/sponsor-pubkey-internal/{wallet}", deprecated=True)
async def get_sponsor_pubkey_internal(wallet: str, request: Request):
    """DEPRECATED: V1 endpoint for TEE to fetch sponsor keys. No longer needed.

    V2: Sponsor public key is passed directly in the /score/round-v2 request body.
    """
    raise HTTPException(410, "Deprecated — V2 passes sponsor key in scoring request body")
