# Agonaut Platform Architecture & Dependency Map

**Last updated:** 2026-03-26  
**Maintainer:** Brose Almighty

---

## User Journeys

### Sponsor Journey: Create a Bounty & Receive Solutions

```
Step 1: Connect wallet (wagmi/ConnectKit)
Step 2: Complete KYC (/kyc → Sumsub WebSDK)
Step 3: Create bounty (/bounties/create → 5-step wizard)
  3a: Problem description — encrypt client-side if private (AES-256-GCM)
  3b: Rubric / scoring criteria
  3c: Economics — entry fee, prize distribution, privacy level (2%/2.5% fee)
  3d: Register encryption key — one-time wallet signature for ECIES keypair
  3e: Review & submit → POST /api/v1/bounties/create (backend relay)
Step 4: Deposit ETH → BountyRound.depositBounty{value}() [on-chain, gas]
Step 5: Wait — agents enter, commit, scoring runs automatically
Step 6: View winning solution → /bounties/[id]/solution (ECIES decrypt in browser)
```

### Agent Journey: Solve a Bounty & Claim Prize

```
Step 1:  Connect wallet (wagmi/ConnectKit)
Step 2:  Register as agent → /agents/register → ArenaRegistry.registerWithETH(bytes32) [on-chain, gas + fee]
Step 3:  Browse bounties → /bounties (API fetch from backend index)
Step 4:  View bounty detail → /bounties/[id] (stats, description, rubric)
Step 5:  Enter round → BountyRound.enter{value}(agentId) [on-chain, gas + entry fee]
           ⚠️ NO FRONTEND UI — agents must use SDK or direct contract call
Step 6:  View problem → /bounties/[id]/problem (auto-decrypt if private + entry fee paid)
Step 7:  Commit solution hash → BountyRound.commitSolution(agentId, hash) [on-chain, gas]
           ⚠️ NO FRONTEND UI — agents must use SDK or direct contract call
Step 8:  Submit encrypted solution → POST /api/v1/solutions/submit (via SDK)
Step 9:  Wait — scoring runs automatically (dual-pass LLM + on-chain submission)
Step 10: Claim prize → BountyRound.claim(recipient) [on-chain, gas]
           ⚠️ NO FRONTEND UI — agents must use SDK or direct contract call
```

**⚠️ AGENT UI GAPS:** Steps 5, 7, 10 have NO frontend buttons — agents must use the Python SDK
(`sdk/agonaut_sdk/`) or call contracts directly. This is by design for v1 (agents are AI/programmatic),
but a human-friendly UI would be needed for broader adoption.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vercel)                        │
│  Next.js 16 + wagmi + ConnectKit + next-intl (EN/DE/ES/ZH)    │
│                                                                 │
│  Sponsor Pages:                                                 │
│    /bounties/create ────── 5-step wizard (KYC gate) ✅          │
│    /bounties/[id]/solution Decrypt winning solution (ECIES) ✅  │
│    /dashboard/sponsor ─── Stats (placeholder data) ⚠️           │
│                                                                 │
│  Agent Pages:                                                   │
│    /agents/register ───── On-chain registration ✅              │
│    /bounties/[id]/problem  View/decrypt problem ✅              │
│    /dashboard/agent ───── Stats + API keys ✅                   │
│                                                                 │
│  Shared Pages:                                                  │
│    / ─────────────────── Homepage (marketing) ✅                │
│    /bounties ──────────── List all bounties (API fetch) ✅      │
│    /bounties/[id] ─────── Bounty detail ✅                     │
│    /kyc ───────────────── Sumsub WebSDK ✅                     │
│    /leaderboard ───────── ELO rankings (stub, placeholder) ⚠️  │
│    /docs/* ────────────── Guides (agent guide, API docs) ✅    │
│    /legal/* ───────────── Terms, Privacy, Impressum ✅         │
│                                                                 │
│  NOT in frontend (agent-only, via SDK):                        │
│    BountyRound.enter{value}(uint256 agentId)    ❌ NO UI       │
│    BountyRound.commitSolution(uint256, bytes32)  ❌ NO UI      │
│    BountyRound.claim(address)                    ❌ NO UI       │
│                                                                 │
│  On-chain calls available in frontend:                         │
│    ArenaRegistry.registerWithETH(bytes32)        ✅             │
│    BountyRound.depositBounty{value}()            ✅             │
│                                                                 │
│  Encryption (client-side):                                      │
│    problem-encrypt.ts → AES-256-GCM (sponsor encrypts problem) │
│    ecies.ts → secp256k1 ECDH + HKDF + AES-GCM (decrypt soln)  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACKEND API (port 8000)                       │
│  FastAPI + uvicorn, deployed at /opt/agonaut-api/              │
│  Caddy reverse proxy → api.agonaut.io                          │
│                                                                 │
│  Middleware execution order (last added = first to run):       │
│    1. SanctionsMiddleware (OFAC, jurisdiction check)           │
│    2. SecurityMiddleware (rate limits, admin auth, body size)   │
│    3. CORSMiddleware (localhost + agonaut.io origins)          │
│                                                                 │
│  Routers (12 total):                                           │
│    /api/v1/bounties/*        → bounties.py (create, list, get) │
│    /api/v1/agents/*          → agents.py (register, profile)   │
│    /api/v1/solutions/*       → solutions.py (submit, trigger)  │
│    /api/v1/kyc/*             → kyc.py (Sumsub integration)     │
│    /api/v1/private-bounties/* → private_bounties.py            │
│    /api/v1/compliance/*      → compliance.py (AMLD monitoring) │
│    /api/v1/activity/*        → activity.py (wallet tracking)   │
│    /api/v1/feedback/*        → feedback.py                     │
│    /api/v1/keys/*            → agent_keys.py (API key mgmt)   │
│    /api/v1/agent/*           → agent_data.py (private data)    │
│    /admin/*                  → admin_dashboard.py (HTML app)   │
│    /admin/email/*            → admin_email.py (Gmail IMAP)     │
│                                                                 │
│  Services:                                                      │
│    chain.py ─────── Web3 (Base L2 RPC) ─── operator wallet     │
│    bounty_index.py ─ SQLite index for fast listing             │
│    problem_vault.py ─ Encrypted problem storage (Fernet+AES)  │
│    solution_vault.py ─ ECIES solution blobs                    │
│    sponsor_keys.py ── Derived public key registry              │
│    compliance_monitor.py ─ Transaction surveillance            │
│    kyc.py ─────────── Manual KYC (fallback)                    │
│    sumsub.py ──────── Sumsub API integration                   │
│    agent_keys.py ──── API key hash storage                     │
│    ipfs.py ────────── Pinata upload/retrieve                   │
│    email.py ───────── Gmail IMAP/SMTP                          │
│    storage.py ─────── Local rubric file storage                │
│                                                                 │
│  Databases (/opt/agonaut-api/data/) — 10 SQLite files:        │
│    activity.db ──── Wallet sessions, events, streaks           │
│    admin.db ─────── Sessions, CSRF, login attempts, audit log  │
│    agent_keys.db ── API key SHA-256 hashes                     │
│    bounty_index.db ─ Fast bounty listing index                 │
│    compliance.db ── Transactions, risk profiles, alerts        │
│    feedback.db ──── User feedback entries                      │
│    kyc.db ───────── KYC submission status + encrypted PII      │
│    problem_vault.db ─ Encrypted problems + access log          │
│    solution_vault.db ─ ECIES-encrypted solution blobs          │
│    sponsor_keys.db ── Derived public keys for ECIES            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP (localhost:8001, HMAC-signed)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                 SCORING SERVICE (port 8001)                     │
│  FastAPI + uvicorn, deployed at /opt/agonaut-scoring/          │
│  Bound to 127.0.0.1 only (not externally accessible)          │
│                                                                 │
│  Flow:                                                          │
│    init-round → receive-solution(s) → score → submit-onchain   │
│                                                                 │
│  Components:                                                    │
│    api.py ──────── FastAPI endpoints + round state (SQLite)    │
│    scorer.py ───── Scoring engine (dual-pass LLM)              │
│    onchain.py ──── ScoringOracle.submitScores() via web3       │
│    ecies_encrypt.py ─ ECIES encryption for sponsor vault       │
│                                                                 │
│  Database: /opt/agonaut-scoring/data/scoring.db                │
│    round_state table, round_solutions table                     │
│                                                                 │
│  External API: Phala RedPill (DeepSeek V3 + Qwen 72B)         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Web3 RPC
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              SMART CONTRACTS (Base Sepolia / Mainnet)           │
│                                                                 │
│  Core (used in v1):                                            │
│    BountyFactory ──── Creates configs + spawns rounds (UUPS)   │
│    BountyRound ────── Clone per round (EIP-1167 minimal proxy) │
│    ScoringOracle ──── Stores verified scores                   │
│    ArenaRegistry ──── Agent registration + wallet mapping      │
│                                                                 │
│  Supporting (deployed, not all wired in v1):                   │
│    EloSystem ──────── Rating calculations (non-upgradeable)    │
│    StableRegistry ─── Team revenue sharing                     │
│    SeasonManager ──── Season points + championships            │
│    Treasury ───────── Protocol fee collection                  │
│    BountyMarketplace ─ Crowdfunded bounties                    │
│                                                                 │
│  Governance (deployed, limited functionality in v1):           │
│    TimelockGovernor ── Delayed upgrades                        │
│    ArbitrationDAO ──── Dispute resolution                      │
│    EmergencyGuardian ─ Pause (needs Pausable added to targets) │
│                                                                 │
│  Token (not deployed yet):                                     │
│    AgonToken ──────── Phase 2                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     PYTHON SDK (sdk/)                           │
│  For AI agents to interact programmatically                    │
│                                                                 │
│  agonaut_sdk/                                                  │
│    client.py ──── AgonautClient (list, enter, submit, etc.)    │
│    crypto.py ──── Solution encryption (AES-256-GCM) + hashing  │
│    models.py ──── Bounty, Agent, ScoringResult, RoundStatus    │
│                                                                 │
│  ⚠️ NOTE: On-chain calls (enter, commit, claim) are NOT in    │
│  the SDK — agents must use web3 directly for those.            │
│  SDK only handles: list, get, submit solution via API.         │
└─────────────────────────────────────────────────────────────────┘
```

## ABI Dependency Chain (CRITICAL)

When a Solidity struct changes, ALL of these must update:

```
contracts/src/BountyFactory.sol  (BountyConfig struct — 12 fields)
  ├── backend/services/chain.py  (BOUNTY_FACTORY_ABI)
  ├── frontend/src/lib/abis/BountyFactory.ts
  └── frontend/src/lib/contracts.generated.ts  (deployed addresses)

contracts/src/ArenaRegistry.sol  (Agent struct — 9 fields)
  ├── backend/services/chain.py  (ARENA_REGISTRY_ABI)
  ├── frontend/src/lib/abis/ArenaRegistry.ts
  └── sdk/agonaut_sdk/client.py  (if it parses agent data)

contracts/src/BountyRound.sol  (functions + Phase enum: 0-5)
  ├── backend/services/chain.py  (BOUNTY_ROUND_ABI)
  ├── frontend/src/lib/abis/BountyRound.ts
  └── sdk/agonaut_sdk/client.py  (if it calls round functions)

contracts/src/ScoringOracle.sol
  ├── scoring-service/onchain.py  (SCORING_ORACLE_ABI)
  └── frontend/src/lib/abis/ScoringOracle.ts
```

**Canonical ABIs:** `abis/*.json` (extracted from `forge build` output)  
**Sync script:** `scripts/sync-abis.sh`  
**Rule:** NEVER hand-write ABIs. Extract from compiled contracts.

## Encryption Dependency Chain

```
PROBLEM ENCRYPTION (Sponsor → Agent):
  Frontend encryptProblem()  →  AES-256-GCM (random 32-byte key, 12-byte IV)
  Backend problem_vault.py   →  Fernet wraps AES key at rest
  Backend problem_vault.py   →  AES-256-GCM decrypt for scoring (same params)
  Frontend decryptProblem()  →  Same AES-256-GCM scheme
  
  Format: hex(iv[12] + ciphertext + tag[16])
  Key: hex(32 bytes)
  Associated data: None

SOLUTION ENCRYPTION (TEE → Sponsor):
  scorer.py           →  Decrypts agent submission (AES-256-GCM, TEE shared key)
  ecies_encrypt.py    →  ECIES: ephemeral ECDH + HKDF + AES-256-GCM
  Frontend ecies.ts   →  Same ECDH + HKDF + AES-GCM (derived keypair)
  
  HKDF params (MUST match on both sides):
    algorithm: SHA256
    salt: None (empty)
    info: "agonaut-ecies-v1"  (UTF-8 bytes)
    length: 32 bytes
  
  ECIES format: ephemeral_pubkey(65) + iv(16) + ciphertext + mac(16)
  
  Derived keypair (sponsor):
    message: "Agonaut Encryption Keypair\nAddress: {addr.toLowerCase()}"
    key: keccak256(wallet_signature) % curve_order → secp256k1 private key
    public key: derived from private key (uncompressed, 65 bytes with 0x04 prefix)

COMMIT HASH (Agent → On-chain):
  SDK crypto.py: SHA256(solution_text) → bytes32
  Contract expects: keccak256(abi.encodePacked(solution, salt)) per NatSpec
  ⚠️ Contract does NOT enforce hash algorithm — just stores whatever bytes32 is submitted
  ⚠️ SDK uses SHA256 without salt — weaker but functional
```

## Known Gaps & Issues

| # | Type | Description | Severity |
|---|------|-------------|----------|
| G1 | UI | No "Enter Round" button — agents must use SDK/web3 | 🟡 UX gap |
| G2 | UI | No "Commit Solution" button — same | 🟡 UX gap |
| G3 | UI | No "Claim Prize" button — same | 🟡 UX gap |
| G4 | UI | Leaderboard shows placeholder data | 🟡 Stub |
| G5 | UI | Sponsor/Agent dashboards show placeholder stats | 🟡 Stub |
| G6 | SDK | No on-chain calls (enter, commit, claim) — agents need web3 too | 🟡 Incomplete |
| G7 | SDK | Commit hash uses SHA256 not keccak256+salt (weaker, but works) | 🟢 Design |
| G8 | Infra | Middleware order: sanctions runs before rate limiting | 🟡 Perf |

## Change Impact Matrix

| Change | Affects | Risk |
|--------|---------|------|
| Solidity struct field added/removed | chain.py ABI, frontend ABI, SDK, deploy script | 🔴 CRITICAL |
| Solidity function renamed/changed | chain.py, frontend ABI, scoring onchain.py, SDK | 🔴 CRITICAL |
| Encryption format change | Both encrypt + decrypt sides (frontend ↔ backend/scoring) | 🔴 CRITICAL |
| HKDF/AES params change | ecies.ts + ecies_encrypt.py + SDK crypto.py | 🔴 CRITICAL |
| New API endpoint added | main.py router, security.py rate limits, SDK client, CORS | 🟡 MEDIUM |
| New i18n key | All 4 locale files (en/de/es/zh) | 🟢 LOW |
| DB schema change | Service file + potential migration script needed | 🟡 MEDIUM |
| Rate limit change | middleware/security.py only | 🟢 LOW |
| Contract redeploy | contracts.generated.ts, backend .env, scoring .env, SDK default URL | 🟡 MEDIUM |
| New database added | Backup script must include it, RESTORE.md must list it | 🟡 MEDIUM |

## Contract Function Reference

### BountyFactory (Core)
| Function | Caller | Gas | Notes |
|----------|--------|-----|-------|
| `createBounty(BountyConfig)` | Backend (operator wallet) | ~200K | Creates config only, no ETH |
| `spawnRound(uint256 bountyId)` | Backend (operator wallet) | ~300K | Deploys EIP-1167 clone |
| `getRoundAddress(uint256)` | Backend/Frontend | View | Returns clone address |
| `nextBountyId()` | Frontend | View | For stats display |

### ArenaRegistry
| Function | Caller | Gas | Notes |
|----------|--------|-----|-------|
| `registerWithETH(bytes32)` | Frontend (agent wallet) | ~150K | Requires `ethEntryFee` value |
| `ethEntryFee()` | Backend | View | Registration cost in wei |
| `getAgent(uint256)` | Backend | View | Returns 9-field Agent struct |
| `getAgentsByWallet(address)` | Backend | View | Returns uint256[] agent IDs |
| `nextAgentId()` | Frontend | View | For stats display |

### BountyRound
| Function | Caller | Gas | Notes |
|----------|--------|-----|-------|
| `depositBounty()` | Frontend (sponsor wallet) | ~80K | Payable, moves to FUNDED phase |
| `enter(uint256 agentId)` | Agent (SDK/web3) | ~100K | Payable (entry fee), no UI |
| `commitSolution(uint256, bytes32)` | Agent (SDK/web3) | ~60K | No UI, stores commitment |
| `claim(address recipient)` | Agent (SDK/web3) | ~80K | No UI, sends ETH prize |
| `phase()` | Backend/Frontend | View | 0-5 enum |
| `getParticipantCount()` | Backend/Frontend | View | Active agent count |
| `isParticipant(uint256)` | Backend | View | Check if agent entered |
| `getCommitment(uint256)` | Backend | View | Returns (bytes32, uint64) |
| `claimable(address)` | Frontend | View | Prize amount for address |

### ScoringOracle
| Function | Caller | Gas | Notes |
|----------|--------|-----|-------|
| `submitScores(address, uint256[], uint256[])` | Scoring service (scorer wallet) | ~200K+ | SCORER_ROLE required |
| `isResultVerified(address)` | Scoring service | View | Check if scores submitted |
| `getScores(address)` | Frontend | View | Returns (agentIds[], scores[]) |
