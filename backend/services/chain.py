"""
Chain Service — Web3 interaction layer for on-chain operations.

Handles:
- BountyFactory.createBounty() via operator wallet
- BountyFactory.spawnRound() via operator wallet
- Reading contract state (bounty configs, round addresses, phases)
- Transaction management (nonce, gas estimation, confirmations)
"""

import json
import hashlib
import asyncio
import logging
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware
from eth_account import Account

import config

logger = logging.getLogger(__name__)

# ── ABIs ──
# Minimal ABIs inlined to avoid file I/O issues

BOUNTY_FACTORY_ABI = json.loads("""[
  {
    "type": "function",
    "name": "createBounty",
    "inputs": [{
      "type": "tuple",
      "name": "config",
      "components": [
        {"type": "bytes32", "name": "problemCid"},
        {"type": "uint256", "name": "entryFee"},
        {"type": "uint32", "name": "commitDuration"},
        {"type": "uint16[]", "name": "prizeDistribution"},
        {"type": "uint8", "name": "maxAgents"},
        {"type": "uint8", "name": "tier"},
        {"type": "uint16", "name": "acceptanceThreshold"},
        {"type": "bool", "name": "graduatedPayouts"},
        {"type": "bool", "name": "active"},
        {"type": "uint64", "name": "createdAt"},
        {"type": "address", "name": "creator"}
      ]
    }],
    "outputs": [{"type": "uint256", "name": "bountyId"}],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "spawnRound",
    "inputs": [{"type": "uint256", "name": "bountyId"}],
    "outputs": [{"type": "address", "name": "roundAddr"}],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "nextBountyId",
    "inputs": [],
    "outputs": [{"type": "uint256", "name": ""}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBounty",
    "inputs": [{"type": "uint256", "name": "bountyId"}],
    "outputs": [{
      "type": "tuple",
      "name": "config",
      "components": [
        {"type": "bytes32", "name": "problemCid"},
        {"type": "uint256", "name": "entryFee"},
        {"type": "uint32", "name": "commitDuration"},
        {"type": "uint16[]", "name": "prizeDistribution"},
        {"type": "uint8", "name": "maxAgents"},
        {"type": "uint8", "name": "tier"},
        {"type": "uint16", "name": "acceptanceThreshold"},
        {"type": "bool", "name": "graduatedPayouts"},
        {"type": "bool", "name": "active"},
        {"type": "uint64", "name": "createdAt"},
        {"type": "address", "name": "creator"}
      ]
    }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoundCount",
    "inputs": [{"type": "uint256", "name": "bountyId"}],
    "outputs": [{"type": "uint256", "name": "count"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoundAddress",
    "inputs": [
      {"type": "uint256", "name": "bountyId"},
      {"type": "uint256", "name": "roundIndex"}
    ],
    "outputs": [{"type": "address", "name": "roundAddr"}],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "BountyCreated",
    "inputs": [
      {"type": "uint256", "name": "bountyId", "indexed": true},
      {"type": "address", "name": "creator", "indexed": true},
      {"type": "bytes32", "name": "problemCid", "indexed": false}
    ]
  },
  {
    "type": "event",
    "name": "RoundSpawned",
    "inputs": [
      {"type": "uint256", "name": "bountyId", "indexed": true},
      {"type": "uint256", "name": "roundIndex", "indexed": true},
      {"type": "address", "name": "roundAddr", "indexed": false}
    ]
  }
]""")

BOUNTY_ROUND_ABI = json.loads("""[
  {
    "type": "function",
    "name": "phase",
    "inputs": [],
    "outputs": [{"type": "uint8", "name": ""}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "sponsor",
    "inputs": [],
    "outputs": [{"type": "address", "name": ""}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "sponsorDeposit",
    "inputs": [],
    "outputs": [{"type": "uint256", "name": ""}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "agentCount",
    "inputs": [],
    "outputs": [{"type": "uint256", "name": ""}],
    "stateMutability": "view"
  }
]""")


@dataclass
class CreateBountyResult:
    bounty_id: int
    round_address: str
    problem_cid: str
    create_tx_hash: str
    spawn_tx_hash: str


class ChainService:
    """Web3 service for interacting with Agonaut contracts."""

    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(config.RPC_URL))
        # Base is a PoA chain
        self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

        if not config.OPERATOR_PRIVATE_KEY:
            raise ValueError("OPERATOR_PRIVATE_KEY not set")

        self.operator = Account.from_key(config.OPERATOR_PRIVATE_KEY)
        self.factory = self.w3.eth.contract(
            address=Web3.to_checksum_address(config.BOUNTY_FACTORY),
            abi=BOUNTY_FACTORY_ABI,
        )

        logger.info(
            f"ChainService initialized: chain={config.CHAIN_ID}, "
            f"operator={self.operator.address}, "
            f"factory={config.BOUNTY_FACTORY}"
        )

    def _send_tx(self, tx_func, value: int = 0) -> str:
        """Build, sign, send a transaction and wait for receipt."""
        nonce = self.w3.eth.get_transaction_count(self.operator.address)

        tx = tx_func.build_transaction({
            "from": self.operator.address,
            "nonce": nonce,
            "gas": 2_000_000,  # generous limit, actual will be less
            "maxFeePerGas": self.w3.eth.gas_price * 2,
            "maxPriorityFeePerGas": self.w3.to_wei(0.001, "gwei"),
            "chainId": config.CHAIN_ID,
            "value": value,
        })

        # Estimate gas for tighter limit
        try:
            estimated = self.w3.eth.estimate_gas(tx)
            tx["gas"] = int(estimated * 1.2)  # 20% buffer
        except Exception as e:
            logger.warning(f"Gas estimation failed, using default: {e}")

        signed = self.w3.eth.account.sign_transaction(tx, self.operator.key)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)

        logger.info(f"TX sent: {tx_hash.hex()}")

        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        if receipt["status"] != 1:
            raise RuntimeError(f"Transaction reverted: {tx_hash.hex()}")

        logger.info(f"TX confirmed: {tx_hash.hex()} (block {receipt['blockNumber']})")
        return tx_hash.hex()

    def create_bounty_and_spawn(
        self,
        problem_cid_hex: str,
        entry_fee_wei: int,
        commit_duration_sec: int,
        prize_distribution: list[int],
        max_agents: int,
        tier: int,
        acceptance_threshold: int,
        graduated_payouts: bool,
        sponsor_address: str,
    ) -> CreateBountyResult:
        """
        Create a bounty config + spawn a round in two transactions.
        
        Returns the bounty ID and round address for the frontend
        to direct the sponsor's deposit.
        """
        # Build the BountyConfig tuple
        config_tuple = (
            bytes.fromhex(problem_cid_hex.replace("0x", "")),  # problemCid (bytes32)
            entry_fee_wei,                                       # entryFee
            commit_duration_sec,                                 # commitDuration
            prize_distribution,                                  # prizeDistribution
            max_agents,                                          # maxAgents
            tier,                                                # tier
            acceptance_threshold,                                # acceptanceThreshold
            graduated_payouts,                                   # graduatedPayouts
            True,                                                # active (overwritten by contract)
            0,                                                   # createdAt (overwritten)
            Web3.to_checksum_address(sponsor_address),          # creator (overwritten)
        )

        # Step 1: createBounty
        logger.info("Creating bounty on-chain...")
        create_tx = self._send_tx(
            self.factory.functions.createBounty(config_tuple)
        )

        # Read the bounty ID (nextBountyId - 1 after creation)
        bounty_id = self.factory.functions.nextBountyId().call() - 1
        logger.info(f"Bounty created: ID={bounty_id}, tx={create_tx}")

        # Step 2: spawnRound
        logger.info(f"Spawning round for bounty {bounty_id}...")
        spawn_tx = self._send_tx(
            self.factory.functions.spawnRound(bounty_id)
        )

        # Read the round address
        round_address = self.factory.functions.getRoundAddress(bounty_id, 0).call()
        logger.info(f"Round spawned: {round_address}, tx={spawn_tx}")

        return CreateBountyResult(
            bounty_id=bounty_id,
            round_address=round_address,
            problem_cid=problem_cid_hex,
            create_tx_hash=create_tx,
            spawn_tx_hash=spawn_tx,
        )

    def get_round_phase(self, round_address: str) -> int:
        """Read current phase of a BountyRound."""
        contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(round_address),
            abi=BOUNTY_ROUND_ABI,
        )
        return contract.functions.phase().call()

    def get_bounty_count(self) -> int:
        """Total bounties created."""
        return self.factory.functions.nextBountyId().call() - 1

    def get_operator_balance(self) -> float:
        """Operator ETH balance."""
        bal = self.w3.eth.get_balance(self.operator.address)
        return float(self.w3.from_wei(bal, "ether"))


# Singleton
_chain_service: Optional[ChainService] = None


def get_chain_service() -> ChainService:
    global _chain_service
    if _chain_service is None:
        _chain_service = ChainService()
    return _chain_service
