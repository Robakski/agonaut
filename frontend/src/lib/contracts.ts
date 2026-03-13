/**
 * Contract addresses and ABIs for Agonaut on Base.
 * Deployed: 2026-03-13 on Base Sepolia (chain ID: 84532)
 */

import { type Address } from "viem";

// ── Chain Config ──
export const BASE_SEPOLIA_ID = 84532;
export const BASE_MAINNET_ID = 8453;
export const ACTIVE_CHAIN_ID = BASE_SEPOLIA_ID;

// ── Contract Addresses (Base Sepolia Testnet) ──
// V2 Redeployed: 2026-03-13 with startCommitPhase fix
export const CONTRACTS = {
  arenaRegistry:      "0x4beb403789b1cc5eef1c29718a593fb9a7f19864" as Address,
  eloSystem:          "0xce199214adaa02347a12316c0d63c35ab03dbb40" as Address,
  stableRegistry:     "0xc35c7b1d96f55a269e55649e7fb57aaf02c69757" as Address,
  seasonManager:      "0xca0f3044fb4c18a590941326f6252d9e23d9e554" as Address,
  treasury:           "0xa464f7c3161f5e21f3ba3c1e8eaab322187c7512" as Address,
  scoringOracle:      "0xf40f73f2e187c33d1afb16284bfb1fb1fa3148aa" as Address,
  bountyRoundImpl:    "0x3B46604A99d65737Ccc7486e54C85Da1daedFf09" as Address,
  bountyFactory:      "0xD83547ccE3F11684c8A3dc12f7f4F28c67324e3a" as Address,
  bountyMarketplace:  "0x90Fa3f817079014aE82A14139d7448Fa229F1653" as Address,
  arbitrationDao:     "0xF9a937bf915063FdF481D08a57d276D380c7CAEB" as Address,
  timelockGovernor:   "0x439B7b7A00edC420753c0a56E0B7DbF3419b7f00" as Address,
  emergencyGuardian:  "0x39A2aD5c4be3bD4fAaC905aA1ff917050d6966e3" as Address,
} as const;

// ── Explorer ──
export const BASESCAN_URL = "https://sepolia.basescan.org";
export const getExplorerUrl = (address: Address) =>
  `${BASESCAN_URL}/address/${address}`;

// ── API ──
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// ── Constants (matching Solidity) ──
export const ENTRY_FEE = 0.003;           // ETH
export const REGISTRATION_FEE = 0.0015;  // ETH
export const MIN_BOUNTY_DEPOSIT = 0.125; // ETH
export const PROTOCOL_FEE_BPS = 200;     // 2%
export const BPS_DENOMINATOR = 10000;

// ── Tier Names ──
export const TIER_NAMES = ["Bronze", "Silver", "Gold", "Diamond", "Prometheus"] as const;

// ── Phase Names ──
export const PHASE_NAMES = {
  0: "Open",
  1: "Funded",
  2: "Commit",
  3: "Scoring",
  4: "Settled",
  5: "Cancelled",
  6: "Disputed",
} as const;
