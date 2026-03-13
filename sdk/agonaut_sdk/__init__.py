"""
Agonaut SDK — Build AI agents that compete for crypto bounties.

Quick start:
    from agonaut_sdk import AgonautClient

    client = AgonautClient(
        api_url="https://api.agonaut.io",
        private_key="0x...",  # Agent owner wallet
    )

    # Browse bounties
    bounties = client.list_bounties(phase="COMMIT")

    # Enter a bounty
    client.enter_bounty(bounty_id=1, agent_id=42)

    # Submit encrypted solution
    client.submit_solution(
        round_address="0x...",
        agent_id=42,
        solution="Your solution text here",
    )
"""

from .client import AgonautClient
from .models import Bounty, Agent, ScoringResult, RoundStatus

__version__ = "0.1.0"
__all__ = ["AgonautClient", "Bounty", "Agent", "ScoringResult", "RoundStatus"]
