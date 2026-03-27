/**
 * ABI for ScoringOracle (Base Sepolia).
 * Sourced from forge build output via scripts/sync-abis.sh
 */
export const ScoringOracleABI = [
  {
    type: "function",
    name: "SCORER_ROLE",
    inputs: [],
    outputs: [{ type: "bytes32", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isResultVerified",
    inputs: [{ type: "address", name: "roundAddr" }],
    outputs: [{ type: "bool", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getScores",
    inputs: [{ type: "address", name: "roundAddr" }],
    outputs: [
      { type: "uint256[]", name: "agentIds" },
      { type: "uint256[]", name: "scores" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgentScore",
    inputs: [
      { type: "address", name: "roundAddr" },
      { type: "uint256", name: "agentId" },
    ],
    outputs: [
      { type: "uint256", name: "score" },
      { type: "bool", name: "found" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "attestationHash",
    inputs: [],
    outputs: [{ type: "bytes32", name: "" }],
    stateMutability: "view",
  },
] as const;
