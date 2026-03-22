"""
User Feedback — Improvement proposals, bug reports, UX feedback.

Stored in SQLite. Viewable in admin dashboard.
"""

import sqlite3
import time
import os
from contextlib import contextmanager
from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/feedback", tags=["feedback"])

DB_PATH = os.environ.get("FEEDBACK_DB", "/opt/agonaut-api/data/feedback.db")
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")


def _ensure_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with _get_db() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA busy_timeout=5000")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                message TEXT NOT NULL,
                wallet TEXT,
                page TEXT,
                email TEXT,
                user_agent TEXT,
                ts INTEGER NOT NULL,
                status TEXT DEFAULT 'new',
                notes TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_feedback_ts ON feedback(ts);
            CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
        """)


@contextmanager
def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


class FeedbackRequest(BaseModel):
    type: str  # idea, bug, ux, other
    message: str
    wallet: Optional[str] = None
    page: Optional[str] = None
    email: Optional[str] = None
    user_agent: Optional[str] = None


@router.post("/submit")
async def submit_feedback(req: FeedbackRequest):
    """Submit user feedback — no auth required."""
    if not req.message or len(req.message.strip()) < 5:
        raise HTTPException(400, "Message too short")
    if len(req.message) > 5000:
        raise HTTPException(400, "Message too long (max 5000 chars)")

    _ensure_db()
    with _get_db() as db:
        db.execute(
            "INSERT INTO feedback (type, message, wallet, page, email, user_agent, ts) VALUES (?,?,?,?,?,?,?)",
            (req.type, req.message.strip(), req.wallet, req.page, req.email, req.user_agent, int(time.time())),
        )
    return {"ok": True}


@router.get("/list")
async def list_feedback(
    key: str = Query(""),
    status: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """Admin: list all feedback."""
    if not ADMIN_KEY or key != ADMIN_KEY:
        raise HTTPException(403, "Forbidden")

    _ensure_db()
    where, params = [], []
    if status:
        where.append("status = ?")
        params.append(status)
    if type:
        where.append("type = ?")
        params.append(type)
    w = f"WHERE {' AND '.join(where)}" if where else ""

    with _get_db() as db:
        total = db.execute(f"SELECT COUNT(*) FROM feedback {w}", params).fetchone()[0]
        rows = db.execute(f"SELECT * FROM feedback {w} ORDER BY ts DESC LIMIT ?", params + [limit]).fetchall()

    return {"total": total, "items": [dict(r) for r in rows]}


@router.post("/update-status")
async def update_status(id: int, status: str, key: str = Query("")):
    """Admin: mark feedback as reviewed/done/dismissed."""
    if not ADMIN_KEY or key != ADMIN_KEY:
        raise HTTPException(403, "Forbidden")
    _ensure_db()
    with _get_db() as db:
        db.execute("UPDATE feedback SET status = ? WHERE id = ?", (status, id))
    return {"ok": True}
