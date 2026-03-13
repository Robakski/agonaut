#!/usr/bin/env python3
"""
Agonaut End-to-End Integration Test

Simulates the full bounty lifecycle without requiring deployed contracts
or Phala TEE access. Tests the off-chain flow:

  1. Create a bounty with rubric
  2. Multiple agents encrypt and submit solutions
  3. Scoring service processes all solutions
  4. Verify scores, verdicts, and on-chain payload

Run:
    python tests/integration_test.py

Requirements:
    pip install cryptography
"""

import json
import os
import sys
import hashlib
import time
from pathlib import Path

# Add project paths
sys.path.insert(0, str(Path(__file__).parent.parent / "scoring-service"))
sys.path.insert(0, str(Path(__file__).parent.parent / "compliance"))
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "agonaut_sdk"))

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ═══════════════════════════════════════════════════════════════
#  TEST UTILITIES
# ═══════════════════════════════════════════════════════════════

PASS = "✅"
FAIL = "❌"
tests_run = 0
tests_passed = 0


def test(name: str, condition: bool, detail: str = ""):
    global tests_run, tests_passed
    tests_run += 1
    if condition:
        tests_passed += 1
        print(f"  {PASS} {name}")
    else:
        print(f"  {FAIL} {name}" + (f" — {detail}" if detail else ""))


def encrypt(plaintext: str, key: bytes) -> str:
    """Encrypt a solution with AES-256-GCM."""
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return (nonce + ct).hex()


# ═══════════════════════════════════════════════════════════════
#  TEST 1: ENCRYPTION / DECRYPTION
# ═══════════════════════════════════════════════════════════════

print("\n" + "=" * 60)
print("  Agonaut Integration Test")
print("=" * 60)

print("\n--- Test 1: Solution Encryption ---")

test_key = os.urandom(32)
test_key_hex = test_key.hex()

solution_text = "def sort(lst): return sorted(lst)"
encrypted = encrypt(solution_text, test_key)
commit_hash = hashlib.sha256(solution_text.encode()).hexdigest()

test("Encrypt produces hex string", len(encrypted) > 0)
test("Commit hash is SHA256", len(commit_hash) == 64)

# Decrypt and verify
from scorer import decrypt_solution
decrypted = decrypt_solution(encrypted, test_key_hex)
test("Decrypt recovers plaintext", decrypted == solution_text)

# Tampered ciphertext should fail
try:
    tampered = encrypted[:24] + "ff" + encrypted[26:]
    decrypt_solution(tampered, test_key_hex)
    test("Tampered ciphertext rejected", False, "Should have raised ValueError")
except ValueError:
    test("Tampered ciphertext rejected", True)


# ═══════════════════════════════════════════════════════════════
#  TEST 2: SCORING ENGINE (without LLM)
# ═══════════════════════════════════════════════════════════════

print("\n--- Test 2: Score Computation ---")

from scorer import (
    compute_score, build_full_rubric, Check,
    VERDICT_RECOVERY, FUNDAMENTALLY_BROKEN_CAP_PERCENT,
    UNSKIPPABLE_FAIL_CAP_PERCENT, MAX_SCORE_BPS,
    BASELINE_CHECKS, DEFAULT_SPONSOR_CHECKS,
    parse_output,
)

all_checks = build_full_rubric()
baseline = [c for c in all_checks if c.id.startswith("B")]
sponsor = [c for c in all_checks if not c.id.startswith("B")]
max_possible = sum(c.weight for c in sponsor)

# All checks pass, COHERENT
all_pass = {c.id: True for c in all_checks}
result = compute_score(all_pass, all_checks, "COHERENT", "Solid solution", False)
test("All pass + COHERENT = max score", result.final_score == max_possible,
     f"got {result.final_score}, expected {max_possible}")

# All pass, FLAWED (-20% of earned)
result = compute_score(all_pass, all_checks, "FLAWED", "Contradictions found", False)
expected_flawed = int(max_possible * 0.80)
test("All pass + FLAWED = -20%", result.final_score == expected_flawed,
     f"got {result.final_score}, expected {expected_flawed}")

# All pass, FUNDAMENTALLY_BROKEN (cap at 20%)
result = compute_score(all_pass, all_checks, "FUNDAMENTALLY_BROKEN", "Incoherent", False)
fb_cap = (max_possible * FUNDAMENTALLY_BROKEN_CAP_PERCENT) // 100
test("All pass + FUNDAMENTALLY_BROKEN = cap", result.final_score == fb_cap,
     f"got {result.final_score}, expected {fb_cap}")

# Failed baseline = score 0
failed_baseline = {c.id: True for c in all_checks}
failed_baseline["B1"] = False
result = compute_score(failed_baseline, all_checks, "COHERENT", "Illegal content", False)
test("Failed baseline B1 = score 0", result.final_score == 0)
test("Failed baseline = not baseline_passed", not result.baseline_passed)

# Failed unskippable = capped at 20%
failed_unskippable = {c.id: True for c in all_checks}
unskippable_checks = [c for c in sponsor if c.unskippable]
if unskippable_checks:
    failed_unskippable[unskippable_checks[0].id] = False
    result = compute_score(failed_unskippable, all_checks, "COHERENT", "Core requirement missed", False)
    unskip_cap = (max_possible * UNSKIPPABLE_FAIL_CAP_PERCENT) // 100
    test("Failed unskippable = capped", result.final_score <= unskip_cap,
         f"got {result.final_score}, cap {unskip_cap}")
    test("Unskippable cap applied flag", result.unskippable_cap_applied)

# EXCEPTIONAL recovers 100% of skippable missed points
skippable = [c for c in sponsor if not c.unskippable]
if skippable:
    missed_some = {c.id: True for c in all_checks}
    # Miss 3 skippable checks
    for s in skippable[:3]:
        missed_some[s.id] = False
    result = compute_score(missed_some, all_checks, "EXCEPTIONAL", "Superior approach", False)
    test("EXCEPTIONAL recovers missed skippable", result.final_score == max_possible,
         f"got {result.final_score}, expected {max_possible}")

# ELEGANT recovers 50%
if skippable:
    missed_some = {c.id: True for c in all_checks}
    missed_weight = 0
    for s in skippable[:3]:
        missed_some[s.id] = False
        missed_weight += s.weight
    base = max_possible - missed_weight
    expected_elegant = base + int(missed_weight * 0.50)
    result = compute_score(missed_some, all_checks, "ELEGANT", "Good design", False)
    test("ELEGANT recovers 50% of missed", result.final_score == expected_elegant,
         f"got {result.final_score}, expected {expected_elegant}")


# ═══════════════════════════════════════════════════════════════
#  TEST 3: JSON OUTPUT PARSING
# ═══════════════════════════════════════════════════════════════

print("\n--- Test 3: Output Parsing ---")

# Valid output
valid_json = json.dumps({
    "baseline": {"B1": True, "B2": True, "B3": True, "B4": True},
    "checks": {f"C{i}": True for i in range(1, len(sponsor) + 1)},
    "verdict": "COHERENT",
    "reasoning": "Solid solution. C1 and C2 pass clearly.",
    "injection_detected": False,
})

parsed = parse_output(valid_json, all_checks)
test("Valid JSON parses successfully", parsed is not None)
test("Verdict extracted", parsed["verdict"] == "COHERENT")
test("Reasoning preserved", "C1" in parsed["reasoning"])

# Invalid JSON = None (score 0)
parsed = parse_output("not json at all", all_checks)
test("Invalid JSON returns None", parsed is None)

# Markdown-wrapped JSON
md_json = f"```json\n{valid_json}\n```"
parsed = parse_output(md_json, all_checks)
test("Markdown-wrapped JSON parses", parsed is not None)

# Invalid verdict defaults to COHERENT
bad_verdict = json.dumps({
    "baseline": {"B1": True, "B2": True, "B3": True, "B4": True},
    "checks": {f"C{i}": True for i in range(1, len(sponsor) + 1)},
    "verdict": "SUPER_AMAZING",
    "reasoning": "test",
    "injection_detected": False,
})
parsed = parse_output(bad_verdict, all_checks)
test("Invalid verdict defaults to COHERENT", parsed["verdict"] == "COHERENT")


# ═══════════════════════════════════════════════════════════════
#  TEST 4: SANCTIONS SCREENING
# ═══════════════════════════════════════════════════════════════

print("\n--- Test 4: Sanctions Screening ---")

from sanctions import SanctionsChecker

checker = SanctionsChecker()

# Known Tornado Cash address
result = checker.check_wallet("0x722122dF12D4e14e13Ac3b6895a86e84145b6967")
test("Tornado Cash blocked", result.blocked)
test("Risk level critical", result.risk_level == "critical")

# Clean address
result = checker.check_wallet("0x0000000000000000000000000000000000000001")
test("Clean address allowed", not result.blocked)

# Blocked jurisdiction
result = checker.check_jurisdiction(country_code="KP")
test("North Korea blocked", result.blocked)

# EDD jurisdiction
result = checker.check_jurisdiction(country_code="NG")
test("Nigeria requires EDD", result.edd_required)

# Allowed jurisdiction
result = checker.check_jurisdiction(country_code="DE")
test("Germany allowed", not result.blocked and not result.edd_required)

# Full screening
result = checker.full_screening(
    "0x0000000000000000000000000000000000000001",
    country_code="DE",
)
test("Full screening clean wallet+DE passes", not result.blocked)

# Full screening sanctioned wallet
result = checker.full_screening(
    "0x722122dF12D4e14e13Ac3b6895a86e84145b6967",
    country_code="DE",
)
test("Full screening sanctioned wallet blocks", result.blocked)


# ═══════════════════════════════════════════════════════════════
#  TEST 5: KYC TIERS
# ═══════════════════════════════════════════════════════════════

print("\n--- Test 5: KYC Tiers ---")

from kyc_tiers import KYCManager, KYCTier
import tempfile

# Use temp file for test state
with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
    kyc_path = f.name

kyc = KYCManager(state_path=kyc_path)
test_addr = "0xtest1234567890"

# Unverified user can browse
ok, reason = kyc.check_action(test_addr, "browse")
test("Unverified can browse", ok)

# Unverified user cannot create bounty
ok, reason = kyc.check_action(test_addr, "create_bounty")
test("Unverified cannot create bounty", not ok)

# Verify at Tier 1
kyc.set_verified(test_addr, KYCTier.BASIC, "test-verification-123")
ok, reason = kyc.check_action(test_addr, "create_bounty", 500)
test("Tier 1 can create small bounty", ok)

# Tier 1 cannot create large bounty
ok, reason = kyc.check_action(test_addr, "create_bounty", 15_000)
test("Tier 1 cannot create €15K bounty", not ok)

# Block user
kyc.block_user(test_addr, "Suspicious activity")
ok, reason = kyc.check_action(test_addr, "browse")
test("Blocked user cannot browse", not ok)

# Unblock
kyc.unblock_user(test_addr)
ok, reason = kyc.check_action(test_addr, "browse")
test("Unblocked user can browse again", ok)

# Cleanup
os.unlink(kyc_path)


# ═══════════════════════════════════════════════════════════════
#  TEST 6: SPONSOR RUBRIC PARSING
# ═══════════════════════════════════════════════════════════════

print("\n--- Test 6: Sponsor Rubric ---")

from scorer import parse_sponsor_rubric

custom_rubric = {
    "criteria": [
        {
            "name": "Performance",
            "checks": [
                {"description": "Handles 10K req/s", "weight": 3000, "unskippable": True},
                {"description": "P99 under 50ms", "weight": 2000, "unskippable": False},
            ]
        },
        {
            "name": "Security",
            "checks": [
                {"description": "No SQL injection", "weight": 3000, "unskippable": True},
                {"description": "Input validation", "weight": 2000, "unskippable": False},
            ]
        },
    ]
}

checks = parse_sponsor_rubric(custom_rubric)
test("Rubric parses 4 checks", len(checks) == 4)
test("IDs auto-assigned", checks[0].id == "C1" and checks[3].id == "C4")
test("Weights correct", checks[0].weight == 3000)
test("Unskippable preserved", checks[0].unskippable and not checks[1].unskippable)
test("Total weight = 10000", sum(c.weight for c in checks) == 10000)

# Build full rubric with custom checks
full = build_full_rubric(checks)
test("Full rubric includes baseline", any(c.id == "B1" for c in full))
test("Full rubric includes custom", any(c.id == "C1" for c in full))


# ═══════════════════════════════════════════════════════════════
#  TEST 7: ON-CHAIN PAYLOAD FORMAT
# ═══════════════════════════════════════════════════════════════

print("\n--- Test 7: On-Chain Payload ---")

from scorer import ScoredSolution, to_onchain_payload, ScoreBreakdown

mock_results = [
    ScoredSolution(
        agent_id=1, commit_hash="aaa", error=None,
        breakdown=ScoreBreakdown(
            final_score=9500, base_score=8500, max_possible=10000,
            verdict="ELEGANT", verdict_adjustment=1000,
            baseline_passed=True, unskippable_passed=True, unskippable_cap_applied=False,
            checks_passed=20, checks_total=24, checks_detail={},
            failed_unskippable=[], reasoning="Good", injection_detected=False,
        ),
    ),
    ScoredSolution(
        agent_id=2, commit_hash="bbb", error=None,
        breakdown=ScoreBreakdown(
            final_score=0, base_score=0, max_possible=10000,
            verdict="COHERENT", verdict_adjustment=0,
            baseline_passed=False, unskippable_passed=False, unskippable_cap_applied=False,
            checks_passed=0, checks_total=24, checks_detail={},
            failed_unskippable=["B1"], reasoning="Illegal", injection_detected=True,
        ),
    ),
]

payload = to_onchain_payload(mock_results)
test("Payload has agent_ids", payload["agent_ids"] == [1, 2])
test("Payload has scores", payload["scores"] == [9500, 0])
test("Payload has commit_hashes", payload["commit_hashes"] == ["aaa", "bbb"])
test("Metadata includes results", len(payload["metadata"]["results"]) == 2)


# ═══════════════════════════════════════════════════════════════
#  TEST 8: SDK CRYPTO
# ═══════════════════════════════════════════════════════════════

print("\n--- Test 8: SDK Encryption ---")

from crypto import encrypt_solution, compute_commit_hash

sdk_key = os.urandom(32).hex()
enc, ch = encrypt_solution("hello world", sdk_key)
test("SDK encrypt returns hex", len(enc) > 0)
test("SDK commit hash matches", ch == hashlib.sha256(b"hello world").hexdigest())

# Verify SDK encryption is compatible with scorer decryption
decrypted = decrypt_solution(enc, sdk_key)
test("SDK encryption compatible with scorer decryption", decrypted == "hello world")


# ═══════════════════════════════════════════════════════════════
#  RESULTS
# ═══════════════════════════════════════════════════════════════

print("\n" + "=" * 60)
print(f"  Results: {tests_passed}/{tests_run} passed")
if tests_passed == tests_run:
    print(f"  {PASS} ALL TESTS PASSED")
else:
    print(f"  {FAIL} {tests_run - tests_passed} FAILED")
print("=" * 60 + "\n")

sys.exit(0 if tests_passed == tests_run else 1)
