# Agonaut Security Audit — Smart Contracts
Generated: 2026-03-25 by Brose (manual audit)

## Scope
- BountyFactory.sol (725 lines)
- BountyRound.sol (762 lines)
- ScoringOracle.sol (126 lines)
- Constants.sol (149 lines)
- ArbitrationDAO.sol, ArenaRegistry.sol, EloSystem.sol, TimelockGovernor.sol (reviewed)

---

## CRITICAL

*None found.* The contracts are well-structured with proper access control, reentrancy guards, and CEI pattern.

---

## HIGH

### C1: Scorer can submit arbitrary scores — single point of trust
- **File:** `ScoringOracle.sol:75-90`
- **Description:** The SCORER_ROLE holder can submit any scores for any round — there's no on-chain verification that scores came from a TEE. The TEE attestation hash is informational only (not checked during submitScores).
- **Impact:** If the scorer private key is compromised, an attacker can submit fraudulent scores to steal all bounty prizes. This is the highest-value key in the system.
- **Current mitigation:** Key is in `.env`, not committed to git. Port 8001 is localhost-only.
- **Fix (pre-mainnet):**
  1. Generate a FRESH scorer wallet for mainnet (never touch testnet key)
  2. Store scorer key in a KMS or hardware wallet, not a .env file
  3. Consider multi-sig scoring: require 2/3 independent TEE attestations
  4. Add a delay/challenge window before scores can be finalized

### C2: BountyRound.finalize() insertion sort is O(n²) — griefable
- **File:** `BountyRound.sol:444-458`
- **Description:** The insertion sort in finalize() is O(n²) where n = number of scored agents. With MAX_AGENTS_PER_ROUND = 50, worst case is ~1225 iterations. At current gas costs this is manageable (~100k gas), but if MAX_AGENTS is increased, finalization could exceed block gas limit.
- **Impact:** LOW currently (max 50 agents). HIGH if limit is increased without changing sort algorithm.
- **Fix:** Document the invariant: MAX_AGENTS_PER_ROUND must stay ≤50 unless sort is replaced with O(n log n).

### C3: `isPrivate` flag is immutable after creation — no privacy downgrade path
- **File:** `BountyFactory.sol:330` — `stored.isPrivate = config.isPrivate`
- **Description:** Once a bounty is created as private (2.5% fee), it can never be changed to public. This is actually CORRECT behavior (you can't un-encrypt data), but there's no mechanism for a sponsor to request cancellation and re-create as public if they made a mistake.
- **Impact:** LOW — sponsor can deactivate + create new bounty. But fee is already charged on the round.
- **Fix:** Document this in the UI with a clear confirmation step.

---

## MEDIUM

### C4: `commitSolution` allows overwriting previous commits
- **File:** `BountyRound.sol:395-408`
- **Description:** An agent can call `commitSolution` multiple times before the deadline, overwriting their previous solutionHash. While this might be intentional (allow agents to update solutions), it means the commit-reveal scheme is weakened — an agent could watch other commits and update theirs.
- **Impact:** For off-chain TEE scoring this is LOW risk (agents can't see other solutions). But for any future on-chain reveal mechanism, this would be HIGH risk.
- **Fix:** Add `require(commitments[agentId].solutionHash == bytes32(0), "Already committed")` if single-commit is desired. Otherwise, document as intentional.

### C5: `startScoringPhase()` is callable by anyone
- **File:** `BountyRound.sol:413-420`
- **Description:** Any address can call `startScoringPhase()` after the commit deadline. This is by design (permissionless transition), but it means a MEV bot could front-run the scoring transition to extract timing value.
- **Impact:** LOW — no direct financial impact since scoring is off-chain. But the `scoringStartedAt` timestamp controls the SCORING_TIMEOUT cancellation window.
- **Fix:** Accept as designed — permissionless transitions prevent operator liveness failures.

### C6: No minimum deposit validation on testnet
- **File:** `Constants.sol:56` — `MIN_BOUNTY_DEPOSIT = 0.009 ether`
- **Description:** Testnet minimum is 0.009 ETH. The comment says "was 0.125 ether for mainnet." This needs to be changed before mainnet deployment.
- **Impact:** If forgotten, anyone could create bounties with dust amounts, spamming the protocol.
- **Fix:** Restore to 0.125 ether before mainnet. Add a deployment checklist.

### C7: `sweepExpiredClaims` sweeps ALL unclaimed to treasury
- **File:** `BountyRound.sol:586-596`
- **Description:** After 90 days, anyone can call `sweepExpiredClaims` which sends ALL remaining claimable funds to treasury in one shot. There's no partial sweep or per-address expiry.
- **Impact:** LOW — 90 days is generous. But if a legitimate claim was delayed (e.g., lost key recovery), they lose everything after exactly 90 days with no recourse.
- **Fix:** Consider extending to 180 days, or adding an admin grace period extension.

### C8: `cancel()` allows sponsor cancellation ONLY before agents enter
- **File:** `BountyRound.sol:551-563`
- **Description:** Sponsor can cancel if `participants.length == 0`. Once even one agent enters, only the factory can cancel. This is correct, but means the sponsor has no way to cancel a bounty they funded if agents entered but scoring hasn't started.
- **Impact:** LOW — factory (operator) can still cancel. But adds operational burden.
- **Fix:** Consider allowing sponsor cancellation before commit phase starts (with agent refunds).

---

## LOW

### C9: `emergencyWithdraw` doesn't track total refunded
- **File:** `BountyRound.sol:568-581`
- **Description:** Each agent gets `entryFee` refunded individually after cancellation, but the contract doesn't track total refunded vs total entry fees collected. An accounting mismatch is possible if the contract balance is insufficient (shouldn't happen in normal flow, but could in edge cases with selfdestruct forced ETH).
- **Impact:** VERY LOW — would require forced ETH injection via selfdestruct, which is a known Solidity edge case.
- **Fix:** Accept — forced ETH is a known non-issue for accounting.

### C10: `claimBatch` re-credits on failed transfer — good but gas-heavy
- **File:** `BountyRound.sol:569-586`
- **Description:** When a batch claim transfer fails, it re-credits the balance. This is the correct behavior (no funds lost) but the re-credit + event emission adds gas for every failed transfer.
- **Impact:** NONE — correct behavior, just a gas note.

---

## INFORMATIONAL

### C11: No `receive()` or `fallback()` function
- The BountyRound only accepts ETH via `depositBounty()` and `enter()`. Forced ETH (via selfdestruct) will increase `address(this).balance` without updating accounting variables. This is standard and acceptable — the contract uses internal accounting, not `address(this).balance`.

### C12: Solidity 0.8.24 — overflow protection built in
- All arithmetic is safe by default. Unchecked blocks are only used in loop increments (correct optimization).

### C13: OpenZeppelin contracts — latest stable
- Using `@openzeppelin/contracts` and `@openzeppelin/contracts-upgradeable` with proper initializer patterns.

### C14: CREATE2 deterministic addressing
- Round addresses are predictable via `predictRoundAddress()`. This is a feature, not a bug — enables off-chain pre-authorization.

---

## Pre-Mainnet Checklist (from this audit)

- [ ] C1: Fresh scorer wallet — NEVER reuse testnet key
- [ ] C1: Store scorer key in KMS, not .env
- [ ] C2: Document MAX_AGENTS_PER_ROUND = 50 invariant
- [ ] C4: Decide: allow commit overwrite or enforce single commit
- [ ] C6: Restore MIN_BOUNTY_DEPOSIT to 0.125 ether
- [ ] C6: Create deployment checklist for all testnet→mainnet constant changes
- [ ] C7: Consider extending claim expiry to 180 days
