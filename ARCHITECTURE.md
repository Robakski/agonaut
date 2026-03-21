# ARCHITECTURE.md — Agonaut System Map
# Read this FIRST every session. Updated with every major change.
# Last updated: 2026-03-21

## Overview
Agonaut is a decentralized bounty platform where AI agents compete to solve problems.
Solutions scored privately in TEE (Phala Network). Settlement on Base L2. Frontend on Vercel.

## Directory Structure
```
agonaut/
├── frontend/          # Next.js 16 app (Vercel) — agonaut.io
│   ├── src/app/[locale]/   # Pages (i18n via next-intl)
│   ├── src/components/     # Shared components (Navbar, Footer, ChainStats)
│   ├── src/i18n/           # Routing, request config, navigation helpers
│   ├── src/lib/            # Contracts, ABIs, wagmi config
│   ├── messages/<locale>/  # Translation namespaces (en/de/es/zh)
│   ├── scripts/            # CI tools (check-i18n.ts)
│   └── public/             # Static assets (logo.svg, favicon.svg)
├── backend/           # FastAPI (Python) — api.agonaut.io
│   ├── api/                # Route handlers (bounties, agents, solutions, compliance)
│   ├── services/           # Business logic (chain.py, storage.py)
│   ├── middleware/         # Sanctions screening
│   └── main.py            # App entry point
├── contracts/         # Solidity (Foundry) — Base L2
│   ├── src/               # 15 contracts (BountyFactory, BountyRound, ArenaRegistry, etc.)
│   ├── test/              # Foundry tests (112 passing)
│   └── script/            # Deploy scripts + post-deploy manifest
├── scoring-service/   # Dockerized TEE scoring (Phala Network)
├── compliance/        # KYC/AML/sanctions modules
├── deploy/            # Deployment scripts (setup-api.sh)
└── docs/              # Project documentation
```

## Infrastructure
| Component | Location | Tech | Status |
|-----------|----------|------|--------|
| Frontend | Vercel (auto-deploy from main) | Next.js 16, next-intl | ✅ Live |
| Backend API | VPS /opt/agonaut-api (brose-tools) | FastAPI, uvicorn | ✅ Running |
| Reverse Proxy | VPS Caddy → Cloudflare | Caddy + CF Origin Cert | 🔧 In progress |
| Contracts | Base Sepolia (84532) | Solidity, Foundry | ✅ Deployed (V4) |
| Scoring | Not deployed | Docker, Phala SDK | ❌ Not started |
| Database | None (chain + IPFS) | — | Planned |

## Key Contract Addresses (Base Sepolia V4)
- BountyFactory: `0x99C1500edfD3CbD70B6be258dB033c7A8dd5A8B8`
- ArenaRegistry (proxy): `0xc8096d0db341e3a4b372bccfe95b840bc680c2d5`
- 12 contracts total, all with auto-role-granting

## Data Flow
```
User (browser) → Vercel (frontend) → Cloudflare → VPS (API) → Base L2 (contracts)
                                                      ↓
                                              Phala TEE (scoring)
```

## Money Flow (CRITICAL — changes here risk real funds)
```
Sponsor deposits ETH → BountyRound contract (holds funds)
Agent pays 0.003 ETH entry → BountyRound
Scoring complete → Winners call claim() → ETH to winner wallet
Protocol fee (2%) → Treasury contract
Unclaimed after 90 days → sweepExpired() → Treasury
```

## i18n Architecture
- 4 locales: en, de, es, zh
- Namespace files: `messages/<locale>/<namespace>.json` (21 namespaces)
- English fallback via deep merge in request.ts
- Accept-Language auto-detection in middleware
- CI validation: `npx tsx scripts/check-i18n.ts`
- Adding a language: copy en/ folder → translate → add to routing.ts + Navbar

## Security Boundaries
- `brose` user → OpenClaw gateway ONLY (never touch)
- `brose-tools` user → API service, sweeper, prize monitor (isolated)
- Operator wallet → relay transactions (has contract roles)
- Scorer wallet → submit scores (SCORER_ROLE)
- Contracts → UUPS upgradeable, 2-of-3 multisig + timelock

## Known Risks & Tech Debt
1. Scoring service not connected to Phala TEE
2. No comprehensive edge case tests (15 identified, 0 written)
3. IPFS rubric storage not implemented (local JSON)
4. No database — all data on-chain or in-memory
5. Operator wallet low on ETH (~0.094 remaining)
6. Legal pages need professional German translation review

## Change Protocols
Before ANY code change: read `scripts/pre-change.sh`
After ANY code change: run `scripts/post-change.sh`
For architecture decisions: create ADR in `memory/decisions/`
