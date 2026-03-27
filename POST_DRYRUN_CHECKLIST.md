# Agonaut Post-Dry-Run Checklist — Path to Mainnet

**Status:** E2E dry-run script ready. Blocked on KYC verification for test operator wallet.
**Next:** Get testnet ETH + KYC verification for operator, then complete dry-run.
**Then:** Work through items below to reach mainnet launch.

---

## 1. Complete E2E Dry-Run (CRITICAL GATE)

### Prerequisites
- [ ] Operator wallet has **0.05+ ETH** on Base Sepolia (testnet)
  - Faucet: https://www.alchemy.com/faucets/base-sepolia
- [ ] Operator wallet passes KYC verification
  - Go to https://agonaut.io/kyc and complete Sumsub ID verification
  - Or: Robert inserts test KYC record directly into backend DB (`INSERT INTO kyc (wallet, status) VALUES ('0x8c35c1930CAd1224e7A1F90E9f7df5486e7489d2', 'VERIFIED')`)

### Run the Dry-Run
```bash
cd /home/brose/.openclaw/workspace/products/agonaut
.venv/bin/python scripts/e2e-testnet-dryrun.py
```

Expected output: All 10 steps pass (✅). If any fail, fix before proceeding.

### What It Tests
- Agent registration on-chain ✅
- Bounty creation via API relay ✅
- ETH deposit to BountyRound ✅
- Agent entry + entry fee payment ✅
- Solution commit on-chain ✅
- Solution submission to backend ✅
- Scoring trigger + completion ✅
- Score verification on-chain ✅
- Prize claim by agent ✅

---

## 2. Post-Dry-Run Fixes (if any failures)

If specific steps fail, debug using the script output + the checklist below. Don't proceed to mainnet prep until dry-run is fully green.

---

## 3. Pre-Mainnet Security & Infrastructure

### G2-G4 Verification (Already Implemented)
- [x] Entry fee on-chain verification in TEE proxy
- [x] TEE restart recovery handling (404 → clear error)
- [x] Rate limiting on TEE endpoints (10/min store, 20/min agent-problem)

### Missing Implementations (NEW)

#### 3a. On-Chain Transaction Recording for Compliance
**File:** `backend/api/solutions.py` + `backend/api/bounties.py`
**Status:** Endpoints exist but aren't wired to record events
**Action:**
- [ ] Wire `recordTransaction()` calls in:
  - `bounties/create` (bounty_deposit event)
  - Entry fee transactions (agent entry)
  - Prize payouts (claim)
- [ ] Verify activity.db has `solution_submit` event recorded
- [ ] Test compliance monitor picks up all transaction events

#### 3b. Activity Tracking Events
**Status:** Some events missing from submission flow
**Action:**
- [ ] Add `trackActivity("solution_submit", ...)` to `/solutions/submit`
- [ ] Add `trackActivity("entry_fee_paid", ...)` to agent enter() on-chain callback
- [ ] Verify airdrop activity tracker records all events

#### 3c. Private Bounty UI Badge
**File:** `frontend/src/app/[locale]/bounties/page.tsx` (bounty listing)
**Status:** Not implemented
**Action:**
- [ ] Add 🔐 badge to bounty card if `is_private: true`
- [ ] Test on testnet with a private bounty

#### 3d. Platform Documentation
**Status:** Missing
**Action:**
- [ ] Create `docs/private-bounties.md` explaining:
  - What private bounties are
  - How agents request access
  - How encryption works
  - Cost (2.5% fee vs 2% public)
- [ ] Update FAQ with private bounty Q&A
- [ ] Add to sponsor guide: "How to create a private bounty"

#### 3e. KYC Key Encryption (Envelope Encryption)
**Status:** LOW PRIORITY — Level 1 for testnet, Level 2 for mainnet
**Action (Mainnet only):**
- [ ] Implement AWS Secrets Manager integration
- [ ] Wrap `KYC_ENCRYPTION_KEY` in envelope encryption
- [ ] Use Terraform IaC for secret provisioning

---

## 4. Mainnet Deployment Prep

### 4a. Fresh Scorer Wallet for Mainnet
**Status:** Not created
**Action:**
```bash
cast wallet new  # Generate fresh keypair
# Then:
# 1. Save private key securely (AWS Secrets Manager)
# 2. Fund with mainnet ETH
# 3. Grant SCORER_ROLE via ScoringOracle.grantRole()
```

### 4b. Contract Deployment to Base Mainnet
**Status:** Contracts only on testnet (84532)
**Action:**
```bash
cd /home/brose/.openclaw/workspace/products/agonaut/contracts
CHAIN_ID=8453 forge script script/Deploy.s.sol --broadcast --rpc-url https://mainnet.base.org
# Verify on Basescan
```

### 4c. Update Frontend for Mainnet
**Files to update:**
- [ ] `frontend/src/lib/contracts.generated.ts` (DEPLOYED_AT timestamp, mainnet addresses)
- [ ] `frontend/src/lib/contracts.ts` — ensure `ACTIVE_CHAIN_ID = 8453` when deploying
- [ ] Environment variable `NEXT_PUBLIC_API_URL` → `https://api.agonaut.io/api/v1` (same, but ensure mainnet contracts)

### 4d. Backend Config for Mainnet
**Files to update:**
- [ ] `backend/config.py` — mainnet RPC URL + contract addresses
- [ ] `backend/.env` — mainnet values for all env vars
- [ ] `scoring-service/config.py` — same as backend

### 4e. VPS Deployment to Mainnet
**Status:** Backend/scoring already deployed to VPS, but pointing to testnet
**Action:**
```bash
# On VPS, update env vars:
sudo systemctl stop agonaut-api agonaut-scoring
# Update /opt/agonaut-api/.env and /opt/agonaut-scoring/.env to mainnet
sudo systemctl start agonaut-api agonaut-scoring
```

### 4f. Secrets Manager Migration
**Status:** Env vars currently in plaintext on VPS
**Action:**
- [ ] Migrate `KYC_ENCRYPTION_KEY`, `SUMSUB_*`, `PROBLEM_VAULT_KEY` to AWS Secrets Manager
- [ ] Update systemd service files to fetch secrets at startup
- [ ] Test secret rotation

---

## 5. Final Mainnet Safety Checks

Before going live:

- [ ] **No testnet code paths left** in smart contracts (check for TESTNET flags)
- [ ] **All error messages are user-friendly** (no internal stack traces)
- [ ] **Rate limits** appropriate for production load:
  - TEE endpoints: 10/min (fine), may need increase if usage high
  - General endpoints: 60/min (may need tuning)
- [ ] **Database backups automated** and tested
- [ ] **Monitoring alerts** set up for:
  - TEE service down
  - API latency spikes
  - KYC failures > 10% of attempts
  - Scoring failures
- [ ] **Incident response runbook** written (how to pause, rollback, etc.)
- [ ] **Sumsub KYC quota** verified (Level 1 = 1000 verifications/month; upgrade if needed)

---

## 6. Launch Sequence (Day Of)

1. **Morning:** Run full E2E test on testnet one more time ✅
2. **Deploy to mainnet:** Frontend (Vercel auto-deploys), backend (SSH to VPS + deploy script)
3. **Verification:** Create test bounty on mainnet, verify on Basescan
4. **Go live:** Announce at https://twitter.com/agonaut_io / docs
5. **Monitor:** Watch for errors in real-time logging

---

## 7. Post-Launch (Day 1+)

- [ ] Monitor API error rates (target <0.1%)
- [ ] Watch for scoring delays (target <5 min after trigger)
- [ ] Check gas prices on Base (may spike — adjust entry fee if needed)
- [ ] Respond to first bounty creators (onboard + support)
- [ ] Celebrate 🎉

---

## Timeline Estimate

| Phase | Days | Gate |
|-------|------|------|
| E2E dry-run + fixes | 1-2 | Dry-run must pass |
| Security checklist (3a-3e) | 1 | All items checked |
| Mainnet prep (4a-4f) | 2-3 | All deployed, tested |
| Final safety checks (5) | 0.5 | Runbooks ready |
| **Go Live** | **Day 5-7** | All gates complete |

---

## Risk Mitigation

**If something breaks on mainnet:**
1. Pause new bounty creation (API-level gate)
2. Keep agent access alive (can still claim prizes)
3. Emergency: roll back to testnet version (fast via Vercel + systemctl)
4. Post-mortem: document fix, re-test on testnet, re-deploy

**Partial rollback options:**
- Pause just KYC (accept unverified sponsors)
- Pause scoring (hold bounties in COMMIT phase)
- Pause deposits (no new bounties, but existing ones work)

---

## Questions?

- For dry-run issues: Check script output, search for the error in the code
- For crypto/contracts: See `products/agonaut/contracts/src/`
- For API issues: See `products/agonaut/backend/api/`
- For frontend issues: See `products/agonaut/frontend/src/`

**Next:** Get testnet ETH → run dry-run → report results 🚀
