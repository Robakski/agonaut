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
        {"type": "bool", "name": "isPrivate"},
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
        {"type": "bool", "name": "isPrivate"},
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
    "name": "getParticipantCount",
    "inputs": [],
    "outputs": [{"type": "uint256", "name": ""}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "commitDeadline",
    "inputs": [],
    "outputs": [{"type": "uint256", "name": ""}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getCommitment",
    "inputs": [{"type": "uint256", "name": "agentId"}],
    "outputs": [
      {"type": "bytes32", "name": "hash"},
      {"type": "uint64", "name": "timestamp"}
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isParticipant",
    "inputs": [{"type": "uint256", "name": "agentId"}],
    "outputs": [{"type": "bool", "name": ""}],
    "stateMutability": "view"
  }
]""")

ARENA_REGISTRY_ABI = json.loads("""[
  {
    "type": "function",
    "name": "registerWithETH",
    "inputs": [
      {"type": "bytes32", "name": "metadataHash"}
    ],
    "outputs": [{"type": "uint256", "name": "agentId"}],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "ethEntryFee",
    "inputs": [],
    "outputs": [{"type": "uint256", "name": ""}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "usdcEntryFee",
    "inputs": [],
    "outputs": [{"type": "uint256", "name": ""}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAgent",
    "inputs": [{"type": "uint256", "name": "agentId"}],
    "outputs": [{
      "type": "tuple",
      "name": "agent",
      "components": [
        {"type": "address", "name": "wallet"},
        {"type": "bytes32", "name": "metadataHash"},
        {"type": "uint64", "name": "registeredAt"},
        {"type": "uint64", "name": "deregisteredAt"},
        {"type": "uint16", "name": "stableId"},
        {"type": "uint16", "name": "eloRating"},
        {"type": "uint256", "name": "totalWinnings"},
        {"type": "uint32", "name": "roundsEntered"},
        {"type": "uint32", "name": "roundsWon"}
      ]
    }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextAgentId",
    "inputs": [],
    "outputs": [{"type": "uint256", "name": ""}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAgentsByWallet",
    "inputs": [{"type": "address", "name": "wallet"}],
    "outputs": [{"type": "uint256[]", "name": "agentIds"}],
    "stateMutability": "view"
  }
]""")

SCORING_ORACLE_ABI = json.loads("""[
  {
    "type": "function",
    "name": "isResultVerified",
    "inputs": [{"type": "address", "name": "roundAddr"}],
    "outputs": [{"type": "bool", "name": ""}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getScores",
    "inputs": [{"type": "address", "name": "roundAddr"}],
    "outputs": [
      {"type": "uint256[]", "name": "agentIds"},
      {"type": "uint256[]", "name": "scores"}
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAgentScore",
    "inputs": [
      {"type": "address", "name": "roundAddr"},
      {"type": "uint256", "name": "agentId"}
    ],
    "outputs": [
      {"type": "uint256", "name": "score"},
      {"type": "bool", "name": "found"}
    ],
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

    def _send_tx(self, tx_func, value: int = 0, retries: int = 2) -> str:
        """Build, sign, send a transaction and wait for receipt.
        
        Retries on nonce/gas price conflicts (replacement underpriced, nonce too low).
        """
        for attempt in range(retries + 1):
            nonce = self.w3.eth.get_transaction_count(self.operator.address, 'pending')
            gas_price = self.w3.eth.gas_price
            # Use higher gas on retries to replace stuck txs
            gas_multiplier = 3 + attempt * 2  # 3x, 5x, 7x

            tx = tx_func.build_transaction({
                "from": self.operator.address,
                "nonce": nonce,
                "gas": 2_000_000,
                "maxFeePerGas": gas_price * gas_multiplier,
                "maxPriorityFeePerGas": self.w3.to_wei(0.1 * (attempt + 1), "gwei"),
                "chainId": config.CHAIN_ID,
                "value": value,
            })

            try:
                estimated = self.w3.eth.estimate_gas(tx)
                tx["gas"] = int(estimated * 1.2)
            except Exception as e:
                logger.warning(f"Gas estimation failed, using default: {e}")

            try:
                signed = self.w3.eth.account.sign_transaction(tx, self.operator.key)
                tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
                logger.info(f"TX sent (attempt {attempt+1}): {tx_hash.hex()}")

                receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
                if receipt["status"] != 1:
                    raise RuntimeError(f"Transaction reverted: {tx_hash.hex()}")

                logger.info(f"TX confirmed: {tx_hash.hex()} (block {receipt['blockNumber']})")
                return tx_hash.hex()

            except Exception as e:
                err_msg = str(e).lower()
                if attempt < retries and ("nonce" in err_msg or "underpriced" in err_msg or "replacement" in err_msg):
                    logger.warning(f"TX attempt {attempt+1} failed ({e}), retrying with higher gas...")
                    import time
                    time.sleep(2)
                    continue
                raise

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
        is_private: bool = False,
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
            is_private,                                          # isPrivate (2.5% fee if true)
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

    def get_next_agent_id(self) -> int:
        """Next agent ID (= total agents + 1)."""
        registry = self.w3.eth.contract(
            address=Web3.to_checksum_address(config.ARENA_REGISTRY),
            abi=ARENA_REGISTRY_ABI,
        )
        return registry.functions.nextAgentId().call()

    def get_agent(self, agent_id: int) -> Optional[dict]:
        """Read agent data from ArenaRegistry.

        Returns dict with: agentId, wallet, metadataHash, registeredAt,
        deregisteredAt, stableId, eloRating, totalWinnings, roundsEntered, roundsWon
        """
        try:
            registry = self.w3.eth.contract(
                address=Web3.to_checksum_address(config.ARENA_REGISTRY),
                abi=ARENA_REGISTRY_ABI,
            )
            result = registry.functions.getAgent(agent_id).call()
            # Result is a tuple matching Agent struct (9 fields):
            # wallet, metadataHash, registeredAt, deregisteredAt, stableId,
            # eloRating, totalWinnings, roundsEntered, roundsWon
            wallet, metadata_hash, registered_at, deregistered_at, stable_id, \
                elo_rating, total_winnings, rounds_entered, rounds_won = result

            return {
                "agentId": agent_id,
                "wallet": wallet,
                "metadataHash": metadata_hash.hex() if isinstance(metadata_hash, bytes) else metadata_hash,
                "registeredAt": registered_at,
                "deregistered": deregistered_at > 0,
                "deregisteredAt": deregistered_at,
                "stableId": stable_id,
                "eloRating": elo_rating,
                "totalWinnings": total_winnings,
                "totalWinningsEth": float(self.w3.from_wei(total_winnings, "ether")),
                "roundsEntered": rounds_entered,
                "roundsWon": rounds_won,
            }
        except Exception as e:
            logger.warning(f"Failed to read agent {agent_id}: {e}")
            return None

    def get_operator_balance(self) -> float:
        """Operator ETH balance."""
        bal = self.w3.eth.get_balance(self.operator.address)
        return float(self.w3.from_wei(bal, "ether"))

    def verify_commitment(self, round_address: str, agent_address: str, commit_hash: str) -> bool:
        """Verify an agent's on-chain commitment matches the submitted hash.

        Looks up agent IDs for the wallet, then checks each for a matching commitment.
        """
        try:
            # Get agent IDs for this wallet
            registry = self.w3.eth.contract(
                address=Web3.to_checksum_address(config.ARENA_REGISTRY),
                abi=ARENA_REGISTRY_ABI,
            )
            agent_ids = registry.functions.getAgentsByWallet(
                Web3.to_checksum_address(agent_address)
            ).call()

            if not agent_ids:
                return False

            contract = self.w3.eth.contract(
                address=Web3.to_checksum_address(round_address),
                abi=BOUNTY_ROUND_ABI,
            )
            expected = bytes.fromhex(commit_hash.replace("0x", ""))

            for agent_id in agent_ids:
                try:
                    result = contract.functions.getCommitment(agent_id).call()
                    on_chain_hash = result[0]  # (bytes32 hash, uint64 timestamp)
                    if on_chain_hash == expected:
                        return True
                except Exception:
                    continue

            return False
        except Exception as e:
            logger.warning(f"Commitment verification failed: {e}")
            return False

    def get_round_details(self, round_address: str) -> dict:
        """Read full round state for dashboard/listing."""
        contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(round_address),
            abi=BOUNTY_ROUND_ABI,
        )
        phase = contract.functions.phase().call()
        agent_count = contract.functions.getParticipantCount().call()
        sponsor = contract.functions.sponsor().call()
        deposit = contract.functions.sponsorDeposit().call()
        deadline = contract.functions.commitDeadline().call()

        PHASE_NAMES = {0: "OPEN", 1: "FUNDED", 2: "COMMIT", 3: "SCORING", 4: "SETTLED", 5: "CANCELLED", 6: "DISPUTED"}
        return {
            "phase": PHASE_NAMES.get(phase, f"UNKNOWN({phase})"),
            "phase_id": phase,
            "agent_count": agent_count,
            "sponsor": sponsor,
            "deposit_wei": str(deposit),
            "deposit_eth": float(self.w3.from_wei(deposit, "ether")),
            "commit_deadline": deadline,
        }

    def is_registered_agent(self, wallet_address: str) -> bool:
        """
        Check if a wallet address is registered as an active agent in ArenaRegistry.
        Uses getAgentsByWallet for efficient lookup (no iteration needed).
        """
        try:
            registry = self.w3.eth.contract(
                address=Web3.to_checksum_address(config.ARENA_REGISTRY),
                abi=ARENA_REGISTRY_ABI,
            )
            agent_ids = registry.functions.getAgentsByWallet(
                Web3.to_checksum_address(wallet_address)
            ).call()

            if not agent_ids:
                return False

            # Check if any of the wallet's agents are active (deregisteredAt == 0)
            for agent_id in agent_ids:
                try:
                    agent = registry.functions.getAgent(agent_id).call()
                    deregistered_at = agent[3]  # deregisteredAt (uint64)
                    if deregistered_at == 0:  # 0 means still active
                        return True
                except Exception:
                    continue

            return False
        except Exception as e:
            logger.warning(f"Failed to check agent registration for {wallet_address}: {e}")
            return False

    def has_agent_committed(self, round_address: str, agent_address: str) -> bool:
        """Check if any agent owned by this wallet is a participant in the round."""
        try:
            # Use the main ABIs (which now include getAgentsByWallet and isParticipant)
            registry = self.w3.eth.contract(
                address=Web3.to_checksum_address(config.ARENA_REGISTRY),
                abi=ARENA_REGISTRY_ABI,
            )
            agent_ids = registry.functions.getAgentsByWallet(
                Web3.to_checksum_address(agent_address)
            ).call()

            if not agent_ids:
                logger.info(f"Wallet {agent_address[:10]}... has no registered agents")
                return False

            round_contract = self.w3.eth.contract(
                address=Web3.to_checksum_address(round_address),
                abi=BOUNTY_ROUND_ABI,
            )

            for agent_id in agent_ids:
                if round_contract.functions.isParticipant(agent_id).call():
                    logger.info(f"Agent {agent_id} (wallet {agent_address[:10]}...) is participant in {round_address[:10]}...")
                    return True

            logger.info(f"No agents from wallet {agent_address[:10]}... are participants in {round_address[:10]}...")
            return False
        except Exception as e:
            logger.warning(f"Failed to check agent commitment: {e}")
            return False

    # ── ScoringOracle reads ──

    def is_result_verified(self, round_address: str) -> bool:
        """Check if scoring results exist for a round."""
        try:
            oracle = self.w3.eth.contract(
                address=Web3.to_checksum_address(config.SCORING_ORACLE),
                abi=SCORING_ORACLE_ABI,
            )
            return oracle.functions.isResultVerified(
                Web3.to_checksum_address(round_address)
            ).call()
        except Exception as e:
            logger.warning(f"Failed to check result verification: {e}")
            return False

    def get_scores(self, round_address: str) -> tuple[list[int], list[int]]:
        """Get scoring results for a round from ScoringOracle."""
        oracle = self.w3.eth.contract(
            address=Web3.to_checksum_address(config.SCORING_ORACLE),
            abi=SCORING_ORACLE_ABI,
        )
        agent_ids, scores = oracle.functions.getScores(
            Web3.to_checksum_address(round_address)
        ).call()
        return list(agent_ids), list(scores)

    def build_register_agent_tx(self, owner_address: str, name: str, metadata_cid: str) -> dict:
        """Build unsigned transaction for agent registration.

        The contract uses registerWithETH(bytes32 metadataHash).
        We hash the metadata CID to get a bytes32 value.
        """
        registry = self.w3.eth.contract(
            address=Web3.to_checksum_address(config.ARENA_REGISTRY),
            abi=ARENA_REGISTRY_ABI,
        )
        reg_fee = registry.functions.ethEntryFee().call()

        # Convert metadata CID to bytes32 hash
        import hashlib
        metadata_hash = bytes.fromhex(
            hashlib.sha256(metadata_cid.encode()).hexdigest()
        )
        tx_data = registry.functions.registerWithETH(metadata_hash)

        # Build unsigned transaction
        tx = tx_data.build_transaction({
            "from": Web3.to_checksum_address(owner_address),
            "value": reg_fee,
            "gas": 300_000,
            "maxFeePerGas": self.w3.eth.gas_price * 2,
            "maxPriorityFeePerGas": self.w3.to_wei(0.001, "gwei"),
            "chainId": config.CHAIN_ID,
            "nonce": self.w3.eth.get_transaction_count(Web3.to_checksum_address(owner_address)),
        })

        try:
            estimated = self.w3.eth.estimate_gas(tx)
            tx["gas"] = int(estimated * 1.2)
        except Exception as e:
            logger.warning(f"Gas estimation failed for registerAgent: {e}")

        return {
            "to": config.ARENA_REGISTRY,
            "data": tx["data"],
            "value": hex(reg_fee),
            "gas": hex(tx["gas"]),
            "maxFeePerGas": hex(tx["maxFeePerGas"]),
            "maxPriorityFeePerGas": hex(tx["maxPriorityFeePerGas"]),
            "chainId": hex(config.CHAIN_ID),
            "ethEntryFeeWei": str(reg_fee),
            "ethEntryFeeEth": str(float(self.w3.from_wei(reg_fee, "ether"))),
        }


# Singleton
_chain_service: Optional[ChainService] = None


def get_chain_service() -> ChainService:
    global _chain_service
    if _chain_service is None:
        _chain_service = ChainService()
    return _chain_service
