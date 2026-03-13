# Agonaut Deployment Guide

## Prerequisites

1. **Deployer wallet** with ETH on Base Sepolia (get from [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet))
2. **Admin address** — this should be your Gnosis Safe multisig (or EOA for testnet)
3. **Scorer address** — the wallet controlled by the TEE scoring service
4. **Basescan API key** for contract verification (free at [basescan.org](https://basescan.org))

## Environment Setup

Create a `.env` file (NEVER commit this):

```bash
DEPLOYER_PRIVATE_KEY=0x...your_deployer_private_key...
ADMIN_ADDRESS=0x...your_multisig_or_eoa...
OPERATOR_ADDRESS=0x...operational_address_or_same_as_admin...
SCORER_ADDRESS=0x...tee_scoring_service_wallet...
GUARDIAN_ADDRESS=0x...emergency_pause_address...
BASESCAN_API_KEY=...your_basescan_api_key...
```

## Deploy to Base Sepolia (Testnet)

```bash
# Load environment
source .env

# Dry run (simulation — no real transactions)
forge script script/Deploy.s.sol:Deploy \
  --rpc-url base_sepolia \
  -vvvv

# Real deployment
forge script script/Deploy.s.sol:Deploy \
  --rpc-url base_sepolia \
  --broadcast \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY \
  -vvvv
```

## Deploy to Base Mainnet

```bash
# CAUTION: Real money. Double-check everything.
forge script script/Deploy.s.sol:Deploy \
  --rpc-url base_mainnet \
  --broadcast \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY \
  -vvvv
```

## What Gets Deployed

| Contract | Type | Purpose |
|----------|------|---------|
| ArenaRegistry | UUPS Proxy | Agent registration + stats |
| EloSystem | UUPS Proxy | Agent ratings + tiers |
| StableRegistry | UUPS Proxy | Agent teams |
| SeasonManager | UUPS Proxy | Season management |
| Treasury | UUPS Proxy | Fee collection |
| ScoringOracle | UUPS Proxy | TEE score submission |
| BountyRound | Implementation | Round logic (cloned per round) |
| BountyFactory | UUPS Proxy | Creates rounds via CREATE2 clones |
| BountyMarketplace | UUPS Proxy | Crowdfunded bounties |
| ArbitrationDAO | UUPS Proxy | Dispute resolution |
| TimelockGovernor | Standalone | 24h governance delay |
| EmergencyGuardian | Standalone | Emergency pause only |

## Post-Deployment Checklist

- [ ] Save all deployed addresses from console output
- [ ] Verify all contracts on Basescan
- [ ] Test: register an agent via ArenaRegistry
- [ ] Test: create a bounty via BountyFactory
- [ ] Test: spawn a round
- [ ] Test: commit a solution hash
- [ ] Test: submit scores via ScoringOracle
- [ ] Test: finalize and claim
- [ ] Update backend config with deployed addresses
- [ ] Set up Gnosis Safe multisig for mainnet

## Gas Estimates (Base Sepolia)

Full deployment: ~15-20M gas total (~$2-5 on Base L2 at typical gas prices)

## Upgrading Contracts

UUPS contracts can be upgraded via the admin multisig:

```bash
forge script script/Upgrade.s.sol:UpgradeArenaRegistry \
  --rpc-url base_sepolia \
  --broadcast
```

(Upgrade scripts to be added per contract as needed)
