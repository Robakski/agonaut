#!/usr/bin/env bash
# =============================================================================
# Agonaut Integration Test — Base Sepolia Testnet
# =============================================================================
# Tests the live deployed contracts end-to-end using `cast`.
# Prerequisites: operator wallet must have ETH (funded before running).
# =============================================================================

set -euo pipefail

# ─── Colours ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

PASS="${GREEN}[PASS]${RESET}"
FAIL="${RED}[FAIL]${RESET}"
INFO="${CYAN}[INFO]${RESET}"

# ─── Configuration ────────────────────────────────────────────────────────────
CAST="${HOME}/.foundry/bin/cast"
RPC="https://sepolia.base.org"

# Contract addresses
ARENA_REGISTRY="0xE068f2E4D86a0dD244e3d3Cd26Dd643Ce781F0fc"
BOUNTY_FACTORY="0x8CbD4904d9AD691D779Bc3700e4Bb0ad0A7B1300"
SCORING_ORACLE="0x67F015168061645152D180c4bEea3f861eCCb523"
TREASURY="0x4352C3544DB832065a465f412B5C68B6FE17a4F4"

# Operator wallet
OPERATOR_ADDR="0x8c35c1930CAd1224e7A1F90E9f7df5486e7489d2"
OPERATOR_PK="REDACTED_TESTNET_KEY"

# Test metadata hash (bytes32 — IPFS CID placeholder)
TEST_METADATA="0x74657374206d657461646174612068617368202d20696e7465677261696f6e00"

# Track pass/fail counts
PASS_COUNT=0
FAIL_COUNT=0

# ─── Helpers ──────────────────────────────────────────────────────────────────

# cast call returns "12345 [1.2e4]" — strip the annotation to get just the number
strip_annotation() { echo "$1" | awk '{print $1}'; }

# cast from-wei helper
to_eth() { $CAST from-wei "$1" 2>/dev/null || echo "?"; }

log_header() {
    echo ""
    echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}"
    echo -e "${BOLD}${CYAN}  $1${RESET}"
    echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}"
}

log_pass() {
    echo -e "${PASS} $1"
    PASS_COUNT=$((PASS_COUNT + 1))
}

log_fail() {
    echo -e "${FAIL} $1"
    FAIL_COUNT=$((FAIL_COUNT + 1))
}

log_info() {
    echo -e "${INFO} $1"
}

check_bytecode() {
    local name="$1"
    local addr="$2"
    local code
    code=$($CAST code "$addr" --rpc-url "$RPC" 2>/dev/null || echo "0x")
    if [[ "$code" != "0x" && ${#code} -gt 4 ]]; then
        log_pass "$name deployed at $addr (bytecode: ${#code} chars)"
    else
        log_fail "$name NOT found at $addr"
    fi
}

# ─── TEST SUITE ───────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║       AGONAUT Integration Test — Base Sepolia        ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
log_header "1. CONTRACT DEPLOYMENT CHECKS"
# ─────────────────────────────────────────────────────────────────────────────

check_bytecode "ArenaRegistry" "$ARENA_REGISTRY"
check_bytecode "BountyFactory" "$BOUNTY_FACTORY"
check_bytecode "ScoringOracle" "$SCORING_ORACLE"
check_bytecode "Treasury"      "$TREASURY"

# ─────────────────────────────────────────────────────────────────────────────
log_header "2. READ CONTRACT CONSTANTS"
# ─────────────────────────────────────────────────────────────────────────────

# ArenaRegistry — ethEntryFee
ETH_FEE_RAW=$($CAST call "$ARENA_REGISTRY" "ethEntryFee()(uint256)" --rpc-url "$RPC")
ETH_FEE=$(strip_annotation "$ETH_FEE_RAW")
ETH_FEE_ETH=$(to_eth "$ETH_FEE")
log_info "ArenaRegistry.ethEntryFee  = $ETH_FEE wei  ($ETH_FEE_ETH ETH)"

if [[ "$ETH_FEE" == "1500000000000000" ]]; then
    log_pass "Registration fee matches REGISTRATION_FEE constant (0.0015 ETH)"
else
    log_fail "Registration fee mismatch: expected 1500000000000000, got $ETH_FEE"
fi

# ArenaRegistry — nextAgentId (before registration)
AGENT_ID_BEFORE_RAW=$($CAST call "$ARENA_REGISTRY" "nextAgentId()(uint256)" --rpc-url "$RPC")
AGENT_ID_BEFORE=$(strip_annotation "$AGENT_ID_BEFORE_RAW")
log_info "ArenaRegistry.nextAgentId  = $AGENT_ID_BEFORE (before registration)"
if [[ "$AGENT_ID_BEFORE" -ge 1 ]]; then
    log_pass "nextAgentId is valid (>= 1)"
else
    log_fail "nextAgentId should be >= 1"
fi

# ArenaRegistry — initial ELO constant
INITIAL_ELO_RAW=$($CAST call "$ARENA_REGISTRY" "INITIAL_ELO()(uint16)" --rpc-url "$RPC")
INITIAL_ELO=$(strip_annotation "$INITIAL_ELO_RAW")
log_info "ArenaRegistry.INITIAL_ELO  = $INITIAL_ELO"
if [[ "$INITIAL_ELO" == "1200" ]]; then
    log_pass "INITIAL_ELO = 1200 ✓"
else
    log_fail "INITIAL_ELO mismatch: expected 1200, got $INITIAL_ELO"
fi

# ArenaRegistry — tier thresholds
SILVER_MIN=$(strip_annotation "$($CAST call "$ARENA_REGISTRY" "TIER_SILVER_MIN()(uint16)" --rpc-url "$RPC")")
GOLD_MIN=$(strip_annotation "$($CAST call "$ARENA_REGISTRY" "TIER_GOLD_MIN()(uint16)" --rpc-url "$RPC")")
DIAMOND_MIN=$(strip_annotation "$($CAST call "$ARENA_REGISTRY" "TIER_DIAMOND_MIN()(uint16)" --rpc-url "$RPC")")
log_info "Tier thresholds: Silver=$SILVER_MIN  Gold=$GOLD_MIN  Diamond=$DIAMOND_MIN"
if [[ "$SILVER_MIN" == "1400" && "$GOLD_MIN" == "1600" && "$DIAMOND_MIN" == "1800" ]]; then
    log_pass "Tier thresholds correct (1400/1600/1800)"
else
    log_fail "Tier thresholds unexpected: Silver=$SILVER_MIN Gold=$GOLD_MIN Diamond=$DIAMOND_MIN"
fi

# ─────────────────────────────────────────────────────────────────────────────
log_header "3. OPERATOR WALLET BALANCE"
# ─────────────────────────────────────────────────────────────────────────────

OP_BALANCE=$($CAST balance "$OPERATOR_ADDR" --rpc-url "$RPC")
OP_BALANCE_ETH=$(to_eth "$OP_BALANCE")
log_info "Operator balance: $OP_BALANCE wei  ($OP_BALANCE_ETH ETH)"
if [[ "$OP_BALANCE" -ge "$ETH_FEE" ]]; then
    log_pass "Operator has sufficient ETH for registration"
else
    log_fail "Operator has insufficient ETH (need $ETH_FEE, have $OP_BALANCE)"
fi

# ─────────────────────────────────────────────────────────────────────────────
log_header "4. REGISTER AN AGENT (ArenaRegistry.registerWithETH)"
# ─────────────────────────────────────────────────────────────────────────────

log_info "Submitting registerWithETH with ${ETH_FEE} wei..."
log_info "Metadata hash: $TEST_METADATA"

REG_OUTPUT=$($CAST send \
    --rpc-url "$RPC" \
    --private-key "$OPERATOR_PK" \
    --value "${ETH_FEE}" \
    "$ARENA_REGISTRY" \
    "registerWithETH(bytes32)(uint256)" "$TEST_METADATA" \
    2>&1)

REG_STATUS=$(echo "$REG_OUTPUT" | grep "^status" | awk '{print $2}')
REG_TX=$(echo "$REG_OUTPUT" | grep "^transactionHash" | awk '{print $2}')

log_info "Transaction hash: $REG_TX"
log_info "Status line     : $REG_STATUS"

if echo "$REG_STATUS" | grep -q "^1"; then
    log_pass "registerWithETH transaction succeeded (status=1)"
else
    log_fail "registerWithETH transaction failed"
    echo "--- raw output ---"
    echo "$REG_OUTPUT"
    echo "---"
fi

# ─────────────────────────────────────────────────────────────────────────────
log_header "5. VERIFY REGISTRATION"
# ─────────────────────────────────────────────────────────────────────────────

AGENT_ID_AFTER_RAW=$($CAST call "$ARENA_REGISTRY" "nextAgentId()(uint256)" --rpc-url "$RPC")
AGENT_ID_AFTER=$(strip_annotation "$AGENT_ID_AFTER_RAW")
EXPECTED_ID=$((AGENT_ID_BEFORE + 1))
log_info "nextAgentId after registration: $AGENT_ID_AFTER (was $AGENT_ID_BEFORE)"

if [[ "$AGENT_ID_AFTER" -eq "$EXPECTED_ID" ]]; then
    log_pass "nextAgentId incremented correctly ($AGENT_ID_BEFORE → $AGENT_ID_AFTER)"
else
    log_fail "nextAgentId did not increment as expected (expected $EXPECTED_ID, got $AGENT_ID_AFTER)"
fi

# The registered agent ID is AGENT_ID_BEFORE (IDs start at 1, assigned then incremented)
REGISTERED_AGENT_ID=$AGENT_ID_BEFORE

# Check isActive
IS_ACTIVE=$($CAST call "$ARENA_REGISTRY" "isActive(uint256)(bool)" "$REGISTERED_AGENT_ID" --rpc-url "$RPC")
log_info "Agent #$REGISTERED_AGENT_ID isActive: $IS_ACTIVE"
if [[ "$IS_ACTIVE" == "true" ]]; then
    log_pass "Agent #$REGISTERED_AGENT_ID is active ✓"
else
    log_fail "Agent #$REGISTERED_AGENT_ID is NOT active"
fi

# Get full agent struct
# getAgent returns: wallet, metadataHash, registeredAt, deregisteredAt, stableId, eloRating, totalWinnings, roundsEntered, roundsWon
AGENT_RAW=$($CAST call "$ARENA_REGISTRY" \
    "getAgent(uint256)(address,bytes32,uint64,uint64,uint16,uint16,uint256,uint32,uint32)" \
    "$REGISTERED_AGENT_ID" --rpc-url "$RPC" 2>&1)

log_info "Agent #$REGISTERED_AGENT_ID full data:"
echo "$AGENT_RAW" | while IFS= read -r line; do
    echo -e "  ${CYAN}│${RESET} $line"
done

# Parse wallet (first line)
AGENT_WALLET=$(echo "$AGENT_RAW" | sed -n '1p' | awk '{print $1}')
AGENT_WALLET_LOWER=$(echo "$AGENT_WALLET" | tr '[:upper:]' '[:lower:]')
OPERATOR_LOWER=$(echo "$OPERATOR_ADDR" | tr '[:upper:]' '[:lower:]')

if [[ "$AGENT_WALLET_LOWER" == "$OPERATOR_LOWER" ]]; then
    log_pass "Agent wallet matches operator ($OPERATOR_ADDR)"
else
    log_fail "Agent wallet mismatch: expected $OPERATOR_ADDR, got $AGENT_WALLET"
fi

# Parse eloRating (6th line, index 6)
AGENT_ELO_RAW=$(echo "$AGENT_RAW" | sed -n '6p')
AGENT_ELO=$(strip_annotation "$AGENT_ELO_RAW")
log_info "Agent ELO rating: $AGENT_ELO"
if [[ "$AGENT_ELO" == "1200" ]]; then
    log_pass "Agent ELO initialized to 1200 ✓"
else
    log_fail "Agent ELO unexpected: $AGENT_ELO"
fi

# Get tier
AGENT_TIER_RAW=$($CAST call "$ARENA_REGISTRY" "getTier(uint256)(uint8)" "$REGISTERED_AGENT_ID" --rpc-url "$RPC")
AGENT_TIER=$(strip_annotation "$AGENT_TIER_RAW")
TIER_NAME_RAW=$($CAST call "$ARENA_REGISTRY" "tierName(uint16)(string)" "1200" --rpc-url "$RPC")
# Strip surrounding quotes from the string return
TIER_NAME=$(echo "$TIER_NAME_RAW" | tr -d '"')
log_info "Agent #$REGISTERED_AGENT_ID tier: $AGENT_TIER ($TIER_NAME)"
if [[ "$AGENT_TIER" == "0" ]]; then
    log_pass "Agent tier is Bronze (0) at 1200 ELO ✓"
else
    log_fail "Unexpected tier: $AGENT_TIER"
fi

# Wallet agents lookup
WALLET_AGENTS=$($CAST call "$ARENA_REGISTRY" "getAgentsByWallet(address)(uint256[])" "$OPERATOR_ADDR" --rpc-url "$RPC")
log_info "Agents for operator wallet: $WALLET_AGENTS"
if echo "$WALLET_AGENTS" | grep -q "$REGISTERED_AGENT_ID"; then
    log_pass "Agent #$REGISTERED_AGENT_ID found in operator's agent list"
else
    log_fail "Agent #$REGISTERED_AGENT_ID NOT in operator's wallet agent list"
fi

# ─────────────────────────────────────────────────────────────────────────────
log_header "6. ACCUMULATED FEES & TREASURY"
# ─────────────────────────────────────────────────────────────────────────────

# ArenaRegistry accumulated fees
ACC_FEES_RAW=$($CAST call "$ARENA_REGISTRY" "accumulatedEthFees()(uint256)" --rpc-url "$RPC")
ACC_FEES=$(strip_annotation "$ACC_FEES_RAW")
ACC_FEES_ETH=$(to_eth "$ACC_FEES")
log_info "ArenaRegistry.accumulatedEthFees = $ACC_FEES wei  ($ACC_FEES_ETH ETH)"
if [[ "$ACC_FEES" -ge "$ETH_FEE" ]]; then
    log_pass "Fees accumulated in ArenaRegistry (>= 1 registration fee)"
else
    log_fail "No fees accumulated — expected >= $ETH_FEE, got $ACC_FEES"
fi

# Treasury ETH balance
TREASURY_BAL=$($CAST balance "$TREASURY" --rpc-url "$RPC")
TREASURY_BAL_ETH=$(to_eth "$TREASURY_BAL")
log_info "Treasury ETH balance       = $TREASURY_BAL wei  ($TREASURY_BAL_ETH ETH)"
log_info "(Registration fees sit in ArenaRegistry until admin withdraws to Treasury)"

# Operator balance after registration
OP_BALANCE_AFTER=$($CAST balance "$OPERATOR_ADDR" --rpc-url "$RPC")
OP_BALANCE_AFTER_ETH=$(to_eth "$OP_BALANCE_AFTER")
GAS_SPENT=$((OP_BALANCE - ETH_FEE - OP_BALANCE_AFTER))
log_info "Operator balance after     = $OP_BALANCE_AFTER wei  ($OP_BALANCE_AFTER_ETH ETH)"
log_info "Gas cost approx.           = ~$GAS_SPENT wei"

# ─────────────────────────────────────────────────────────────────────────────
log_header "SUMMARY"
# ─────────────────────────────────────────────────────────────────────────────

TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo ""
echo -e "  Tests run : ${BOLD}${TOTAL}${RESET}"
echo -e "  ${GREEN}Passed${RESET}    : ${BOLD}${PASS_COUNT}${RESET}"
echo -e "  ${RED}Failed${RESET}    : ${BOLD}${FAIL_COUNT}${RESET}"
echo ""

if [[ "$FAIL_COUNT" -eq 0 ]]; then
    echo -e "${BOLD}${GREEN}✅  All tests passed!${RESET}"
    echo ""
    echo -e "  Registered agent ID : ${BOLD}#${REGISTERED_AGENT_ID}${RESET}"
    echo -e "  Tx hash             : ${BOLD}${REG_TX}${RESET}"
    echo -e "  Explorer            : https://sepolia.basescan.org/tx/${REG_TX}"
    exit 0
else
    echo -e "${BOLD}${RED}❌  ${FAIL_COUNT} test(s) failed${RESET}"
    exit 1
fi
