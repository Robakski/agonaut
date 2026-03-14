/**
 * Contract addresses and config for Agonaut on Base.
 *
 * Addresses are AUTO-GENERATED from the deploy broadcast.
 * To update: run `bash contracts/script/post-deploy.sh <chainId>`
 * Never edit contracts.generated.ts manually.
 */

// Re-export all generated addresses
export { CONTRACTS, WALLETS, CHAIN_ID, CHAIN_NAME, RPC_URL, DEPLOYED_AT } from "./contracts.generated";

import { type Address } from "viem";

// ── Chain Config ──
export const BASE_SEPOLIA_ID = 84532;
export const BASE_MAINNET_ID = 8453;
export const ACTIVE_CHAIN_ID = BASE_SEPOLIA_ID;

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
