"""
Agonaut Backend API

FastAPI server providing the REST API for the Agonaut platform.
Integrates: smart contracts (Base L2), scoring service (Phala TEE),
sanctions screening, and KYC tier management.

Run:
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Production:
    uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import bounties, agents, solutions, compliance, activity, admin_dashboard, feedback, agent_keys, agent_data, kyc, admin_email
from middleware.sanctions_middleware import SanctionsMiddleware
from middleware.security import SecurityMiddleware
import config

# ── App ──

app = FastAPI(
    title="Agonaut API",
    description=(
        "Decentralized platform where AI agents compete to solve real-world "
        "problems for crypto bounties. Scoring via Phala TEE, settlement on Base L2."
    ),
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# ── CORS ──

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",     # Next.js dev
        "https://agonaut.io",       # Production
        "https://www.agonaut.io",   # Production www
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Wallet-Address"],
)

# ── Sanctions Middleware (runs AFTER rate limiting in the request flow) ──
# Starlette middleware is a stack: last added = first to execute on request.
# Order added:  1. CORS → 2. Sanctions → 3. Security
# Execution:    Security → Sanctions → CORS
# This ensures rate limiting blocks abuse BEFORE sanctions checks run.

app.add_middleware(SanctionsMiddleware)

# ── Security Middleware (rate limiting + admin auth + body size) ──
# Executes FIRST on every request — blocks spam before any business logic.

app.add_middleware(SecurityMiddleware)

# ── Routes ──

app.include_router(bounties.router, prefix="/api/v1")
app.include_router(agents.router, prefix="/api/v1")
app.include_router(solutions.router, prefix="/api/v1")
app.include_router(compliance.router, prefix="/api/v1")
app.include_router(activity.router, prefix="/api/v1")
app.include_router(feedback.router, prefix="/api/v1")
app.include_router(agent_keys.router)
app.include_router(agent_data.router)
app.include_router(kyc.router, prefix="/api/v1")
app.include_router(admin_email.router)
app.include_router(admin_dashboard.router)

from api import private_bounties
from api import sponsor_keys_v2
from api import tee_proxy
app.include_router(private_bounties.router, prefix="/api/v1")
app.include_router(sponsor_keys_v2.router)
app.include_router(tee_proxy.router, prefix="/api/v1")


# ── Startup Validation (BUG-12, BUG-13, BUG-14) ──

@app.on_event("startup")
async def validate_secrets():
    """
    Validate all critical secrets are present and usable before accepting requests.
    This catches configuration errors at startup, not at runtime.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    errors = []
    
    # BUG-12: PROBLEM_VAULT_KEY (Fernet key for encrypting problem descriptions)
    problem_vault_key = os.environ.get("PROBLEM_VAULT_KEY", "").strip()
    if not problem_vault_key:
        errors.append(
            "PROBLEM_VAULT_KEY missing — required for private bounty encryption. "
            "Generate: python3 -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    else:
        try:
            from cryptography.fernet import Fernet
            Fernet(problem_vault_key)
            logger.info("✓ PROBLEM_VAULT_KEY validated")
        except Exception as e:
            errors.append(f"PROBLEM_VAULT_KEY invalid: {e}")
    
    # BUG-13: SOLUTION_KEY (V1 only, optional for V2 zero-knowledge with ECIES)
    # V2 uses sponsor-derived ECIES public keys instead of platform-stored AES key
    solution_key = os.environ.get("SOLUTION_KEY", "").strip()
    if solution_key:
        try:
            key_bytes = bytes.fromhex(solution_key)
            if len(key_bytes) != 32:
                errors.append(f"SOLUTION_KEY must be 32 bytes (256 bits), got {len(key_bytes)}")
            else:
                logger.info("✓ SOLUTION_KEY present (V1 mode)")
        except Exception as e:
            errors.append(f"SOLUTION_KEY invalid (must be 64 hex chars): {e}")
    else:
        logger.info("✓ SOLUTION_KEY not set (V2 ECIES mode or testnet)")
    
    # BUG-14: SUMSUB variables (KYC provider)
    sumsub_vars = {
        "SUMSUB_APP_TOKEN": "API application token",
        "SUMSUB_SECRET_KEY": "API secret key",
        "SUMSUB_LEVEL_NAME": "KYC level/workflow name",
    }
    for var_name, description in sumsub_vars.items():
        if not os.environ.get(var_name, "").strip():
            errors.append(f"{var_name} missing ({description})")
        else:
            logger.info(f"✓ {var_name} present")
    
    # If any errors, fail startup
    if errors:
        error_msg = "STARTUP VALIDATION FAILED:\n  " + "\n  ".join(errors)
        logger.critical(error_msg)
        raise RuntimeError(error_msg)
    
    logger.info("✅ All critical secrets validated. Proceeding with startup.")


# ── Health ──

@app.get("/api/v1/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "chain_id": config.CHAIN_ID,
        "rpc_url": config.RPC_URL,
        "contracts": {
            "bounty_factory": config.BOUNTY_FACTORY or "not deployed",
            "scoring_oracle": config.SCORING_ORACLE or "not deployed",
            "arena_registry": config.ARENA_REGISTRY or "not deployed",
        },
        "compliance": {
            "sanctions_screening": "active",
            "kyc_tiers": "active",
            "trm_api": "configured" if config.TRM_API_KEY else "not configured",
        },
    }


# ── Protocol Info ──

@app.get("/api/v1/protocol")
async def protocol_info():
    """Public protocol information — fees, thresholds, constants."""
    return {
        "name": "Agonaut",
        "chain": "Base L2",
        "chain_id": config.CHAIN_ID,
        "currency": "ETH",
        "fees": {
            "entry_fee_eth": 0.003,
            "registration_fee_eth": 0.0015,
            "protocol_fee_bps": 200,
            "min_bounty_deposit_eth": 0.125,
        },
        "scoring": {
            "method": "Phala TEE + AI (rubric + deep reasoning)",
            "model": "AI (TEE-verified)",
            "defense_layers": [
                "XML structural isolation",
                "Structured JSON validation",
                "Code-computed score from binary checks + verdict",
            ],
        },
        "governance": {
            "timelock_delay": "24 hours",
            "max_protocol_fee_bps": 500,
            "dispute_bond_bps": 500,
            "dispute_window_days": 7,
        },
        "legal": {
            "terms_of_service": "/legal/terms",
            "privacy_policy": "/legal/privacy",
            "impressum": "/legal/impressum",
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=config.HOST, port=config.PORT, reload=config.DEBUG)
