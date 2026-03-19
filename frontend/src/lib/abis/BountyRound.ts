/**
 * ABI for BountyRound (Base Sepolia).
 * Sourced from contracts/src/BountyRound.sol
 */
export const BountyRoundABI = [
  // ── Views ──
  {
    type: "function",
    name: "phase",
    inputs: [],
    outputs: [{ type: "uint8", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "sponsor",
    inputs: [],
    outputs: [{ type: "address", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "sponsorDeposit",
    inputs: [],
    outputs: [{ type: "uint256", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalPrizePool",
    inputs: [],
    outputs: [{ type: "uint256", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "entryFee",
    inputs: [],
    outputs: [{ type: "uint256", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "agentCount",
    inputs: [],
    outputs: [{ type: "uint256", name: "" }],
    stateMutability: "view",
  },
  // ── Write (sponsor only) ──
  {
    type: "function",
    name: "depositBounty",
    inputs: [],
    outputs: [],
    stateMutability: "payable",
  },
  // ── Events ──
  {
    type: "event",
    name: "BountyDeposited",
    inputs: [
      { type: "address", name: "sponsor", indexed: true },
      { type: "uint256", name: "amount", indexed: false },
    ],
  },
] as const;
