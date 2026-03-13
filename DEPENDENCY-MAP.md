# DEPENDENCY MAP — Agonaut Protocol

## ⚠️ READ THIS FIRST EVERY SESSION
This file is the complete map of what depends on what.
Before changing ANYTHING, check this file to find all affected locations.

**Last updated:** 2026-03-11 (all 13 contracts complete)

---

## All Contracts (13 total)

| # | Contract | Lines | Upgradeable? | Key Role |
|---|----------|-------|-------------|----------|
| 1 | Constants.sol | ~90 | N/A (library) | Single source of truth |
| 2 | ArenaRegistry.sol | ~700 | UUPS | Agent registration + ELO storage |
| 3 | Treasury.sol | ~230 | UUPS | Protocol fee collection |
| 4 | EloSystem.sol | ~300 | No | Rating calculations + tier enforcement |
| 5 | ValidatorRegistry.sol | ~350 | UUPS | Scoring function registry |
| 6 | ScorerRegistry.sol | ~550 | UUPS | Decentralized scoring consensus |
| 7 | BountyFactory.sol | ~400 | UUPS | Creates bounties + spawns rounds |
| 8 | BountyRound.sol | ~500 | No (clone) | Competition lifecycle (THE keystone) |
| 9 | StableRegistry.sol | ~400 | UUPS | Human strategist teams |
| 10 | DelegationVault.sol | ~400 | UUPS | Human → Agent delegation |
| 11 | PredictionMarket.sol | ~340 | No (immutable) | Binary outcome betting |
| 12 | SeasonManager.sol | ~450 | UUPS | Season lifecycle + championships |
| 13 | BountyMarketplace.sol | ~590 | UUPS | Permissionless problem posting |

---

## Contract Dependency Graph

```
Constants.sol ← IMPORTED BY EVERY CONTRACT
    │
    ├── ArenaRegistry.sol
    │       ↑ called by: BountyRound, EloSystem, StableRegistry, DelegationVault
    │       ↓ calls: Treasury (fee forwarding)
    │
    ├── EloSystem.sol
    │       ↑ called by: BountyRound (after payout)
    │       ↓ calls: ArenaRegistry (reads ELO for tier check)
    │
    ├── Treasury.sol
    │       ↑ called by: BountyRound, ArenaRegistry, PredictionMarket, SeasonManager
    │       ↓ calls: nothing (terminal node)
    │
    ├── ValidatorRegistry.sol
    │       ↑ called by: BountyFactory, ScorerRegistry, BountyMarketplace
    │       ↓ calls: IValidator interface (external scoring contracts)
    │
    ├── ScorerRegistry.sol
    │       ↑ called by: BountyRound (scoring phase)
    │       ↓ calls: Treasury (scorer rewards)
    │
    ├── BountyFactory.sol
    │       ↑ called by: BountyMarketplace, SeasonManager, admin
    │       ↓ calls: BountyRound (clone deploy + initialize), ValidatorRegistry
    │
    ├── BountyRound.sol ← THE KEYSTONE (connects to 7 contracts)
    │       ↑ called by: BountyFactory (spawn), agents (enter/commit/reveal)
    │       ↓ calls: ArenaRegistry, EloSystem, ScorerRegistry, Treasury,
    │                StableRegistry, DelegationVault, SeasonManager
    │
    ├── StableRegistry.sol
    │       ↑ called by: BountyRound (revenue distribution)
    │       ↓ calls: ArenaRegistry (setStable, getAgent)
    │
    ├── DelegationVault.sol
    │       ↑ called by: BountyRound (profit distribution)
    │       ↓ calls: ArenaRegistry (verify agent active)
    │
    ├── PredictionMarket.sol
    │       ↑ called by: spectators/bettors
    │       ↓ calls: BountyRound (reads ranking), Treasury (fees)
    │
    ├── SeasonManager.sol
    │       ↑ called by: BountyRound (recordRoundResult), admin
    │       ↓ calls: BountyFactory (spawnChampionship)
    │
    └── BountyMarketplace.sol
            ↑ called by: anyone (propose bounty), voters
            ↓ calls: BountyFactory (createBounty), ValidatorRegistry (isActive)
```

---

## Shared Values: WHERE THEY LIVE

| Value | Defined In | Used By |
|-------|-----------|---------|
| Token name/symbol ($AGON) | `Constants.sol` | Frontend, docs, future token contract |
| Protocol name (Agonaut) | `Constants.sol` | All contracts NatSpec |
| ELO thresholds | `Constants.sol` | EloSystem, ArenaRegistry.getTier() |
| Stake caps per tier | `Constants.sol` | EloSystem, BountyRound.enter() |
| Protocol fee (2%) | `Constants.sol` | BountyRound.finalize(), Treasury |
| Scorer reward (0.5%) | `Constants.sol` | BountyRound, ScorerRegistry |
| Tier enum values | `Constants.sol` | EloSystem, ArenaRegistry, BountyRound, BountyFactory |
| All role hashes | `Constants.sol` | Every contract with access control |
| Timing constants | `Constants.sol` | BountyFactory, BountyRound, DelegationVault, SeasonManager |
| Scorer consensus (66.67%) | `Constants.sol` | ScorerRegistry |
| Min scorer stake | `Constants.sol` | ScorerRegistry |

---

## Cross-Contract Role Grants (DEPLOYMENT ORDER)

These roles MUST be granted during deployment for the system to work:

| Contract | Needs Role | On Contract | Why |
|----------|-----------|-------------|-----|
| BountyRound | BOUNTY_ROUND_ROLE | ArenaRegistry | recordRoundResult() |
| BountyRound | BOUNTY_ROUND_ROLE | StableRegistry | distributeRevenue() |
| BountyRound | BOUNTY_ROUND_ROLE | DelegationVault | distributeProfits() |
| BountyRound | BOUNTY_ROUND_ROLE | SeasonManager | recordRoundResult() |
| BountyRound | ROUND_ROLE | ScorerRegistry | openScoringRound() |
| EloSystem | ELO_SYSTEM_ROLE | ArenaRegistry | updateElo() |
| StableRegistry | STABLE_REGISTRY_ROLE | ArenaRegistry | setStable() |
| BountyFactory | BOUNTY_CREATOR_ROLE | BountyFactory | createBounty() (self) |
| BountyMarketplace | BOUNTY_CREATOR_ROLE | BountyFactory | createBounty() on approval |
| SeasonManager | BOUNTY_CREATOR_ROLE | BountyFactory | spawnChampionship() |

---

## Prize Distribution Flow (BountyRound.finalize)

```
totalPrizePool (sum of all agent stakes)
    │
    ├── For each winning agent (by rank):
    │     grossPrize = totalPrizePool × prizeDistribution[rank] / 10000
    │     │
    │     ├── protocolFee = grossPrize × 200 / 10000 (2%) → Treasury
    │     ├── stableCut = afterFee × revenueShareBps / 10000 → Stable owner
    │     ├── delegationCut = remainder × performanceFeeBps / 10000 → Delegators
    │     └── agentCut = remainder → Agent wallet
    │
    └── Scorer reward = totalPrizePool × 50 / 10000 (0.5%) → ScorerRegistry
```

---

## File Locations

| Component | Path |
|-----------|------|
| Smart Contracts | `products/agonaut/contracts/src/` |
| Contract Tests | `products/agonaut/contracts/test/` |
| Deploy Scripts | `products/agonaut/contracts/script/` |
| Backend | `products/agonaut/backend/` |
| Frontend | `products/agonaut/frontend/` |
| SDK | `products/agonaut/sdk/` |
| Architecture V1 | `products/agonaut/ARCHITECTURE.md` |
| Architecture V2 | `products/agonaut/ARCHITECTURE-V2.md` |
| This File | `products/agonaut/DEPENDENCY-MAP.md` |
| Constants | `products/agonaut/contracts/src/Constants.sol` |
| Build Plan | `products/agonaut/BUILD-PLAN-V2.md` |
| Decisions | `products/agonaut/DECISIONS.md` |
| Concept | `products/agonaut/CONCEPT.md` |
| Compiler Config | `products/agonaut/contracts/foundry.toml` |

---

## Change Checklist

### Before ANY change:
1. Read this file
2. Read Constants.sol
3. Identify ALL affected contracts using the dependency graph above
4. Make the change in Constants.sol FIRST (if it's a shared value)
5. Update all importing contracts
6. Run `forge test` — ALL tests must pass
7. Update this DEPENDENCY-MAP.md if dependencies changed

### After ANY change:
1. `cd products/agonaut/contracts && forge build` — must compile clean
2. `forge test` — must pass 100%
3. Verify this dependency map is still accurate
4. Commit with descriptive message

### Deployment Order (MUST follow):
1. Treasury
2. ArenaRegistry → initialize(treasury)
3. EloSystem
4. ValidatorRegistry
5. ScorerRegistry
6. StableRegistry → set arenaRegistry
7. DelegationVault → set arenaRegistry
8. SeasonManager → set treasury, bountyFactory
9. BountyRound (implementation only, not initialized)
10. BountyFactory → set all addresses, set roundImplementation
11. BountyMarketplace → set bountyFactory, validatorRegistry
12. PredictionMarket → set treasury
13. Grant ALL cross-contract roles (see table above)
