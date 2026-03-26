# Agonaut Audit Process — How to Use the Maps

**Goal:** Make audits systematic, repeatable, and comprehensive instead of reactive/accidental.

---

## When to Audit

- After any Solidity contract change (struct, function, role)
- Before deployment (testnet → mainnet)
- After dependency upgrades (ethers.js, fastapi, web3.py, etc.)
- Before major feature release
- Monthly security review

---

## The Audit Checklist

Use ARCHITECTURE.md and follow the **Change Impact Matrix**.

### PHASE 1: ABI Verification (Always First)

```bash
cd contracts && forge build
cd .. && bash scripts/sync-abis.sh
```

This extracts real ABIs from compiled output. Then verify:

1. **Check compiled ABIs exist**
   - `abis/BountyFactory.json`
   - `abis/BountyRound.json`
   - `abis/ArenaRegistry.json`
   - `abis/ScoringOracle.json`

2. **Compare to hand-written ABIs**
   ```python
   python3 << 'EOF'
   import json
   
   # Load compiled
   compiled = json.load(open('abis/BountyFactory.json'))
   compiled_fns = {f['name'] for f in compiled if f.get('type') == 'function'}
   
   # Check code calls only these functions
   # (grep backend/services/chain.py, frontend/src/lib/abis/*)
   EOF
   ```

3. **Extract all contract calls**
   ```python
   import re
   with open('backend/services/chain.py') as f:
       calls = set(re.findall(r'\.functions\.(\w+)\(', f.read()))
   # Verify every call is in compiled ABI
   ```

### PHASE 2: Encryption Flows

**Problem Encryption (Sponsor → Agent):**
- Frontend: `src/lib/problem-encrypt.ts` — AES-256-GCM
- Backend: `backend/services/problem_vault.py` — decrypt with SAME params

Check:
- IV size: 12 bytes? ✅
- Key size: 32 bytes (256-bit)? ✅
- Mode: AES-GCM? ✅
- Format: hex(iv + ciphertext_with_tag)? ✅

**Solution Encryption (TEE → Sponsor):**
- Backend: `scoring-service/ecies_encrypt.py` — ECIES (secp256k1 + HKDF)
- Frontend: `src/lib/ecies.ts` — decrypt with SAME params

Check:
- Algorithm: ECDH? ✅
- HKDF: SHA256, salt=None, info="agonaut-ecies-v1", length=32? ✅
- GCM: 16-byte IV? ✅
- Format: ephemeral_pubkey + iv + ciphertext + tag? ✅

### PHASE 3: Rate Limiting

Check `backend/middleware/security.py` has all endpoints:

```python
RATE_LIMITS = {
    "/api/v1/bounties/create": "5/minute",
    "/api/v1/solutions/submit": "10/minute",
    "/api/v1/agents/register": "5/minute",
    # ... check every write endpoint has a limit
}
```

### PHASE 4: Contract Tests

```bash
cd contracts && forge test --summary
# Expect: 160/160 passing
```

If any test fails, STOP. Don't continue to deployment.

### PHASE 5: End-to-End Flow

**Sponsor bounty creation:**
1. Frontend: encrypts problem with AES-256-GCM
2. Backend: receives encrypted problem + key (wrapped in Fernet)
3. Backend: stores in SQLite
4. Agent: requests key via `/request-key`
5. Backend: verifies entry fee paid on-chain
6. Backend: releases decrypted key
7. Agent: decrypts problem locally with AES-256-GCM ← MUST work

**Solution submission:**
1. Agent: solves problem
2. Agent: submits encrypted solution
3. Backend: forwards to scoring service
4. Scoring: decrypts solution (if needed), scores, encrypts for sponsor
5. Backend: stores encrypted solution blob (platform cannot decrypt)
6. Sponsor: requests solution via `/sponsor-access`
7. Frontend: decrypts solution with sponsor's private key ← MUST work

---

## Checklist Template

Copy this for each audit:

```
AUDIT: [Date] [Round N]
================================================

PHASE 1: ABI Verification
[ ] forge build succeeded
[ ] abis/*.json extracted
[ ] All 15 contract calls in code ✅
[ ] No "function not found" errors

PHASE 2: Problem Encryption
[ ] Frontend AES params match backend
[ ] IV size: 12 bytes
[ ] Key size: 32 bytes
[ ] Format: hex(iv + ciphertext_with_tag)

PHASE 3: Solution Encryption
[ ] ECIES params match (HKDF, salt, info, length)
[ ] IV size: 16 bytes
[ ] Format: ephemeral_pubkey + iv + ciphertext + tag

PHASE 4: Rate Limiting
[ ] All write endpoints have limits
[ ] Limits in middleware/security.py

PHASE 5: Contract Tests
[ ] forge test --summary: 160/160 passing

PHASE 6: E2E Flows
[ ] Sponsor encrypts problem
[ ] Agent requests key (entry fee verified)
[ ] Agent decrypts problem
[ ] Agent submits solution
[ ] Scoring encrypts for sponsor
[ ] Sponsor decrypts solution

ISSUES FOUND: [count]
- [Issue 1: description, fix]
- [Issue 2: description, fix]

DEPLOY READY: [YES/NO]
```

---

## Common Bugs (Anti-Patterns)

**Anti-pattern 1: Hand-written ABI drifts from contract**
```
❌ ABI says: function register(string name)
✅ Contract: function registerWithETH(bytes32 metadataHash)
→ All calls revert
```
**Fix:** Extract ABIs from compiled output.

**Anti-pattern 2: Encryption params mismatch**
```
❌ Frontend: IV = 12 bytes, Backend: IV = 16 bytes
→ Decryption fails
```
**Fix:** Check both sides use exact same params.

**Anti-pattern 3: Missing rate limits**
```
❌ POST /bounties/create has no rate limit
→ Spam attack, DOS
```
**Fix:** Add to middleware/security.py RATE_LIMITS dict.

**Anti-pattern 4: Struct field reorder**
```
❌ Solidity: (address, bytes32, uint256)
❌ ABI: (bytes32, address, uint256)
→ All data misaligned, contracts break
```
**Fix:** Always extract ABIs from compiled contracts.

---

## Tools

- `scripts/sync-abis.sh` — Extract ABIs from forge output
- `docs/audit-round-5-systematic.md` — Example systematic audit
- `ARCHITECTURE.md` — Dependency map for change impact analysis

---

## Before Mainnet Deployment

✅ All 6 audit phases passing  
✅ 160/160 contract tests passing  
✅ All ABIs verified  
✅ Encryption flows tested  
✅ Rate limits in place  
✅ KYC provider tested (Sumsub)  
✅ Mainnet constants updated (MIN_BOUNTY_DEPOSIT)  
✅ Fresh scorer wallet generated  
✅ Disaster recovery tested (RESTORE.md)  

---

**Last Updated:** 2026-03-26  
**Maintainer:** Brose Almighty
