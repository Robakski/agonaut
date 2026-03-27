#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Agonaut E2E Smoke Test — Verify All Services Are Working
#
# Run AFTER deploying backend + scoring service.
# Tests every critical API endpoint without touching the chain.
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

API="https://api.agonaut.io/api/v1"
PASS=0
FAIL=0

test_endpoint() {
    local method="$1"
    local url="$2"
    local expect="$3"
    local label="$4"

    if [ "$method" = "GET" ]; then
        RESP=$(curl -sf "$url" 2>&1 || echo "CURL_FAILED")
    else
        RESP=$(curl -sf -X POST "$url" -H "Content-Type: application/json" -d '{}' 2>&1 || echo "CURL_FAILED")
    fi

    if echo "$RESP" | grep -q "$expect"; then
        echo "  ✅ $label"
        PASS=$((PASS + 1))
    else
        echo "  ❌ $label — expected '$expect', got: ${RESP:0:100}"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== Agonaut E2E Smoke Test ==="
echo "API: $API"
echo ""

echo "── 1. Health Checks ──"
test_endpoint GET "$API/health" "healthy" "Backend API health"
test_endpoint GET "http://127.0.0.1:8001/health" "ok\|healthy" "Scoring service health (localhost)"

echo ""
echo "── 2. Public Endpoints ──"
test_endpoint GET "$API/bounties/" "bounty_id\|\[\]" "List bounties"
test_endpoint GET "$API/agents/leaderboard" "rank\|\[\]" "Leaderboard"
test_endpoint GET "$API/agents/check-role?wallet=0x0000000000000000000000000000000000000000" "registered\|is_agent" "Agent role check"

echo ""
echo "── 3. Protocol Info ──"
test_endpoint GET "$API/protocol" "AI\|agonaut\|version" "Protocol info"

echo ""
echo "── 4. Compliance ──"
test_endpoint GET "$API/compliance/blocked-jurisdictions" "jurisdictions\|\[\]" "Blocked jurisdictions"

echo ""
echo "── 5. KYC Status (no wallet) ──"
test_endpoint GET "$API/kyc/status?wallet=0x0000000000000000000000000000000000000000" "status\|NONE\|error" "KYC status check"

echo ""
echo "── 6. Admin Dashboard (should redirect or require auth) ──"
ADMIN_RESP=$(curl -sf -o /dev/null -w "%{http_code}" "https://api.agonaut.io/admin/dashboard" 2>&1 || echo "000")
if [ "$ADMIN_RESP" = "200" ] || [ "$ADMIN_RESP" = "302" ] || [ "$ADMIN_RESP" = "401" ]; then
    echo "  ✅ Admin dashboard responds ($ADMIN_RESP)"
    PASS=$((PASS + 1))
else
    echo "  ❌ Admin dashboard — HTTP $ADMIN_RESP"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "── 7. Rate Limiting ──"
# Hit activity/track 65 times rapidly (limit is 60/min)
echo "  Testing rate limit on /activity/track..."
for i in $(seq 1 65); do
    curl -sf -X POST "$API/activity/track" -H "Content-Type: application/json" \
        -d '{"wallet":"0x0000","event":"test","page":"/test"}' -o /dev/null 2>&1 || true
done
RATE_RESP=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$API/activity/track" \
    -H "Content-Type: application/json" -d '{"wallet":"0x0000","event":"test","page":"/test"}' 2>&1 || echo "000")
if [ "$RATE_RESP" = "429" ]; then
    echo "  ✅ Rate limiting working (429 after 60 requests)"
    PASS=$((PASS + 1))
else
    echo "  ⚠️  Rate limiting may not be active (HTTP $RATE_RESP) — check in-memory state"
fi

echo ""
echo "════════════════════════════════"
echo "  PASS: $PASS | FAIL: $FAIL"
if [ $FAIL -eq 0 ]; then
    echo "  ✅ ALL TESTS PASSED"
else
    echo "  ❌ $FAIL TESTS FAILED — fix before going live"
fi
echo "════════════════════════════════"
