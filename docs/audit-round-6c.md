# Audit Round 6c — Environment & Setup Validation
**Date:** 2026-03-27 (late session)
**Auditor:** Brose (manual review)
**Focus:** Missing env vars, setup validation, critical path verification

---

## 🔴 CRITICAL BUGS (Will prevent service startup or cause runtime failures)

### BUG-12: PROBLEM_VAULT_KEY missing in VPS deployment
**Location:** `backend/services/problem_vault.py` line 44-50
**Severity:** CRITICAL — Service crashes on import if not set
**Impact:** Any request to `/private-bounties` will crash the backend

```python
key = os.environ.get("PROBLEM_VAULT_KEY", "")
if not key:
    key = os.environ.get("KYC_ENCRYPTION_KEY", "")
if not key:
    raise RuntimeError("PROBLEM_VAULT_KEY not set")  # ← CRASHES SERVICE
```

**Root Cause:** Fallback to `KYC_ENCRYPTION_KEY` is documented, but neither var is in the deployment script or VPS .env

**Fix Required Before Dry-Run:**
```bash
# Generate a Fernet key (base64-encoded 32-byte value)
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# Add to /opt/agonaut-api/.env:
PROBLEM_VAULT_KEY=<generated-key>

# Restart service:
sudo systemctl restart agonaut-api
```

---

### BUG-13: SOLUTION_KEY empty by default, decryption fails silently
**Location:** `scoring-service/scorer.py` line ~528
**Severity:** CRITICAL — Scoring pipeline fails silently
**Impact:** All solutions decrypt as garbage → scoring produces random scores

```python
SOLUTION_KEY = os.environ.get("SOLUTION_KEY", "")  # Defaults to empty!

def decrypt_solution(encrypted_hex, key_hex):
    if not key_hex or len(key_hex) < 64:
        # SILENTLY FAILS with garbage output
        ...
```

**Root Cause:** No validation that key is set or valid. Decryption with empty key produces corrupted plaintext.

**Fix Required Before Dry-Run:**
```bash
# Both SDK and scoring service need the SAME 256-bit AES key (hex)
python3 -c "import os; print(os.urandom(32).hex())"

# Add to /opt/agonaut-scoring/.env:
SOLUTION_KEY=<generated-hex-key>

# Also provide to SDK agents (they need it to encrypt solutions)
# Restart both services:
sudo systemctl restart agonaut-api agonaut-scoring
```

---

## 🟡 HIGH ISSUES (Won't break startup but will fail at runtime)

### BUG-14: No validation that SUMSUB env vars are set
**Location:** `backend/services/sumsub.py`
**Impact:** KYC submission endpoint crashes if SUMSUB_APP_TOKEN not in .env

**Fix:** Check deployment script includes all Sumsub vars from earlier setup

---

## ✅ VERIFIED WORKING

- KYC flow: reject → resubmit allowed ✅
- Problem vault: encryption/decryption matches ✅
- Private bounties: metadata stripped correctly ✅
- Entry fee: enforced on-chain ✅
- Signature verification: EIP-191 + timestamp checks ✅
- Admin dashboard: brute-force protection, CSRF, session management ✅
- Leaderboard: efficient iteration with agent count cap ✅
- Compliance monitoring: transactions recorded (non-blocking) ✅
- Sanctions middleware: before security middleware (correct order) ✅

---

## Pre-Dry-Run Checklist

- [ ] **BUG-12**: Generate + set `PROBLEM_VAULT_KEY` on VPS
- [ ] **BUG-13**: Generate + set `SOLUTION_KEY` on scoring service AND give to SDK agents
- [ ] **M-7** (from 6b): Verify all Sumsub env vars present + valid
- [ ] Deploy fresh backend/scoring with these vars
- [ ] Run smoke test (`e2e-test.sh`)
- [ ] Manual test: create private bounty → agent requests key → decryption works

---

## Summary: 3 Critical Setup Issues

| Issue | Root | Fix Time | Blocking |
|-------|------|----------|----------|
| PROBLEM_VAULT_KEY missing | Env var not in deploy script | 2 min | ✅ Yes |
| SOLUTION_KEY empty | No validation on decrypt | 2 min | ✅ Yes |
| Sumsub vars unchecked | No pre-flight validation | 1 min | 🟡 Maybe |

**Estimated time to resolve: 10 minutes**

After these fixes, you're **good for dry-run**.
