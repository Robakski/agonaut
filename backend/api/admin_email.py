"""
Admin Email API — read, send, forward emails from contact@agonaut.io.

All endpoints require ADMIN_KEY authentication (handled by SecurityMiddleware).
"""

import logging
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional

from services.email import fetch_inbox, fetch_email, send_email, forward_email, get_unread_count

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin/email", tags=["Admin Email"])


# ── Models ─────────────────────────────────────────────────────────

class SendEmailRequest(BaseModel):
    to: str = Field(..., min_length=5, max_length=254)
    subject: str = Field(..., min_length=1, max_length=500)
    body: str = Field(..., min_length=1, max_length=50000)
    is_html: bool = False


class ForwardEmailRequest(BaseModel):
    uid: str = Field(..., min_length=1)
    to: str = Field(..., min_length=5, max_length=254)
    comment: str = Field("", max_length=5000)


# ── Endpoints ──────────────────────────────────────────────────────

@router.get("/inbox")
async def email_inbox(
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    folder: str = Query("INBOX"),
):
    """Fetch inbox emails (newest first)."""
    try:
        messages = fetch_inbox(folder=folder, limit=limit, offset=offset)
        unread = get_unread_count(folder=folder)
        return {"messages": messages, "unread": unread, "folder": folder}
    except Exception as e:
        logger.error(f"Failed to fetch inbox: {e}")
        raise HTTPException(status_code=500, detail=f"Email service error: {str(e)}")


@router.get("/read/{uid}")
async def email_read(uid: str, folder: str = Query("INBOX")):
    """Read a single email by UID (marks as read)."""
    try:
        msg = fetch_email(uid, folder=folder)
        if not msg:
            raise HTTPException(status_code=404, detail="Email not found")
        return msg
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to read email {uid}: {e}")
        raise HTTPException(status_code=500, detail=f"Email service error: {str(e)}")


@router.get("/unread")
async def email_unread_count():
    """Get unread email count."""
    try:
        count = get_unread_count()
        return {"unread": count}
    except Exception as e:
        logger.error(f"Failed to get unread count: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/send")
async def email_send(req: SendEmailRequest):
    """Send an email from contact@agonaut.io."""
    if "@" not in req.to:
        raise HTTPException(status_code=400, detail="Invalid email address")

    success = send_email(to=req.to, subject=req.subject, body=req.body, is_html=req.is_html)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send email")

    return {"sent": True, "to": req.to, "subject": req.subject}


@router.post("/forward")
async def email_forward(req: ForwardEmailRequest):
    """Forward an email to another address."""
    if "@" not in req.to:
        raise HTTPException(status_code=400, detail="Invalid email address")

    success = forward_email(uid=req.uid, to=req.to, comment=req.comment)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to forward email")

    return {"forwarded": True, "to": req.to, "uid": req.uid}
