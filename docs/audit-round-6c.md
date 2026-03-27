# Audit Round 6c — Contract Tests + Deep Verification
**Date:** 2026-03-27 04:30 UTC
**Auditor:** Brose (manual)

## Findings

### BUG-12 HIGH (FIXED `dc18c12`): 5 contract tests failing
- **PrizeDistribution (2 tests):** MockStableRegistryPD missing `getStableShare()` function. BountyRound.finalize() now calls `getStableShare()` (added in earlier contract fix), but mock only had `getStable()`.
- **Marketplace (2 tests):** MockBountyFactory.BountyConfig struct missing `isPrivate` field. Struct was out of sync after private bounties feature.
- **Adversarial (1 test):** `test_scorerSubmitsForNonParticipant` expected finalize to succeed with non-participant, but BUG-3 fix added participant validation. Updated test to expect `NotParticipant(2)` revert.

**Result: 160/160 tests passing.**

## ✅ Deep Verifications (No Issues Found)

### Contract ↔ Backend ABI Alignment
- BountyConfig struct: Solidity (12 fields) = Python tuple (12 args) = ABI JSON (12 components) ✅
- Field order verified: problemCid, entryFee, commitDuration, prizeDistribution, maxAgents, tier, acceptanceThreshold, graduatedPayouts, active, **isPrivate**, createdAt, creator ✅
- BountyRound public getters: phase, sponsor, sponsorDeposit, commitDeadline, getParticipantCount — all in ABI ✅

### KYC Flow
- Sumsub token: uses wallet address as `externalUserId` → webhook `parse_webhook` reads same field ✅
- Webhook signature verification: SHA256 HMAC ✅
- KYC gate fails closed on API error (defaults to "NONE") ✅
- Frontend KYC page: gets token → launches WebSDK → polls status ✅

### Private Bounty Flow
- Client-side AES-256-GCM encryption → `problem_vault.store_private_problem()` ✅
- Key release: signature + on-chain isParticipant check → fail-closed on chain error ✅
- Problem for scoring: server-side decrypt → pass to scoring service ✅
- Private rubrics NEVER go to IPFS ✅

### Solution Encryption Flow
- SDK: AES-256-GCM with shared SOLUTION_KEY → hex encoded ✅
- Scoring: decrypts with same key → scores → ECIES encrypts for sponsor ✅
- Sponsor: signs message → backend verifies → returns ECIES blob → frontend decrypts with derived key ✅

### i18n
- 29 locale files across EN/DE/ES/ZH — all keys present ✅
- Zero missing keys verified programmatically ✅

### All Pages Verified Present
- 11/11 pages exist (agents, bounties, leaderboard, docs, dashboard/agent, dashboard/sponsor, kyc, legal, legal/terms, legal/privacy, legal/impressum) ✅
- Plus: bounties/create, bounties/[id], bounties/[id]/problem, bounties/[id]/solution, agents/register ✅

### Deploy Scripts
- sync-backend.sh: atomic with backup + rollback on health check failure ✅
- sync-scoring.sh: same pattern ✅

## Remaining Open Items
| Item | Severity | Notes |
|------|----------|-------|
| M-7: SOLUTION_KEY not generated | Setup | Must generate before dry-run |
| M-5: No auto-trigger after commit deadline | Medium | Cron needed |
| BUG-7: Agent dashboard mock submissions | Low | Stats real, history empty |
| View Solutions link shows in all phases | Cosmetic | Could gate on SETTLED |
| MIN_BOUNTY_DEPOSIT = 0.125 ETH in frontend | Testnet only | Blocks cheap testnet tests |
