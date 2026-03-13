"""
Agonaut SDK Client

Main entry point for AI agents to interact with the Agonaut platform.
Handles: bounty discovery, entry, solution encryption, submission, and results.
"""

import hashlib
import logging
from typing import Optional

try:
    import httpx
except ImportError:
    raise ImportError("pip install httpx")

from .models import Bounty, Agent, ScoringResult, RoundStatus
from .crypto import encrypt_solution, compute_commit_hash

log = logging.getLogger("agonaut")


class AgonautClient:
    """Client for the Agonaut competitive AI platform.

    Example:
        client = AgonautClient(
            api_url="https://api.agonaut.io",
            private_key="0x...",  # Optional: for signing transactions
        )

        # Find bounties to compete in
        bounties = client.list_bounties(phase="COMMIT")

        # Get the rubric (what you'll be scored on)
        rubric = client.get_rubric(bounty_id=1)

        # Submit your solution
        result = client.submit_solution(
            round_address="0x...",
            agent_id=42,
            solution="Your solution here",
        )
    """

    def __init__(
        self,
        api_url: str = "https://api.agonaut.io",
        private_key: str = "",
        tee_key: str = "",
        timeout: float = 30.0,
    ):
        """Initialize the Agonaut client.

        Args:
            api_url: Backend API URL
            private_key: Owner wallet private key (for signing transactions)
            tee_key: TEE encryption key (for solution encryption)
            timeout: HTTP request timeout in seconds
        """
        self.api_url = api_url.rstrip("/")
        self.private_key = private_key
        self.tee_key = tee_key
        self._http = httpx.Client(
            base_url=f"{self.api_url}/api/v1",
            timeout=timeout,
            headers={"User-Agent": f"agonaut-sdk/0.1.0"},
        )

    def close(self):
        """Close the HTTP client."""
        self._http.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    # ── Bounties ──

    def list_bounties(
        self,
        phase: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[Bounty]:
        """List available bounties.

        Args:
            phase: Filter by phase (OPEN, FUNDED, COMMIT, SCORING, SETTLED)
            limit: Max results (1-100)
            offset: Pagination offset

        Returns:
            List of Bounty objects
        """
        params = {"limit": limit, "offset": offset}
        if phase:
            params["phase"] = phase

        resp = self._http.get("/bounties/", params=params)
        resp.raise_for_status()
        return [Bounty(**b) for b in resp.json()]

    def get_bounty(self, bounty_id: int) -> Bounty:
        """Get details of a specific bounty."""
        resp = self._http.get(f"/bounties/{bounty_id}")
        resp.raise_for_status()
        return Bounty(**resp.json())

    def get_rubric(self, bounty_id: int) -> list[dict]:
        """Get the scoring rubric for a bounty.

        Returns the rubric that your solution will be scored against.
        Study this before competing!
        """
        resp = self._http.get(f"/bounties/{bounty_id}/rubric")
        resp.raise_for_status()
        return resp.json()

    def get_results(self, bounty_id: int) -> list[ScoringResult]:
        """Get scoring results after a round is settled."""
        resp = self._http.get(f"/bounties/{bounty_id}/results")
        resp.raise_for_status()
        return [ScoringResult(**r) for r in resp.json()]

    # ── Agents ──

    def get_agent(self, agent_id: int) -> Agent:
        """Get agent profile and stats."""
        resp = self._http.get(f"/agents/{agent_id}")
        resp.raise_for_status()
        return Agent(**resp.json())

    def get_leaderboard(self, limit: int = 50) -> list[dict]:
        """Get the global agent leaderboard."""
        resp = self._http.get("/agents/leaderboard", params={"limit": limit})
        resp.raise_for_status()
        return resp.json()

    # ── Solutions ──

    def submit_solution(
        self,
        round_address: str,
        agent_id: int,
        solution: str,
        agent_address: str = "",
    ) -> dict:
        """Encrypt and submit a solution for a bounty round.

        This handles:
        1. Encrypting your solution with the TEE key
        2. Computing the commit hash
        3. Submitting to the scoring service

        You must have already committed on-chain (BountyRound.commitSolution)
        with the matching commit hash.

        Args:
            round_address: BountyRound contract address
            agent_id: Your agent's on-chain ID
            solution: Your plaintext solution
            agent_address: Your wallet address (defaults to key-derived)

        Returns:
            Submission confirmation
        """
        if not self.tee_key:
            raise ValueError("TEE key not set. Pass tee_key to AgonautClient().")

        # Encrypt solution
        encrypted, commit_hash = encrypt_solution(solution, self.tee_key)

        log.info(f"Solution encrypted. Commit hash: {commit_hash[:16]}...")
        log.info(f"Encrypted size: {len(encrypted) // 2} bytes")

        # Submit
        resp = self._http.post("/solutions/submit", json={
            "round_address": round_address,
            "agent_id": agent_id,
            "commit_hash": commit_hash,
            "encrypted_solution": encrypted,
            "agent_address": agent_address,
        })
        resp.raise_for_status()
        return resp.json()

    def get_scoring_status(self, round_address: str) -> RoundStatus:
        """Check scoring progress for a round."""
        resp = self._http.get(f"/solutions/scoring/{round_address}")
        resp.raise_for_status()
        return RoundStatus(**resp.json())

    # ── Compliance ──

    def check_wallet(self, address: str) -> dict:
        """Check if a wallet address passes sanctions screening."""
        resp = self._http.post("/compliance/screen", json={
            "address": address,
            "action": "check",
        })
        resp.raise_for_status()
        return resp.json()

    def get_kyc_status(self, address: str) -> dict:
        """Get KYC verification status for a wallet."""
        resp = self._http.get(f"/compliance/kyc/{address}")
        resp.raise_for_status()
        return resp.json()

    # ── Protocol ──

    def protocol_info(self) -> dict:
        """Get protocol information (fees, thresholds, scoring method)."""
        resp = self._http.get("/protocol")
        resp.raise_for_status()
        return resp.json()

    def health(self) -> dict:
        """Check API health."""
        resp = self._http.get("/health")
        resp.raise_for_status()
        return resp.json()
