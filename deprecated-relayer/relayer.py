#!/usr/bin/env python3
"""
Agonaut MPC Relayer — Bridges scoring results from Partisia → Base L2

This script:
1. Monitors the Partisia MPC contract for completed scoring rounds
2. Reads the attested scores + MPC node signatures
3. Submits them to PartisiaMpcVerifier on Base L2
4. Anyone can run this — signatures prove authenticity, not the relayer

Architecture:
    Partisia Blockchain (MPC scores + signatures)
        ↓ (this relayer reads results)
    relayer.py
        ↓ (submits to Base L2)
    PartisiaMpcVerifier.sol (verifies signatures, stores scores)
        ↓ (BountyRound reads verified scores)
    BountyRound.finalize() → prize distribution

Requirements:
    pip install web3 requests

Environment variables:
    BASE_RPC_URL        — Base L2 RPC endpoint
    PRIVATE_KEY         — Relayer wallet private key (pays gas, not trusted)
    VERIFIER_ADDRESS    — PartisiaMpcVerifier contract address on Base
    PBC_API_URL         — Partisia Blockchain REST API endpoint
    PBC_CONTRACT_ADDR   — Partisia MPC contract address
    POLL_INTERVAL       — Seconds between polls (default: 30)
"""

import os
import sys
import json
import time
import logging
from typing import Optional

# Web3 for Base L2 interaction
try:
    from web3 import Web3
    from web3.middleware import ExtraDataToPOAMiddleware
except ImportError:
    print("Install web3: pip install web3")
    sys.exit(1)

# Requests for Partisia REST API
try:
    import requests
except ImportError:
    print("Install requests: pip install requests")
    sys.exit(1)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("relayer")

# ═══════════════════════════════════════════════════════════════
#  CONFIGURATION
# ═══════════════════════════════════════════════════════════════

BASE_RPC_URL = os.environ.get("BASE_RPC_URL", "https://mainnet.base.org")
PRIVATE_KEY = os.environ.get("PRIVATE_KEY", "")
VERIFIER_ADDRESS = os.environ.get("VERIFIER_ADDRESS", "")
PBC_API_URL = os.environ.get("PBC_API_URL", "https://reader.partisiablockchain.com")
PBC_CONTRACT_ADDR = os.environ.get("PBC_CONTRACT_ADDR", "")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "30"))

# PartisiaMpcVerifier ABI (only the function we need)
VERIFIER_ABI = json.loads("""[
    {
        "inputs": [
            {"internalType": "address", "name": "roundAddr", "type": "address"},
            {"internalType": "uint256[]", "name": "agentIds", "type": "uint256[]"},
            {"internalType": "uint256[]", "name": "scores", "type": "uint256[]"},
            {"internalType": "bytes[]", "name": "signatures", "type": "bytes[]"}
        ],
        "name": "submitMpcResult",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "address", "name": "roundAddr", "type": "address"}],
        "name": "isResultVerified",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function"
    }
]""")


# ═══════════════════════════════════════════════════════════════
#  PARTISIA BLOCKCHAIN CLIENT
# ═══════════════════════════════════════════════════════════════

class PartisiaClient:
    """Reads scoring results from the Partisia MPC contract."""

    def __init__(self, api_url: str, contract_addr: str):
        self.api_url = api_url.rstrip("/")
        self.contract_addr = contract_addr

    def get_contract_state(self) -> Optional[dict]:
        """Fetch the full contract state from Partisia reader node."""
        url = f"{self.api_url}/shards/Shard0/blockchain/contracts/{self.contract_addr}"
        try:
            resp = requests.get(url, timeout=15)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            log.error(f"Failed to fetch PBC contract state: {e}")
            return None

    def get_completed_results(self) -> list[dict]:
        """Get all completed scoring results with proofs."""
        state = self.get_contract_state()
        if not state:
            return []

        results = []
        # Parse the contract state to extract completed results
        # The exact parsing depends on Partisia's state serialization format
        # This is a simplified version — real implementation needs proper deserialization
        contract_data = state.get("serializedContract", {})

        # Look for results with proof attached (status == Complete)
        for result in contract_data.get("results", []):
            if result.get("proof") is not None:
                results.append(result)

        return results


# ═══════════════════════════════════════════════════════════════
#  BASE L2 CLIENT
# ═══════════════════════════════════════════════════════════════

class BaseClient:
    """Submits verified MPC results to PartisiaMpcVerifier on Base L2."""

    def __init__(self, rpc_url: str, private_key: str, verifier_address: str):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

        self.account = self.w3.eth.account.from_key(private_key)
        self.verifier = self.w3.eth.contract(
            address=Web3.to_checksum_address(verifier_address),
            abi=VERIFIER_ABI,
        )
        log.info(f"Relayer address: {self.account.address}")
        log.info(f"Verifier address: {verifier_address}")

    def is_already_verified(self, round_addr: str) -> bool:
        """Check if a round's result is already submitted on Base."""
        return self.verifier.functions.isResultVerified(
            Web3.to_checksum_address(round_addr)
        ).call()

    def submit_result(
        self,
        round_addr: str,
        agent_ids: list[int],
        scores: list[int],
        signatures: list[bytes],
    ) -> Optional[str]:
        """Submit MPC result to PartisiaMpcVerifier on Base L2.

        Returns transaction hash on success, None on failure.
        """
        try:
            # Check if already submitted
            if self.is_already_verified(round_addr):
                log.info(f"Round {round_addr} already verified, skipping")
                return None

            # Build transaction
            tx = self.verifier.functions.submitMpcResult(
                Web3.to_checksum_address(round_addr),
                agent_ids,
                scores,
                signatures,
            ).build_transaction({
                "from": self.account.address,
                "nonce": self.w3.eth.get_transaction_count(self.account.address),
                "gas": 500_000,
                "maxFeePerGas": self.w3.eth.gas_price * 2,
                "maxPriorityFeePerGas": self.w3.to_wei(0.001, "gwei"),
            })

            # Sign and send
            signed = self.account.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            log.info(f"Submitted result for {round_addr}: tx={tx_hash.hex()}")

            # Wait for confirmation
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            if receipt["status"] == 1:
                log.info(f"✅ Result verified on Base for {round_addr}")
                return tx_hash.hex()
            else:
                log.error(f"❌ Transaction reverted for {round_addr}")
                return None

        except Exception as e:
            log.error(f"Failed to submit result for {round_addr}: {e}")
            return None


# ═══════════════════════════════════════════════════════════════
#  RESULT PARSING
# ═══════════════════════════════════════════════════════════════

def parse_proof_signatures(proof_string: str) -> list[bytes]:
    """Parse the EVM-compatible proof string from Partisia into raw signature bytes.

    Input format: '[0xRRRR...SSSS...VV, 0xRRRR...SSSS...VV, ...]'
    Each signature is 65 bytes: r (32) + s (32) + v (1)
    """
    # Strip brackets and split
    proof_string = proof_string.strip("[]")
    sig_strings = [s.strip() for s in proof_string.split(",") if s.strip()]

    signatures = []
    for sig_hex in sig_strings:
        # Remove 0x prefix
        sig_hex = sig_hex.strip().lstrip("0x")
        sig_bytes = bytes.fromhex(sig_hex)
        if len(sig_bytes) != 65:
            log.warning(f"Invalid signature length: {len(sig_bytes)}, expected 65")
            continue
        signatures.append(sig_bytes)

    return signatures


def parse_scoring_result(result: dict) -> tuple[int, list[int], list[int], list[bytes]]:
    """Parse a scoring result from Partisia contract state.

    Returns: (round_id, agent_ids, scores, signatures)
    """
    round_id = result["round_id"]
    agent_ids = [s["agent_id"] for s in result["scores"]]
    scores = [s["score"] for s in result["scores"]]
    signatures = parse_proof_signatures(result["proof"])
    return round_id, agent_ids, scores, signatures


# ═══════════════════════════════════════════════════════════════
#  ROUND ADDRESS MAPPING
# ═══════════════════════════════════════════════════════════════

# The relayer needs to map Partisia round_ids to Base L2 BountyRound addresses.
# This mapping is maintained by the relayer operator (or read from BountyFactory events).

ROUND_ADDRESS_MAP: dict[int, str] = {}
ROUND_MAP_FILE = os.path.join(os.path.dirname(__file__), "round_map.json")


def load_round_map():
    """Load round_id → Base address mapping from file."""
    global ROUND_ADDRESS_MAP
    if os.path.exists(ROUND_MAP_FILE):
        with open(ROUND_MAP_FILE, "r") as f:
            ROUND_ADDRESS_MAP = {int(k): v for k, v in json.load(f).items()}
        log.info(f"Loaded {len(ROUND_ADDRESS_MAP)} round mappings")


def save_round_map():
    """Persist round mapping to file."""
    with open(ROUND_MAP_FILE, "w") as f:
        json.dump({str(k): v for k, v in ROUND_ADDRESS_MAP.items()}, f, indent=2)


# ═══════════════════════════════════════════════════════════════
#  MAIN LOOP
# ═══════════════════════════════════════════════════════════════

def run_relayer():
    """Main relayer loop — polls Partisia, submits to Base."""

    if not PRIVATE_KEY:
        log.error("PRIVATE_KEY not set. Relayer needs a funded wallet to pay gas.")
        sys.exit(1)
    if not VERIFIER_ADDRESS:
        log.error("VERIFIER_ADDRESS not set.")
        sys.exit(1)
    if not PBC_CONTRACT_ADDR:
        log.error("PBC_CONTRACT_ADDR not set.")
        sys.exit(1)

    pbc = PartisiaClient(PBC_API_URL, PBC_CONTRACT_ADDR)
    base = BaseClient(BASE_RPC_URL, PRIVATE_KEY, VERIFIER_ADDRESS)
    load_round_map()

    # Track which results we've already submitted
    submitted_rounds: set[int] = set()

    log.info("🚀 Agonaut Relayer started")
    log.info(f"   Partisia: {PBC_API_URL}")
    log.info(f"   Base RPC: {BASE_RPC_URL}")
    log.info(f"   Poll interval: {POLL_INTERVAL}s")

    while True:
        try:
            results = pbc.get_completed_results()

            for result in results:
                round_id, agent_ids, scores, signatures = parse_scoring_result(result)

                # Skip already submitted
                if round_id in submitted_rounds:
                    continue

                # Need Base L2 address for this round
                round_addr = ROUND_ADDRESS_MAP.get(round_id)
                if not round_addr:
                    log.warning(f"No Base address mapped for round {round_id}, skipping")
                    continue

                log.info(f"New result for round {round_id}: {len(agent_ids)} agents scored")

                # Submit to Base L2
                tx_hash = base.submit_result(round_addr, agent_ids, scores, signatures)
                if tx_hash:
                    submitted_rounds.add(round_id)
                    log.info(f"✅ Round {round_id} relayed to Base: {tx_hash}")

        except KeyboardInterrupt:
            log.info("Relayer stopped by user")
            break
        except Exception as e:
            log.error(f"Relay loop error: {e}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    run_relayer()
