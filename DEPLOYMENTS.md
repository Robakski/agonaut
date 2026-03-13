# Agonaut Deployments — Base Sepolia (Chain ID: 84532)

**V2 Deployed:** 2026-03-13 (with startCommitPhase fix)

## Proxy Addresses (use these)

| Contract | Proxy Address |
|---|---|
| ArenaRegistry | `0x4beb403789b1cc5eef1c29718a593fb9a7f19864` |
| ScoringOracle | `0xf40f73f2e187c33d1afb16284bfb1fb1fa3148aa` |
| Treasury | `0xa464f7c3161f5e21f3ba3c1e8eaab322187c7512` |
| StableRegistry | `0xc35c7b1d96f55a269e55649e7fb57aaf02c69757` |
| SeasonManager | `0xca0f3044fb4c18a590941326f6252d9e23d9e554` |
| BountyFactory | `0xD83547ccE3F11684c8A3dc12f7f4F28c67324e3a` |
| BountyMarketplace | `0x90Fa3f817079014aE82A14139d7448Fa229F1653` |
| ArbitrationDAO | `0xF9a937bf915063FdF481D08a57d276D380c7CAEB` |
| TimelockGovernor | `0x439B7b7A00edC420753c0a56E0B7DbF3419b7f00` |
| EmergencyGuardian | `0x39A2aD5c4be3bD4fAaC905aA1ff917050d6966e3` |

## Implementation Addresses

| Contract | Implementation |
|---|---|
| EloSystem | `0xce199214adaa02347a12316c0d63c35ab03dbb40` |
| BountyRound | `0x3B46604A99d65737Ccc7486e54C85Da1daedFf09` |
| Treasury | `0x40e77a08d88e17694cd8635cb305f832741ee0c4` |
| ScoringOracle | `0x1cf8f3b9956b5593ca9019c8e042c7680bac4939` |
| ArenaRegistry | `0xd332206e6da7411b728fc9168f568437c5664c17` |
| StableRegistry | `0xb5dd81ee7c9214ade24921a3e290968471fcf0d8` |
| BountyFactory | `0x2955121f78e548e4a55d61c36fbab58246367b12` |
| SeasonManager | `0x938d54b189637e08743f1b1f1a891759ea7faeef` |
| BountyMarketplace | `0xc3270ec0b85885cc28750d85c09bf83622994bd7` |
| ArbitrationDAO | `0x7774551cb7911402fbfd11b33002978ae5e1ba95` |

## Wallets

| Role | Address |
|---|---|
| Deployer (no roles) | `0x4357862Ee5e8EDCD2918742cAc9b1e2D4454B473` |
| Admin | `0x10D7dCfe54751e229B10BDfDF62cA91ae5f22B5f` |
| Operator | `0x8c35c1930CAd1224e7A1F90E9f7df5486e7489d2` |
| Scorer | `0x758719d3f12ba9779AFBBCB83b6f9E594DBEf381` |
| Guardian | `0x677394E4593Cc833e000BBB81Eb9031aD2aE0c4B` |

## Phala TEE Scoring Service

| Key | Value |
|---|---|
| CVM UUID | `b41a7fb7-1c73-4f8b-87b5-da94bb7759b6` |
| App ID | `7aad0c242730f3dda5329b3a0be6957ff2d7eb36` |
| Public URL | `https://7aad0c242730f3dda5329b3a0be6957ff2d7eb36-8001.dstack-pha-prod5.phala.network` |
| Instance | tdx.small (1 vCPU, 2 GB, $0.058/hr) |
| Dashboard | `https://cloud.phala.com/dashboard/cvms/b41a7fb7-1c73-4f8b-87b5-da94bb7759b6` |

## Notes

- EloSystem is NOT behind a proxy (deployed directly, initialized via calls)
- BountyRound implementation is used by BountyFactory to clone rounds via CREATE2
- TimelockGovernor and EmergencyGuardian are NOT proxied (deployed directly)
