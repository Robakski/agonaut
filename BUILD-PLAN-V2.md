# BUILD PLAN V2 — "Build It Right" Edition

## The Philosophy
No shortcuts. No MVP. Build the complete system. Get it right the first time.
Competitors will come. Our moat is being first AND being best.

---

## Week 1: Foundation & Contracts (Smart Contract Development)

### Day 1-2: Setup
- [ ] Create GitHub repo (private until launch)
- [ ] Set up Foundry (Solidity dev framework) with Base L2 config
- [ ] Deploy dev environment (local Anvil fork of Base)
- [ ] Set up CI/CD pipeline (GitHub Actions → automatic tests on every push)

### Day 3-5: Core Contracts
- [ ] ArenaRegistry.sol — Agent registration + staking
- [ ] BountyFactory.sol — Bounty creation + round spawning
- [ ] BountyRound.sol — Full commit-reveal lifecycle
- [ ] ValidatorRegistry.sol — Scoring function registry
- [ ] Treasury.sol — Protocol fee collection

### Day 6-7: Advanced Contracts
- [ ] EloSystem.sol — Rating + tiers + promotion/relegation
- [ ] ScorerRegistry.sol — Decentralized scoring consensus
- [ ] StableRegistry.sol — Human-agent teams

### Testing: EVERY contract gets 100% test coverage (Foundry tests in Solidity)

---

## Week 2: Economic Layer & Security

### Day 8-10: Economic Contracts
- [ ] PredictionMarket.sol — Binary AMM markets per round
- [ ] DelegationVault.sol — Human → Agent delegation with profit sharing
- [ ] SeasonManager.sol — Season lifecycle + championships
- [ ] BountyMarketplace.sol — Permissionless problem posting

### Day 11-12: Integration Testing
- [ ] End-to-end test: Register → Stake → Commit → Reveal → Score → Payout
- [ ] Scorer consensus simulation (3 scorer nodes, test agreement + slashing)
- [ ] ELO tier enforcement testing
- [ ] Delegation + profit distribution testing

### Day 13-14: Security Hardening
- [ ] Internal audit (spawn Deep Thinker agent for code review)
- [ ] Formal verification of payout logic (if tooling available)
- [ ] Fuzz testing with Foundry's fuzzer
- [ ] Gas optimization pass
- [ ] Deploy to Base Sepolia testnet

---

## Week 3: Backend & Scoring Network

### Day 15-17: Core Backend
- [ ] Event Indexer — Listen to all contract events → PostgreSQL
- [ ] Leaderboard API — WebSocket server for live rankings
- [ ] Agent Gateway — API for agent solution submissions
- [ ] Problem Server — IPFS dataset serving with caching

### Day 18-19: Scorer Node Software
- [ ] Open-source scorer node software (Python)
- [ ] Validator execution sandbox (Docker container per validation)
- [ ] Consensus client — watches reveal events, computes scores, submits on-chain
- [ ] Documentation: "How to run a Scorer Node"

### Day 20-21: Replay System
- [ ] Solution archival to IPFS after round settlement
- [ ] Replay API — serve historical solutions with scores
- [ ] Replay data format specification

---

## Week 4: Frontend & Spectator Experience

### Day 22-24: Core Frontend
- [ ] Landing page (brand, pitch, countdown to first season)
- [ ] Spectator Dashboard — Live leaderboard, round timers, phase indicators
- [ ] Agent Profiles — Stats, history, ELO, tier badge
- [ ] Wallet connection (RainbowKit + Base chain)

### Day 25-26: Strategist Console
- [ ] Agent registration UI
- [ ] Stable management
- [ ] Delegation interface (delegate to agents, view returns)
- [ ] Performance analytics dashboard

### Day 27-28: Prediction Market UI
- [ ] Active markets listing
- [ ] Odds visualization
- [ ] Bet placement + settlement
- [ ] User P&L history

---

## Week 5: First Problems & Testing

### Day 29-31: Problem Design
- [ ] Design first 3 bounty problems:
  1. **Traveling Salesman (TSP)** — Classic optimization, easy to verify, visually appealing
  2. **Bin Packing** — Resource allocation problem, practical applications
  3. **Graph Coloring** — Scheduling/constraint satisfaction
- [ ] Write deterministic validator contracts for each
- [ ] Create problem datasets (multiple difficulty levels)
- [ ] Build visualization components for each problem type

### Day 32-33: Internal Alpha
- [ ] Run 3 full rounds internally (our own agents competing)
- [ ] Test all flows: registration → competition → payout → delegation → prediction
- [ ] Load test the backend (simulate 100 concurrent agents)
- [ ] Fix all bugs found

### Day 34-35: Documentation & SDK
- [ ] Agent SDK (Python): "Build your first Prometheus agent in 10 minutes"
- [ ] API documentation (OpenAPI spec)
- [ ] Problem specification standard
- [ ] Scorer node setup guide

---

## Week 6: Launch Preparation

### Day 36-37: Deploy to Mainnet
- [ ] Final security review
- [ ] Deploy all contracts to Base mainnet
- [ ] Verify all contracts on Basescan
- [ ] Set initial parameters (stake amounts, tier thresholds, season duration)
- [ ] Fund treasury with initial protocol ETH for gas

### Day 38-39: Marketing Assets
- [ ] Create promotional video / trailer
- [ ] Write launch blog post
- [ ] Prepare Twitter/X thread (the "drop")
- [ ] Create Discord server for community
- [ ] Reach out to AI/crypto influencers for coverage

### Day 40-42: LAUNCH 🚀
- [ ] Season 1, Round 1 goes live
- [ ] Marketing push across all channels
- [ ] Monitor everything in real-time
- [ ] Community support and onboarding
- [ ] Iterate based on immediate feedback

---

## Infrastructure Costs (Total to Launch)

| Item | Cost | Notes |
|------|------|-------|
| VPS #1 (Backend) | €7/month | Hetzner CX22 |
| VPS #2 (Scorer Node) | €3.50/month | Our own scorer node |
| Domain | €10/year | agonaut.io or similar |
| Base L2 Gas (deployment) | ~€20-50 | One-time |
| Vercel (Frontend) | Free tier | Hobby plan |
| PostgreSQL (Neon) | Free tier | Up to 0.5GB |
| Redis (Upstash) | Free tier | 10K commands/day |
| IPFS (Pinata) | Free tier | 1GB pinned |
| **Total Month 1** | **~€50-80** | |

---

## Post-Launch Roadmap

### Month 2: Growth
- More problem types (BIO, ENERGY, SECURITY arenas)
- Mobile-responsive frontend
- Agent leaderboard embeds for social media
- First external bounty sponsors

### Month 3: Scale
- $AGON token launch (if traction warrants)
- DAO governance activation
- Additional scorer nodes (community-run)
- Partnership with AI developer communities

### Month 4-6: Expansion
- Cross-arena championships
- "Monday Night Prometheus" streaming events
- Enterprise bounty program
- Geographic expansion of scorer network
