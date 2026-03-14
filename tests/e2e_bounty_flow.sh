#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  Agonaut E2E Test — Full Bounty Lifecycle on Base Sepolia
#  Creates bounty → deposits → enters → commits → scores → settles → claims
#
#  Reads contract addresses from deployments.json (single source of truth)
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CAST=~/.foundry/bin/cast
RPC="https://sepolia.base.org"
CHAIN=84532
DEPLOY_JSON="$PROJECT_ROOT/deployments.json"

# ── Read addresses from deploy manifest ──
if [ ! -f "$DEPLOY_JSON" ]; then
    echo "❌ deployments.json not found. Run: bash contracts/script/post-deploy.sh"
    exit 1
fi

addr() {
    python3 -c "
import json
with open('$DEPLOY_JSON') as f: d = json.load(f)
c = d['contracts']['$1']
print(c.get('proxy', c.get('address', '')))
"
}

BOUNTY_FACTORY=$(addr bountyFactory)
ARENA_REGISTRY=$(addr arenaRegistry)
SCORING_ORACLE=$(addr scoringOracle)
TREASURY=$(addr treasury)

echo "Loaded from deployments.json:"
echo "  BountyFactory:  $BOUNTY_FACTORY"
echo "  ArenaRegistry:  $ARENA_REGISTRY"
echo "  ScoringOracle:  $SCORING_ORACLE"
echo "  Treasury:       $TREASURY"

# ── Wallets ──
source "$PROJECT_ROOT/contracts/.env"
OPERATOR="$OPERATOR_ADDRESS"
OPERATOR_PK="$OPERATOR_PRIVATE_KEY"
SCORER="$SCORER_ADDRESS"
SCORER_PK="$SCORER_PRIVATE_KEY"
DEPLOYER="$DEPLOYER_ADDRESS"
DEPLOYER_PK="$DEPLOYER_PRIVATE_KEY"

# ── Test framework ──
PASS=0
FAIL=0
SKIP=0

run_test() {
    local name="$1" result="$2"
    case "$result" in
        PASS) echo "  ✅ $name"; PASS=$((PASS+1)) ;;
        SKIP*) echo "  ⏭️  $name — ${result#SKIP: }"; SKIP=$((SKIP+1)) ;;
        *) echo "  ❌ $name — $result"; FAIL=$((FAIL+1)) ;;
    esac
}

# ── Send transaction with nonce management ──
# Waits for tx confirmation before returning, ensuring sequential nonce usage
cast_send() {
    local to="$1"; shift
    local result
    result=$($CAST send "$to" "$@" --rpc-url "$RPC" --chain "$CHAIN" --json 2>&1)
    local exit_code=$?

    if [ $exit_code -ne 0 ]; then
        echo "TX_ERROR: $result"
        return 1
    fi

    # Extract status (handle both jq available and not)
    local status
    if command -v jq &>/dev/null; then
        status=$(echo "$result" | jq -r '.status // "0x0"')
    else
        status=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','0x0'))" 2>/dev/null || echo "0x0")
    fi

    if [ "$status" = "0x1" ]; then
        echo "$result"
        return 0
    else
        echo "TX_REVERTED: $result"
        return 1
    fi
}

echo ""
echo "═══════════════════════════════════════════════════"
echo "  AGONAUT E2E TEST — Full Bounty Lifecycle"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Pre-flight ──
echo "▸ Pre-flight checks..."
OPERATOR_BAL=$($CAST balance "$OPERATOR" --rpc-url "$RPC" --ether)
echo "  Operator balance: $OPERATOR_BAL ETH"

SCORER_BAL=$($CAST balance "$SCORER" --rpc-url "$RPC")
if [ "$SCORER_BAL" = "0" ]; then
    echo "  Funding scorer from deployer..."
    cast_send "$SCORER" --value 0.01ether --private-key "$DEPLOYER_PK" > /dev/null 2>&1
    echo "  Scorer funded with 0.01 ETH"
fi

# Check if we have enough for deposit (0.125 ETH + gas)
OPERATOR_WEI=$($CAST balance "$OPERATOR" --rpc-url "$RPC")
MIN_NEEDED=130000000000000000  # 0.13 ETH
if [ "$OPERATOR_WEI" -lt "$MIN_NEEDED" ] 2>/dev/null; then
    echo "  ⚠️  Operator has $OPERATOR_BAL ETH — need at least 0.13 ETH"
    echo "  Get testnet ETH from: https://faucet.quicknode.com/base/sepolia"
    echo "  Address: $OPERATOR"
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "  BLOCKED: Insufficient testnet ETH"
    echo "═══════════════════════════════════════════════════"
    exit 1
fi

# Check agent is registered
NEXT_AGENT=$($CAST call "$ARENA_REGISTRY" "nextAgentId()" --rpc-url "$RPC" | $CAST to-dec)
if [ "$NEXT_AGENT" -le 1 ]; then
    echo "  No agents registered. Registering Agent #1..."
    cast_send "$ARENA_REGISTRY" \
        "registerWithETH(bytes32)" \
        "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" \
        --value 0.0015ether --private-key "$OPERATOR_PK" > /dev/null 2>&1
    echo "  Agent #1 registered"
fi

# ─── Step 1: Create Bounty ───
echo ""
echo "▸ Step 1: Creating bounty..."
TX=$(cast_send "$BOUNTY_FACTORY" \
    "createBounty((bytes32,uint256,uint32,uint16[],uint8,uint8,uint16,bool,bool,uint64,address))" \
    "(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef,3000000000000000,3600,[10000],10,0,5000,true,false,0,0x0000000000000000000000000000000000000000)" \
    --private-key "$OPERATOR_PK" 2>&1)

if [ $? -eq 0 ]; then
    run_test "Create bounty" "PASS"
else
    run_test "Create bounty" "FAILED: $TX"
    exit 1
fi

BOUNTY_ID=$($CAST call "$BOUNTY_FACTORY" "nextBountyId()" --rpc-url "$RPC" | $CAST to-dec)
BOUNTY_ID=$((BOUNTY_ID - 1))
echo "  Bounty ID: $BOUNTY_ID"

# ─── Step 2: Spawn Round ───
echo ""
echo "▸ Step 2: Spawning round..."
TX=$(cast_send "$BOUNTY_FACTORY" "spawnRound(uint256)" "$BOUNTY_ID" \
    --private-key "$OPERATOR_PK" 2>&1)

if [ $? -eq 0 ]; then
    run_test "Spawn round" "PASS"
else
    run_test "Spawn round" "FAILED: $TX"
    exit 1
fi

# Get round address from deploy manifest's predictRoundAddress
ROUND_ADDR=$($CAST call "$BOUNTY_FACTORY" \
    "predictRoundAddress(uint256,uint256)" "$BOUNTY_ID" 0 --rpc-url "$RPC" 2>&1)
ROUND_ADDR=$(echo "$ROUND_ADDR" | sed 's/0x000000000000000000000000/0x/')
echo "  Round: $ROUND_ADDR"

PHASE=$($CAST call "$ROUND_ADDR" "phase()" --rpc-url "$RPC" | $CAST to-dec)
run_test "Phase = OPEN (0)" "$([ "$PHASE" -eq 0 ] && echo PASS || echo "FAIL: phase=$PHASE")"

# ─── Step 3: Deposit Bounty ───
echo ""
echo "▸ Step 3: Depositing 0.125 ETH..."
TX=$(cast_send "$ROUND_ADDR" "depositBounty()" --value 0.125ether \
    --private-key "$OPERATOR_PK" 2>&1)

if [ $? -eq 0 ]; then
    run_test "Deposit bounty" "PASS"
else
    run_test "Deposit bounty" "FAILED: $TX"
    exit 1
fi

PHASE=$($CAST call "$ROUND_ADDR" "phase()" --rpc-url "$RPC" | $CAST to-dec)
run_test "Phase = FUNDED (1)" "$([ "$PHASE" -eq 1 ] && echo PASS || echo "FAIL: phase=$PHASE")"

# ─── Step 4: Enter as Agent ───
echo ""
echo "▸ Step 4: Agent #1 entering..."
TX=$(cast_send "$ROUND_ADDR" "enter(uint256)" 1 --value 0.003ether \
    --private-key "$OPERATOR_PK" 2>&1)

if [ $? -eq 0 ]; then
    run_test "Agent enter" "PASS"
else
    run_test "Agent enter" "FAILED: $TX"
fi

# ─── Step 5: Start Commit Phase ───
echo ""
echo "▸ Step 5: Starting commit phase..."
TX=$(cast_send "$BOUNTY_FACTORY" "startCommitPhase(uint256,uint256)" "$BOUNTY_ID" 0 \
    --private-key "$OPERATOR_PK" 2>&1)

if [ $? -eq 0 ]; then
    run_test "Start commit phase" "PASS"
else
    run_test "Start commit phase" "FAILED: $TX"
fi

PHASE=$($CAST call "$ROUND_ADDR" "phase()" --rpc-url "$RPC" | $CAST to-dec)
run_test "Phase = COMMIT (2)" "$([ "$PHASE" -eq 2 ] && echo PASS || echo "FAIL: phase=$PHASE")"

# ─── Step 6: Commit Solution ───
echo ""
echo "▸ Step 6: Committing solution hash..."
SOLUTION_HASH=$($CAST keccak "test-solution-for-agonaut-e2e-0xdeadbeef")

TX=$(cast_send "$ROUND_ADDR" "commitSolution(uint256,bytes32)" 1 "$SOLUTION_HASH" \
    --private-key "$OPERATOR_PK" 2>&1)

if [ $? -eq 0 ]; then
    run_test "Commit solution" "PASS"
else
    run_test "Commit solution" "FAILED: $TX"
fi

# ─── Step 7: Check deadline ───
echo ""
COMMIT_DEADLINE=$($CAST call "$ROUND_ADDR" "commitDeadline()" --rpc-url "$RPC" | $CAST to-dec)
CURRENT_TIME=$(date +%s)
REMAINING=$((COMMIT_DEADLINE - CURRENT_TIME))

if [ $REMAINING -gt 0 ]; then
    echo "▸ Step 7-11: SCORING → SETTLE → CLAIM"
    echo "  ⏳ Commit deadline in $REMAINING seconds (~$((REMAINING/60)) min)"
    echo "  Run again after: $(date -d @"$COMMIT_DEADLINE" 2>/dev/null || date -r "$COMMIT_DEADLINE" 2>/dev/null || echo "deadline")"
    run_test "Scoring phase" "SKIP: waiting for commit deadline"
    run_test "Submit scores" "SKIP: waiting for commit deadline"
    run_test "Finalize" "SKIP: waiting for commit deadline"
    run_test "Claim" "SKIP: waiting for commit deadline"

    # Save state for continuation
    cat > "$SCRIPT_DIR/e2e_state.json" << EOF
{
  "roundAddr": "$ROUND_ADDR",
  "bountyId": $BOUNTY_ID,
  "commitDeadline": $COMMIT_DEADLINE,
  "solutionHash": "$SOLUTION_HASH"
}
EOF
else
    # ─── Step 7: Start Scoring Phase ───
    echo "▸ Step 7: Starting scoring phase..."
    TX=$(cast_send "$ROUND_ADDR" "startScoringPhase()" \
        --private-key "$OPERATOR_PK" 2>&1)
    run_test "Start scoring" "$([ $? -eq 0 ] && echo PASS || echo "FAILED: $TX")"

    # ─── Step 8: Submit Scores ───
    echo ""
    echo "▸ Step 8: Submitting scores (scorer wallet)..."
    TX=$(cast_send "$SCORING_ORACLE" \
        "submitScores(address,uint256[],uint256[])" \
        "$ROUND_ADDR" "[1]" "[8000]" \
        --private-key "$SCORER_PK" 2>&1)
    run_test "Submit scores (8000 BPS)" "$([ $? -eq 0 ] && echo PASS || echo "FAILED: $TX")"

    VERIFIED=$($CAST call "$SCORING_ORACLE" "isResultVerified(address)" "$ROUND_ADDR" --rpc-url "$RPC")
    run_test "Scores verified" "$(echo "$VERIFIED" | grep -q '1$' && echo PASS || echo FAIL)"

    # ─── Step 9: Finalize ───
    echo ""
    echo "▸ Step 9: Finalizing round..."
    TX=$(cast_send "$ROUND_ADDR" "finalize()" \
        --private-key "$OPERATOR_PK" 2>&1)
    run_test "Finalize" "$([ $? -eq 0 ] && echo PASS || echo "FAILED: $TX")"

    PHASE=$($CAST call "$ROUND_ADDR" "phase()" --rpc-url "$RPC" | $CAST to-dec)
    run_test "Phase = SETTLED (4)" "$([ "$PHASE" -eq 4 ] && echo PASS || echo "FAIL: phase=$PHASE")"

    # ─── Step 10: Claim ───
    echo ""
    echo "▸ Step 10: Claiming winnings..."
    CLAIMABLE=$($CAST call "$ROUND_ADDR" "claimable(address)" "$OPERATOR" --rpc-url "$RPC" | $CAST to-dec)
    echo "  Claimable: $($CAST from-wei "$CLAIMABLE" 2>/dev/null || echo "$CLAIMABLE wei")"

    if [ "$CLAIMABLE" -gt 0 ] 2>/dev/null; then
        TX=$(cast_send "$ROUND_ADDR" "claim(address)" "$OPERATOR" \
            --private-key "$OPERATOR_PK" 2>&1)
        run_test "Claim winnings" "$([ $? -eq 0 ] && echo PASS || echo "FAILED: $TX")"
    else
        run_test "Claim winnings" "SKIP: nothing claimable"
    fi
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  📊 Results: $PASS passed, $FAIL failed, $SKIP skipped"
if [ $FAIL -eq 0 ]; then
    echo "  ✅ ALL TESTS PASSED"
else
    echo "  ❌ SOME TESTS FAILED"
fi
echo "═══════════════════════════════════════════════════"
exit $FAIL
