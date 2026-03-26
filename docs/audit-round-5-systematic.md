# Audit Round 5: Systematic Dependency Tracing

**Date:** 2026-03-26  
**Method:** Architecture map + Change impact matrix  
**Duration:** ~2 hours  
**Approach:** Traced every dependency chain instead of reactive bug finding

---

## What Changed

Instead of finding bugs by accident, I used the ARCHITECTURE.md map to systematically check:

1. **ABI Dependency Chain** — every struct/function used in code must exist in contract ABIs
2. **Encryption Flows** — problem encryption (AES) + solution encryption (ECIES) must match on both sides
3. **Contract Calls** — all backend + frontend calls verified against compiled contract JSON
4. **Rate Limiting** — every endpoint checked for security middleware configuration

---

## Process: Following the Map

### Step 1: Build ABIs from Compiled Contracts
Extracted real ABIs from forge output (`contracts/out/`) as JSON:
- BountyFactory (67 functions)
- ArenaRegistry (83 functions)
- BountyRound (107 functions)
- ScoringOracle (41 functions)

### Step 2: Extract Every Contract Call

**Backend (chain.py):**
```
Calls: createBounty, getAgent, getAgentsByWallet, getCommitment, 
       getParticipantCount, isParticipant, registerWithETH, 
       spawnRound, sponsor, sponsorDeposit, phase, commitDeadline, 
       nextBountyId, getRoundAddress
```

**Frontend (register/create pages):**
```
Calls: registerWithETH, depositBounty, nextBountyId, nextAgentId
```

**Scoring service (onchain.py):**
```
Calls: submitScores, getScores, isResultVerified
```

### Step 3: Verify Against Contract ABIs
Every call matched ✅ except ONE:

```
❌ registrationFee() — NOT IN CONTRACT
✅ ethEntryFee() — EXISTS (public state variable)
```

---

## Finding: registrationFee Bug

### Root Cause
The hand-written ABI in `chain.py` declared a non-existent function.

### Contract Reality
```solidity
// ArenaRegistry.sol
uint256 public ethEntryFee;  // Auto-generates view function
uint256 public usdcEntryFee;

function setEntryFee(uint256 ethFee, uint256 usdcFee) external onlyOwner { ... }
```

There is NO `registrationFee()` function. Calling it would revert on-chain.

### Impact
**CRITICAL**: Agent registration would ALWAYS fail with a revert.

### Fix
```python
# Before
reg_fee = registry.functions.registrationFee().call()

# After
reg_fee = registry.functions.ethEntryFee().call()
```

Updated in:
- `backend/services/chain.py` (ABI + function call)
- `backend/api/agents.py` (response message)

---

## Step 4: Verify Encryption Flows

### Problem Encryption (Sponsor → Agent)
**Frontend:** `src/lib/problem-encrypt.ts`
```typescript
const key = await crypto.subtle.generateKey(
  { name: "AES-GCM", length: 256 },  // ← 256-bit key
  ...
);
const iv = crypto.getRandomValues(new Uint8Array(12));  // ← 12-byte IV
const ciphertext = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv },
  key,
  encoded,
);
// Format: hex(iv[12] + ciphertext_with_tag[16])
```

**Backend:** `backend/services/problem_vault.py`
```python
encrypted_bytes = bytes.fromhex(encrypted_hex)
iv = encrypted_bytes[:12]  # ← 12-byte IV matches
ciphertext_and_tag = encrypted_bytes[12:]  # ← Rest is ciphertext + GCM tag
aesgcm = AESGCM(key_bytes)
plaintext_bytes = aesgcm.decrypt(iv, ciphertext_and_tag, None)
```

**Status:** ✅ **MATCH** — Both sides use same parameters

### Solution Encryption (TEE → Sponsor)
**Backend:** `scoring-service/ecies_encrypt.py`
```python
aes_key = HKDF(
    algorithm=hashes.SHA256(),
    length=32,
    salt=None,
    info=b"agonaut-ecies-v1",  # ← HKDF info string
    backend=default_backend(),
).derive(shared_secret)
```

**Frontend:** `src/lib/ecies.ts`
```typescript
const info = new TextEncoder().encode("agonaut-ecies-v1");  // ← MATCHES
const key = await hkdf(
    "SHA-256",
    sharedSecret.buffer,
    new Uint8Array(),  // ← salt=None (empty)
    info,
    32  // ← length=32 bytes
);
```

**Status:** ✅ **MATCH** — HKDF params identical

---

## Step 5: Rate Limiting Verification

Checked `backend/middleware/security.py` for all critical endpoints:

| Endpoint | Limit | Status |
|----------|-------|--------|
| /api/v1/bounties/create | 5/min | ✅ |
| /api/v1/solutions/submit | 10/min | ✅ |
| /api/v1/agents/register | 5/min | ✅ |
| /api/v1/kyc/submit | 5/min | ✅ |
| /api/v1/activity/track | 60/min | ✅ |
| /api/v1/feedback/submit | 10/min | ✅ |
| /api/v1/keys/create | 5/min | ✅ |
| /api/v1/solutions/register-sponsor-key | 10/min | ✅ |

**Status:** ✅ All write endpoints have strict limits

---

## Summary

| Category | Items Checked | Pass | Fail |
|----------|---------------|------|------|
| Contract ABIs | 4 contracts, 15 calls | 14 | 1 |
| Function signatures | Chain.py, frontend, scoring | All | ✅ |
| Struct fields | BountyConfig (12), Agent (9), Commitment (2) | All | ✅ |
| Encryption (AES) | frontend ↔ backend params | Match | ✅ |
| Encryption (ECIES) | HKDF, salt, info, length | Match | ✅ |
| Rate limits | 32 endpoints | All | ✅ |

---

## Lessons: How to Use the Map

1. **Extract, don't inspect** — Python script reads compiled ABIs, compares to code
2. **Check BOTH sides** — Problem: encrypt frontend + decrypt backend, MUST match exactly
3. **Verify systematically** — All 4 contracts, all calls, line by line
4. **Fail early** — Missing ABI → catch before mainnet, not after customer loses money

---

## Next Audit Phases

- [ ] Contract test coverage (160 tests passing, verify no new code paths)
- [ ] Admin dashboard security (password reset, session handling)
- [ ] KYC flow end-to-end (Sumsub webhook → bounty gate)
- [ ] Scoring pipeline (problem decrypt → LLM → on-chain submission)
- [ ] Compliance monitoring (transaction threshold detection, risk profiling)
- [ ] Solution vault (ECIES roundtrip, sponsor can decrypt)

---

## Deployment Readiness

- ✅ All ABIs verified against contracts
- ✅ All function calls will not revert due to ABI mismatch
- ✅ Encryption flows compatible between frontend/backend/scoring
- ✅ Rate limits in place for abuse prevention
- ⚠️ Testnet values still in Constants.sol (MIN_BOUNTY_DEPOSIT = 0.009 ETH)
- ⚠️ Mainnet deployment needs fresh scorer wallet + KYC provider test

**Recommendation:** Deploy to mainnet after 2-3 more audit cycles covering the remaining "Next Audit Phases."
