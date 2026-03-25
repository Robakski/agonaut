"""
Security Middleware — Rate limiting, request validation, admin auth.

Enterprise-grade security layer applied globally.
"""

import os
import re
import logging
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

log = logging.getLogger("middleware.security")

ADMIN_KEY = os.environ.get("ADMIN_KEY", "")

# ── Rate Limiter ──
# In-memory storage is fine for single-process; swap to Redis for multi-worker
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

# Rate limit tiers by endpoint pattern
RATE_LIMITS = {
    # Public write endpoints — strict
    "/api/v1/feedback/submit": "10/minute",
    "/api/v1/activity/track": "60/minute",
    "/api/v1/bounties/create": "5/minute",
    "/api/v1/solutions/submit": "10/minute",
    "/api/v1/agents/register": "5/minute",
    "/api/v1/compliance/screen": "20/minute",
    "/api/v1/compliance/monitor/stats": "30/minute",
    "/api/v1/compliance/monitor/alerts": "30/minute",
    "/api/v1/compliance/monitor/wallet": "30/minute",
    "/api/v1/compliance/monitor/reviews": "30/minute",
    "/api/v1/compliance/monitor/high-risk": "30/minute",
    "/api/v1/compliance/monitor/audit-log": "20/minute",
    "/api/v1/compliance/record-tx": "30/minute",
    # Admin endpoints — moderate (authenticated anyway)
    "/api/v1/activity/wallets": "30/minute",
    "/api/v1/activity/stats": "30/minute",
    "/api/v1/activity/export": "10/minute",
    "/api/v1/feedback/list": "30/minute",
    "/admin/dashboard": "20/minute",
    # Role check
    "/api/v1/agents/check-role": "30/minute",
    # KYC endpoints
    "/api/v1/kyc/status": "30/minute",
    "/api/v1/kyc/submit": "5/minute",
    "/api/v1/kyc/pending": "30/minute",
    "/api/v1/kyc/review": "20/minute",
    # Agent API key endpoints
    "/api/v1/keys/create": "5/minute",
    "/api/v1/keys/challenge": "30/minute",
    "/api/v1/keys/revoke": "10/minute",
    # Agent data endpoints (authenticated)
    "/api/v1/agent/bounties": "120/minute",
    "/api/v1/agent/me": "60/minute",
    # Private bounty endpoints
    "/api/v1/private-bounties/store": "5/minute",
    "/api/v1/private-bounties/request-key": "10/minute",
    "/api/v1/solutions/register-sponsor-key": "10/minute",
    "/api/v1/solutions/sponsor-access": "10/minute",
}

# Endpoints that require ADMIN_KEY
ADMIN_ENDPOINTS = {
    "/api/v1/activity/wallets",
    "/api/v1/activity/stats",
    "/api/v1/activity/export",
    "/api/v1/feedback/list",
    "/api/v1/feedback/update-status",
    "/api/v1/solutions/trigger-scoring/",  # operator-only (prefix match catches path params)
    "/api/v1/kyc/pending",
    "/api/v1/kyc/detail/",
    "/api/v1/kyc/review",
    "/api/v1/kyc/audit/",
    "/admin/email/",
}

# Max request body size (bytes)
MAX_BODY_SIZE = 50_000  # 50KB — more than enough for any legitimate request


class SecurityMiddleware(BaseHTTPMiddleware):
    """Unified security middleware: rate limiting + admin auth + body size."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Skip health check
        if path == "/api/v1/health":
            return await call_next(request)

        # ── 1. Request body size limit ──
        if request.method in ("POST", "PUT", "PATCH"):
            content_length = request.headers.get("content-length")
            if content_length and int(content_length) > MAX_BODY_SIZE:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Request body too large"},
                )

        # ── 2. Admin endpoint authentication ──
        # Check if path matches any admin endpoint (prefix match for path params)
        is_admin = False
        for admin_path in ADMIN_ENDPOINTS:
            if path.startswith(admin_path):
                is_admin = True
                break

        if is_admin:
            key = request.query_params.get("key", "")
            if not ADMIN_KEY or key != ADMIN_KEY:
                log.warning(f"Unauthorized admin access attempt: {path} from {get_remote_address(request)}")
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Forbidden"},
                )

        # ── 3. Rate limiting ──
        client_ip = get_remote_address(request)
        limit_str = None
        for endpoint, limit in RATE_LIMITS.items():
            if path.startswith(endpoint):
                limit_str = limit
                break

        if limit_str:
            # Parse limit: "10/minute" → (10, 60)
            match = re.match(r"(\d+)/(second|minute|hour|day)", limit_str)
            if match:
                count = int(match.group(1))
                window = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}[match.group(2)]
                # Simple in-memory rate check
                if not _rate_check(client_ip, path, count, window):
                    log.warning(f"Rate limited: {client_ip} → {path}")
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Too many requests. Please slow down."},
                        headers={"Retry-After": str(window)},
                    )

        return await call_next(request)


# ── Simple in-memory rate limiter ──
# Thread-safe enough for uvicorn's async model; swap to Redis for multi-worker

import time
from collections import defaultdict

_rate_store: dict[str, list[float]] = defaultdict(list)
_store_lock = False  # Simple flag, adequate for single-process async


def _rate_check(client_ip: str, path: str, max_count: int, window_sec: int) -> bool:
    """Returns True if request is allowed, False if rate limited."""
    key = f"{client_ip}:{path}"
    now = time.time()
    cutoff = now - window_sec

    # Clean old entries
    _rate_store[key] = [t for t in _rate_store[key] if t > cutoff]

    if len(_rate_store[key]) >= max_count:
        return False

    _rate_store[key].append(now)

    # Periodic cleanup (every ~1000 checks) to prevent memory leak
    if len(_rate_store) > 10000:
        stale_keys = [k for k, v in _rate_store.items() if not v or v[-1] < cutoff]
        for k in stale_keys:
            del _rate_store[k]

    return True
