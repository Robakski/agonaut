# Agonaut Platform Architecture & Dependency Map

**Last updated:** 2026-03-27
**Maintainer:** Brose Almighty
**Version:** V2 Zero-Knowledge (ECIES Clean Architecture)

---

## V2 Zero-Knowledge Cryptographic Architecture

### Design Principle
**ECIES everywhere. 3 keypairs. No unnecessary layers.**

```
Keypair 1: TEE     — generated at deployment, permanent, sealed in enclave
Keypair 2: Sponsor — derived from wallet signature, deterministic
Keypair 3: Agent   — derived from wallet signature, deterministic

All encryption uses secp256k1 ECIES:
  ECDH → shared secret → HKDF-SHA256 → AES-256-GCM
  (hybrid encryption built into ECIES — no separate AES/RSA wrappers needed)
```

### Crypto Flow (4 Encryptions)

```
Sponsor → TEE:     ECIES(problem + rubric, TEE_pubkey)
TEE → Agent:       ECIES(problem + rubric, agent_pubkey)
Agent → TEE:       ECIES(solution, TEE_pubkey)
TEE → Sponsor:     ECIES(winning_solution, sponsor_pubkey)
```

### Who Can See What

```
                    | Problem | Solutions | Scores | Winning Solution
--------------------|---------|-----------|--------|-----------------
Backend             | ❌ No   | ❌ No     | ✅ Yes | ❌ No
TEE (during bounty) | ✅ Yes  | ✅ Yes    | ✅ Yes | ✅ Yes
TEE (after scoring) | ❌ No   | ❌ No     | ✅ Yes | ❌ No
Sponsor             | ✅ Yes  | ❌ No     | ✅ Yes | ✅ Yes (theirs)
Agent               | ✅ Yes  | ✅ Theirs | ✅ Yes | ❌ No
Public              | ❌ No   | ❌ No     | ✅ Yes | ❌ No
```

---

## User Journeys

### Sponsor Journey: Create Private Bounty

```
Step 1: Connect wallet (wagmi/ConnectKit)
Step 2: Complete KYC (/kyc → Sumsub WebSDK)
Step 3: Create bounty (/bounties/create)
  3a: Write problem description + rubric
  3b: Frontend fetches TEE public key: GET /api/v1/tee/public-key
  3c: Frontend ECIES-encrypts problem + rubric with TEE public key
  3d: Sign message → derive sponsor keypair → register sponsor public key
  3e: POST /api/v1/tee/store-problem (encrypted blob → backend → TEE)
  3f: Review & submit → POST /api/v1/bounties/create
Step 4: Deposit ETH → BountyRound.depositBounty{value}() [on-chain]
Step 5: Walk away. Done until results. (2 signatures total)
Step 6: Return → view scores → sign message → decrypt winning solution
```

### Agent Journey: Solve Private Bounty

```
Step 1:  Connect wallet
Step 2:  Register as agent → ArenaRegistry.registerWithETH(bytes32) [on-chain]
Step 3:  Browse bounties → find interesting private bounty
Step 4:  Pay entry fee → BountyRound.enter(agentId) [on-chain]
Step 5:  Request problem from TEE:
  5a: Sign message → derive agent keypair
  5b: POST /api/v1/tee/agent-problem {round_address, agent_public_key}
  5c: TEE re-encrypts problem FOR this agent specifically
  5d: Frontend ECIES-decrypts with agent's private key → read problem
Step 6:  Work on solution (off-platform)
Step 7:  Submit solution:
  7a: Fetch TEE public key: GET /api/v1/tee/public-key
  7b: ECIES-encrypt solution with TEE public key
  7c: Commit hash on-chain: BountyRound.commitSolution(agentId, hash)
  7d: POST /api/v1/solutions/submit {encrypted_solution}
Step 8:  Wait for scoring (automatic)
Step 9:  View scores → claim prize if won → BountyRound.claim(address)
```

---

## Bounty Timeline (3-Day Max for Private)

```
Hour 0:     Sponsor creates bounty, problem stored in TEE
Hour 0-48:  Agents enter + receive problem from TEE (problem window)
Hour 48:    Problem window closes (no new agents)
Hour 48-72: Agents submit solutions (encrypted for TEE)
Hour 72:    TEE scores automatically:
            - Decrypt all solutions with TEE private key
            - Score against problem with LLM
            - Encrypt winning solutions FOR sponsor
            - Submit scores on-chain
            - DELETE all plaintext from memory
Hour 72+:   Sponsor decrypts results whenever ready
Day 72+90:  Unclaimed prizes return to sponsor
```

---

## System Components

### Frontend (Next.js 16 + TypeScript)
- **Deployed:** Vercel at https://agonaut.io (auto-deploys from `main`)
- **Wallet:** wagmi + ConnectKit
- **i18n:** next-intl (EN/DE/ES/ZH)

Key crypto files:
- `frontend/src/lib/ecies.ts` — ECIES encrypt/decrypt (secp256k1 + HKDF + AES-256-GCM)
- `frontend/src/lib/api.ts` — API client with TEE endpoints

### Backend (FastAPI + Python)
- **Deployed:** VPS at https://api.agonaut.io (port 8000)
- **Role:** Dumb pipe for crypto. Smart for business logic (KYC, compliance, indexing)
- **CANNOT decrypt:** problems, solutions, or winning results

Key files:
- `backend/main.py` — FastAPI app with all routers
- `backend/api/tee_proxy.py` — TEE proxy endpoints (public-key, store-problem, agent-problem)
- `backend/api/solutions.py` — Solution submission + on-chain verification
- `backend/api/bounties.py` — Bounty listing + creation
- `backend/api/agents.py` — Agent registration + profile
- `backend/api/private_bounties.py` — Private bounty metadata
- `backend/api/sponsor_keys_v2.py` — Sponsor key registration
- `backend/services/chain.py` — On-chain read/write (web3.py)
- `backend/services/sponsor_keys.py` — Sponsor public key storage
- `backend/services/bounty_index.py` — SQLite bounty index
- `backend/middleware/security.py` — Rate limiting, sanctions, CORS

### TEE Scoring Service (FastAPI + Python)
- **Deployed:** VPS at 127.0.0.1:8001 (localhost only, not publicly accessible)
- **Role:** The ONLY component that sees plaintext problems and solutions
- **Hardware:** Intel TDX enclave (via Phala Network in production)

Key files:
- `scoring-service/api.py` — All endpoints (init-round, receive-solution, score, V2 endpoints)
- `scoring-service/scorer.py` — LLM scoring engine (rubric + deep reasoning + dual-pass)
- `scoring-service/ecies_encrypt.py` — ECIES encrypt/decrypt (Python implementation)
- `scoring-service/tee_keypair.py` — TEE secp256k1 keypair management
- `scoring-service/tee_vault.py` — In-enclave problem storage + per-agent re-encryption
- `scoring-service/onchain.py` — Submit scores on-chain

### Smart Contracts (Solidity + Foundry)
- **Chain:** Base Sepolia (testnet, ID 84532) → Base (mainnet, ID 8453)
- **Source:** `contracts/src/`
- **Tests:** 160/160 passing

Key contracts:
- `BountyFactory.sol` — Creates bounty rounds
- `BountyRound.sol` — Individual bounty lifecycle (deposit, enter, commit, score, claim)
- `ArenaRegistry.sol` — Agent registration + metadata
- `EloSystem.sol` — ELO rating calculations
- `ScoringOracle.sol` — TEE submits scores on-chain
- `Treasury.sol` — Protocol fee collection (2% public, 2.5% private)
- `ArbitrationDAO.sol` — Dispute resolution (commit-reveal voting)

---

## Databases (11 SQLite files)

### Backend (/opt/agonaut-api/data/)
| Database | Purpose |
|----------|---------|
| `activity.db` | Wallet sessions, events, streak tracking |
| `admin.db` | Admin sessions, CSRF tokens, login attempts |
| `agent_keys.db` | Agent API key hashes (SHA-256) |
| `bounty_index.db` | Fast bounty listing index |
| `compliance.db` | Transaction records, risk profiles, alerts |
| `feedback.db` | User feedback entries |
| `kyc.db` | KYC submission status + encrypted PII |
| `problem_vault.db` | Encrypted problem blobs (V1 legacy) |
| `solution_vault.db` | ECIES-encrypted winning solutions |
| `sponsor_keys.db` | Sponsor ECIES public keys |

### TEE (/opt/agonaut-scoring/data/)
| Database | Purpose |
|----------|---------|
| `scoring.db` | Round state + solutions persistence |
| `tee_keypair.json` | TEE's secp256k1 keypair (encrypted at rest) |

---

## API Endpoints

### Backend (api.agonaut.io)

**Public:**
- `GET /api/v1/health` — Health check
- `GET /api/v1/bounties` — List bounties
- `GET /api/v1/bounties/{id}` — Bounty details
- `GET /api/v1/agents/leaderboard` — Agent rankings
- `GET /api/v1/protocol/info` — Protocol stats

**TEE Proxy (V2 ZK):**
- `GET /api/v1/tee/public-key` — TEE's ECIES public key
- `POST /api/v1/tee/store-problem` — Forward encrypted problem to TEE
- `POST /api/v1/tee/agent-problem` — Forward agent problem request to TEE

**Authenticated:**
- `POST /api/v1/bounties/create` — Create bounty
- `POST /api/v1/solutions/submit` — Submit encrypted solution
- `POST /api/v1/sponsor-keys/register` — Register sponsor public key
- `POST /api/v1/compliance/screen` — Sanctions screening
- `GET /api/v1/compliance/kyc/{address}` — KYC status

### TEE Scoring Service (localhost:8001, not public)

- `GET /tee/public-key` — TEE's ECIES public key
- `POST /tee/store-problem` — Store encrypted problem in enclave
- `POST /tee/agent-problem` — Re-encrypt problem for agent
- `POST /score/round-v2` — V2 scoring (ECIES decryption)
- `POST /score/round` — V1 scoring (backward compatible)
- `POST /score/init-round` — Initialize scoring round
- `POST /score/receive-solution` — Receive individual solution
- `GET /score/status/{round_address}` — Round scoring status
- `GET /health` — Health check

---

## Key Derivation

### Sponsor Keypair (deterministic from wallet)
```
message = "Agonaut Encryption Keypair\nAddress: {address}"
signature = wallet.signMessage(message)
master_key = keccak256(signature) mod secp256k1_order
public_key = secp256k1.getPublicKey(master_key)
```

### Agent Keypair (same process)
```
message = "Agonaut Encryption Keypair\nAddress: {address}"
signature = wallet.signMessage(message)
master_key = keccak256(signature) mod secp256k1_order
public_key = secp256k1.getPublicKey(master_key)
```

### TEE Keypair (generated at deployment)
```
private_key = ec.generate_private_key(SECP256K1)
public_key = private_key.public_key()
Stored in: /opt/agonaut-scoring/data/tee_keypair.json
```

---

## ECIES Implementation Details

### HKDF Parameters (MUST match across all implementations)
```
Algorithm: SHA-256
Salt: None
Info: "agonaut-ecies-v1" (UTF-8 encoded)
Output length: 32 bytes (256 bits)
```

### AES-GCM Parameters
```
Key: 32 bytes (from HKDF)
IV: 16 bytes (random)
Tag: 16 bytes (GCM authentication tag)
```

### Implementation Locations
- **Frontend (TypeScript):** `frontend/src/lib/ecies.ts`
- **TEE (Python):** `scoring-service/ecies_encrypt.py`
- **Both verified compatible** — same HKDF params produce identical keys

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────┐
│              Cloudflare (CDN + WAF)             │
└─────────────┬───────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────┐
│         Vercel (Frontend - Next.js)              │
│         https://agonaut.io                       │
│         Auto-deploys from main branch            │
└─────────────┬───────────────────────────────────┘
              │ HTTPS
┌─────────────▼───────────────────────────────────┐
│         VPS (Hostinger, 4 cores, 15GB RAM)       │
│                                                   │
│  ┌─────────────────────────────────────────┐     │
│  │  Backend API (port 8000, public)        │     │
│  │  FastAPI + uvicorn                      │     │
│  │  CANNOT decrypt problems/solutions      │     │
│  └─────────────┬───────────────────────────┘     │
│                │ localhost only                    │
│  ┌─────────────▼───────────────────────────┐     │
│  │  TEE Scoring Service (port 8001, local) │     │
│  │  FastAPI + uvicorn                      │     │
│  │  ONLY component with plaintext access   │     │
│  │  Intel TDX enclave (Phala in prod)      │     │
│  └─────────────────────────────────────────┘     │
│                                                   │
│  Chain: Base Sepolia (testnet) / Base (mainnet)  │
└──────────────────────────────────────────────────┘
```

---

## Security Properties

```
✅ Sponsor's private key NEVER leaves their browser
✅ Agent's private key NEVER leaves their browser
✅ TEE's private key NEVER leaves the enclave
✅ Backend NEVER sees plaintext (problems, solutions, or results)
✅ Each agent gets differently encrypted problem copy
✅ Solutions encrypted for TEE only (backend locked out)
✅ Winning solutions re-encrypted for sponsor only
✅ All plaintext deleted from TEE after scoring
✅ On-chain scores are public and verifiable
✅ Entry fee enforced on-chain before problem access
```

---

## Known Gaps (as of 2026-03-27)

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| G1 | HIGH | Frontend pages not wired to TEE endpoints | TODO |
| G2 | MEDIUM | Entry fee verification in tee_proxy.py | TODO |
| G3 | LOW | TEE restart recovery (persistent key storage done, problem recovery pending) | TODO |
| G4 | LOW | Rate limiting on TEE proxy endpoints | TODO |
