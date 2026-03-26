# Agonaut Full System Audit — Pre-Mainnet

**Auditor:** Brose Almighty  
**Date:** 2026-03-26  
**Scope:** Backend (37 files), Frontend (48 files), Scoring Service (4 files), Contracts (13 files)  
**Time limit:** 20 minutes

---

## 🔴 BUGS — Will Break in Production

### SYS-1: Bounty Detail Page Does Not Exist [BLOCKER]
**File:** Missing `frontend/src/app/[locale]/bounties/[id]/page.tsx`

The bounty listing page links every bounty card to `/bounties/{id}`. That page doesn't exist — only `/bounties/{id}/problem` and `/bounties/{id}/solution` exist. **Users click a bounty → get a 404.**

This is the most visible page on the platform. Must exist before launch.

**Fix:** Create bounty detail page showing: title, description (if public), phase, prize pool, agents entered, deadline, "Enter Round" button for agents, "View Solutions" link for sponsor.

### SYS-2: Scoring Service Stores Round State In-Memory Only [HIGH]
**File:** `scoring-service/api.py` — `_rounds = {}` (line ~23)

All round state (solutions received, scoring results, status) lives in a Python dict. If the scoring service restarts (crash, deploy, OOM), **all in-progress rounds lose their solutions**. Agents' work is gone. No recovery possible.

**Fix:** Persist round state to SQLite (like all other services do). At minimum, persist received solutions to disk as they arrive.

### SYS-3: `_store_solutions()` Doesn't Know Agent Addresses [HIGH]
**File:** `scoring-service/api.py` lines ~275-330

The `_store_solutions` function reads `rnd.get("decrypted_solutions", {})` keyed by agent address. But solutions are submitted by `agent_id`, not address. The `decrypted_solutions` dict is populated by `score_round()` in `scorer.py` — need to verify it actually maps to addresses. If it maps to agent IDs (likely), the lookup `addr.lower() in decrypted` will **never match** and no solutions get stored in the vault.

**Fix:** Verify `decrypted_solutions` key format matches what `_store_solutions` expects. Add logging to catch mismatches.

### SYS-4: Sponsor Can't Find Solution Viewer [MEDIUM]
There's no navigation path from bounty listing → solution viewer. The solution viewer is at `/bounties/{id}/solution` but:
- No bounty detail page exists (SYS-1)
- Sponsor dashboard shows placeholder data, not real bounties with "View Solutions" links
- The solution viewer URL isn't shown anywhere after bounty creation

**Fix:** Wire sponsor dashboard to real data + add "View Solutions" links for completed bounties.

### SYS-5: `wagmi.ts` Exports Config But Problem Viewer Import May Fail [MEDIUM]
**File:** `frontend/src/app/[locale]/bounties/[id]/problem/page.tsx`

The problem viewer imports `getWalletClient` from `wagmi/actions` and `config` from `@/lib/wagmi`. The `getWalletClient(config)` call requires the wagmi config object. This should work BUT: `getWalletClient` from `wagmi/actions` may not accept a config parameter directly in wagmi v2. It typically reads from React context.

Need to verify this compiles and works at runtime, not just build time.

### SYS-6: Homepage Doesn't Mention Private Bounties [LOW]
The homepage has no mention of private bounties, zero-knowledge solutions, or encrypted problem delivery. This is a major differentiator that should be prominently featured.

---

## 🟡 SECURITY — Vulnerabilities to Address

### SEC-1: Admin Endpoints Use URL Query Parameter for Auth [HIGH]
**File:** `middleware/security.py` lines 82-89

Admin endpoints check `request.query_params.get("key", "")` for the ADMIN_KEY. This means the key appears in:
- Server access logs
- Browser history
- Referrer headers
- Proxy logs

The admin dashboard itself uses cookie-based auth (good), but the API endpoints (activity, feedback, KYC admin, compliance) all use URL query params.

**Fix:** Accept admin key via `Authorization` header or `X-Admin-Key` header instead of query params.

### SEC-2: Sanctions Middleware Extracts Wallet From Header — Easy to Omit [MEDIUM]
**File:** `middleware/sanctions_middleware.py` line ~75

For write endpoints, the middleware tries to extract wallet from: query params → path params → `X-Wallet-Address` header. But the actual wallet is in the POST body (e.g., `sponsorAddress` in bounty creation). The middleware **never reads the body**, so sanctions screening likely never finds the wallet on POST requests.

The actual KYC check in `bounties.py` catches this for bounty creation, but agent registration and solution submission may bypass sanctions screening entirely.

**Fix:** For POST endpoints, read wallet from the request body JSON.

### SEC-3: `protocol` Endpoint Leaks Internal Config Details [LOW]
**File:** `main.py` `/api/v1/protocol`

Exposes `SCORING_MODEL` name. While not critical, it tells attackers which model to target for prompt injection. Remove or genericize.

### SEC-4: Rate Limiter Memory Leak Protection Weak [LOW]
**File:** `middleware/security.py` `_rate_check()`

Cleanup only triggers when `len(_rate_store) > 10000`. A slow-drip attack from many IPs could fill memory before cleanup triggers. Not critical for single VPS but worth noting.

---

## 🟠 FUNCTIONALITY GAPS — What Customers Expect

### FUNC-1: Agent Leaderboard Returns Empty Array
**File:** `backend/api/agents.py` `leaderboard()` returns `[]`

The leaderboard page exists in the frontend but the API always returns empty. Customers see an empty page. Need to wire to EloSystem contract reads.

### FUNC-2: Agent Profile Returns 404
**File:** `backend/api/agents.py` `get_agent()` raises 404

The agent detail endpoint is a stub. Agent profiles don't work.

### FUNC-3: Agent/Sponsor Dashboards Show Placeholder Data
Both dashboard pages show hardcoded stats (ELO 1200, 0 ETH earned, etc.). Not wired to any API. Useless for real users.

### FUNC-4: Bounty Results Endpoint is Stub
**File:** `backend/api/agents.py` `get_results()` raises 404

After a bounty is scored and settled, there's no way to see results via API.

### FUNC-5: Search Agents is Stub
Returns empty array always.

### FUNC-6: No Email Notifications
When a bounty is scored, the sponsor gets no notification. When KYC is approved, no email. The email service exists but isn't wired to any workflow events.

### FUNC-7: `protocol` Endpoint Shows 0.125 ETH Min Deposit But Contracts Allow 0.009
The API says `min_bounty_deposit_eth: 0.125` but the contract `Constants.sol` still has `0.009 ether` (testnet). Confusing discrepancy.

---

## ✅ WHAT WORKS WELL

1. **Bounty creation flow** — KYC gate, privacy selector, encryption, relay, deposit — well-wired
2. **ECIES solution encryption** — Fixed and verified with cross-platform tests
3. **Problem encryption/decryption** — Fixed and verified (4 bugs caught today)
4. **KYC via Sumsub** — Full integration with webhook, fail-closed gate
5. **Compliance monitoring** — Transaction surveillance, risk scoring, admin dashboard
6. **Agent API keys** — EIP-191 wallet signature, SHA-256 hash storage, max 3 keys
7. **Rate limiting** — Tiered per endpoint, admin auth, body size limits
8. **CORS** — Locked to localhost + agonaut.io origins only
9. **Pull-based claims** — 90-day expiry, sweep function, nonReentrant
10. **Backend deploy script** — Atomic sync with backup + rollback on health fail
11. **Admin dashboard** — Cookie auth, brute-force protection, CSRF, audit logging

---

## Priority Fix Order for Mainnet

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 1 | SYS-1: Create bounty detail page | 2-3 hrs | Users 404 on core action |
| 2 | SYS-2: Persist scoring round state | 1-2 hrs | Data loss on restart |
| 3 | SYS-3: Verify solution vault key mapping | 30 min | Solutions may not store |
| 4 | SEC-1: Move admin auth to headers | 30 min | Key leakage |
| 5 | SEC-2: Fix sanctions body parsing | 1 hr | Compliance gap |
| 6 | SYS-4: Wire sponsor dashboard | 2 hrs | Sponsor can't find solutions |
| 7 | FUNC-7: Align min deposit | 5 min | Confusing discrepancy |
| 8 | SYS-6: Homepage privacy messaging | 1 hr | Missing key differentiator |
| 9 | FUNC-1-6: Wire remaining stubs | 4-6 hrs | Polish |

**Bottom line:** The crypto, contracts, and security architecture are solid. The gaps are mostly in **frontend completeness** (missing pages, placeholder data, stubs) and **operational resilience** (in-memory scoring state). Fix SYS-1 through SYS-4 and you can launch.
