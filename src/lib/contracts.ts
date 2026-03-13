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
export const CONTRACTS = {
  arenaRegistry:      "0xE068f2E4D86a0dD244e3d3Cd26Dd643Ce781F0fc" as Address,
  eloSystem:          "0xd14B475eB6886e0FfcC5B8cD9F976eeaD194cF77" as Address,
  stableRegistry:     "0x9b41997435d4B4806E34C1673b52149A4DEef728" as Address,
  seasonManager:      "0xc96597A38E08B5562DAd0C9461E73452D31DAa62" as Address,
  treasury:           "0x4352C3544DB832065a465f412B5C68B6FE17a4F4" as Address,
  scoringOracle:      "0x67F015168061645152D180c4bEea3f861eCCb523" as Address,
  bountyRoundImpl:    "0x21820abE0AEc0b467Fb2E24808979F810066485b" as Address,
  bountyFactory:      "0x8CbD4904d9AD691D779Bc3700e4Bb0ad0A7B1300" as Address,
  bountyMarketplace:  "0x6A7E4887Fc285B5A6880EaB18bB9C6A668A213c3" as Address,
  arbitrationDao:     "0xE42f1B74deF83086E034FB0d83e75A444Aa54586" as Address,
  timelockGovernor:   "0x28477aB4838e0e2dcd004fabeaDE5d862325F53d" as Address,
  emergencyGuardian:  "0x66c25D62eccED201Af8EBeefe8A001035640d8E8" as Address,
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
