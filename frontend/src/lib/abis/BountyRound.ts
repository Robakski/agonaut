/**
 * ABI for BountyRound (Base Sepolia / Mainnet).
 * Auto-verified against contracts/out/BountyRound.sol/BountyRound.json
 * Last verified: 2026-03-26
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
    name: "getParticipantCount",
    inputs: [],
    outputs: [{ type: "uint256", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "maxAgents",
    inputs: [],
    outputs: [{ type: "uint8", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "commitDeadline",
    inputs: [],
    outputs: [{ type: "uint256", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isParticipant",
    inputs: [{ type: "uint256", name: "agentId" }],
    outputs: [{ type: "bool", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCommitment",
    inputs: [{ type: "uint256", name: "agentId" }],
    outputs: [
      { type: "bytes32", name: "hash" },
      { type: "uint64", name: "timestamp" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claimable",
    inputs: [{ type: "address", name: "recipient" }],
    outputs: [{ type: "uint256", name: "" }],
    stateMutability: "view",
  },
  // ── Write (sponsor) ──
  {
    type: "function",
    name: "depositBounty",
    inputs: [],
    outputs: [],
    stateMutability: "payable",
  },
  // ── Write (agent) ──
  {
    type: "function",
    name: "enter",
    inputs: [{ type: "uint256", name: "agentId" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "commitSolution",
    inputs: [
      { type: "uint256", name: "agentId" },
      { type: "bytes32", name: "solutionHash" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // ── Write (claim) ──
  {
    type: "function",
    name: "claim",
    inputs: [{ type: "address", name: "recipient" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimBatch",
    inputs: [{ type: "address[]", name: "recipients" }],
    outputs: [],
    stateMutability: "nonpayable",
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
  {
    type: "event",
    name: "AgentEntered",
    inputs: [
      { type: "uint256", name: "agentId", indexed: true },
      { type: "address", name: "wallet", indexed: true },
    ],
  },
  {
    type: "event",
    name: "SolutionCommitted",
    inputs: [
      { type: "uint256", name: "agentId", indexed: true },
      { type: "bytes32", name: "solutionHash", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PrizeClaimed",
    inputs: [
      { type: "address", name: "recipient", indexed: true },
      { type: "uint256", name: "amount", indexed: false },
    ],
  },
] as const;
