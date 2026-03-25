"""
Compliance Monitoring Service — Transaction surveillance, risk scoring,
and regulatory data retention for AML/KYC compliance.

Designed for EU AMLD requirements:
- 5-year data retention
- Threshold monitoring (€10K equivalent)
- Risk scoring per wallet
- Full audit trail for authorities
- Enhanced due diligence triggers
"""

import sqlite3
import time
import os
import logging
import json
from pathlib import Path
from typing import Optional
from contextlib import contextmanager

logger = logging.getLogger(__name__)

DB_PATH = Path("/opt/agonaut-api/data/compliance.db")

# ── Thresholds ──────────────────────────────────────────────────
# EU AMLD threshold is €10K; we use ETH equivalent (conservative)
SINGLE_TX_THRESHOLD_ETH = float(os.environ.get("COMPLIANCE_SINGLE_TX_THRESHOLD", "3.0"))  # ~€10K at ~€3300/ETH
CUMULATIVE_THRESHOLD_ETH = float(os.environ.get("COMPLIANCE_CUMULATIVE_THRESHOLD", "10.0"))  # ~€33K cumulative
RAPID_TX_COUNT = int(os.environ.get("COMPLIANCE_RAPID_TX_COUNT", "5"))  # structuring detection
RAPID_TX_WINDOW = int(os.environ.get("COMPLIANCE_RAPID_TX_WINDOW", "3600"))  # 1 hour

# Risk levels
RISK_LOW = "LOW"
RISK_MEDIUM = "MEDIUM"
RISK_HIGH = "HIGH"
RISK_CRITICAL = "CRITICAL"


@contextmanager
def _db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    """Create compliance tables if they don't exist."""
    with _db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet TEXT NOT NULL,
            tx_type TEXT NOT NULL,
            amount_eth REAL NOT NULL,
            amount_usd_approx REAL,
            tx_hash TEXT,
            chain_id INTEGER,
            round_address TEXT,
            metadata TEXT,
            risk_flags TEXT,
            created_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tx_wallet ON transactions(wallet);
        CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at);
        CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(tx_type);

        CREATE TABLE IF NOT EXISTS risk_profiles (
            wallet TEXT PRIMARY KEY,
            risk_level TEXT NOT NULL DEFAULT 'LOW',
            total_volume_eth REAL NOT NULL DEFAULT 0,
            total_tx_count INTEGER NOT NULL DEFAULT 0,
            flags TEXT NOT NULL DEFAULT '[]',
            kyc_status TEXT DEFAULT 'NONE',
            sumsub_applicant_id TEXT,
            first_seen REAL NOT NULL,
            last_activity REAL NOT NULL,
            notes TEXT DEFAULT '',
            review_required INTEGER NOT NULL DEFAULT 0,
            reviewed_at REAL,
            reviewed_by TEXT
        );

        CREATE TABLE IF NOT EXISTS compliance_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet TEXT NOT NULL,
            alert_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            description TEXT NOT NULL,
            tx_id INTEGER,
            acknowledged INTEGER NOT NULL DEFAULT 0,
            acknowledged_at REAL,
            created_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_alert_wallet ON compliance_alerts(wallet);
        CREATE INDEX IF NOT EXISTS idx_alert_ack ON compliance_alerts(acknowledged);

        CREATE TABLE IF NOT EXISTS compliance_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            actor TEXT NOT NULL,
            wallet TEXT,
            detail TEXT,
            created_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_created ON compliance_audit_log(created_at);
        """)


# ── Initialize on import ───────────────────────────────────────
init_db()


def record_transaction(
    wallet: str,
    tx_type: str,
    amount_eth: float,
    tx_hash: str = None,
    chain_id: int = None,
    round_address: str = None,
    metadata: dict = None,
    eth_usd_price: float = None,
) -> dict:
    """Record a financial transaction and run compliance checks.
    
    tx_type: 'bounty_deposit', 'bounty_refund', 'prize_payout', 'entry_fee', 'registration_fee'
    Returns: { 'risk_flags': [...], 'alerts': [...] }
    """
    wallet = wallet.lower()
    now = time.time()
    amount_usd = amount_eth * eth_usd_price if eth_usd_price else None
    risk_flags = []
    alerts = []

    # ── Single transaction threshold ────────────────────────
    if amount_eth >= SINGLE_TX_THRESHOLD_ETH:
        risk_flags.append("LARGE_SINGLE_TX")
        alerts.append({
            "type": "LARGE_TRANSACTION",
            "severity": RISK_HIGH,
            "desc": f"Single transaction of {amount_eth:.4f} ETH exceeds threshold ({SINGLE_TX_THRESHOLD_ETH} ETH)"
        })

    with _db() as conn:
        # Store transaction
        conn.execute(
            """INSERT INTO transactions 
               (wallet, tx_type, amount_eth, amount_usd_approx, tx_hash, chain_id, round_address, metadata, risk_flags, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (wallet, tx_type, amount_eth, amount_usd, tx_hash, chain_id, round_address,
             json.dumps(metadata) if metadata else None, json.dumps(risk_flags), now)
        )
        tx_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        # ── Cumulative volume check ─────────────────────────
        row = conn.execute(
            "SELECT COALESCE(SUM(amount_eth), 0) as total FROM transactions WHERE wallet = ?",
            (wallet,)
        ).fetchone()
        cumulative = row["total"]

        if cumulative >= CUMULATIVE_THRESHOLD_ETH:
            risk_flags.append("CUMULATIVE_THRESHOLD")
            alerts.append({
                "type": "CUMULATIVE_THRESHOLD",
                "severity": RISK_HIGH,
                "desc": f"Cumulative volume {cumulative:.4f} ETH exceeds threshold ({CUMULATIVE_THRESHOLD_ETH} ETH)"
            })

        # ── Rapid transaction detection (structuring) ───────
        cutoff = now - RAPID_TX_WINDOW
        rapid = conn.execute(
            "SELECT COUNT(*) as cnt FROM transactions WHERE wallet = ? AND created_at > ?",
            (wallet, cutoff)
        ).fetchone()["cnt"]

        if rapid >= RAPID_TX_COUNT:
            risk_flags.append("RAPID_TRANSACTIONS")
            alerts.append({
                "type": "STRUCTURING_SUSPICION",
                "severity": RISK_MEDIUM,
                "desc": f"{rapid} transactions in {RAPID_TX_WINDOW}s window — possible structuring"
            })

        # ── Update risk profile ─────────────────────────────
        existing = conn.execute(
            "SELECT * FROM risk_profiles WHERE wallet = ?", (wallet,)
        ).fetchone()

        risk_level = _calculate_risk_level(risk_flags, cumulative)

        if existing:
            old_flags = json.loads(existing["flags"])
            merged_flags = list(set(old_flags + risk_flags))
            # Risk level only goes UP, never down automatically
            if _risk_rank(risk_level) < _risk_rank(existing["risk_level"]):
                risk_level = existing["risk_level"]
            conn.execute(
                """UPDATE risk_profiles SET
                   risk_level = ?, total_volume_eth = ?, total_tx_count = total_tx_count + 1,
                   flags = ?, last_activity = ?,
                   review_required = CASE WHEN ? IN ('HIGH', 'CRITICAL') THEN 1 ELSE review_required END
                   WHERE wallet = ?""",
                (risk_level, cumulative, json.dumps(merged_flags), now, risk_level, wallet)
            )
        else:
            conn.execute(
                """INSERT INTO risk_profiles 
                   (wallet, risk_level, total_volume_eth, total_tx_count, flags, first_seen, last_activity, review_required)
                   VALUES (?, ?, ?, 1, ?, ?, ?, ?)""",
                (wallet, risk_level, cumulative, json.dumps(risk_flags), now, now,
                 1 if risk_level in (RISK_HIGH, RISK_CRITICAL) else 0)
            )

        # ── Create alerts ───────────────────────────────────
        for alert in alerts:
            conn.execute(
                """INSERT INTO compliance_alerts (wallet, alert_type, severity, description, tx_id, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (wallet, alert["type"], alert["severity"], alert["desc"], tx_id, now)
            )

        # Update risk flags on the tx record
        if risk_flags:
            conn.execute(
                "UPDATE transactions SET risk_flags = ? WHERE id = ?",
                (json.dumps(risk_flags), tx_id)
            )

    if alerts:
        logger.warning(f"COMPLIANCE ALERT for {wallet}: {[a['type'] for a in alerts]}")

    return {"risk_flags": risk_flags, "alerts": alerts}


def get_risk_profile(wallet: str) -> Optional[dict]:
    """Get full risk profile for a wallet."""
    wallet = wallet.lower()
    with _db() as conn:
        row = conn.execute("SELECT * FROM risk_profiles WHERE wallet = ?", (wallet,)).fetchone()
        if not row:
            return None
        d = dict(row)
        d["flags"] = json.loads(d["flags"])
        return d


def get_transaction_history(wallet: str, limit: int = 100) -> list:
    """Get transaction history for a wallet (for authority requests)."""
    wallet = wallet.lower()
    with _db() as conn:
        rows = conn.execute(
            "SELECT * FROM transactions WHERE wallet = ? ORDER BY created_at DESC LIMIT ?",
            (wallet, limit)
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["risk_flags"] = json.loads(d["risk_flags"]) if d["risk_flags"] else []
            d["metadata"] = json.loads(d["metadata"]) if d["metadata"] else None
            result.append(d)
        return result


def get_alerts(acknowledged: bool = None, severity: str = None, limit: int = 50) -> list:
    """Get compliance alerts with optional filters."""
    with _db() as conn:
        query = "SELECT * FROM compliance_alerts WHERE 1=1"
        params = []
        if acknowledged is not None:
            query += " AND acknowledged = ?"
            params.append(1 if acknowledged else 0)
        if severity:
            query += " AND severity = ?"
            params.append(severity)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def acknowledge_alert(alert_id: int) -> bool:
    """Acknowledge a compliance alert."""
    with _db() as conn:
        cur = conn.execute(
            "UPDATE compliance_alerts SET acknowledged = 1, acknowledged_at = ? WHERE id = ? AND acknowledged = 0",
            (time.time(), alert_id)
        )
        return cur.rowcount > 0


def get_wallets_needing_review(limit: int = 50) -> list:
    """Get wallets flagged for enhanced due diligence review."""
    with _db() as conn:
        rows = conn.execute(
            """SELECT * FROM risk_profiles 
               WHERE review_required = 1 AND (reviewed_at IS NULL OR reviewed_at < last_activity)
               ORDER BY total_volume_eth DESC LIMIT ?""",
            (limit,)
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["flags"] = json.loads(d["flags"])
            result.append(d)
        return result


def mark_reviewed(wallet: str, reviewer: str = "admin", notes: str = "") -> bool:
    """Mark a wallet as reviewed (EDD complete)."""
    wallet = wallet.lower()
    now = time.time()
    with _db() as conn:
        cur = conn.execute(
            """UPDATE risk_profiles SET reviewed_at = ?, reviewed_by = ?, 
               notes = CASE WHEN ? != '' THEN ? ELSE notes END
               WHERE wallet = ?""",
            (now, reviewer, notes, notes, wallet)
        )
        if cur.rowcount > 0:
            conn.execute(
                "INSERT INTO compliance_audit_log (action, actor, wallet, detail, created_at) VALUES (?, ?, ?, ?, ?)",
                ("EDD_REVIEW", reviewer, wallet, notes, now)
            )
        return cur.rowcount > 0


def update_kyc_link(wallet: str, kyc_status: str, sumsub_id: str = None):
    """Link KYC status to compliance profile."""
    wallet = wallet.lower()
    with _db() as conn:
        existing = conn.execute("SELECT 1 FROM risk_profiles WHERE wallet = ?", (wallet,)).fetchone()
        now = time.time()
        if existing:
            conn.execute(
                "UPDATE risk_profiles SET kyc_status = ?, sumsub_applicant_id = ? WHERE wallet = ?",
                (kyc_status, sumsub_id, wallet)
            )
        else:
            conn.execute(
                """INSERT INTO risk_profiles 
                   (wallet, risk_level, total_volume_eth, total_tx_count, flags, kyc_status, sumsub_applicant_id, first_seen, last_activity, review_required)
                   VALUES (?, 'LOW', 0, 0, '[]', ?, ?, ?, ?, 0)""",
                (wallet, kyc_status, sumsub_id, now, now)
            )


def get_compliance_stats() -> dict:
    """Aggregate compliance statistics for dashboard."""
    with _db() as conn:
        total_wallets = conn.execute("SELECT COUNT(*) FROM risk_profiles").fetchone()[0]
        risk_dist = {}
        for row in conn.execute("SELECT risk_level, COUNT(*) as cnt FROM risk_profiles GROUP BY risk_level"):
            risk_dist[row["risk_level"]] = row["cnt"]
        
        total_volume = conn.execute("SELECT COALESCE(SUM(amount_eth), 0) FROM transactions").fetchone()[0]
        total_txs = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
        
        open_alerts = conn.execute("SELECT COUNT(*) FROM compliance_alerts WHERE acknowledged = 0").fetchone()[0]
        pending_reviews = conn.execute(
            "SELECT COUNT(*) FROM risk_profiles WHERE review_required = 1 AND (reviewed_at IS NULL OR reviewed_at < last_activity)"
        ).fetchone()[0]

        # Last 24h volume
        cutoff_24h = time.time() - 86400
        vol_24h = conn.execute(
            "SELECT COALESCE(SUM(amount_eth), 0) FROM transactions WHERE created_at > ?", (cutoff_24h,)
        ).fetchone()[0]
        txs_24h = conn.execute(
            "SELECT COUNT(*) FROM transactions WHERE created_at > ?", (cutoff_24h,)
        ).fetchone()[0]

        return {
            "total_wallets": total_wallets,
            "risk_distribution": risk_dist,
            "total_volume_eth": round(total_volume, 6),
            "total_transactions": total_txs,
            "volume_24h_eth": round(vol_24h, 6),
            "transactions_24h": txs_24h,
            "open_alerts": open_alerts,
            "pending_reviews": pending_reviews,
        }


def get_audit_log(limit: int = 100) -> list:
    """Get compliance audit log."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT * FROM compliance_audit_log ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


def log_audit(action: str, actor: str, wallet: str = None, detail: str = ""):
    """Log a compliance action."""
    with _db() as conn:
        conn.execute(
            "INSERT INTO compliance_audit_log (action, actor, wallet, detail, created_at) VALUES (?, ?, ?, ?, ?)",
            (action, actor, wallet, detail, time.time())
        )


def _calculate_risk_level(flags: list, cumulative_eth: float) -> str:
    """Determine risk level based on flags and volume."""
    if "LARGE_SINGLE_TX" in flags and "RAPID_TRANSACTIONS" in flags:
        return RISK_CRITICAL
    if "CUMULATIVE_THRESHOLD" in flags:
        return RISK_HIGH
    if "LARGE_SINGLE_TX" in flags or "RAPID_TRANSACTIONS" in flags:
        return RISK_MEDIUM
    if cumulative_eth > SINGLE_TX_THRESHOLD_ETH * 0.5:
        return RISK_MEDIUM
    return RISK_LOW


def _risk_rank(level: str) -> int:
    return {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}.get(level, 0)
