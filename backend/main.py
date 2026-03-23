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

# ── Security Middleware (rate limiting + admin auth + body size) ──

app.add_middleware(SecurityMiddleware)

# ── Sanctions Middleware (INV-8.7: compliance from day one) ──

app.add_middleware(SanctionsMiddleware)

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
            "model": config.SCORING_MODEL,
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
