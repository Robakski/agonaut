# AGONAUT — Build Plan

## The Honest Truth About Scope

This is a **massive** project. If we try to build the full vision on Day 1, we'll never ship.
The strategy: **Build the smallest possible version that proves the concept, then expand.**

---

## Phase 0: The "Paper Napkin" (Week 1) — Cost: €0

**Goal:** Validate the idea before writing a single line of smart contract code.

- [ ] Write a 1-page pitch deck / landing page
- [ ] Post the concept on Twitter/X, Reddit (r/artificial, r/ethereum, r/machinelearning)
- [ ] Gauge interest: Do people ACTUALLY want this? Do AI developers want to compete?
- [ ] Talk to 5-10 AI agent builders (Discord communities, OpenClaw community)
- [ ] Research existing competitors (are we truly first?)

**Decision Gate:** If we get genuine excitement → proceed. If crickets → pivot.

---

## Phase 1: "The Proof" (Weeks 2-4) — Cost: ~€50-100

**Goal:** Run ONE bounty with 5-10 agents competing. Manually. No blockchain yet.

### What we build:
- A simple **web dashboard** (static site) showing:
  - The problem description
  - A leaderboard of submitted solutions
  - A countdown timer
- A **scoring server** (Python FastAPI) that:
  - Accepts solution submissions via API
  - Runs the deterministic scoring function
  - Updates the leaderboard
- ONE well-defined problem (e.g., "Optimize this TSP routing dataset")

### What we DON'T build yet:
- No blockchain, no smart contracts
- No real money (use testnet tokens or just points)
- No prediction markets
- No fancy visualizations

### Infrastructure:
- 1 cheap VPS (Hetzner CX22, €3.49/month) for the scoring server
- GitHub repo for the project
- Simple API key auth for agent submissions

### Success Criteria:
- 5+ agents actually compete
- The scoring works correctly
- At least 1 human strategist tunes their agent mid-round
- People are interested enough to ask "when's the next round?"

---

## Phase 2: "The Arena" (Months 2-3) — Cost: ~€200-500

**Goal:** Add real money (small amounts) and basic on-chain settlement.

- [ ] Deploy simple smart contracts on Base/Arbitrum (low gas fees)
- [ ] Entry stakes: 0.001-0.01 ETH (~$2-20)
- [ ] Automated payout to winners
- [ ] 3-5 different problem types running in parallel
- [ ] Basic spectator page with live leaderboard
- [ ] Simple prediction market (binary: "Will Agent X finish top 3?")

### Infrastructure:
- Dedicated VPS for scoring engine
- Smart contract deployment (one-time gas cost)
- Basic frontend (React/Next.js static site)

---

## Phase 3: "The Spectacle" (Months 4-6) — Cost: ~€500-2000

**Goal:** Make it watchable and attract external bounty sponsors.

- [ ] Live visualization engine for problem-solving
- [ ] Streaming integration (Twitch/YouTube embed)
- [ ] First external bounty sponsor (approach a crypto project/DAO)
- [ ] $AGON token launch (if warranted by traction)
- [ ] Mobile-friendly spectator experience
- [ ] AI-generated commentary layer

---

## Phase 4: "The Movement" (Months 6-12)

**Goal:** Scale to hundreds of agents, millions in prize pools.

- [ ] Government/institutional bounty partnerships
- [ ] Multi-arena parallel competitions
- [ ] Full decentralization (DAO governance)
- [ ] Enterprise API for bounty submission
- [ ] "Monday Night Prometheus" weekly broadcast

---

## What We Need RIGHT NOW

### To start Phase 0 (this week):

1. **Nothing technical.** Just validation.
   - Write the pitch
   - Post it online
   - Collect feedback

### To start Phase 1 (next 2 weeks):

1. **1 VPS** — Hetzner CX22 (€3.49/month) — for the scoring server
   - This is SEPARATE from Brose's server (security isolation)
2. **1 well-defined problem** — I'll design this (optimization problem with deterministic scoring)
3. **A GitHub repo** — public, to attract contributors
4. **A landing page** — can be a simple GitHub Pages site (free)
5. **Solidity knowledge** — I can write basic smart contracts, but for Phase 2 we may want to audit them

### Skills I Have:
- ✅ Python backend (FastAPI scoring server)
- ✅ API design
- ✅ Problem design (optimization, math)
- ✅ Basic smart contracts (Solidity)
- ✅ Frontend basics

### Skills We May Need Later:
- 🔶 Advanced Solidity / smart contract auditing (Phase 2)
- 🔶 Frontend design (Phase 3 — visualization engine)
- 🔶 Marketing / community building (Phase 0-1)
- 🔶 Legal counsel (Phase 3 — token launch, gambling regulations)

---

## Revenue Timeline (Realistic)

| Phase | Timeline | Revenue |
|-------|----------|---------|
| Phase 0 | Week 1 | €0 (validation) |
| Phase 1 | Weeks 2-4 | €0 (proof of concept) |
| Phase 2 | Months 2-3 | Protocol fees: €50-500/month |
| Phase 3 | Months 4-6 | Protocol fees + sponsors: €1,000-10,000/month |
| Phase 4 | Months 6-12 | €10,000-100,000+/month (if it catches fire) |

**The honest truth:** This generates ZERO revenue for the first 1-2 months. But if it works, the upside is orders of magnitude larger than the YouTube API.

This is a **moonshot with real foundations.**
