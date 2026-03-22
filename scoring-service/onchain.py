"""
On-chain score submission via ScoringOracle.

Submits verified scores from the TEE scoring engine to the
ScoringOracle contract on Base L2.

Uses web3.py for transaction construction and signing.
"""

import logging
import os
import json
from typing import Optional

try:
    from web3 import Web3
    from web3.middleware import ExtraDataToPOAMiddleware
except ImportError:
    raise ImportError("pip install web3")

log = logging.getLogger("onchain")

# ── Config ──

RPC_URL = os.environ.get("RPC_URL", "https://sepolia.base.org")
SCORING_ORACLE = os.environ.get("SCORING_ORACLE", "")
SCORER_PRIVATE_KEY = os.environ.get("SCORER_PRIVATE_KEY", "")
CHAIN_ID = int(os.environ.get("CHAIN_ID", "84532"))

# ScoringOracle ABI (only what we need)
SCORING_ORACLE_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "roundAddr", "type": "address"},
            {"internalType": "uint256[]", "name": "agentIds", "type": "uint256[]"},
            {"internalType": "uint256[]", "name": "scores", "type": "uint256[]"},
        ],
        "name": "submitScores",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "address", "name": "roundAddr", "type": "address"}],
        "name": "isResultVerified",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "address", "name": "roundAddr", "type": "address"}],
        "name": "getScores",
        "outputs": [
            {"internalType": "uint256[]", "name": "agentIds", "type": "uint256[]"},
            {"internalType": "uint256[]", "name": "scores", "type": "uint256[]"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
]


def get_web3() -> Web3:
    """Get configured Web3 instance."""
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    # Base L2 uses PoA-like consensus
    w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
    if not w3.is_connected():
        raise ConnectionError(f"Cannot connect to {RPC_URL}")
    return w3


def submit_scores(
    round_address: str,
    agent_ids: list[int],
    scores: list[int],
    scorer_key: str = "",
) -> dict:
    """Submit scores to ScoringOracle on-chain.

    Args:
        round_address: BountyRound contract address
        agent_ids: List of on-chain agent IDs
        scores: List of scores (0-10000 BPS) matching agent_ids order
        scorer_key: Private key of scorer wallet (or uses env var)

    Returns:
        dict with tx_hash, status, gas_used, etc.

    Raises:
        ValueError: If config missing or scores already submitted
        Exception: If transaction reverts
    """
    key = scorer_key or SCORER_PRIVATE_KEY
    oracle_addr = SCORING_ORACLE

    if not key:
        raise ValueError("SCORER_PRIVATE_KEY not configured")
    if not oracle_addr:
        raise ValueError("SCORING_ORACLE address not configured")
    if len(agent_ids) != len(scores):
        raise ValueError(f"agent_ids ({len(agent_ids)}) and scores ({len(scores)}) length mismatch")

    w3 = get_web3()
    oracle = w3.eth.contract(
        address=Web3.to_checksum_address(oracle_addr),
        abi=SCORING_ORACLE_ABI,
    )

    # Check if already submitted
    already = oracle.functions.isResultVerified(
        Web3.to_checksum_address(round_address)
    ).call()
    if already:
        raise ValueError(f"Scores already submitted for round {round_address}")

    # Build transaction
    scorer_account = w3.eth.account.from_key(key)
    scorer_address = scorer_account.address

    nonce = w3.eth.get_transaction_count(scorer_address)

    # Estimate gas
    tx_data = oracle.functions.submitScores(
        Web3.to_checksum_address(round_address),
        agent_ids,
        scores,
    )

    try:
        gas_estimate = tx_data.estimate_gas({"from": scorer_address})
    except Exception as e:
        log.error(f"Gas estimation failed: {e}")
        raise ValueError(f"Transaction would revert: {e}")

    # Add 20% buffer
    gas_limit = int(gas_estimate * 1.2)

    # Get gas price (Base L2 uses EIP-1559)
    base_fee = w3.eth.get_block("latest")["baseFeePerGas"]
    max_priority = w3.to_wei(0.001, "gwei")  # Base L2 priority fee is very low
    max_fee = base_fee * 2 + max_priority

    tx = tx_data.build_transaction({
        "from": scorer_address,
        "nonce": nonce,
        "gas": gas_limit,
        "maxFeePerGas": max_fee,
        "maxPriorityFeePerGas": max_priority,
        "chainId": CHAIN_ID,
        "type": 2,  # EIP-1559
    })

    # Sign and send
    signed = w3.eth.account.sign_transaction(tx, key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)

    log.info(f"Score submission tx sent: {tx_hash.hex()}")

    # Wait for receipt
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

    result = {
        "tx_hash": tx_hash.hex(),
        "status": "success" if receipt["status"] == 1 else "reverted",
        "block_number": receipt["blockNumber"],
        "gas_used": receipt["gasUsed"],
        "round_address": round_address,
        "agent_count": len(agent_ids),
    }

    if receipt["status"] == 1:
        log.info(
            f"Scores submitted on-chain: round={round_address[:10]}... "
            f"agents={len(agent_ids)} gas={receipt['gasUsed']} "
            f"block={receipt['blockNumber']}"
        )
    else:
        log.error(f"Score submission REVERTED: {result}")

    return result


def verify_scores(round_address: str) -> Optional[dict]:
    """Read scores from ScoringOracle on-chain (for verification)."""
    w3 = get_web3()
    oracle = w3.eth.contract(
        address=Web3.to_checksum_address(SCORING_ORACLE),
        abi=SCORING_ORACLE_ABI,
    )

    verified = oracle.functions.isResultVerified(
        Web3.to_checksum_address(round_address)
    ).call()

    if not verified:
        return None

    agent_ids, scores = oracle.functions.getScores(
        Web3.to_checksum_address(round_address)
    ).call()

    return {
        "round_address": round_address,
        "verified": True,
        "agent_ids": list(agent_ids),
        "scores": list(scores),
    }


if __name__ == "__main__":
    """Quick verification test."""
    logging.basicConfig(level=logging.INFO)

    if not SCORING_ORACLE:
        print("SCORING_ORACLE not set — skipping")
        exit(0)

    w3 = get_web3()
    print(f"Connected to {RPC_URL}, chain {w3.eth.chain_id}")

    oracle = w3.eth.contract(
        address=Web3.to_checksum_address(SCORING_ORACLE),
        abi=SCORING_ORACLE_ABI,
    )
    print(f"ScoringOracle: {SCORING_ORACLE}")

    if SCORER_PRIVATE_KEY:
        account = w3.eth.account.from_key(SCORER_PRIVATE_KEY)
        balance = w3.eth.get_balance(account.address)
        print(f"Scorer: {account.address} ({w3.from_wei(balance, 'ether')} ETH)")
    else:
        print("SCORER_PRIVATE_KEY not set")
