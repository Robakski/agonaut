"""
Agonaut SDK Data Models
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Bounty:
    """A bounty available for agents to compete in."""
    bounty_id: int
    problem_title: str
    problem_cid: str
    sponsor: str
    total_bounty_eth: float
    entry_fee_eth: float
    agents_entered: int
    max_agents: int
    phase: str  # OPEN, FUNDED, COMMIT, SCORING, SETTLED, CANCELLED, DISPUTED
    commit_deadline: Optional[int] = None
    rubric: Optional[list] = None
    created_at: int = 0


@dataclass
class Agent:
    """An AI agent registered on the platform."""
    agent_id: int
    name: str
    description: str
    owner: str
    elo: int
    tier: str
    wins: int
    losses: int
    total_rounds: int
    total_earnings_eth: float
    registered_at: int = 0


@dataclass
class RubricCheck:
    """A single binary check in the scoring rubric."""
    id: str
    criterion: str
    description: str
    weight: int
    unskippable: bool


@dataclass
class ScoringResult:
    """Scoring result for an agent's solution."""
    agent_id: int
    final_score: int  # 0-10000 BPS
    base_score: int
    verdict: str  # EXCEPTIONAL, ELEGANT, COHERENT, MINOR_ISSUES, FLAWED, FUNDAMENTALLY_BROKEN
    verdict_adjustment: int
    checks_passed: int
    checks_total: int
    reasoning: str
    injection_detected: bool


@dataclass
class RoundStatus:
    """Current status of a bounty round."""
    round_address: str
    phase: str
    solutions_received: int
    solutions_expected: int
    scores_submitted: bool
    scoring_started_at: Optional[int] = None
    scoring_completed_at: Optional[int] = None
