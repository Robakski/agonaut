/**
 * ABI for BountyFactory (Base Sepolia).
 * Sourced from contracts/src/BountyFactory.sol
 */
export const BountyFactoryABI = [
  // ── Views ──
  {
    type: "function",
    name: "nextBountyId",
    inputs: [],
    outputs: [{ type: "uint256", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBounty",
    inputs: [{ type: "uint256", name: "bountyId" }],
    outputs: [
      {
        type: "tuple",
        name: "config",
        components: [
          { type: "bytes32", name: "problemCid" },
          { type: "uint256", name: "entryFee" },
          { type: "uint32", name: "commitDuration" },
          { type: "uint16[]", name: "prizeDistribution" },
          { type: "uint8", name: "maxAgents" },
          { type: "uint8", name: "tier" },
          { type: "uint16", name: "acceptanceThreshold" },
          { type: "bool", name: "graduatedPayouts" },
          { type: "bool", name: "active" },
          { type: "uint64", name: "createdAt" },
          { type: "address", name: "creator" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRoundCount",
    inputs: [{ type: "uint256", name: "bountyId" }],
    outputs: [{ type: "uint256", name: "count" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRoundAddress",
    inputs: [
      { type: "uint256", name: "bountyId" },
      { type: "uint256", name: "roundIndex" },
    ],
    outputs: [{ type: "address", name: "roundAddr" }],
    stateMutability: "view",
  },
  // ── Write (role-gated: BOUNTY_CREATOR_ROLE) ──
  {
    type: "function",
    name: "createBounty",
    inputs: [
      {
        type: "tuple",
        name: "config",
        components: [
          { type: "bytes32", name: "problemCid" },
          { type: "uint256", name: "entryFee" },
          { type: "uint32", name: "commitDuration" },
          { type: "uint16[]", name: "prizeDistribution" },
          { type: "uint8", name: "maxAgents" },
          { type: "uint8", name: "tier" },
          { type: "uint16", name: "acceptanceThreshold" },
          { type: "bool", name: "graduatedPayouts" },
          { type: "bool", name: "active" },
          { type: "uint64", name: "createdAt" },
          { type: "address", name: "creator" },
        ],
      },
    ],
    outputs: [{ type: "uint256", name: "bountyId" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "spawnRound",
    inputs: [{ type: "uint256", name: "bountyId" }],
    outputs: [{ type: "address", name: "roundAddr" }],
    stateMutability: "nonpayable",
  },
  // ── Events ──
  {
    type: "event",
    name: "BountyCreated",
    inputs: [
      { type: "uint256", name: "bountyId", indexed: true },
      { type: "address", name: "creator", indexed: true },
      { type: "bytes32", name: "problemCid", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RoundSpawned",
    inputs: [
      { type: "uint256", name: "bountyId", indexed: true },
      { type: "uint256", name: "roundIndex", indexed: true },
      { type: "address", name: "roundAddr", indexed: false },
    ],
  },
] as const;
