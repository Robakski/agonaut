# Agonaut Smart Contract Security Audit

**Auditor:** Brose Almighty (AI)  
**Date:** 2026-03-25  
**Scope:** All 13 contracts in `contracts/src/` (6,472 lines, Solidity 0.8.24)  
**Status:** Pre-mainnet review (revised after Robert's feedback)

---

## Executive Summary

The codebase is well-structured with appropriate use of OpenZeppelin libraries, UUPS upgradeability, role-based access control, and pull-based prize claims. Most of the architecture is sound. Three genuine bugs need fixing before mainnet — one critical, one medium, one high.

---

## 🔴 BUGS — Must Fix Before Mainnet

### BUG-1: StableRegistry Interface Mismatch in BountyRound [CRITICAL]

**File:** `BountyRound.sol` lines 46-48  
**Origin:** Pre-existing (since BountyRound was written)  

BountyRound declares:
```solidity
interface IStableRegistry {
    function getStable(uint16 stableId) external view returns (address owner, uint16 revenueShareBps);
}
```

But StableRegistry's actual `getStable()` returns `Stable memory` — a struct containing `string name` (a dynamic type). When a struct has dynamic types, ABI encoding uses offset pointers. The caller expecting `(address, uint16)` will decode garbage: `owner` becomes an offset pointer (~0xE0), `revenueShareBps` becomes the actual owner address truncated to uint16.

**Impact:** Any round with a stable-affiliated winning agent will miscalculate the stable revenue share. Prizes distributed incorrectly.

**Fix plan:** Add a dedicated view to StableRegistry that returns only what BountyRound needs:
```solidity
function getStableShare(uint16 stableId) external view returns (address owner, uint16 revenueShareBps) {
    Stable storage s = stables[stableId];
    return (s.owner, s.revenueShareBps);
}
```
Then update BountyRound's interface to call `getStableShare()` instead of `getStable()`.

### BUG-2: BountyMarketplace BountyConfig Missing `isPrivate` [MEDIUM]

**File:** `BountyMarketplace.sol` ~line 55  
**Origin:** Caused by private bounties feature addition  

The `IBountyFactory.BountyConfig` struct inside BountyMarketplace doesn't include the `isPrivate` field that was added to BountyFactory's actual struct. The field sits between `active` and `createdAt`, so all fields after it are ABI-shifted. Crowdfunded bounty activation via `_activateBounty()` will produce a malformed `createBounty()` call.

**Impact:** Crowdfunded bounties created through the Marketplace will have corrupted config data (wrong `createdAt`, wrong `creator`, possibly revert).

**Fix plan:** Add `bool isPrivate` to the `IBountyFactory.BountyConfig` in BountyMarketplace, matching the real struct. Set it to `false` in `_activateBounty()` (crowdfunded bounties are always public in v1).

### BUG-3: `finalize()` Doesn't Validate Scored Agents Are Participants [HIGH]

**File:** `BountyRound.sol` `finalize()` ~line 410  
**Origin:** Pre-existing  

`finalize()` reads scores from ScoringOracle and distributes prizes without checking that scored agent IDs actually exist in `_isParticipant[]`. A buggy scorer could submit scores for agents who never entered, and prizes would be allocated to their wallets.

**Impact:** With the current trusted single scorer, risk is low. But defense-in-depth requires validation, especially before mainnet with real ETH.

**Fix plan:** Add validation loop before prize distribution:
```solidity
for (uint256 i; i < len; ++i) {
    require(_isParticipant[agentIds[i]], "Not a participant");
}
```

---

## 📋 Design Notes — Intentional / Acknowledged

These were flagged during audit but are deliberate design decisions, not bugs.

### DN-1: EloSystem Is Not Upgradeable
**Intentional.** A non-upgradeable ELO system is more trustworthy for agents — ratings can't be changed under them. If a bug is found, a new EloSystem must be deployed and BountyFactory updated via `setContractAddresses()`. Existing active rounds keep the old reference. Agent ELO data doesn't migrate automatically — acceptable tradeoff for immutability guarantees.

### DN-2: StableRegistry `distributeRevenue()` Not Called by BountyRound
**Future-proofing.** BountyRound v1 calculates stable cuts inline and allocates to `claimable[]`. The `distributeRevenue()` function exists for a potential v2 push-based flow. `totalEarnings` in StableRegistry will be 0 in v1 — acknowledged.

### DN-3: ArbitrationDAO Randomness Uses `blockhash` + Commit-Reveal
**Known L2 trust assumption.** The commit-reveal scheme prevents single-party manipulation. Sequencer collusion remains theoretically possible on Base (centralized sequencer). Documented as acceptable for v1; Chainlink VRF is the v2 upgrade path.

### DN-4: EmergencyGuardian Requires Pausable on Targets
**Planned for later.** Core contracts don't implement `PausableUpgradeable` yet. EmergencyGuardian will be functional once Pausable is added in a future upgrade. Not a blocker for initial mainnet if the admin multisig can handle emergencies directly.

### DN-5: Force-Sent ETH Locked in BountyRound
**Standard behavior.** No `receive()`/`fallback()` means normal transfers revert. ETH force-sent via `selfdestruct` is permanently locked — this is the norm for most contracts and not worth adding sweep complexity for.

### DN-6: SeasonManager Prize Pool — No Direct Withdrawal
The championship BountyRound is the intended distribution mechanism. `spawnChampionship()` deploys the round, and the prize pool should fund it. **Note:** `spawnChampionship()` doesn't currently forward the ETH to the round — this gap should be addressed when seasons are implemented, but seasons aren't active for mainnet launch.

### DN-7: TimelockGovernor Helper Functions Need PROPOSER_ROLE on Self
Deployment configuration concern — the TimelockGovernor's own address must be granted PROPOSER_ROLE for `scheduleUpgrade()` etc. to work. Not a code bug; needs to be in the deployment checklist.

---

## 🔧 Deployment Checklist Items

- [ ] Restore `MIN_BOUNTY_DEPOSIT` to `0.125 ether` in Constants.sol (currently testnet value 0.009)
- [ ] Verify TimelockGovernor has PROPOSER_ROLE on itself
- [ ] Fresh scorer wallet for mainnet (never commit private key to git)
- [ ] Remove `unchecked` blocks in SeasonManager point accumulation (code hygiene, not a bug)
- [ ] Add Pausable to core contracts when EmergencyGuardian is activated

---

## Summary

| Category | Count | Action |
|----------|-------|--------|
| Bugs (must fix) | 3 | BUG-1 Critical, BUG-2 Medium, BUG-3 High |
| Design notes | 7 | Acknowledged, no action needed |
| Deployment checklist | 5 | Pre-mainnet tasks |

**Overall:** The contract architecture is solid. The three real bugs are fixable without structural changes. BUG-1 is the most urgent — it will corrupt prize distribution for any stable-affiliated agent.
