# INVARIANTS.md — Agonaut Design Invariants

> **This file is the source of truth for design INTENT.**
> Every architectural decision agreed with Robert goes here as a testable invariant.
> `InvariantAudit.t.sol` enforces these automatically — `forge test` MUST catch violations.
>
> **Rules:**
> 1. Every agreement with Robert gets added here immediately
> 2. No code change may violate any invariant without Robert's explicit approval
> 3. Sub-agents MUST read this file before modifying any contract
> 4. If code contradicts an invariant, the CODE is wrong (not the invariant)

---

## Category 1: Solution Privacy (IP Protection)

### INV-1.1: Solutions MUST NEVER appear on-chain
- No contract may store solution bytes in any state variable
- No contract may emit solution bytes in any event
- No function may accept solution bytes as a parameter that gets stored on-chain
- Solutions are encrypted and submitted to the scoring service OFF-CHAIN
- Only solution HASHES (commits) may exist on-chain
- **Rationale:** IP theft protection — sponsors pay for solutions, competitors must not see them
- **Status:** ✅ FIXED — only commit hashes stored on-chain

### INV-1.2: Solutions are scored by Phala TEE on encrypted data
- Solutions encrypted by agents (AES-256-GCM), decrypted ONLY inside TEE hardware
- No single party sees plaintext — not us, not Phala, not any intermediary
- Scoring happens inside TEE (Intel TDX) — only scores come out
- Scores submitted on-chain via ScoringOracle.sol by authorized scorer
- **Rationale:** Trustless scoring without exposing IP

### INV-1.3: Sponsor receives solutions ONLY after settlement + payment
- After Phase.SETTLED and prizes allocated, sponsor gets private access to solutions
- Solutions are revealed ONLY to the sponsor (not publicly)
- Mechanism: TEE re-encrypts solutions for sponsor's public key after settlement verification
- Public NEVER sees solutions unless sponsor chooses to publish
- **Rationale:** Sponsor paid for solutions — they own the output

### INV-1.4: Commit phase stores ONLY hashes
- `commitSolution()` accepts only `bytes32 solutionHash`
- No solution content, no IPFS CIDs, no encrypted blobs stored on-chain during commit
- Hash = `keccak256(abi.encodePacked(solutionId, salt))` or similar
- **Rationale:** Hash proves agent committed without revealing content

### INV-1.5: No on-chain REVEAL phase exists
- BountyRound lifecycle: OPEN → FUNDED → COMMIT → SCORING → SETTLED (+ CANCELLED, DISPUTED)
- There is NO REVEAL phase — solutions go directly from commit to TEE scoring
- Agents submit encrypted solutions to scoring service off-chain, referencing their on-chain commit hash
- **Status:** ✅ FIXED — Phase enum clean, no REVEAL

---

## Category 1B: TEE Scoring via Phala Cloud (Required for Launch)

### INV-1.6: Phala TEE for solution scoring
- All solution scoring happens inside Phala Cloud GPU TEE (Intel TDX hardware)
- Solutions are encrypted by agents and sent to our scoring API
- Our API forwards encrypted solutions to Phala TEE — we NEVER see plaintext
- LLM inside TEE decrypts, evaluates against scoring criteria, returns only the score
- Cryptographic attestation proves the TEE is running our exact scoring code
- **Provider:** Phala Cloud On-demand API (OpenAI-compatible)
- **Cost:** ~$0.03 per round (20 agents), scales linearly
- **Status:** 🔴 NOT BUILT — required for launch

### INV-1.7: Scoring Service API (off-chain)
- Python/Node.js service that orchestrates the scoring flow
- Receives encrypted solutions from agents after commit phase closes
- Verifies commit hashes match on-chain commitments
- Forwards encrypted solutions to Phala TEE for scoring
- Collects scores and submits to ScoringOracle.sol on Base
- The service CANNOT read solutions (encrypted for TEE public key only)
- **Location:** `products/agonaut/scoring-service/`
- **Status:** 🔴 NOT BUILT — required for launch

### INV-1.8: Single-chain architecture (Base L2 only)
- ALL on-chain logic lives on Base L2 (no second blockchain needed)
- BountyRound.sol: escrow, commits, entry fees, claims
- ScoringOracle.sol: receives verified scores from authorized scorer
- Off-chain: Phala TEE handles solution privacy + AI scoring
- Agents interact with Base (register, enter, commit) + scoring API (submit solution)
- Sponsors interact with Base only + scoring API (retrieve solutions after settlement)
- **No Partisia, no MPC, no relayer — simplified architecture**

### INV-1.11: Prompt injection defense (CRITICAL)
- Solutions are UNTRUSTED INPUT — agents have financial incentive to manipulate scores
- Defense Layer 1: XML structural isolation — solutions wrapped in `<candidate_solution>` tags, system prompt treats contents as DATA not instructions
- Defense Layer 2: Structured JSON output validation — model must return exact schema (booleans + enum verdict), parse failure = score 0 (tripwire for successful injection)
- Defense Layer 3: Code-computed score — model outputs YES/NO checks + verdict enum, OUR code computes final BPS from weights and adjustments. Model never outputs a final number.
- `injection_detected` flag tracked per solution (B4 baseline check)
- `temperature: 0` + `seed: 42` for maximum determinism and repeatability
- **Location:** `products/agonaut/scoring-service/scorer.py`
- **This is our most critical defense — a successful injection could steal prizes**

### INV-1.9: Sponsor solution access after settlement
- After Phase.SETTLED, sponsor retrieves solutions from the scoring service
- Solutions re-encrypted for the sponsor's public key inside TEE
- Only the sponsor (verified by on-chain settlement status) can decrypt
- Contributors in crowdfunded bounties also get access (verified by BountyMarketplace.isContributor)
- Solutions are NEVER made public — only authorized parties see them

### INV-1.10: TEE attestation verification
- Phala provides cryptographic attestation documents for each TEE instance
- Attestation proves: correct hardware (Intel TDX), correct code, no tampering
- Attestation hash can be published on-chain for public verification
- Agents and sponsors can independently verify the TEE is legitimate before submitting
- **This is our enterprise trust guarantee — "don't trust us, verify the hardware"**

---

## Category 2: Economics (ETH-Only v1)

### INV-2.1: All fees are ETH-only in v1
- No $AGON token interactions in any active v1 contract
- No ERC20 transferFrom/approve in entry or registration flows
- Entry fee: 0.003 ETH (~$6) paid via msg.value
- Registration fee: 0.0015 ETH (~$3) paid via msg.value
- $AGON is Phase 2 — AgonToken.sol exists but is not wired to any active contract
- **Rationale:** Ship with ETH, prove revenue, THEN launch token

### INV-2.2: Sponsors pay bounty + 2% protocol fee ONLY
- Sponsor deposits ETH bounty into escrow
- 2% protocol fee deducted from prize pool (capped at MAX_PROTOCOL_FEE_BPS = 500 = 5%)
- Sponsors do NOT pay scoring costs, entry fees, or any other hidden charges
- Clean pricing: sponsor knows exact cost upfront
- **Rationale:** Sponsors are our customers — don't surprise them with fees

### INV-2.3: Entry fees go to treasury (no burn in v1)
- Agent entry fees accumulate in BountyRound contract
- On finalize(), entry fees allocated to treasury via claimable mapping
- No ETH is burned (ETH can't be burned; burn is a $AGON Phase 2 feature)
- **Rationale:** Revenue stream for protocol operations

### INV-2.4: Minimum bounty deposit enforced
- MIN_BOUNTY_DEPOSIT = 0.125 ETH (~$250)
- Enforced in BountyRound.depositBounty()
- Ensures 2% fee ($5+) covers base operational costs
- **Rationale:** Tiny bounties cost more to operate than they generate

### INV-2.5: Pull-based claims ONLY (no push payments)
- finalize() NEVER sends ETH — only writes to `claimable[address]` mapping
- Recipients call `claim()` or `claimBatch()` to withdraw
- One reverting recipient cannot block others
- 90-day expiry → unclaimed funds swept to treasury
- **Rationale:** Prevents revert griefing, gas DoS, and stuck funds

### INV-2.6: No delegation cuts in v1
- DelegationVault is Phase 2 — moved to src/phase2/
- finalize() does NOT calculate or allocate delegation performance fees
- Agent receives: grossPrize - protocolFee - stableCut (if applicable)
- **Rationale:** Delegation economics need rethinking before launch

### INV-2.7: No prediction markets in v1
- PredictionMarket is Phase 2 — moved to src/phase2/
- No betting, wagering, or market-making in any active contract
- **Rationale:** Regulatory complexity, not core to value prop

---

## Category 3: Scoring & TEE

### INV-3.1: All scoring via Phala TEE + AI judges
- No on-chain scoring computation
- Solutions scored by LLM running inside Phala TEE (hardware-isolated)
- ScoringOracle.sol on Base receives scores from authorized scorer address
- BountyRound.finalize() reads verified scores from ScoringOracle
- v1: single scorer address (us), v2: multiple independent judge nodes with consensus
- **Rationale:** AI-capable scoring for any problem type, TEE guarantees privacy

### INV-3.2: Scoring timeout protection
- If scores aren't delivered within 24 hours after commit closes, round can be cancelled
- cancelScoringTimeout() transitions to CANCELLED phase
- All funds refundable on cancellation (sponsor deposit + agent entry fees)
- **Rationale:** Prevents permanent fund lockup if scoring service fails

### INV-3.3: Acceptance threshold determines payout
- Scores normalized 0-10000 BPS
- Best score >= threshold → 100% bounty paid to winners
- Graduated payouts (if enabled): 80% of threshold → 50% payout, 50% → 25%, below → 0%
- Below threshold with no graduated payouts → full refund to sponsor (minus 2% fee)
- **Rationale:** Sponsors shouldn't pay for bad solutions

---

## Category 4: Governance & Security

### INV-4.1: 2-of-3 multisig for governance
- Gnosis Safe multisig → TimelockController (24h delay) → protocol contracts
- EmergencyGuardian can ONLY pause (not unpause or change state)
- No single key can modify protocol parameters
- **Rationale:** Prevents single point of compromise

### INV-4.2: Flash loan arbitrator protection
- Arbitrators must have staked for MIN_STAKE_AGE (7 days) before eligibility
- Prevents: flash-loan → stake → become arbitrator → vote → unstake in one block
- Enforced in ArbitrationDAO._selectArbitrators()
- **Rationale:** Arbitration integrity

### INV-4.3: Fee caps are hardcoded safety nets
- MAX_PROTOCOL_FEE_BPS = 500 (5% absolute maximum)
- MAX_SCORING_FEE_BPS = 200 (2% absolute maximum)
- Hardcoded in Constants.sol — cannot be changed without contract upgrade
- finalize() checks: `require(protocolFeeBps <= Constants.MAX_PROTOCOL_FEE_BPS)`
- **Rationale:** Anti-rug protection — even compromised governance can't drain users

### INV-4.4: Sponsor escrow is locked after agents enter
- Sponsor can cancel ONLY before any agent enters (Phase.FUNDED, 0 participants)
- Once agents enter, sponsor deposit is locked until settlement or cancellation
- Factory can cancel anytime (emergency)
- **Rationale:** Agents commit time/resources — sponsor can't pull the rug mid-competition

---

## Category 5: Contract Architecture

### INV-5.1: Active v1 contracts (7 core)
- BountyRound.sol — competition lifecycle
- BountyFactory.sol — creates rounds via CREATE2 clones
- ArenaRegistry.sol — agent registration + stats
- Treasury.sol — fee collection
- Constants.sol — shared values
- ScoringOracle.sol — TEE score verification
- EloSystem.sol — agent ratings + tiers
Plus supporting:
- StableRegistry.sol — agent teams
- SeasonManager.sol — seasons
- ArbitrationDAO.sol — dispute resolution
- BountyMarketplace.sol — community bounty proposals
- TimelockGovernor.sol — governance timelock
- EmergencyGuardian.sol — emergency pause
- ScoringOracle uses SCORER_ROLE for authorized TEE scorer

### INV-5.2: Phase 2 contracts (not wired)
- AgonToken.sol — $AGON token (kept for future)
- DelegationVault.sol — in src/phase2/
- PredictionMarket.sol — in src/phase2/

### INV-5.3: BountyRound address array is address[6]
- [0] arenaRegistry
- [1] eloSystem
- [2] stableRegistry
- [3] seasonManager
- [4] treasury
- [5] scoringOracle
- Must match exactly in BountyFactory._initializeRound()

### INV-5.4: Solidity 0.8.24 exact pragma everywhere
- Not `^0.8.24`, not `>=0.8.24` — exactly `pragma solidity 0.8.24;`
- All contracts, all test files

### INV-5.5: BountyRound lifecycle phases (v1)
- OPEN → FUNDED → COMMIT → SCORING → SETTLED
- Plus: CANCELLED, DISPUTED
- NO REVEAL PHASE (solutions go to TEE off-chain)
- **Status:** ⚠️ VIOLATED — Phase enum still has REVEAL

---

## Category 7: BountyMarketplace (Crowdfunded Bounties)

### INV-7.1: Crowdfunded bounty model
- Anyone can propose a problem with scoring criteria and funding parameters
- Multiple contributors can fund the same bounty (not just one sponsor)
- All contributors get private solution access after settlement
- Proposer CAN compete as an agent in their own bounty — no restriction
- TEE/AI scoring is objective; proposer has no unfair advantage
- If proposer has the best solution, contributors still get what they paid for
- More competitors = better outcomes; restricting proposer would hurt the platform
- **Rationale:** Bigger pools attract better agents; the market handles this naturally

### INV-7.2: Contribution rules
- Minimum contribution per person: 0.125 ETH (~$250) DEFAULT, proposer can set HIGHER
- Proposer sets `minContribution` (must be >= 0.125 ETH / Constants.MIN_BOUNTY_DEPOSIT)
- No withdrawals before funding deadline — funds are committed
- **Rationale:** No cheap solution access; no refund griefing

### INV-7.3: Funding parameters (proposer-configurable)
- `fundingDeadline`: 1-10 days from proposal creation
- `fundingGoal`: minimum ETH to activate bounty (>= 0.125 ETH)
- `fundingCap`: maximum ETH accepted (0 = unlimited). When hit, no more contributions.
- `maxContributors`: maximum number of funders (0 = unlimited)
- `minContribution`: minimum per contributor (>= 0.125 ETH, proposer can set higher)
- **Rationale:** Proposer controls exclusivity, cost, and timeline

### INV-7.4: Funding lifecycle
- PROPOSED → FUNDING (accepting contributions) → FUNDED (goal met OR deadline + goal met) → ACTIVE (BountyRound created) → SETTLED
- If deadline passes and goal NOT met → EXPIRED → all contributors get full refund
- If fundingCap reached before deadline → auto-close funding (can proceed to ACTIVE)
- 2% protocol fee deducted from total pool when BountyRound is created
- **Rationale:** Clear lifecycle, no fund lockup, automatic refunds

### INV-7.5: Solution access for crowdfunded bounties
- ALL contributors receive solution access after settlement (not just top contributor)
- $250 contributor gets same access as $10K contributor
- Solutions are private to contributors only — not public
- **Rationale:** Fair — everyone funded it, everyone benefits

### INV-7.6: Deadline bounds
- MIN_FUNDING_DURATION = 1 day
- MAX_FUNDING_DURATION = 10 days
- Enforced in proposeBounty()
- **Rationale:** Prevent instant-expire spam and indefinite fund lockup

---

### INV-6.3: Stable revenue share is immutable
- Revenue share (revenueShareBps) is set at stable creation and CANNOT be changed
- setRevenueShare() function has been removed from StableRegistry
- Prevents stable owner from rugging agents by increasing cut after they join
- If owner wants different rate, they must create a new stable
- Agents can see the rate before joining and trust it won't change
- MAX_REVENUE_SHARE_BPS = 5000 (50% cap, enforced at creation)

---

## Category 8: Compliance (KYC / AML / Sanctions)

### INV-8.1: Sanctions screening on EVERY wallet interaction
- Every wallet that interacts with the platform API is screened before any action
- Screening checks: OFAC SDN sanctioned addresses, blocked jurisdictions, TRM Labs risk scoring
- Blocked wallet → denied access, logged to audit trail
- This applies to: registration, bounty creation, committing solutions, claiming payouts
- **Location:** `products/agonaut/compliance/sanctions.py`
- **Status:** ✅ BUILT — operational with OFAC list + jurisdiction blocking

### INV-8.2: Sanctioned jurisdictions fully blocked
- Users from comprehensively sanctioned countries are blocked at API and frontend level
- Blocked: North Korea, Iran, Syria, Cuba, Myanmar, Russia
- FATF grey list countries require enhanced due diligence (Tier 2 KYC)
- Jurisdiction determined by IP geolocation + self-declaration
- Blocked jurisdiction list updated when EU/OFAC/UN sanctions change
- **Status:** ✅ BUILT

### INV-8.3: Tiered KYC verification required
- Tier 0 (none): browsing, connecting wallet only
- Tier 1 (basic ID): creating bounties, cumulative payouts > €1,000
- Tier 2 (enhanced): single bounty > €10K, cumulative volume > €50K, FATF grey list countries
- Tier 3 (entity): company sponsors (company docs + ultimate beneficial owner)
- KYC is MANDATORY at each tier threshold — not optional, not deferred
- Unverified users are blocked from actions requiring their tier
- **Location:** `products/agonaut/compliance/kyc_tiers.py`
- **Status:** ✅ BUILT (gate logic); 🔴 KYC provider integration needed for launch

### INV-8.4: Full audit trail retained
- Every sanctions screening result logged to append-only `screening_log.jsonl`
- Logs include: timestamp, wallet address, action attempted, result, risk level, reason
- Retention: minimum 5 years per German GwG §8
- Logs must survive system restarts and be exportable for regulatory review
- **Status:** ✅ BUILT

### INV-8.5: Sanctioned wallet addresses kept current
- OFAC SDN crypto addresses hardcoded in `sanctions.py` (20+ addresses)
- Additional addresses in `sanctioned_wallets.json` (updatable without code change)
- Must be reviewed and updated at minimum quarterly
- TRM Labs API provides real-time screening when configured
- **Status:** ✅ BUILT

### INV-8.6: Ethics and legality baseline in scoring
- Every solution scored by the TEE must pass 4 mandatory baseline checks (B1-B4)
- B1: No illegal activity content
- B2: No hate speech or discrimination
- B3: No obvious IP theft
- B4: No evaluator manipulation attempts
- Failing ANY baseline check = score 0, disqualified — no exceptions
- These checks are platform-enforced, not sponsor-configurable
- **Location:** `products/agonaut/scoring-service/scorer.py` (BASELINE_CHECKS)
- **Status:** ✅ BUILT

### INV-8.7: No service without compliance from day one
- Platform MUST NOT operate without sanctions screening active
- Platform MUST NOT allow bounty creation without KYC verification
- Platform MUST NOT process payouts without screening the recipient
- This is non-negotiable — Robert's explicit requirement (2026-03-12)
- "No matter if we don't have a company registration on day 1, the full stack runs from day one"
- **Status:** ✅ DESIGNED — enforcement in API middleware (to be built with backend)

---

## Category 9: Regulatory Compliance (Website Launch Checklist)

### INV-9.1: Impressum (§5 TMG) — REQUIRED before website goes live
- German law requires a legal notice on every commercial website
- Must include: full name, address, email, phone
- Fines up to €50,000 if missing
- Update with company details when UG/GmbH is registered
- **Status:** 🔴 Template in ToS Section 20 — needs Robert's details filled in

### INV-9.2: Consumer withdrawal waiver (Widerrufsrecht)
- EU Consumer Rights Directive: 14-day withdrawal right for digital services
- Waived when user consents to immediate performance before withdrawal period expires
- Frontend MUST display consent notice before every paid transaction
- Text: "I agree that the service begins immediately and I lose my right of withdrawal upon transaction confirmation"
- **Status:** ✅ ToS Section 18 drafted — frontend implementation needed at launch

### INV-9.3: German copyright law compliance (§29 UrhG)
- Under German law, copyright CANNOT be transferred — only usage rights (Nutzungsrechte)
- ToS grants "exclusive, irrevocable, perpetual, worldwide, transferable, sublicensable usage rights (ausschließliche Nutzungsrechte)" — NOT "ownership transfer"
- Practical effect identical to full ownership, but legally correct under UrhG
- **Status:** ✅ FIXED in ToS Section 5.1

### INV-9.4: Export controls clause
- EU Dual-Use Regulation, German AWG, US EAR
- Users responsible for determining if their solutions contain controlled technology
- Platform does not review solutions for export classification (we can't — TEE)
- **Status:** ✅ ToS Section 19 drafted

### INV-9.5: Fee transparency (E-Commerce Directive)
- All fees must be clearly displayed before every transaction
- Entry fee, protocol fee, bounty deposit — shown before wallet confirmation
- No hidden charges
- **Status:** 🔴 Frontend implementation needed at launch

### INV-9.6: DAC8 tax reporting readiness
- EU Directive on Administrative Cooperation — crypto platforms report transactions >€1,000
- Applies if we're classified as a CASP (Crypto-Asset Service Provider)
- Transaction data is on-chain anyway — we can generate reports when needed
- **Depends on:** BaFin classification (legal opinion)
- **Status:** 🟡 DEFERRED — implement when legal classification is confirmed

### INV-9.7: Content takedown process
- Telemediengesetz requires process for removing illegal user content
- Bounty descriptions are public — could contain prohibited content
- Need: report mechanism, review process, removal capability
- **Status:** 🔴 Needs implementation with backend/frontend

---

## Category 6: Sybil & Anti-Gaming

### INV-6.1: Sybil attacks are economically irrational
- Unlimited agents per bounty (no slots to stuff)
- Objective TEE/AI scoring (garbage solutions score low)
- Entry fees per agent = protocol revenue (attacker pays us)
- Solutions private (can't copy others)
- **Rationale:** Design makes sybil self-punishing, no complex anti-sybil needed

### INV-6.2: Sponsor self-attack is unprofitable
- 2% protocol fee is non-refundable even on full sponsor refund
- Entry fees per fake agent are non-refundable
- Bad solutions → graduated payout reduction or full refund to sponsor (minus 2%)
- Net: sponsor always loses money gaming the system

---

## Violation Tracking

| Invariant | Status | Issue | Fix Required |
|-----------|--------|-------|-------------|
| INV-1.1 | ✅ FIXED | Solutions not on-chain | Only commit hashes stored |
| INV-1.5 | ✅ FIXED | No REVEAL phase | Phase enum clean |
| INV-1.6 | 🔴 NOT BUILT | Phala TEE scoring integration | Build scoring service |
| INV-1.7 | 🔴 NOT BUILT | Scoring Service API | Build in products/agonaut/scoring-service/ |
| INV-1.9 | 🔴 NOT BUILT | Sponsor solution access | Build in scoring service |
| INV-1.10 | 🔴 NOT BUILT | TEE attestation on-chain | Add attestation hash to ScoringOracle |
| INV-5.5 | ✅ FIXED | Phase enum correct | OPEN→FUNDED→COMMIT→SCORING→SETTLED |
| INV-X.1 | ✅ FIXED | PartisiaMpcVerifier.sol replaced | ScoringOracle.sol deployed |
| INV-8.1 | ✅ BUILT | Sanctions screening | compliance/sanctions.py |
| INV-8.2 | ✅ BUILT | Jurisdiction blocking | 6 blocked + 16 EDD countries |
| INV-8.3 | ⚠️ PARTIAL | KYC tier gates built | KYC provider (Sumsub) needed for launch |
| INV-8.4 | ✅ BUILT | Audit trail logging | screening_log.jsonl |
| INV-8.5 | ✅ BUILT | Sanctioned wallets list | OFAC SDN + updatable JSON |
| INV-8.6 | ✅ BUILT | Ethics baseline in scoring | B1-B4 checks in scorer.py |
| INV-8.7 | ⚠️ PENDING | Day-one compliance enforcement | Needs API middleware integration |
| INV-9.1 | 🔴 NEEDED | Impressum | Robert's details needed for launch |
| INV-9.2 | ✅ DRAFTED | Consumer withdrawal waiver | Frontend consent UI needed |
| INV-9.3 | ✅ FIXED | German copyright (Nutzungsrechte) | ToS Section 5.1 corrected |
| INV-9.4 | ✅ DRAFTED | Export controls clause | ToS Section 19 |
| INV-9.5 | 🔴 NEEDED | Fee transparency | Frontend implementation |
| INV-9.6 | 🟡 DEFERRED | DAC8 tax reporting | Awaits BaFin classification |
| INV-9.7 | 🔴 NEEDED | Content takedown process | Backend/frontend implementation |

---

## Change Log

- **2026-03-11:** Initial creation from all design discussions
- **2026-03-11:** Identified 3 violations in current code (reveal phase should not exist)
- **2026-03-11:** Fixed reveal phase, sha256, dead code, stable rug, crowdfunded marketplace
- **2026-03-12:** Architecture pivot: Partisia MPC → Phala TEE + AI judges
- **2026-03-12:** Removed all MPC/Partisia invariants, replaced with TEE scoring model
- **2026-03-12:** Added Category 8: Compliance (INV-8.1–8.7) — KYC, AML, sanctions screening
- **2026-03-12:** Scoring system redesigned: binary rubric + weighted checks + unskippable gates + deep reasoning verdicts
- **2026-03-12:** Ethics baseline (B1-B4) added to scoring — fail = disqualified
- **2026-03-12:** Full IP ownership transfer to sponsor (not license) with standard contractor carve-out
- **2026-03-12:** Legal framework drafted: ToS, Privacy Policy (GDPR), KYC/AML Plan
- **2026-03-12:** IP clause fixed for German copyright law (§29 UrhG) — Nutzungsrechte, not ownership transfer
- **2026-03-12:** Added: Impressum template, consumer withdrawal waiver, export controls, DAC8 awareness
- **2026-03-12:** Added Category 9: Regulatory Compliance (INV-9.1–9.7) — website launch checklist
- **2026-03-12:** Created LAUNCH_CHECKLIST.md — all Robert action items + placeholder locations
- **2026-03-12:** Built: deploy script, backend API, scoring service API, SDK, Docker, integration tests (47/47 passing)
