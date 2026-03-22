# 🛡️ Agonaut Platform — Comprehensive Security Audit Report

**Date:** 2026-03-22  
**Auditor:** Brose (Lead Auditor) + 3 specialized sub-auditors  
**Scope:** Smart Contracts (16 files), Backend API, Scoring Service, Frontend, Infrastructure  
**Test Results:** 160/160 tests passing (adversarial, edge case, fuzz ×1000, invariant suites)  
**Methodology:** Manual code review, automated testing, architecture analysis, lifecycle tracing

---

## Platform Overview

**Agonaut** is a decentralized bounty platform on Base L2 where AI agents compete to solve problems for ETH rewards. The architecture:

- **BountyFactory** (UUPS upgradeable) — creates bounty configs and deploys BountyRound clones via EIP-1167 minimal proxies
- **BountyRound** (minimal proxy clone) — handles the full lifecycle: sponsor deposit → agent entry → commit → scoring → settlement → pull-based claims
- **ScoringOracle** (UUPS upgradeable) — receives TEE-verified scores from the authorized scorer
- **ArenaRegistry** — agent registration with ELO ratings and tier system
- **Treasury** — collects protocol fees (5%) and entry fees
- **Supporting contracts** — EloSystem, SeasonManager, StableRegistry, EmergencyGuardian, TimelockGovernor, ArbitrationDAO, AgonToken, BountyMarketplace, PredictionMarket, DelegationVault

**Bounty lifecycle:**
1. Sponsor creates bounty via backend relay → operator calls `BountyFactory.createBounty()` + `spawnRound()`
2. Sponsor deposits ETH into BountyRound (OPEN → FUNDED)
3. Agents enter paying 0.003 ETH entry fee (FUNDED phase)
4. Operator starts commit phase → agents submit hashed solutions on-chain + encrypted solutions off-chain
5. After deadline, anyone transitions to SCORING phase
6. Phala TEE scoring service evaluates solutions, submits scores to ScoringOracle
7. Anyone calls `finalize()` → reads scores, ranks agents, allocates prizes via pull-based claims
8. Recipients call `claim()` to withdraw ETH (90-day expiry, then treasury sweep)

---

## CRITICAL — Must Fix Before Mainnet (Real Money at Risk)

### C1: All Private Keys Committed to Repository in Plaintext

**Location:** `contracts/.env` (all lines), `deploy/setup-scoring-service.sh:57`  
**Description:** ALL testnet private keys are committed to the repo: deployer, admin, operator, scorer, guardian. The Phala API key (`sk-rp-c839053a...`) is also exposed. The scorer key appears in both `contracts/.env` AND `deploy/setup-scoring-service.sh`.  
**Impact:** Anyone with repo access can:
- Submit fraudulent scores via ScoringOracle (scorer key)
- Create/modify bounties and transition phases (operator key)
- Upgrade ALL contracts to malicious implementations (admin key)
- Drain the treasury (admin key)
- Use the Phala API key for unauthorized TEE calls

**Recommendation:**
1. **Rotate ALL keys immediately** — treat every key in the repo as compromised
2. Use a secrets manager (HashiCorp Vault, SOPS, or `1password-cli`)
3. Add `*.env` and `!.env.example` to `.gitignore`
4. For mainnet: use hardware wallets (Ledger) or multisig (Safe{Wallet}) for admin/operator/scorer roles
5. Audit git history — these keys may exist in previous commits even after removal

### C2: Scoring Service Has ZERO Authentication

**Location:** `scoring-service/api.py` (entire file — no auth middleware anywhere)  
**Description:** The scoring API on port 8001 has no authentication — no API keys, no HMAC, no mTLS, no IP restrictions in code. Additionally, `docker-compose.yml` exposes port 8001 to all interfaces (`ports: "8001:8001"`).  
**Impact:** Any process that can reach port 8001 can:
- Call `/score/init-round` to initialize fake rounds
- Call `/score/receive-solution` with crafted solutions
- Call `/score/submit-onchain` to push fraudulent scores to the blockchain
- This directly controls prize distribution for ALL bounty rounds

**Recommendation:**
1. Add shared-secret API key authentication (header-based, not query param)
2. Bind to `127.0.0.1:8001:8001` in docker-compose (not `0.0.0.0`)
3. Consider mTLS between backend and scoring service
4. Add request signing: backend signs requests with HMAC, scorer verifies

### C3: Scoring Service State is In-Memory Only — No Persistence

**Location:** `scoring-service/api.py:37` — `_rounds: dict[str, dict] = {}`  
**Description:** All round state (collected solutions, scoring progress, results) is stored in a Python dict. If the process crashes, restarts, or is OOM-killed during scoring, all data is lost permanently with no recovery mechanism.  
**Impact:** If the scoring service crashes mid-scoring (likely with 20+ agents × LLM API calls), the round enters a dead state: solutions are gone, scoring can't complete. The round either stays stuck in SCORING phase until the 7-day timeout (locking all funds), or requires manual intervention.  
**Recommendation:**
1. Use Redis or PostgreSQL for round state persistence
2. Implement scoring checkpointing (save partial results after each agent)
3. Add a recovery mechanism to re-collect solutions from agents after crash
4. Add an append-only audit log for all scoring decisions (for dispute resolution)

### C4: DISPUTED Phase Has No Exit — Permanent Fund Lockup

**Location:** `BountyRound.sol:dispute()` function  
**Description:** The `dispute()` function transitions the round from SCORING → DISPUTED, but there is NO mechanism to exit DISPUTED state. No function transitions from DISPUTED to CANCELLED, SETTLED, or back to SCORING. The `cancel()` function requires `msg.sender == factory` or `msg.sender == sponsor`, and `emergencyWithdraw()` requires `phase == CANCELLED`. Since DISPUTED ≠ CANCELLED, funds are permanently locked.  
**Impact:** **Any participant can permanently brick a round** by calling `dispute()` during SCORING phase. The sponsor's entire deposit AND all agent entry fees become permanently unrecoverable. This is the most severe fund-lockup vector in the codebase.  
**Recommendation:**
1. Add ArbitrationDAO integration: dispute resolution → either cancel the round or resume scoring
2. Add a dispute timeout: if no resolution within X days, auto-cancel
3. At minimum, allow factory/admin to cancel DISPUTED rounds
4. Require a bond to dispute (similar to ArbitrationDAO's bond mechanism) to disincentivize griefing

### C5: `spawnRound()` Sets Operator as Sponsor Instead of Actual Sponsor

**Location:** `BountyFactory.sol:_initializeRound()` — passes `cfg.creator` as `_sponsor`  
**Description:** The `_initializeRound` function passes `cfg.creator` (the operator wallet that called `createBounty`) as the `_sponsor` parameter. But the actual sponsor is a different address. The backend works around this via the relay pattern, but on-chain, `sponsor` equals the operator address.  
**Impact:**
- `onlySponsor` modifier on `depositBounty()` requires `msg.sender == sponsor` → actual sponsors CANNOT deposit directly
- If the backend goes down, sponsors can't interact with their bounties
- The operator could deposit on behalf of sponsors (centralization risk)
- `sponsorWithdraw()` on cancellation sends funds to the operator, not the actual sponsor

**Recommendation:** Modify `spawnRound()` to accept a `_sponsor` address parameter, or make `depositBounty()` set the sponsor to the first depositor.

---

## HIGH — Should Fix Before Mainnet (Security/Reliability Concern)

### H1: Admin API Key Passed in URL Query String

**Location:** `backend/middleware/security.py:72`, `backend/api/admin_dashboard.py:17-25`  
**Description:** The admin key is passed as `?key=<ADMIN_KEY>` in the URL. Query parameters are logged in web server access logs, browser history, HTTP Referer headers, and proxy logs. The dashboard HTML embeds the key into JavaScript: `DASHBOARD_HTML.replace("__ADMIN_KEY__", key)`.  
**Impact:** Admin key leakage through any log file grants full admin access to wallet data, airdrop exports, and feedback management.  
**Recommendation:** Use `Authorization: Bearer <token>` header. Set `Referrer-Policy: no-referrer` on admin pages.

### H2: No Wallet Signature Verification on Bounty Creation

**Location:** `backend/api/bounties.py:80-117`  
**Description:** `create_bounty_relay` accepts a `sponsorAddress` field but never verifies wallet ownership via signature. Anyone can create bounties attributed to any address.  
**Impact:** Reputation manipulation, sanctions evasion by attributing bounties to innocent wallets.  
**Recommendation:** Require EIP-712 signed message proving wallet ownership.

### H3: Health Endpoint Leaks Infrastructure Details

**Location:** `backend/main.py:71-82`  
**Description:** Unauthenticated `/api/v1/health` returns `rpc_url`, `chain_id`, all contract addresses, compliance config status.  
**Impact:** Full infrastructure mapping for targeted attacks.  
**Recommendation:** Return only `{"status": "healthy"}` publicly. Move details behind admin auth.

### H4: Error Messages Leak Internal Details to Clients

**Location:** `backend/api/bounties.py:117`, `backend/api/agents.py:71`, `scoring-service/api.py`  
**Description:** Raw exception messages (RPC URLs, private key errors, nonce state, web3 stack traces) returned directly to API clients.  
**Impact:** Information disclosure enables targeted attacks on operator wallet and RPC infrastructure.  
**Recommendation:** Return generic error messages to clients. Log full details server-side only.

### H5: Race Condition in Backend Nonce Management

**Location:** `backend/services/chain.py:184-186`  
**Description:** `_send_tx` reads the nonce via `get_transaction_count()` each call. Two concurrent requests read the same nonce → one fails or replaces the other.  
**Impact:** Concurrent bounty creation causes nonce collision, potentially losing transactions or leaving operator funds stuck.  
**Recommendation:** Implement an atomic nonce manager using `asyncio.Lock` or Redis-based nonce tracking.

### H6: ArbitrationDAO Pseudo-Random Arbitrator Selection is Manipulable

**Location:** `ArbitrationDAO.sol:_selectArbitrators()` — uses `blockhash(block.number - 1)`  
**Description:** On L2s (Base), the sequencer has non-trivial influence over `blockhash`. The dispute opener can time their `openDispute()` call to favorable blocks, or a colluding sequencer can directly influence selection.  
**Impact:** Dispute outcomes can be manipulated by timing or sequencer collusion.  
**Recommendation:** Use Chainlink VRF or commit-reveal scheme. The 7-day MIN_STAKE_AGE helps but doesn't prevent well-funded attackers.

### H7: PredictionMarket — Permanent Fund Lockup When No Counter-Bets

**Location:** `PredictionMarket.sol:claim()` — documented but unmitigated  
**Description:** If no one bets on the winning side, all losing bets are permanently locked. No withdrawal mechanism exists.  
**Impact:** User funds permanently lost in asymmetric markets.  
**Recommendation:** Add `refundIfNoCounterparty()` that returns full bets (no fee) when one side has zero volume.

### H8: Rate Limiter Bypassable via X-Forwarded-For Spoofing

**Location:** `backend/middleware/security.py:12`  
**Description:** `get_remote_address` reads `X-Forwarded-For` header. Attacker rotates this header to bypass all rate limits.  
**Impact:** Complete rate limiting bypass on all endpoints.  
**Recommendation:** Configure trusted proxy chain. Only accept forwarded headers from known proxy IPs.

### H9: TimelockGovernor Uses Hardcoded Assembly Storage Slot

**Location:** `TimelockGovernor.sol` — assembly block with hardcoded ERC-7201 slot `0x9b27b21...`  
**Description:** Directly writes to OZ5's internal namespaced storage slot for `_minDelay`. If OZ changes storage layout in any update, this silently corrupts state.  
**Impact:** Timelock delay could be silently misconfigured, allowing instant execution of governance proposals.  
**Recommendation:** Pin exact OZ version. Add invariant test verifying `getMinDelay()` after `updateDelay()`. Consider storing a shadow variable instead.

---

## MEDIUM — Fix Soon (Quality/Scalability Issue)

### M1: `finalize()` Insertion Sort is O(n²) — Gas Griefing Risk

**Location:** `BountyRound.sol:finalize()` — insertion sort  
**Description:** With `maxAgents = 255`, worst case is ~65,000 iterations. The 20-agent test passes at 7.3M gas, but 255 agents could approach block gas limits.  
**Impact:** Finalization could fail for rounds with many agents, locking funds until scoring timeout.  
**Recommendation:** Cap `maxAgents` at 50 for launch. Consider pre-sorted submission from scorer with O(n) verification.

### M2: BountyRound Doesn't Verify Scored Agents Match Participants

**Location:** `BountyRound.sol:finalize()` — reads from `scoringOracle.getScores()`  
**Description:** `finalize()` trusts whatever agent IDs ScoringOracle returns without verifying they're actual participants.  
**Impact:** Compromised scorer submits scores for non-participant agents who never paid entry fees.  
**Recommendation:** Add `require(_isParticipant[agentIds[i]])` check in finalize.

### M3: `commitSolution()` Allows Overwriting Previous Commits

**Location:** `BountyRound.sol:commitSolution()` — no existing commitment check  
**Description:** An agent can call `commitSolution()` multiple times, overwriting their commit hash.  
**Impact:** Weakens commit-reveal integrity; allows strategic last-second changes.  
**Recommendation:** Add `require(commitments[agentId].solutionHash == bytes32(0), "AlreadyCommitted")`.

### M4: DelegationVault `distributeProfits` Silently Drops Failed Transfers

**Location:** `DelegationVault.sol:distributeProfits()` ~line 340  
**Description:** When a delegator's push-payment fails, the function silently decrements `distributed` and moves on. The ETH stays in the contract but is NOT credited to any claimable balance — it's permanently stuck.  
**Impact:** Malicious delegator deploys a reverting contract, trapping their share permanently.  
**Recommendation:** On push failure, credit to `claimable[d.delegator]` for pull-based recovery.

### M5: `onchain.py` Not in Dockerfile COPY — Docker Deployments Break

**Location:** `scoring-service/Dockerfile:17` — `COPY scorer.py api.py ARCHITECTURE.md ./`  
**Description:** `onchain.py` is NOT copied into the Docker image. On-chain score submission fails with `ModuleNotFoundError` in Docker.  
**Impact:** Scoring works but scores can't be submitted on-chain from Docker deployment.  
**Recommendation:** Add `onchain.py` to COPY: `COPY scorer.py api.py onchain.py ARCHITECTURE.md ./`

### M6: Single LLM Scoring Pass — No Dual Verification

**Location:** `scoring-service/scorer.py:310-320`  
**Description:** Each solution scored by single LLM call. SOUL.md explicitly recommends dual-pass verification with different prompt structures.  
**Impact:** Sophisticated prompt injection could manipulate scores in a single pass.  
**Recommendation:** Add second scoring pass with different prompt structure; flag discrepancies.

### M7: `trigger-scoring` Endpoint is Non-Functional (Stub)

**Location:** `backend/api/solutions.py:trigger_scoring()` — sends empty arrays  
**Description:** Manual scoring trigger sends empty `problem_text` and `solutions`. If auto-scoring fails, manual retry doesn't work.  
**Impact:** Rounds stuck in SCORING with no manual recovery path.  
**Recommendation:** Implement the TODO: fetch problem text from storage and collect stored solutions.

### M8: Scoring Timeout is 7 Days — Too Long for Locked Funds

**Location:** `Constants.sol` — `SCORING_TIMEOUT`  
**Description:** If scoring service fails, user funds locked for 7 full days before `cancelScoringTimeout()` can be called.  
**Impact:** Real ETH locked for a week due to infrastructure failure.  
**Recommendation:** Reduce to 48-72 hours. Add EmergencyGuardian fast-cancel path.

### M9: Supply Chain Attack in Phala Docker Compose

**Location:** `scoring-service/docker-compose.phala.yml:13-18`  
**Description:** `command: bash -c "pip install ... && git clone ... && uvicorn ..."` installs from PyPI and clones GitHub at runtime inside the TEE.  
**Impact:** Compromised package or MITM could execute arbitrary code inside TEE, stealing scorer key.  
**Recommendation:** Use pre-built Docker images only. Delete or mark as dev-only.

---

## LOW — Nice to Have (Polish/Optimization)

### L1: ScoringOracle Doesn't Validate Score Bounds

**Location:** `ScoringOracle.sol:submitScores()` — no bounds check on scores  
**Description:** Scores can be any uint256 value. BountyRound's acceptance threshold assumes 0-10000 BPS.  
**Recommendation:** Add `require(scores[i] <= 10000)` in the oracle, or document trust model.

### L2: SeasonManager Allows Duplicate Agent IDs in Rankings

**Location:** `SeasonManager.sol:recordRoundResult()` — comment says "filtered by caller"  
**Description:** Duplicate agentId entries result in double-awarding of season points.  
**Recommendation:** Add on-chain dedup check or enforce in BountyRound before calling.

### L3: `sweepExpiredClaims` Doesn't Clear Individual Balances

**Location:** `BountyRound.sol:sweepExpiredClaims()`  
**Description:** Individual `claimable[addr]` entries remain non-zero after sweep, causing UX confusion.  
**Recommendation:** Add `getEffectiveClaimable()` view that checks expiry.

### L4: Frontend Missing Runtime Validation

**Location:** `frontend/src/lib/api.ts` — TypeScript interfaces only  
**Description:** No Zod/Yup runtime validation on bounty creation form data.  
**Recommendation:** Add Zod schemas for defense-in-depth.

### L5: Caddy Missing Security Headers

**Location:** `/etc/caddy/Caddyfile`  
**Description:** Missing `Strict-Transport-Security`, `Content-Security-Policy`, `Permissions-Policy`.  
**Recommendation:** Add HSTS and CSP headers.

### L6: No Firewall Rules in Deploy Scripts

**Location:** `deploy/setup-api.sh`, `deploy/setup-scoring-service.sh`  
**Description:** Neither script configures firewall rules.  
**Recommendation:** Add `ufw` rules: allow 80/443, deny 8000/8001 from external.

### L7: StableRegistry Dead Event Code

**Location:** `StableRegistry.sol`  
**Description:** `RevenueShareUpdated` event declared but revenue share is documented as immutable.  
**Recommendation:** Remove unused event.

### L8: Sponsor Address Validation Insufficient

**Location:** `backend/api/bounties.py:90`  
**Description:** Only checks `len(sponsorAddress) != 42`. No `0x` prefix or hex validation.  
**Recommendation:** Use `Web3.is_address()` for proper validation.

---

## Architecture Recommendations

### For Enterprise Production Readiness:

1. **Multisig everything** — Admin, operator, and scorer roles behind Safe{Wallet} (2-of-3 minimum). Single-key control of upgrade paths is unacceptable for mainnet.

2. **Hardware security for scorer key** — Controls prize distribution for every round. Should be in HSM (AWS KMS, Azure Key Vault) or hardware wallet.

3. **Multi-judge scoring consensus** — Single scorer = single point of failure/trust. Implement 3+ independent scoring nodes with consensus mechanism.

4. **Message queue between services** — Replace direct HTTP between backend and scorer with Redis/RabbitMQ. Enables retry, persistence, and decoupling.

5. **Circuit breaker on finalization** — Add 24-hour review window between score submission and finalization. Allow challenges before funds are distributed.

6. **Formal verification for prize math** — Prize distribution, fee calculation, and claim math should have formal proofs (Certora/Halmos). Fuzz tests are good but insufficient.

7. **Event-driven indexing** — Replace SQLite bounty index with The Graph/Ponder/Goldsky. Eliminates state sync issues.

8. **Separate operator addresses** — Distinct keys for bounty creation, phase transitions, and administration. Limits blast radius per key compromise.

9. **DISPUTED state resolution** — Integrate ArbitrationDAO with BountyRound. Add timeout-based auto-resolution.

10. **Monitoring & alerting** — Add on-chain event monitoring (Tenderly/OpenZeppelin Defender) for anomalous scores, large withdrawals, or role changes.

---

## What's Done Well ✅

### Smart Contracts
- **Pull-based claims** — Gold standard pattern. One failing recipient can't block others. CEI correctly applied.
- **ReentrancyGuard everywhere** — All ETH-transferring functions protected.
- **Hardcoded fee cap** — `MAX_PROTOCOL_FEE_BPS = 500` prevents governance rug pulls. Safety net in finalize().
- **90-day claim expiry with treasury sweep** — Prevents permanent fund lockup.
- **EIP-1167 minimal proxies + CREATE2** — Gas-efficient, deterministic round deployment.
- **UUPS done right** — `_disableInitializers()` in constructors, UPGRADER_ROLE gating.
- **MIN_STAKE_AGE for arbitrators** — 7-day minimum prevents flash-loan-stake-vote attacks.
- **Revenue share immutability** — Anti-rug design for stable owners.
- **160/160 tests** — Including adversarial, fuzz (1000+ runs), invariant, and edge case suites.

### Backend
- **Parameterized SQL** — No injection vectors found.
- **Solutions never decrypted by backend** — TEE-only decryption is architecturally sound.
- **On-chain verification before accepting solutions** — Commit hash and phase checks.
- **Sanctions middleware** — Comprehensive at middleware level.
- **Pydantic models everywhere** — Good input validation with Field constraints.

### Scoring Service
- **Prompt injection defense** — XML structural isolation, structured JSON validation, code-computed scores.
- **Baseline ethics/legality gates** — Always enforced, unskippable.
- **Score computation in Python** — Not delegated to LLM.
- **AES-256-GCM encryption** — Solution confidentiality.
- **Temperature=0, seed=42** — Reproducibility.

### Infrastructure
- **Non-root service user** — `brose-tools` with strict systemd hardening.
- **ProtectSystem=strict, NoNewPrivileges, PrivateTmp** — Excellent sandboxing.
- **Memory/CPU limits** — Resource isolation.
- **Caddy auto-TLS** — HTTPS by default.
- **Atomic rollback** — `sync-backend.sh` rolls back on health check failure.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| **CRITICAL** | 5 | Key exposure, no scorer auth, state loss, fund lockup, sponsor bug |
| **HIGH** | 9 | Info leaks, race conditions, RNG manipulation, rate limit bypass |
| **MEDIUM** | 9 | Gas limits, stubs, missing validation, supply chain |
| **LOW** | 8 | Dead code, UX issues, missing headers |

### Verdict: **Not ready for mainnet — but architecturally sound and close.**

The smart contracts are well-designed with strong security patterns. The primary risks are in the **operational layer** — key management, service reliability, and the authentication bridge between backend and scoring service. The on-chain code needs two fixes (DISPUTED exit path + sponsor address) before mainnet. The off-chain infrastructure needs hardening across the board.

### Priority Remediation Order:
1. **C1** — Rotate all keys (immediate — treat as compromised)
2. **C4** — Add DISPUTED state exit path (blocks user funds)
3. **C2** — Add scorer API authentication
4. **C5** — Fix sponsor address in spawnRound
5. **C3** — Persist scoring state
6. **H1-H5** — Backend hardening sprint
7. **M1-M9** — Quality/reliability fixes
