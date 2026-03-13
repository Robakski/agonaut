/**
 * Minimal ABI for ScoringOracle (Base Sepolia).
 * Sourced from contracts/src/ScoringOracle.sol
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
    name: "attestationHash",
    inputs: [],
    outputs: [{ type: "bytes32", name: "" }],
    stateMutability: "view",
  },
] as const;
