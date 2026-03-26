#!/bin/bash
# sync-abis.sh — Extract ABIs from compiled contracts and generate typed files
#
# Run after any Solidity change:
#   cd contracts && forge build && cd .. && bash scripts/sync-abis.sh
#
# This eliminates hand-written ABI drift (root cause of 6+ critical bugs).

set -euo pipefail

CONTRACTS_OUT="contracts/out"
BACKEND_CHAIN="backend/services/chain.py"
FRONTEND_ABIS="frontend/src/lib/abis"
SCORING_ONCHAIN="scoring-service/onchain.py"

echo "🔧 Syncing ABIs from compiled contracts..."

# Extract full ABIs as JSON
for contract in BountyFactory BountyRound ArenaRegistry ScoringOracle BountyMarketplace; do
  SRC="${CONTRACTS_OUT}/${contract}.sol/${contract}.json"
  if [ -f "$SRC" ]; then
    jq '.abi' "$SRC" > "abis/${contract}.json"
    echo "  ✅ ${contract}.json"
  else
    echo "  ⚠️  ${contract} not found in ${CONTRACTS_OUT}"
  fi
done

echo ""
echo "📋 ABI files written to abis/"
echo ""
echo "Next steps:"
echo "  1. Review abis/*.json for any unexpected changes"
echo "  2. Update backend/services/chain.py inline ABIs"
echo "  3. Update frontend/src/lib/abis/*.ts"
echo "  4. Update scoring-service/onchain.py"
echo ""
echo "⚠️  IMPORTANT: After updating, run:"
echo "    cd frontend && npx next build"
echo "    cd ../contracts && forge test --summary"
echo "  to verify nothing broke."
