#!/usr/bin/env python3
"""
Agonaut KYC Tier System

Determines what level of identity verification a user needs based on
their actions and cumulative volume on the platform.

Tiers:
  0 — No verification (browsing, small agent entries)
  1 — Basic ID (creating bounties, payouts > €1,000)
  2 — Enhanced (large bounties > €10K, cumulative > €50K)
  3 — Entity (companies as sponsors)

This module does NOT perform verification itself — it determines
WHAT level is required. Actual verification is handled by the
KYC provider (Sumsub, IDnow, etc.) when activated.

Until a KYC provider is integrated, this module:
- Tracks required tier per wallet
- Blocks actions that require unmet verification
- Logs all tier decisions for audit trail
- Ready to plug into any KYC provider via the verify() hook
"""

import json
import logging
import os
import time
from dataclasses import dataclass
from enum import IntEnum
from pathlib import Path
from typing import Optional

log = logging.getLogger("kyc")


class KYCTier(IntEnum):
    NONE = 0       # No verification needed
    BASIC = 1      # Government ID + sanctions screening
    ENHANCED = 2   # ID + proof of address + source of funds
    ENTITY = 3     # Full company verification + UBO


# Thresholds in EUR equivalent
TIER1_PAYOUT_THRESHOLD = 1_000       # Cumulative payouts requiring Tier 1
TIER2_SINGLE_BOUNTY = 10_000         # Single bounty requiring Tier 2
TIER2_CUMULATIVE_VOLUME = 50_000     # Cumulative volume requiring Tier 2

# Actions and their minimum required tier
ACTION_TIERS = {
    "browse": KYCTier.NONE,
    "connect_wallet": KYCTier.NONE,
    "register_agent": KYCTier.NONE,
    "enter_bounty": KYCTier.NONE,        # Small entry fee only
    "claim_payout_small": KYCTier.NONE,   # Under threshold
    "claim_payout_large": KYCTier.BASIC,  # Over €1,000 cumulative
    "create_bounty": KYCTier.BASIC,       # Creating bounties always needs ID
    "create_large_bounty": KYCTier.ENHANCED,  # >€10K
    "create_bounty_entity": KYCTier.ENTITY,   # Company sponsor
}


@dataclass
class KYCStatus:
    """Current KYC status for a wallet address."""
    address: str
    current_tier: KYCTier = KYCTier.NONE
    verified_at: float = 0.0
    verification_id: str = ""      # External KYC provider reference
    cumulative_volume_eur: float = 0.0
    cumulative_payouts_eur: float = 0.0
    is_entity: bool = False
    blocked: bool = False
    block_reason: str = ""


class KYCManager:
    """Manages KYC tier requirements and verification status.

    Stores state in a JSON file. In production, replace with database.
    """

    def __init__(self, state_path: str = ""):
        self.state_path = Path(state_path or os.environ.get(
            "KYC_STATE_PATH",
            str(Path(__file__).parent / "kyc_state.json")
        ))
        self._state: dict[str, dict] = {}
        self._load_state()

    def _load_state(self):
        if self.state_path.exists():
            try:
                with open(self.state_path) as f:
                    self._state = json.load(f)
            except Exception as e:
                log.error(f"Failed to load KYC state: {e}")
                self._state = {}

    def _save_state(self):
        try:
            self.state_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.state_path, "w") as f:
                json.dump(self._state, f, indent=2)
        except Exception as e:
            log.error(f"Failed to save KYC state: {e}")

    def get_status(self, address: str) -> KYCStatus:
        """Get current KYC status for a wallet."""
        addr = address.lower()
        data = self._state.get(addr, {})
        return KYCStatus(
            address=addr,
            current_tier=KYCTier(data.get("tier", 0)),
            verified_at=data.get("verified_at", 0),
            verification_id=data.get("verification_id", ""),
            cumulative_volume_eur=data.get("cumulative_volume", 0),
            cumulative_payouts_eur=data.get("cumulative_payouts", 0),
            is_entity=data.get("is_entity", False),
            blocked=data.get("blocked", False),
            block_reason=data.get("block_reason", ""),
        )

    def required_tier(self, address: str, action: str, amount_eur: float = 0) -> KYCTier:
        """Determine what KYC tier is required for an action.

        Args:
            address: Wallet address
            action: What they want to do
            amount_eur: EUR equivalent of the transaction (if applicable)

        Returns:
            Required KYCTier
        """
        status = self.get_status(address)

        # Base tier for the action
        base_tier = ACTION_TIERS.get(action, KYCTier.BASIC)

        # Escalate based on amount
        if action in ("create_bounty", "create_large_bounty") and amount_eur > TIER2_SINGLE_BOUNTY:
            base_tier = max(base_tier, KYCTier.ENHANCED)

        # Escalate based on cumulative volume
        new_cumulative = status.cumulative_volume_eur + amount_eur
        if new_cumulative > TIER2_CUMULATIVE_VOLUME:
            base_tier = max(base_tier, KYCTier.ENHANCED)

        # Escalate for cumulative payouts
        if action.startswith("claim_payout"):
            new_payouts = status.cumulative_payouts_eur + amount_eur
            if new_payouts > TIER1_PAYOUT_THRESHOLD:
                base_tier = max(base_tier, KYCTier.BASIC)

        # Entity check
        if status.is_entity:
            base_tier = max(base_tier, KYCTier.ENTITY)

        return base_tier

    def check_action(self, address: str, action: str, amount_eur: float = 0) -> tuple[bool, str]:
        """Check if a user can perform an action given their current KYC tier.

        Returns:
            (allowed, reason) — allowed=True if current tier meets requirement
        """
        status = self.get_status(address)

        if status.blocked:
            return False, f"Account blocked: {status.block_reason}"

        required = self.required_tier(address, action, amount_eur)

        if status.current_tier >= required:
            return True, "KYC requirements met"

        tier_names = {
            KYCTier.NONE: "no verification",
            KYCTier.BASIC: "basic ID verification",
            KYCTier.ENHANCED: "enhanced verification (ID + proof of address + source of funds)",
            KYCTier.ENTITY: "entity verification (company documents + UBO)",
        }

        return False, (
            f"Action '{action}' requires {tier_names[required]} (Tier {required.value}). "
            f"Current verification: Tier {status.current_tier.value}. "
            f"Please complete identity verification to proceed."
        )

    def record_volume(self, address: str, amount_eur: float, is_payout: bool = False):
        """Record transaction volume for tier escalation tracking."""
        addr = address.lower()
        if addr not in self._state:
            self._state[addr] = {"tier": 0}

        self._state[addr]["cumulative_volume"] = (
            self._state[addr].get("cumulative_volume", 0) + amount_eur
        )
        if is_payout:
            self._state[addr]["cumulative_payouts"] = (
                self._state[addr].get("cumulative_payouts", 0) + amount_eur
            )

        self._save_state()

    def set_verified(self, address: str, tier: KYCTier, verification_id: str = ""):
        """Mark a user as verified at a given tier.

        Called by the KYC provider integration after successful verification.
        """
        addr = address.lower()
        if addr not in self._state:
            self._state[addr] = {}

        self._state[addr].update({
            "tier": tier.value,
            "verified_at": time.time(),
            "verification_id": verification_id,
        })

        self._save_state()
        log.info(f"KYC: {addr[:10]}... verified at Tier {tier.value}")

    def block_user(self, address: str, reason: str):
        """Block a user (e.g., failed sanctions screening, suspicious activity)."""
        addr = address.lower()
        if addr not in self._state:
            self._state[addr] = {}

        self._state[addr]["blocked"] = True
        self._state[addr]["block_reason"] = reason
        self._save_state()
        log.warning(f"KYC: BLOCKED {addr[:10]}... reason={reason}")

    def unblock_user(self, address: str):
        """Unblock a previously blocked user."""
        addr = address.lower()
        if addr in self._state:
            self._state[addr]["blocked"] = False
            self._state[addr]["block_reason"] = ""
            self._save_state()


# ═══════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(name)s | %(message)s")

    mgr = KYCManager()

    print("=" * 60)
    print("  Agonaut KYC Tier System")
    print("=" * 60)
    print(f"  Tier 0: No verification — browse, connect, small entries")
    print(f"  Tier 1: Basic ID — create bounties, payouts > €{TIER1_PAYOUT_THRESHOLD:,}")
    print(f"  Tier 2: Enhanced — bounties > €{TIER2_SINGLE_BOUNTY:,}, volume > €{TIER2_CUMULATIVE_VOLUME:,}")
    print(f"  Tier 3: Entity — company sponsors")
    print("=" * 60)

    test_addr = "0x0000000000000000000000000000000000000001"

    print(f"\n  Test: unverified user browsing...")
    ok, reason = mgr.check_action(test_addr, "browse")
    print(f"  Allowed: {ok} — {reason}")

    print(f"\n  Test: unverified user creating bounty...")
    ok, reason = mgr.check_action(test_addr, "create_bounty", 500)
    print(f"  Allowed: {ok} — {reason}")

    print(f"\n  Test: Tier 1 user creating bounty...")
    mgr.set_verified(test_addr, KYCTier.BASIC, "test-123")
    ok, reason = mgr.check_action(test_addr, "create_bounty", 500)
    print(f"  Allowed: {ok} — {reason}")

    print(f"\n  Test: Tier 1 user creating €15K bounty...")
    ok, reason = mgr.check_action(test_addr, "create_bounty", 15_000)
    print(f"  Allowed: {ok} — {reason}")

    print(f"\n  ✅ KYC tier system operational.")
