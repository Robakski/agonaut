/**
 * Minimal ABI for ArenaRegistry (Base Sepolia).
 * Sourced from contracts/src/ArenaRegistry.sol
 */
export const ArenaRegistryABI = [
  {
    type: "function",
    name: "nextAgentId",
    inputs: [],
    outputs: [{ type: "uint256", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ethEntryFee",
    inputs: [],
    outputs: [{ type: "uint256", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isActive",
    inputs: [{ type: "uint256", name: "agentId" }],
    outputs: [{ type: "bool", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgent",
    inputs: [{ type: "uint256", name: "agentId" }],
    outputs: [
      {
        type: "tuple",
        name: "agent",
        components: [
          { type: "address", name: "wallet" },
          { type: "bytes32", name: "metadataHash" },
          { type: "uint64", name: "registeredAt" },
          { type: "uint64", name: "deregisteredAt" },
          { type: "uint16", name: "stableId" },
          { type: "uint16", name: "eloRating" },
          { type: "uint256", name: "totalWinnings" },
          { type: "uint32", name: "roundsEntered" },
          { type: "uint32", name: "roundsWon" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgentsByWallet",
    inputs: [{ type: "address", name: "wallet" }],
    outputs: [{ type: "uint256[]", name: "agentIds" }],
    stateMutability: "view",
  },
] as const;
