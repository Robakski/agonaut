# Audit Round 7 — Post-Wiring Code Review
**Date:** 2026-03-27
**Scope:** All files changed since commit `37c1744` (14 files, ~1640 lines added)
**Auditor:** Brose (manual, no sub-agents)

---

## Findings Summary

| ID | Severity | File | Description | Status |
|----|----------|------|-------------|--------|
| A7-1 | **CRITICAL** | `scoring-service/ecies_encrypt.py` | `0x` prefix crash: Python `bytes.fromhex()` fails on JS hex with `0x` prefix | 🔴 FIX |
| A7-2 | **HIGH** | `backend/api/bounties.py` | `NameError: agent_ids` undefined when `get_scores()` fails for SETTLED bounty | 🔴 FIX |
| A7-3 | **HIGH** | `backend/services/bounty_index.py` | `get_agent_bounties()` JOIN doesn't include `ap.agent_id` — score matching always fails | 🔴 FIX |
| A7-4 | **HIGH** | `backend/services/bounty_index.py` | `index_bounty()` doesn't lowercase `round_address` — JOIN with participations fails | 🔴 FIX |
| A7-5 | **MEDIUM** | `backend/api/tee_proxy.py` | `store-problem` has no sponsor verification — anyone can overwrite any round's problem | 🔴 FIX |
| A7-6 | **MEDIUM** | `backend/api/tee_proxy.py` | `_get_client_ip()` operator precedence issue — would fail if `request.client` is None | 🔴 FIX |
| A7-7 | **LOW** | `backend/api/tee_proxy.py` | `_rate_buckets` dict never prunes old IP keys — slow memory leak in production | 🔴 FIX |
| A7-8 | **LOW** | `frontend/src/lib/ecies.ts` | `encryptForRecipient` IV is 16 bytes but AES-GCM standard recommends 12 bytes | ⚠️ NOTE |

---

## Detailed Findings

### A7-1 CRITICAL: Python hex prefix crash (ecies_encrypt.py)

**Problem:** Frontend `ecies.ts` outputs `iv: "0xabcd..."` (with 0x prefix). Python `ecies_encrypt.py` decodes with `bytes.fromhex(encrypted["iv"])` which crashes on `0x` prefix.

**Impact:** EVERY private bounty creation would crash when the TEE tries to decrypt the problem. Zero private bounties would work.

**Fix:** Add `.replace("0x", "")` to all `bytes.fromhex()` calls in `decrypt_with_private_key()`.

### A7-2 HIGH: NameError in agent bounties endpoint (bounties.py)

**Problem:** In `get_agent_bounties()`, the variable `agent_ids` is only defined inside a `try` block when `get_scores()` succeeds. But `len(agent_ids)` is referenced unconditionally in the return dict when phase is SETTLED.

**Impact:** If `get_scores()` fails for any SETTLED bounty, the entire endpoint returns `[]` (caught by outer try/except). Agent dashboard would show empty for any agent who participated in a bounty with scoring issues.

**Fix:** Initialize `agent_ids = []` before the try block.

### A7-3 HIGH: Missing agent_id in JOIN query (bounty_index.py)

**Problem:** `get_agent_bounties()` SELECT is `b.*, ap.action, ap.created_at`. The `b.*` only includes bounties table columns (no `agent_id`). The endpoint then does `b.get("agent_id", -1)` which always returns -1.

**Impact:** Score matching for agents on settled bounties never works. Agents always see score=null, rank=null in dashboard.

**Fix:** Add `ap.agent_id` to the SELECT.

### A7-4 HIGH: Case-sensitive round_address JOIN (bounty_index.py)

**Problem:** `index_bounty()` stores `round_address` as-is (might be checksummed: `0xAbCd...`). `record_participation()` stores `.lower()`. The JOIN `b.round_address = ap.round_address` fails on case mismatch.

**Impact:** Agent dashboard shows empty because JOIN finds no matches.

**Fix:** Lowercase `round_address` in `index_bounty()`.

### A7-5 MEDIUM: No sponsor verification on store-problem (tee_proxy.py)

**Problem:** `POST /tee/store-problem` has rate limiting but no authentication. Anyone can call it with any `round_address` and overwrite the problem in the TEE.

**Impact:** Attacker could replace a legitimate sponsor's encrypted problem with garbage, causing agents to receive corrupted data.

**Fix:** Verify the round address exists in bounty_index and the request comes from the sponsor (or at minimum, prevent overwrites).

### A7-6 MEDIUM: Operator precedence in _get_client_ip (tee_proxy.py)

**Problem:** Python parses `a or b or c if d else e` as `a or b or (c if d else e)`. If request.client is None, the function returns `"unknown"` even if CF-Connecting-IP is present.

**Impact:** Rate limiting would use "unknown" as the key for clients without `request.client`, making all such clients share one rate bucket (easy DoS).

**Fix:** Add explicit parentheses.

### A7-7 LOW: Rate bucket memory leak (tee_proxy.py)

**Problem:** `_rate_buckets` dict keys are `"store:{ip}"` and `"agent-problem:{ip}"`. Old IP keys are never removed from the outer dict even after their timestamp lists are pruned empty.

**Impact:** Slow memory growth over months in production. Not urgent but should be cleaned.

**Fix:** Delete keys when their lists are empty, or add a periodic cleanup.

### A7-8 NOTE: 16-byte IV for AES-GCM (ecies.ts)

**Problem:** AES-GCM best practice is 12-byte (96-bit) IV for optimal security. The code uses 16 bytes.

**Impact:** Not a vulnerability — AES-GCM supports arbitrary IV lengths by hashing to 96 bits internally. But 12 bytes is recommended by NIST SP 800-38D. Both Python and JS handle this correctly, and they must match, so this is informational only.

**Status:** No fix needed. Just note for future reference.

---

## What's NOT Broken (Verified Working)

- ✅ ECIES encryption/decryption logic (JS ↔ JS) — matching HKDF params, correct shared secret derivation
- ✅ Agent access controls (wallet → registered → participant → submit) — 3-layer enforcement
- ✅ Entry fee verification (G2) — fail-closed, on-chain check
- ✅ TEE recovery handling (G3) — clear 404 → user-facing error
- ✅ Rate limiting structure (G4) — correct sliding window logic
- ✅ Solution submission page — full commit-then-encrypt flow
- ✅ Problem viewer page — V2 ZK agent decryption flow
- ✅ Sponsor results page — signature-based access + ECIES decryption
- ✅ Sponsor dashboard — real API data via `?sponsor=` filter
- ✅ API client types — all properly typed
- ✅ `encryptForRecipient` naming — clean, backward-compatible alias
- ✅ Bounty creation private flow — correct order of operations
- ✅ TEE vault memory cleanup — overwrites before delete (defense in depth)
- ✅ TEE keypair persistence — file permissions 0o600, auto-generate on first run
