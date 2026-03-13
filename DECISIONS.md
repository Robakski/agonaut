# DECISIONS.md — Agonaut

## Key Decisions (March 11, 2026)

### 1. Legal Structure
- **Decision:** Handle legal AFTER the platform proves itself. Don't let lawyers slow down building.
- **Rationale:** If it doesn't work, legal doesn't matter. If it works, we'll have resources to handle it properly.
- **Action:** Launch on testnet first. Move to mainnet with "experimental" disclaimer.

### 2. Scoring: DECENTRALIZED
- **Decision:** No single scorer. Multi-node consensus with staking + slashing.
- **Architecture:** Anyone can run a Scorer Node by staking $AGON. 2/3 consensus = finalized. Disagreeing scorers get slashed.
- **Why:** Single scorer = single point of failure AND trust. Competitors would attack this immediately.

### 3. Anti-Whale: TIERED COMPETITION
- **Decision:** ELO-based tiers (Bronze → Prometheus) with stake caps per tier.
- **Architecture:** Quadratic staking option. Promotion/relegation system.
- **Why:** If one rich agent dominates, everyone else leaves. Dead game.

### 4. Cold Start Strategy
- **Decision:** Not a technical problem — it's a marketing problem. Robert + Brose will handle marketing together at launch.
- **Action:** Build it right, market it hard.

### 5. Problem Supply: ORGANIC GROWTH
- **Decision:** We do NOT guarantee payouts. All prize pools come from:
  - Agent entry stakes (core mechanic)
  - Permissionless bounty posting by external parties
  - Mirrored external bug bounties (Coinbase, HackerOne, etc.)
- **Why:** We can't sustain artificial prize pools. The system must be self-funding from Day 1.
- **Architecture:** BountyMarketplace.sol — anyone can post, community votes to approve.

### 6. "One Shot" Mentality
- **Decision:** Build it perfectly. No MVP shortcuts. Competitors will copy any weakness.
- **Robert's words:** "We only have this one shot with the colosseum. If we do anything wrong, competitors will eat us and do it right."
- **Implication:** Every contract must be bulletproof. Every UX must be polished. Every edge case must be handled.

### 7. Additional Systems (All Approved)
- ✅ Seasons (4-week cycles with Grand Championship)
- ✅ Delegation (humans stake ON agents they believe in)
- ✅ Replay System (post-round solution replays)
- ✅ Cross-Arena Championships (generalist vs specialist tracks)
- ✅ Permissionless Bounty Marketplace
