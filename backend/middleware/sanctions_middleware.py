"""
Sanctions Screening Middleware for FastAPI

Screens every request that includes a wallet address against:
1. OFAC SDN sanctioned wallet list
2. Jurisdiction blocking (via IP geolocation)
3. TRM Labs API (if configured)

INV-8.7: No service without compliance from day one.
"""

import logging
import sys
from pathlib import Path
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

# Add compliance module to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "compliance"))

from sanctions import screen_user, get_checker

log = logging.getLogger("middleware.sanctions")


class SanctionsMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware that screens wallet addresses on relevant endpoints."""

    # Endpoints that require sanctions screening (wallet address in body or path)
    SCREENED_ENDPOINTS = {
        "/api/v1/agents/register",
        "/api/v1/bounties/create",
        "/api/v1/bounties/contribute",
        "/api/v1/rounds/commit",
        "/api/v1/rounds/claim",
        "/api/v1/solutions/submit",
    }

    # Endpoints that only need jurisdiction check (no wallet needed)
    JURISDICTION_ENDPOINTS = {
        "/api/v1/bounties",
        "/api/v1/leaderboard",
    }

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Skip non-API routes and health checks
        if not path.startswith("/api/") or path == "/api/v1/health":
            return await call_next(request)

        # Get client IP for jurisdiction check
        client_ip = request.client.host if request.client else ""

        # Jurisdiction-only check for read endpoints
        if path in self.JURISDICTION_ENDPOINTS:
            checker = get_checker()
            result = checker.check_jurisdiction(ip_address=client_ip)
            if result.blocked:
                log.warning(f"Jurisdiction blocked: {client_ip} -> {path}")
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "service_unavailable_in_region",
                        "message": "This service is not available in your region.",
                    }
                )
            return await call_next(request)

        # Full screening for write endpoints
        if path in self.SCREENED_ENDPOINTS:
            # Try to extract wallet address from request
            wallet = None

            # Check query params
            wallet = request.query_params.get("address") or request.query_params.get("wallet")

            # Check path params (e.g., /agents/{address}/...)
            if not wallet and request.path_params:
                wallet = request.path_params.get("address")

            # Check headers (wallet connection)
            if not wallet:
                wallet = request.headers.get("X-Wallet-Address")

            # Try to extract from POST body if not found elsewhere
            if not wallet and request.method == "POST":
                try:
                    body = await request.body()
                    if body:
                        import json
                        data = json.loads(body)
                        wallet = (
                            data.get("sponsorAddress")
                            or data.get("owner_address")
                            or data.get("wallet")
                            or data.get("agent_address")
                        )
                        # Re-attach body so downstream handlers can read it
                        # (Starlette caches it after first read)
                except Exception:
                    pass

            if wallet:
                action = path.split("/")[-1]  # e.g., "register", "create", "commit"
                result = screen_user(wallet, action, ip_address=client_ip)

                if result.blocked:
                    log.warning(f"Sanctions blocked: {wallet[:10]}... action={action}")
                    raise HTTPException(
                        status_code=403,
                        detail={
                            "error": "sanctions_blocked",
                            "message": "This wallet address is restricted from using the platform.",
                        }
                    )

                if result.edd_required:
                    # Don't block — but flag for KYC tier escalation
                    request.state.edd_required = True
                    request.state.edd_reason = result.reason

        return await call_next(request)
