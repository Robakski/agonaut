#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CAST=~/.foundry/bin/cast
RPC="https://sepolia.base.org"
CHAIN=84532

source "$PROJECT_ROOT/contracts/.env"
STATE=$(cat "$SCRIPT_DIR/e2e_state.json")
ROUND_ADDR=$(echo "$STATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['roundAddr'])")

DEPLOY_JSON="$PROJECT_ROOT/deployments.json"
SCORING_ORACLE=$(python3 -c "
import json
with open('$DEPLOY_JSON') as f: d = json.load(f)
c = d['contracts']['scoringOracle']
print(c.get('proxy', c.get('address', '')))
")

echo "Continuing E2E — Round: $ROUND_ADDR"
echo "ScoringOracle: $SCORING_ORACLE"

cast_send() {
    local to="$1"; shift
    local result=$($CAST send "$to" "$@" --rpc-url "$RPC" --chain "$CHAIN" --json 2>&1)
    local exit_code=$?
    sleep 6
    if [ $exit_code -ne 0 ]; then echo "TX_ERROR: $result"; return 1; fi
    local status=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','0x0'))" 2>/dev/null)
    if [ "$status" = "0x1" ]; then echo "$result"; return 0; else echo "TX_REVERTED: $result"; return 1; fi
}

# Step 7: Start Scoring
echo "▸ Step 7: Starting scoring phase..."
TX=$(cast_send "$ROUND_ADDR" "startScoringPhase()" --private-key "$OPERATOR_PRIVATE_KEY" 2>&1)
if [ $? -eq 0 ]; then echo "  ✅ Start scoring"; else echo "  ❌ Start scoring: $TX"; exit 1; fi

PHASE=$($CAST call "$ROUND_ADDR" "phase()" --rpc-url "$RPC" | $CAST to-dec)
echo "  Phase: $PHASE (expect 3=SCORING)"

# Step 8: Submit Scores
echo "▸ Step 8: Submitting scores..."
TX=$(cast_send "$SCORING_ORACLE" "submitScores(address,uint256[],uint256[])" "$ROUND_ADDR" "[1]" "[8000]" --private-key "$SCORER_PRIVATE_KEY" 2>&1)
if [ $? -eq 0 ]; then echo "  ✅ Submit scores (8000 BPS)"; else echo "  ❌ Submit scores: $TX"; exit 1; fi

VERIFIED=$($CAST call "$SCORING_ORACLE" "isResultVerified(address)" "$ROUND_ADDR" --rpc-url "$RPC")
echo "  Verified: $VERIFIED"

# Step 9: Finalize
echo "▸ Step 9: Finalizing..."
TX=$(cast_send "$ROUND_ADDR" "finalize()" --private-key "$OPERATOR_PRIVATE_KEY" 2>&1)
if [ $? -eq 0 ]; then echo "  ✅ Finalize"; else echo "  ❌ Finalize: $TX"; exit 1; fi

PHASE=$($CAST call "$ROUND_ADDR" "phase()" --rpc-url "$RPC" | $CAST to-dec)
echo "  Phase: $PHASE (expect 4=SETTLED)"

# Step 10: Claim
echo "▸ Step 10: Claiming..."
CLAIMABLE=$($CAST call "$ROUND_ADDR" "getClaimable(address)" "$OPERATOR_ADDRESS" --rpc-url "$RPC" | $CAST to-dec)
echo "  Claimable: $CLAIMABLE wei"

if [ "$CLAIMABLE" -gt 0 ] 2>/dev/null; then
    TX=$(cast_send "$ROUND_ADDR" "claim(address)" "$OPERATOR_ADDRESS" --private-key "$OPERATOR_PRIVATE_KEY" 2>&1)
    if [ $? -eq 0 ]; then echo "  ✅ Claim successful!"; else echo "  ❌ Claim: $TX"; fi
else
    echo "  ⚠️ Nothing claimable"
fi

echo ""
echo "🎉 FULL LIFECYCLE COMPLETE!"
