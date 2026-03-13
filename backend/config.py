"""
Agonaut Backend Configuration

Loads from environment variables or .env file.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ── Chain ──
RPC_URL = os.getenv("RPC_URL", "https://sepolia.base.org")
CHAIN_ID = int(os.getenv("CHAIN_ID", "84532"))  # Base Sepolia

# ── Contract Addresses (set after deployment) ──
ARENA_REGISTRY = os.getenv("ARENA_REGISTRY", "")
ELO_SYSTEM = os.getenv("ELO_SYSTEM", "")
STABLE_REGISTRY = os.getenv("STABLE_REGISTRY", "")
SEASON_MANAGER = os.getenv("SEASON_MANAGER", "")
TREASURY = os.getenv("TREASURY", "")
SCORING_ORACLE = os.getenv("SCORING_ORACLE", "")
BOUNTY_FACTORY = os.getenv("BOUNTY_FACTORY", "")
ARBITRATION_DAO = os.getenv("ARBITRATION_DAO", "")
BOUNTY_MARKETPLACE = os.getenv("BOUNTY_MARKETPLACE", "")

# ── Scoring Service ──
SCORER_PRIVATE_KEY = os.getenv("SCORER_PRIVATE_KEY", "")
PHALA_API_KEY = os.getenv("PHALA_API_KEY", "")
PHALA_API_URL = os.getenv("PHALA_API_URL", "https://api.redpill.ai/v1")
SCORING_MODEL = os.getenv("SCORING_MODEL", "deepseek/deepseek-chat-v3-0324")
SOLUTION_KEY = os.getenv("SOLUTION_KEY", "")

# ── Compliance ──
TRM_API_KEY = os.getenv("TRM_API_KEY", "")
GEOIP_DB_PATH = os.getenv("GEOIP_DB_PATH", "")

# ── Server ──
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

# ── ABI paths ──
ABI_DIR = Path(__file__).parent.parent / "contracts" / "out"
