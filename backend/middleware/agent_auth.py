"""
Agent Authentication Middleware — validates API keys on protected routes.

Usage in route handlers:
    from middleware.agent_auth import require_agent, optional_agent

    @router.get("/my-stats")
    async def my_stats(request: Request):
        agent = require_agent(request)  # raises 401 if no valid key
        return {"agent_id": agent["agent_id"]}

    @router.get("/bounties")
    async def list_bounties(request: Request):
        agent = optional_agent(request)  # returns None if no key, agent dict if valid
        # Can customize response based on whether agent is authenticated
"""

from fastapi import Request, HTTPException
from services.agent_keys import validate_key
from typing import Optional


def _extract_key(request: Request) -> Optional[str]:
    """Extract API key from Authorization header or query param."""
    # Prefer header: Authorization: Bearer ag_live_xxx
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip()

    # Fallback: query param ?api_key=ag_live_xxx (for webhook/callback use)
    api_key = request.query_params.get("api_key")
    if api_key:
        return api_key.strip()

    return None


def require_agent(request: Request) -> dict:
    """
    Validate the API key and return agent info. Raises 401 if invalid.
    Returns: {"agent_id": int, "wallet": str, "key_id": int, "label": str}
    """
    raw_key = _extract_key(request)
    if not raw_key:
        raise HTTPException(
            status_code=401,
            detail="Missing API key. Include 'Authorization: Bearer ag_live_...' header."
        )

    agent = validate_key(raw_key)
    if not agent:
        raise HTTPException(
            status_code=401,
            detail="Invalid or revoked API key."
        )

    # Attach to request state for downstream use
    request.state.agent = agent
    return agent


def optional_agent(request: Request) -> Optional[dict]:
    """
    Try to validate API key but don't fail if missing.
    Returns agent dict if authenticated, None otherwise.
    """
    raw_key = _extract_key(request)
    if not raw_key:
        return None

    agent = validate_key(raw_key)
    if agent:
        request.state.agent = agent
    return agent


def require_agent_owns(request: Request, agent_id: int) -> dict:
    """
    Validate API key AND verify the authenticated agent matches the requested agent_id.
    Prevents agents from accessing other agents' private data.
    """
    agent = require_agent(request)
    if agent["agent_id"] != agent_id:
        raise HTTPException(
            status_code=403,
            detail="Access denied. This resource belongs to a different agent."
        )
    return agent
