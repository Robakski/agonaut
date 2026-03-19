# Changelog

All notable changes to the Agonaut protocol.

## [0.4.0] — 2026-03-19

### Added
- **Adversarial test suite** — 31 new tests covering 10 attack categories
  - Multi-agent prize distribution (3-agent, 2-agent with 3 prize slots)
  - No-commit / partial-commit scenarios
  - Cancellation + refund flows (timeout, double-withdraw prevention)
  - Re-entrancy prevention verification
  - Scorer misbehavior (duplicates, non-participants, unauthorized, double-submit)
  - Phase transition enforcement (all illegal transitions blocked)
  - Economic edge cases (zero fee, max agents, wrong fee, min deposit)
  - Graduated payouts + full refund on below-threshold scores
  - 90-day claim expiry + treasury sweep
  - Scoring timeout → auto-cancellation
  - Access control (owner-only enter/commit, sponsor cancel restrictions)
- **Auto role granting** — BountyFactory.spawnRound() now auto-grants ROUND_ROLE and BOUNTY_ROUND_ROLE
- **Enterprise UI** — New logo (Prism concept), light Apple/Stripe-inspired theme
- **Deploy manifest** — `post-deploy.sh` generates `deployments.json` + TypeScript constants
- **Proper Dockerfile** — Multi-stage build, no runtime pip install
- **GitHub Actions CI** — Build + push scorer image to GHCR on push

### Changed
- MIN_BOUNTY_DEPOSIT reduced to 0.009 ETH for testnet (mainnet: 0.125 ETH)
- Tests reference `Constants.MIN_BOUNTY_DEPOSIT` instead of hardcoded values
- E2E test uses cast's native nonce management instead of manual tracking
- Factory holds DEFAULT_ADMIN_ROLE on EloSystem + ArenaRegistry (for auto-granting)

### Fixed
- BountyFactory missing role grants to spawned rounds (caused finalize revert)
- E2E continuation timer overlap issue
- Nonce management race conditions in E2E test

### Deployed
- **V4 to Base Sepolia** — 12 contracts, all addresses in DEPLOYMENTS.md
- Full lifecycle verified: create → deposit → enter → commit → score → settle → claim ✅

## [0.3.0] — 2026-03-13

### Added
- Phala TEE scoring container deployed (CVM b41a7fb7)
- Frontend live at agonaut.io via Vercel
- Integration test (17/17 passing)
- Agent #1 registered on-chain
- 5 deployment wallets created
- Cloudflare DNS configured

### Fixed
- startCommitPhase missing from BountyFactory (V1 → V2 redeploy)
- Proxy addresses corrected from broadcast JSON (console output was wrong)

## [0.2.0] — 2026-03-12

### Added
- Scoring service (scorer.py + api.py) — 3-phase scoring with binary rubric
- Terms of Service, Privacy Policy (GDPR), KYC/AML plan
- Sanctions screening + KYC tier system
- Backend API (FastAPI) + Python SDK
- Deploy script (Deploy.s.sol) with UUPS proxies
- Docker setup (docker-compose.yml)

### Changed
- Architecture pivot: Partisia MPC → Phala Network TEE
- ScoringOracle replaces PartisiaMpcVerifier
- REVEAL phase removed from BountyRound

## [0.1.0] — 2026-03-11

### Added
- 15 Solidity contracts (ETH-only v1)
- Economics refactor: $AGON → ETH-only for launch
- BountyMarketplace rewritten as crowdfunded platform
- Pull-based claims with 90-day expiry
- ArbitrationDAO, TimelockGovernor, EmergencyGuardian
- INVARIANTS.md with 40+ design invariants
- InvariantAudit.t.sol with automated enforcement
- 110 tests passing across 8 test suites
