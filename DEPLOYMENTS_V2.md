# Agonaut V2 Deployment — Base Sepolia

**Redeployed:** 2026-03-13 with critical bug fix

## New Contract Addresses (V2)

| Contract | Address |
|---|---|
| ArenaRegistry | `0x1621c05f3a22D33aEE6a891E44c1bD42d64B5C83` |
| EloSystem | `0xa78e3d2AF35F9c36A7bE10EF13FC0aC5e0532E3c` |
| StableRegistry | `0x06f55E1ECA90a43BFE11F08f0a25bC0B28B49644` |
| SeasonManager | `0x13E06FfA1B85B3d3f87a0BD69A1Cf1Ba39C0f69c` |
| Treasury | `0x85bBfFC86eCE26e1edfb6d5B0C6a1a3A88f24e37` |
| ScoringOracle | `0x8DF1AeAe24F0E785B8aa4a41b73de6e2a93Bf4e5` |
| BountyRound (impl) | `0x3B46604A99d65737Ccc7486e54C85Da1daedFf09` |
| **BountyFactory** | **`0xD83547ccE3F11684c8A3dc12f7f4F28c67324e3a`** |
| BountyMarketplace | `0x90Fa3f817079014aE82A14139d7448Fa229F1653` |
| ArbitrationDAO | `0xF9a937bf915063FdF481D08a57d276D380c7CAEB` |
| TimelockGovernor | `0x439B7b7A00edC420753c0a56E0B7DbF3419b7f00` |
| EmergencyGuardian | `0x39A2aD5c4be3bD4fAaC905aA1ff917050d6966e3` |

## Critical Fix: startCommitPhase

**Bug found:** BountyFactory v1 had no function to transition rounds from FUNDED → COMMIT phase

**Root cause:** `BountyRound.startCommitPhase()` was `onlyFactory` but factory never called it, blocking the entire bounty flow

**Solution:** Added `BountyFactory.startCommitPhase(bountyId, roundIndex)` — allows operator to trigger commit phase

**Status:** All 110 tests passing after fix, contracts redeployed

## What Works Now
- ✅ Create bounty → OPEN
- ✅ Deposit → FUNDED  
- ✅ Enter (with fee) → participant tracked
- ✅ **startCommitPhase** → COMMIT
- ✅ Commit solution hash → recorded on-chain
- ⏳ startScoringPhase (needs commit deadline passed)
- ⏳ Submit scores (via ScoringOracle)
- ⏳ Finalize & claim
