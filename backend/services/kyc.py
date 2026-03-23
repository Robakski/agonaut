"""
KYC Service — identity verification gate for bounty creation.

Any wallet (agent, sponsor, or both) can create bounties — but ONLY
after completing verifiable KYC. This is the compliance guardrail.

Status flow:
  NONE → PENDING (submitted data) → VERIFIED (admin approved) → REJECTED

Enterprise design:
- No caching — always read fresh from DB (real-time compliance)
- All KYC data encrypted at rest (AES-256 via Fernet)
- Admin review required for approval
- Audit log for every status change
"""

import sqlite3
import time
import os
import logging
from pathlib import Path
from typing import Optional
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

DB_PATH = Path("/opt/agonaut-api/data/kyc.db")

# ── Encryption ─────────────────────────────────────────────────────
# KYC_ENCRYPTION_KEY must be set in .env (generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
_fernet: Optional[Fernet] = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = os.environ.get("KYC_ENCRYPTION_KEY", "")
        if not key:
            raise RuntimeError("KYC_ENCRYPTION_KEY not set — cannot handle KYC data without encryption")
        _fernet = Fernet(key.encode())
    return _fernet


def _encrypt(plaintext: str) -> str:
    """Encrypt a string. Returns base64-encoded ciphertext."""
    if not plaintext:
        return ""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def _decrypt(ciphertext: str) -> str:
    """Decrypt a string. Returns plaintext."""
    if not ciphertext:
        return ""
    return _get_fernet().decrypt(ciphertext.encode()).decode()


# ── Database ───────────────────────────────────────────────────────

def _get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS kyc_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING',
            full_name_enc TEXT NOT NULL,
            country TEXT NOT NULL,
            document_type TEXT NOT NULL,
            document_id_enc TEXT NOT NULL,
            email_enc TEXT NOT NULL,
            submitted_at REAL NOT NULL,
            reviewed_at REAL,
            reviewed_by TEXT,
            rejection_reason TEXT,
            ip_address TEXT,
            user_agent TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS kyc_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet TEXT NOT NULL,
            action TEXT NOT NULL,
            detail TEXT,
            performed_by TEXT NOT NULL,
            performed_at REAL NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_kyc_wallet ON kyc_submissions(wallet)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_submissions(wallet, status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_wallet ON kyc_audit_log(wallet)")
    conn.commit()
    return conn


# ── Status Checks (no caching — always fresh) ─────────────────────

def get_kyc_status(wallet: str) -> dict:
    """
    Get the current KYC status for a wallet. Always reads from DB.
    Returns: {"status": "NONE|PENDING|VERIFIED|REJECTED", "submitted_at": ..., ...}
    """
    conn = _get_db()
    try:
        row = conn.execute(
            """SELECT id, wallet, status, country, document_type, submitted_at,
                      reviewed_at, rejection_reason
               FROM kyc_submissions
               WHERE wallet = ?
               ORDER BY submitted_at DESC LIMIT 1""",
            (wallet.lower(),)
        ).fetchone()

        if not row:
            return {"status": "NONE", "wallet": wallet.lower()}

        return {
            "status": row["status"],
            "wallet": row["wallet"],
            "submission_id": row["id"],
            "country": row["country"],
            "document_type": row["document_type"],
            "submitted_at": row["submitted_at"],
            "reviewed_at": row["reviewed_at"],
            "rejection_reason": row["rejection_reason"],
        }
    finally:
        conn.close()


def is_kyc_verified(wallet: str) -> bool:
    """Quick check — is this wallet KYC verified? No caching."""
    status = get_kyc_status(wallet)
    return status["status"] == "VERIFIED"


# ── Submission ─────────────────────────────────────────────────────

def submit_kyc(
    wallet: str,
    full_name: str,
    country: str,
    document_type: str,
    document_id: str,
    email: str,
    ip_address: str = "",
    user_agent: str = "",
) -> dict:
    """
    Submit KYC data for verification. Encrypts PII at rest.
    If wallet already has a PENDING or VERIFIED submission, rejects.
    If previously REJECTED, allows resubmission.
    """
    wallet_lower = wallet.lower()
    current = get_kyc_status(wallet_lower)

    if current["status"] == "VERIFIED":
        return {"error": "Already verified", "status": "VERIFIED"}
    if current["status"] == "PENDING":
        return {"error": "Submission already pending review", "status": "PENDING"}

    conn = _get_db()
    try:
        conn.execute(
            """INSERT INTO kyc_submissions
               (wallet, status, full_name_enc, country, document_type,
                document_id_enc, email_enc, submitted_at, ip_address, user_agent)
               VALUES (?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                wallet_lower,
                _encrypt(full_name),
                country,
                document_type,
                _encrypt(document_id),
                _encrypt(email),
                time.time(),
                ip_address,
                user_agent,
            )
        )
        # Audit log
        conn.execute(
            "INSERT INTO kyc_audit_log (wallet, action, detail, performed_by, performed_at) VALUES (?, ?, ?, ?, ?)",
            (wallet_lower, "SUBMITTED", f"country={country}, doc_type={document_type}", wallet_lower, time.time())
        )
        conn.commit()
        return {"status": "PENDING", "wallet": wallet_lower}
    finally:
        conn.close()


# ── Admin Operations ───────────────────────────────────────────────

def review_kyc(submission_id: int, approved: bool, admin: str, reason: str = "") -> dict:
    """Admin approves or rejects a KYC submission."""
    new_status = "VERIFIED" if approved else "REJECTED"
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT wallet, status FROM kyc_submissions WHERE id = ?",
            (submission_id,)
        ).fetchone()
        if not row:
            return {"error": "Submission not found"}
        if row["status"] != "PENDING":
            return {"error": f"Cannot review — status is {row['status']}"}

        conn.execute(
            "UPDATE kyc_submissions SET status = ?, reviewed_at = ?, reviewed_by = ?, rejection_reason = ? WHERE id = ?",
            (new_status, time.time(), admin, reason if not approved else "", submission_id)
        )
        conn.execute(
            "INSERT INTO kyc_audit_log (wallet, action, detail, performed_by, performed_at) VALUES (?, ?, ?, ?, ?)",
            (row["wallet"], new_status, reason or "approved", admin, time.time())
        )
        conn.commit()
        return {"status": new_status, "wallet": row["wallet"], "submission_id": submission_id}
    finally:
        conn.close()


def list_pending(limit: int = 50, offset: int = 0) -> list[dict]:
    """List pending KYC submissions for admin review."""
    conn = _get_db()
    try:
        rows = conn.execute(
            """SELECT id, wallet, status, country, document_type, submitted_at
               FROM kyc_submissions WHERE status = 'PENDING'
               ORDER BY submitted_at ASC LIMIT ? OFFSET ?""",
            (limit, offset)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_submission_detail(submission_id: int) -> Optional[dict]:
    """Get full KYC submission for admin review (decrypts PII)."""
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT * FROM kyc_submissions WHERE id = ?",
            (submission_id,)
        ).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "wallet": row["wallet"],
            "status": row["status"],
            "full_name": _decrypt(row["full_name_enc"]),
            "country": row["country"],
            "document_type": row["document_type"],
            "document_id": _decrypt(row["document_id_enc"]),
            "email": _decrypt(row["email_enc"]),
            "submitted_at": row["submitted_at"],
            "reviewed_at": row["reviewed_at"],
            "reviewed_by": row["reviewed_by"],
            "rejection_reason": row["rejection_reason"],
        }
    finally:
        conn.close()


def get_audit_log(wallet: str) -> list[dict]:
    """Get full audit trail for a wallet."""
    conn = _get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM kyc_audit_log WHERE wallet = ? ORDER BY performed_at DESC",
            (wallet.lower(),)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
