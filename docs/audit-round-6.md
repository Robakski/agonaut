# Audit Round 6 — Full System Audit
**Date:** 2026-03-27
**Auditor:** Brose (manual, no sub-agents)
**Scope:** All code — contracts, backend, frontend, scoring service, SDK, deployment

---

## 🔴 CRITICAL BUGS (Will break core functionality)

### BUG-1: Scoring service never receives `sponsor_address` → winning solutions never stored
**Location:** `scoring-service/api.py` lines 310-340 (init_round), 340-370 (receive_solution), 555-580 (score_round)
**Impact:** Sponsors will NEVER see winning solutions. The "View Solutions" button returns "No solutions found."

The `_store_solutions()` function (line 396) reads `rnd.get("sponsor_address", "")` — but `sponsor_address` is NEVER set on the round dict. Not in `init_round`, `receive_solution`, or `/score/round`. So `sponsor` is always `""`, the early-return fires ("Cannot store solutions"), and no ECIES-encrypted solutions are ever written to the vault.

**Fix:** Add `sponsor_address` to `InitRoundRequest` and `ScoreRoundRequest` models, set it on the round dict. Also read it from the bounty index if not provided.

### BUG-2: Backend never calls `/score/init-round` → agents can't submit solutions
**Location:** `backend/api/solutions.py` (submit_solution), `scoring-service/api.py` (receive_solution)
**Impact:** The `submit_solution` endpoint forwards to scoring service's `/score/receive-solution`, which returns 404 ("Round not initialized") because nobody ever called `/score/init-round`.

The only working scoring path is the manual `trigger-scoring` endpoint which uses the one-shot `/score/round`. But even that sends `"solutions": []` (the stored solutions from receive-solution are unused since the round was never initialized).

**Fix:** Either (a) auto-initialize the round when the first solution arrives (make receive-solution create the round if it doesn't exist), or (b) have the backend call init-round when the bounty transitions to COMMIT phase.

### BUG-3: Bounty listing shows stale phase ("CREATED" forever)
**Location:** `backend/services/bounty_index.py` — `update_bounty_phase()` exists but is NEVER called
**Impact:** Every bounty on the listing page shows "CREATED" regardless of actual on-chain state. Sponsors and agents see incorrect status. Phase filtering doesn't work.

**Fix:** Either (a) read on-chain phase during listing (expensive with many bounties), or (b) update the index when phase changes are detected (webhook/polling/event listener), or (c) update phase in the bounty detail endpoint and cache it.

---

## 🟡 HIGH BUGS (Significant UX/functional issues)

### BUG-4: Scoring service health endpoint leaks model name
**Location:** `scoring-service/api.py` health endpoint
**Impact:** Anyone hitting `/health` (unauthenticated) can see `"scoring_model": "deepseek/deepseek-chat-v3-0324"`. This was flagged as SEC-3 in a prior audit and claimed fixed, but the scoring service health endpoint still exposes it.

**Fix:** Return `"scoring_model": "configured"` instead of the actual model name.

### BUG-5: `trigger-scoring` doesn't pass sponsor address to scoring service
**Location:** `backend/api/solutions.py` trigger_scoring()
**Impact:** Even with BUG-1 fixed, the manual trigger path sends a `/score/round` request without `sponsor_address`. The scoring service won't know who to encrypt solutions for.

**Fix:** Read sponsor from bounty_index (via `find_by_round`) and include it in the scoring request.

### BUG-6: Bounty detail fetches ALL bounties when accessed by round address
**Location:** `frontend/src/app/[locale]/bounties/[id]/page.tsx` lines 63-73
**Impact:** When navigating via round address (0x...), the page fetches `?limit=100` and filters client-side. With many bounties this is wasteful and may miss the target if it's beyond the first 100.

**Fix:** Add a `GET /bounties/by-round/{round_address}` endpoint to the backend.

### BUG-7: Agent dashboard `active` and `history` tabs use empty mock data
**Location:** `frontend/src/app/[locale]/dashboard/agent/page.tsx` lines 133-134
**Impact:** Agent dashboard shows no active submissions and no history, even if the agent has participated in rounds. Stats card (ELO, wins, earnings) IS wired to real chain data, but the submission list is always empty.

**Fix:** Fetch from bounty_index (filtered by agent wallet) or from on-chain events.

---

## 🟢 MEDIUM / LOW ISSUES

### M-1: Protocol endpoint says min_deposit = 0.125 ETH but contract has 0.009 ETH
**Location:** `backend/main.py` protocol info endpoint
**Impact:** Confusion during testnet testing. The frontend also enforces 0.125 ETH minimum — this means you need 0.125 ETH even on testnet.
**Note:** This is intentional for mainnet prep, but should be documented. For testnet dry-run, temporarily lower the frontend minimum.

### M-2: Sponsor dashboard fetches ALL bounties then filters client-side
**Location:** `frontend/src/app/[locale]/dashboard/sponsor/page.tsx`
**Impact:** Inefficient. Backend already supports `?sponsor=` filter but the frontend doesn't use it.
**Fix:** Change to `fetch(\`${API_URL}/bounties/?sponsor=${address}&limit=100\`)`.

### M-3: Bounty listing `entry_fee_eth` always defaults to 0.003
**Location:** `backend/api/bounties.py` line 280
**Impact:** The `bounty_index` doesn't store entry_fee_eth, so the listing always shows 0.003 even if the actual on-chain entry fee is different.
**Fix:** Store entry_fee in bounty_index during creation or read from chain.

### M-4: Agent registration stores archetype as padded bytes32 — not reversible to name
**Location:** `frontend/src/app/[locale]/agents/register/page.tsx`
**Impact:** The metadataHash is `Buffer.from("coder\0\0...")` — this is technically recoverable but fragile. IPFS metadata upload via the backend registration endpoint could provide richer metadata.
**Note:** Works fine for v1 since we display "Agent #{id}" everywhere anyway.

### M-5: No automated scoring trigger when commit phase ends
**Location:** System-wide gap
**Impact:** There's no cron/listener that detects when a round's commit deadline passes and triggers scoring. Someone has to manually call `/trigger-scoring`. This means bounties could sit in COMMIT phase forever after the deadline.
**Fix:** Add a periodic check (every 5 min) that calls `trigger-scoring` for rounds past their commit deadline.

### M-6: `receive-solution` returns 404 even after round is recovered from SQLite
**Location:** `scoring-service/api.py` _recover_rounds()
**Impact:** After scoring service restart, recovered rounds have status from DB (which might not be "receiving"). If status is "completed" or "scoring", new solutions are rejected with wrong error message.
**Note:** Minor — recovery path works for data persistence, just not for accepting new solutions post-restart.

---

## ✅ VERIFIED WORKING

- **ECIES encryption/decryption**: Python↔JS compatible (HKDF params match, GCM tag handling correct)
- **Problem encryption**: AES-256-GCM with 12-byte IV, consistent between frontend and backend vault
- **Sponsor key registration**: Deterministic message → signature → derived keypair. Same keypair regenerated on decrypt.
- **KYC gate**: Properly blocks bounty creation with status-specific messages
- **Rate limiting**: Working (10/10 e2e test), CF-Connecting-IP for real client IP
- **Middleware order**: SecurityMiddleware runs before SanctionsMiddleware (fixed)
- **Agent actions**: Enter/Commit/Claim all use correct contract ABIs, phase-aware UI
- **ArenaRegistry ABI**: Matches contract (registerWithETH, getAgentsByWallet, getAgent struct)
- **BountyRound ABI**: All 14 functions present and correct
- **ScoringOracle ABI**: Now includes getScores/getAgentScore/isResultVerified
- **CSP headers**: Properly configured in next.config.ts
- **Admin dashboard**: Session auth, brute-force protection, CSRF, audit logging all intact
- **Compliance monitoring**: Transaction recording, risk profiling, alert generation functional
- **On-chain verification**: commit hash matching, round phase checking before solution acceptance
- **Private bounty IPFS protection**: Rubrics not uploaded to IPFS for private bounties

---

## Audit Round 6b — Follow-up (same session)

### BUG-8 CRITICAL (FIXED `508c903`): /score/round overwrites previously received solutions
`trigger-scoring` sends `solutions: []` → `/score/round` replaces stored solutions with empty dict.
Fixed: merges existing + new + SQLite recovery. Returns 400 if no solutions.

### BUG-9 HIGH (FIXED `508c903`): agent_address lost after scoring service restart
`round_solutions` SQLite table didn't store `agent_address`. After restart, all addresses empty → ECIES encrypt fails.
Fixed: added column, migration, persist, recovery.

### BUG-10 MEDIUM (FIXED `508c903`): is_private missing from listing response
Bounty listing never returned `is_private` → frontend couldn't show 🔐 badge.
Fixed: added to BountyResponse model, bounty_index schema, migration.

### BUG-11 LOW (FIXED `508c903`): by-round endpoint missing round_address
Could cause frontend on-chain reads to fail silently.
Fixed: always include `round_address` in response.

### M-7: SOLUTION_KEY not generated for scoring service
The scoring engine needs `SOLUTION_KEY` env var (shared AES-256 key) to decrypt agent solutions.
SDK agents encrypt with this key. Currently empty in VPS config.
**Must be generated before dry-run:** `python3 -c "import os; print(os.urandom(32).hex())"`

### M-8: No automated scoring trigger after commit deadline
Rounds sit in COMMIT phase forever after deadline. Someone must manually call `/trigger-scoring`.
Recommend: periodic check (cron or heartbeat) for expired COMMIT rounds.

---

## All Fixed Bugs Summary
| Bug | Severity | Status | Commit |
|-----|----------|--------|--------|
| BUG-1 | 🔴 Critical | ✅ Fixed | `516c39b` |
| BUG-2 | 🔴 Critical | ✅ Fixed | `516c39b` |
| BUG-3 | 🟡 High | ✅ Fixed | `516c39b` |
| BUG-4 | 🟡 High | ✅ Fixed | `516c39b` |
| BUG-5 | 🟡 High | ✅ Fixed | `516c39b` |
| BUG-6 | 🟡 High | ✅ Fixed | `516c39b` |
| BUG-7 | 🟡 High | Open | — (dashboard mock data) |
| BUG-8 | 🔴 Critical | ✅ Fixed | `508c903` |
| BUG-9 | 🟡 High | ✅ Fixed | `508c903` |
| BUG-10 | 🟢 Medium | ✅ Fixed | `508c903` |
| BUG-11 | 🟢 Low | ✅ Fixed | `508c903` |
| M-5 | 🟢 Medium | Open | — (auto-trigger) |
| M-7 | 🟢 Setup | Open | — (SOLUTION_KEY) |

## Priority Fix Order (remaining)
1. **M-7** (SOLUTION_KEY) — generate before dry-run
2. **M-5** (auto-trigger) — cron for expired rounds
3. **BUG-7** (dashboard mock data) — wire to real API
