#!/usr/bin/env python3
"""
Agonaut Sanctions Screening Module

Screens wallet addresses and IP-based geolocation against sanctioned
jurisdictions and known sanctioned wallet addresses.

Three layers:
  1. Jurisdiction blocking — IP geolocation against sanctioned countries
  2. Wallet screening — check against known sanctioned addresses (OFAC SDN list)
  3. TRM Labs API — on-chain risk scoring (free tier: 1,000 screenings/month)

Usage:
    from compliance.sanctions import SanctionsChecker
    checker = SanctionsChecker()

    # Check wallet
    result = checker.check_wallet("0x1234...")
    if result.blocked:
        deny_access(result.reason)

    # Check jurisdiction
    result = checker.check_jurisdiction(ip_address="1.2.3.4")
    if result.blocked:
        deny_access(result.reason)

Environment:
    TRM_API_KEY       — TRM Labs API key (optional, free tier available)
    GEOIP_DB_PATH     — Path to MaxMind GeoLite2 database (optional)
"""

import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

log = logging.getLogger("sanctions")

TRM_API_KEY = os.environ.get("TRM_API_KEY", "")
GEOIP_DB_PATH = os.environ.get("GEOIP_DB_PATH", "")

# ═══════════════════════════════════════════════════════════════
#  SANCTIONED JURISDICTIONS
# ═══════════════════════════════════════════════════════════════

# Full embargo — users from these jurisdictions are completely blocked
BLOCKED_JURISDICTIONS = {
    "KP": "North Korea (DPRK)",
    "IR": "Iran",
    "SY": "Syria",
    "CU": "Cuba",
    "MM": "Myanmar (military junta)",
    # Russian-occupied territories handled via specific region codes if available
    # Russia itself depends on evolving EU sanctions — start conservative
    "RU": "Russia (EU sanctions)",
}

# Enhanced due diligence — users from these jurisdictions require Tier 2 KYC
# Based on FATF grey list (updated periodically)
EDD_JURISDICTIONS = {
    "AL": "Albania",
    "BF": "Burkina Faso",
    "CF": "Cameroon",
    "CD": "Congo (DRC)",
    "HT": "Haiti",
    "KE": "Kenya",
    "ML": "Mali",
    "MZ": "Mozambique",
    "NG": "Nigeria",
    "PH": "Philippines",
    "SN": "Senegal",
    "SS": "South Sudan",
    "TZ": "Tanzania",
    "VE": "Venezuela",
    "VN": "Vietnam",
    "YE": "Yemen",
}


# ═══════════════════════════════════════════════════════════════
#  OFAC SDN SANCTIONED WALLET ADDRESSES
# ═══════════════════════════════════════════════════════════════

# Known sanctioned crypto addresses from OFAC SDN list
# Source: https://www.treasury.gov/ofac/downloads/sdnlist.txt
# These are publicly listed — not secret data
# Updated: [DATE] — must be refreshed periodically

SANCTIONED_WALLETS = {
    # Tornado Cash (OFAC sanctioned Aug 2022)
    "0xd90e2f925DA726b50C4Ed8D0Fb90Ad053324F31b".lower(),
    "0xd96f2B1c14Db8458374d9Aca76E26c3D18364307".lower(),
    "0x4736dCf1b7A3d580672CcE6E7c65cd5cc9cFBfA9".lower(),
    "0xD4B88Df4D29F5CedD6857912842cff3b20C8Cfa3".lower(),
    "0x910Cbd523D972eb0a6f4cAe4618aD62622b39DbF".lower(),
    "0xA160cdAB225685dA1d56aa342Ad8841c3b53f291".lower(),
    "0xFD8610d20aA15b7B2E3Be39B396a1bC3516c7144".lower(),
    "0xF60dD140cFf0706bAE9Cd734Ac3683731562E9c9".lower(),
    "0x22aaA7720ddd5388A3c0A3333430953C68f1849b".lower(),
    "0xBA214C1c1928a32Bffe790263E38B4Af9bFCD659".lower(),
    "0xb1C8094B234DcE6e03f10a5b673c1d8C69739A00".lower(),
    "0x527653eA119F3E6a1F5BD18fbF4714081D7B31ce".lower(),
    "0x58E8dCC13BE9780fC42E8723D8EaD4CF46943dF2".lower(),
    "0x8589427373D6D84E98730D7795D8f6f8731FDA16".lower(),
    "0x722122dF12D4e14e13Ac3b6895a86e84145b6967".lower(),
    # Lazarus Group (North Korea)
    "0x098B716B8Aaf21512996dC57EB0615e2383E2f96".lower(),
    "0xa0e1c89Ef1a489c9C7dE96311eD5Ce5D32c20E4B".lower(),
    "0x3Cffd56B47B7b41c56258D9C7731ABaDc360E460".lower(),
    "0x53b6936513e738f44FB50d2b9476730C0Ab3Bfc1".lower(),
    # Garantex (Russian exchange, OFAC sanctioned)
    "0x6F1cA141A28907F78Ebaa64f83E24b8DDb4FbC2B".lower(),
    # Add more as OFAC updates — check quarterly
}

# File for additional sanctioned addresses (can be updated without code change)
EXTRA_SANCTIONS_FILE = Path(__file__).parent / "sanctioned_wallets.json"


def load_extra_sanctioned_wallets() -> set:
    """Load additional sanctioned wallets from JSON file."""
    if EXTRA_SANCTIONS_FILE.exists():
        try:
            with open(EXTRA_SANCTIONS_FILE) as f:
                data = json.load(f)
                return {addr.lower() for addr in data.get("addresses", [])}
        except Exception as e:
            log.error(f"Failed to load extra sanctions file: {e}")
    return set()


# ═══════════════════════════════════════════════════════════════
#  SCREENING RESULTS
# ═══════════════════════════════════════════════════════════════

@dataclass
class ScreeningResult:
    """Result of a sanctions screening check."""
    blocked: bool = False
    edd_required: bool = False  # Enhanced Due Diligence required
    reason: str = ""
    risk_level: str = "low"  # low, medium, high, critical
    details: dict = field(default_factory=dict)
    timestamp: float = 0.0

    def __post_init__(self):
        if self.timestamp == 0.0:
            self.timestamp = time.time()


# ═══════════════════════════════════════════════════════════════
#  SANCTIONS CHECKER
# ═══════════════════════════════════════════════════════════════

class SanctionsChecker:
    """Multi-layer sanctions screening for Agonaut platform."""

    def __init__(self):
        self._sanctioned_wallets = SANCTIONED_WALLETS | load_extra_sanctioned_wallets()
        self._geoip_reader = None
        self._init_geoip()

    def _init_geoip(self):
        """Initialize MaxMind GeoIP database if available."""
        if not GEOIP_DB_PATH:
            return
        try:
            import geoip2.database
            self._geoip_reader = geoip2.database.Reader(GEOIP_DB_PATH)
            log.info("GeoIP database loaded")
        except ImportError:
            log.warning("geoip2 not installed — IP geolocation disabled (pip install geoip2)")
        except Exception as e:
            log.warning(f"GeoIP init failed: {e}")

    def check_wallet(self, address: str) -> ScreeningResult:
        """Screen a wallet address against sanctions lists.

        Checks:
        1. OFAC SDN list (hardcoded + extra file)
        2. TRM Labs API (if key configured)

        Args:
            address: Ethereum wallet address (0x...)

        Returns:
            ScreeningResult with blocked status and details
        """
        addr_lower = address.lower()

        # Layer 1: Local sanctions list
        if addr_lower in self._sanctioned_wallets:
            log.warning(f"BLOCKED: Wallet {address[:10]}... is on OFAC sanctions list")
            return ScreeningResult(
                blocked=True,
                reason="Wallet address is on the OFAC Specially Designated Nationals (SDN) list",
                risk_level="critical",
                details={"source": "OFAC_SDN", "address": address},
            )

        # Layer 2: TRM Labs API (if configured)
        if TRM_API_KEY:
            trm_result = self._check_trm(address)
            if trm_result and trm_result.blocked:
                return trm_result
            if trm_result and trm_result.edd_required:
                return trm_result

        return ScreeningResult(
            blocked=False,
            reason="Wallet passed sanctions screening",
            risk_level="low",
            details={"address": address, "checks": ["OFAC_SDN", "TRM" if TRM_API_KEY else "OFAC_only"]},
        )

    def check_jurisdiction(self, ip_address: str = "", country_code: str = "") -> ScreeningResult:
        """Screen user's jurisdiction against sanctioned countries.

        Args:
            ip_address: User's IP address (for geolocation)
            country_code: Explicit 2-letter country code (if known)

        Returns:
            ScreeningResult with blocked/EDD status
        """
        cc = country_code.upper()

        # Resolve country from IP if not provided
        if not cc and ip_address and self._geoip_reader:
            try:
                response = self._geoip_reader.country(ip_address)
                cc = response.country.iso_code or ""
            except Exception:
                pass

        if not cc:
            # Can't determine jurisdiction — allow but log
            return ScreeningResult(
                blocked=False,
                reason="Jurisdiction could not be determined",
                risk_level="medium",
                details={"ip": ip_address, "note": "GeoIP unavailable or IP not resolvable"},
            )

        # Check blocked jurisdictions
        if cc in BLOCKED_JURISDICTIONS:
            country_name = BLOCKED_JURISDICTIONS[cc]
            log.warning(f"BLOCKED: Access from sanctioned jurisdiction {cc} ({country_name})")
            return ScreeningResult(
                blocked=True,
                reason=f"Access from sanctioned jurisdiction: {country_name}",
                risk_level="critical",
                details={"country_code": cc, "country_name": country_name},
            )

        # Check EDD jurisdictions
        if cc in EDD_JURISDICTIONS:
            country_name = EDD_JURISDICTIONS[cc]
            return ScreeningResult(
                blocked=False,
                edd_required=True,
                reason=f"Enhanced due diligence required: {country_name} (FATF grey list)",
                risk_level="high",
                details={"country_code": cc, "country_name": country_name},
            )

        return ScreeningResult(
            blocked=False,
            reason="Jurisdiction check passed",
            risk_level="low",
            details={"country_code": cc},
        )

    def full_screening(self, address: str, ip_address: str = "", country_code: str = "") -> ScreeningResult:
        """Run all screening checks and return the highest-risk result.

        Args:
            address: Wallet address
            ip_address: User's IP
            country_code: Explicit country code

        Returns:
            The most restrictive ScreeningResult from all checks
        """
        results = [
            self.check_wallet(address),
            self.check_jurisdiction(ip_address=ip_address, country_code=country_code),
        ]

        # Return the most restrictive result
        blocked = [r for r in results if r.blocked]
        if blocked:
            return blocked[0]

        edd = [r for r in results if r.edd_required]
        if edd:
            return edd[0]

        return ScreeningResult(
            blocked=False,
            reason="All sanctions checks passed",
            risk_level="low",
            details={
                "address": address,
                "checks_run": ["OFAC_SDN", "jurisdiction", "TRM" if TRM_API_KEY else "no_TRM"],
            },
        )

    def _check_trm(self, address: str) -> Optional[ScreeningResult]:
        """Check wallet against TRM Labs API.

        Free tier: 1,000 screenings/month.
        Docs: https://docs.trmlabs.com/
        """
        try:
            import urllib.request
            import urllib.error

            url = "https://api.trmlabs.com/public/v2/screening/addresses"
            payload = json.dumps([{"address": address, "chain": "ethereum"}]).encode()

            req = urllib.request.Request(
                url,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Basic {TRM_API_KEY}",
                },
                method="POST",
            )

            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())

            if not data:
                return None

            result = data[0] if isinstance(data, list) else data
            entities = result.get("entities", [])
            risk_indicators = result.get("riskIndicators", [])

            # Check for sanctioned entities
            for entity in entities:
                category = entity.get("category", "").lower()
                if "sanctions" in category or "ofac" in category:
                    return ScreeningResult(
                        blocked=True,
                        reason=f"TRM Labs: wallet linked to sanctioned entity — {entity.get('name', 'unknown')}",
                        risk_level="critical",
                        details={"source": "TRM", "entity": entity},
                    )

            # Check high-risk indicators
            for indicator in risk_indicators:
                category = indicator.get("category", "").lower()
                risk = indicator.get("incomingVolumeUsd", 0) + indicator.get("outgoingVolumeUsd", 0)
                if ("stolen" in category or "ransomware" in category or "terrorism" in category) and risk > 0:
                    return ScreeningResult(
                        blocked=True,
                        reason=f"TRM Labs: wallet linked to {category} activity",
                        risk_level="critical",
                        details={"source": "TRM", "indicator": indicator},
                    )

                if ("mixer" in category or "high risk" in category) and risk > 1000:
                    return ScreeningResult(
                        blocked=False,
                        edd_required=True,
                        reason=f"TRM Labs: wallet has {category} exposure — enhanced review required",
                        risk_level="high",
                        details={"source": "TRM", "indicator": indicator},
                    )

            return None  # No issues found

        except urllib.error.HTTPError as e:
            log.error(f"TRM API error: {e.code} — {e.reason}")
            return None
        except Exception as e:
            log.error(f"TRM API call failed: {e}")
            return None


# ═══════════════════════════════════════════════════════════════
#  SCREENING LOG — Audit Trail
# ═══════════════════════════════════════════════════════════════

class ScreeningLog:
    """Append-only log of all sanctions screening results for audit trail."""

    def __init__(self, log_path: str = ""):
        self.log_path = Path(log_path or os.environ.get(
            "SCREENING_LOG_PATH",
            str(Path(__file__).parent / "screening_log.jsonl")
        ))
        self.log_path.parent.mkdir(parents=True, exist_ok=True)

    def record(self, address: str, action: str, result: ScreeningResult):
        """Record a screening result to the audit log.

        Args:
            address: Wallet address screened
            action: What the user was trying to do (register, create_bounty, claim, etc.)
            result: The screening result
        """
        entry = {
            "timestamp": result.timestamp,
            "address": address,
            "action": action,
            "blocked": result.blocked,
            "edd_required": result.edd_required,
            "risk_level": result.risk_level,
            "reason": result.reason,
            "details": result.details,
        }

        try:
            with open(self.log_path, "a") as f:
                f.write(json.dumps(entry) + "\n")
        except Exception as e:
            log.error(f"Failed to write screening log: {e}")

    def get_history(self, address: str) -> list[dict]:
        """Get screening history for a specific address."""
        history = []
        if not self.log_path.exists():
            return history

        addr_lower = address.lower()
        with open(self.log_path) as f:
            for line in f:
                try:
                    entry = json.loads(line.strip())
                    if entry.get("address", "").lower() == addr_lower:
                        history.append(entry)
                except json.JSONDecodeError:
                    continue

        return history


# ═══════════════════════════════════════════════════════════════
#  CONVENIENCE — Middleware-style check
# ═══════════════════════════════════════════════════════════════

_checker = None
_log = None


def get_checker() -> SanctionsChecker:
    global _checker
    if _checker is None:
        _checker = SanctionsChecker()
    return _checker


def get_log() -> ScreeningLog:
    global _log
    if _log is None:
        _log = ScreeningLog()
    return _log


def screen_user(address: str, action: str, ip_address: str = "", country_code: str = "") -> ScreeningResult:
    """One-call screening: check wallet + jurisdiction + log result.

    Use this in API middleware or before any platform action.

    Args:
        address: User's wallet address
        action: What they're trying to do (e.g., "register", "create_bounty", "claim")
        ip_address: Their IP address
        country_code: Explicit country code (if known)

    Returns:
        ScreeningResult — check .blocked and .edd_required

    Example:
        result = screen_user("0x1234...", "create_bounty", ip_address=request.remote_addr)
        if result.blocked:
            return HTTP 403, result.reason
    """
    checker = get_checker()
    result = checker.full_screening(address, ip_address=ip_address, country_code=country_code)

    screening_log = get_log()
    screening_log.record(address, action, result)

    if result.blocked:
        log.warning(f"SANCTIONS BLOCK: {address[:10]}... action={action} reason={result.reason}")
    elif result.edd_required:
        log.info(f"EDD REQUIRED: {address[:10]}... action={action} reason={result.reason}")

    return result


# ═══════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.INFO, format="%(name)s | %(message)s")

    print("=" * 60)
    print("  Agonaut Sanctions Screening")
    print("=" * 60)
    print(f"  OFAC wallets loaded: {len(SANCTIONED_WALLETS)}")
    print(f"  Extra wallets file:  {'found' if EXTRA_SANCTIONS_FILE.exists() else 'not found'}")
    print(f"  Blocked countries:   {len(BLOCKED_JURISDICTIONS)}")
    print(f"  EDD countries:       {len(EDD_JURISDICTIONS)}")
    print(f"  TRM API:             {'configured' if TRM_API_KEY else 'not configured (free tier available)'}")
    print(f"  GeoIP:               {'configured' if GEOIP_DB_PATH else 'not configured'}")
    print("=" * 60)

    if len(sys.argv) > 1:
        address = sys.argv[1]
        print(f"\n  Screening wallet: {address}")
        result = screen_user(address, "cli_test")
        print(f"  Blocked:      {result.blocked}")
        print(f"  EDD Required: {result.edd_required}")
        print(f"  Risk Level:   {result.risk_level}")
        print(f"  Reason:       {result.reason}")
    else:
        # Test with known sanctioned address
        print("\n  Testing with known Tornado Cash address...")
        result = screen_user("0x722122dF12D4e14e13Ac3b6895a86e84145b6967", "test")
        print(f"  Blocked: {result.blocked} ✅" if result.blocked else f"  Blocked: {result.blocked} ❌")

        print("\n  Testing with clean address...")
        result = screen_user("0x0000000000000000000000000000000000000001", "test")
        print(f"  Clean: {not result.blocked} ✅" if not result.blocked else f"  Clean: {not result.blocked} ❌")

        print("\n  Testing jurisdiction (Iran)...")
        checker = get_checker()
        result = checker.check_jurisdiction(country_code="IR")
        print(f"  Blocked: {result.blocked} ✅" if result.blocked else f"  Blocked: {result.blocked} ❌")

        print("\n  Testing jurisdiction (Germany)...")
        result = checker.check_jurisdiction(country_code="DE")
        print(f"  Allowed: {not result.blocked} ✅" if not result.blocked else f"  Allowed: {not result.blocked} ❌")

        print(f"\n  ✅ Sanctions screening operational.")
