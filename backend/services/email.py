"""
Email Service — Gmail IMAP/SMTP integration for contact@agonaut.io.

Provides read, send, forward, and search functionality via the admin dashboard.
Uses IMAP for reading and SMTP for sending through Google Workspace.

Requires in .env:
  GMAIL_ADDRESS=contact@agonaut.io
  GMAIL_APP_PASSWORD=<app password from Google account>
"""

import imaplib
import smtplib
import email
import email.utils
import os
import logging
import time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import decode_header
from typing import Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

GMAIL_ADDRESS = os.environ.get("GMAIL_ADDRESS", "contact@agonaut.io")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")
IMAP_HOST = "imap.gmail.com"
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587


@dataclass
class EmailMessage:
    uid: str = ""
    subject: str = ""
    sender: str = ""
    sender_name: str = ""
    to: str = ""
    date: str = ""
    timestamp: float = 0.0
    body_text: str = ""
    body_html: str = ""
    is_read: bool = False
    snippet: str = ""


def _decode_header_value(raw: str) -> str:
    """Decode MIME-encoded header values."""
    if not raw:
        return ""
    parts = decode_header(raw)
    decoded = []
    for content, charset in parts:
        if isinstance(content, bytes):
            decoded.append(content.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(content)
    return " ".join(decoded)


def _extract_body(msg: email.message.Message) -> tuple[str, str]:
    """Extract text and HTML body from email message."""
    text_body = ""
    html_body = ""

    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            disp = str(part.get("Content-Disposition", ""))
            if "attachment" in disp:
                continue
            try:
                payload = part.get_payload(decode=True)
                if payload is None:
                    continue
                charset = part.get_content_charset() or "utf-8"
                decoded = payload.decode(charset, errors="replace")
                if ct == "text/plain":
                    text_body = decoded
                elif ct == "text/html":
                    html_body = decoded
            except Exception:
                continue
    else:
        try:
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                decoded = payload.decode(charset, errors="replace")
                if msg.get_content_type() == "text/html":
                    html_body = decoded
                else:
                    text_body = decoded
        except Exception:
            pass

    return text_body, html_body


def _connect_imap() -> imaplib.IMAP4_SSL:
    """Connect to Gmail IMAP."""
    if not GMAIL_APP_PASSWORD:
        raise RuntimeError("GMAIL_APP_PASSWORD not configured")
    conn = imaplib.IMAP4_SSL(IMAP_HOST)
    conn.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
    return conn


def _connect_smtp() -> smtplib.SMTP:
    """Connect to Gmail SMTP."""
    if not GMAIL_APP_PASSWORD:
        raise RuntimeError("GMAIL_APP_PASSWORD not configured")
    server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
    server.starttls()
    server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
    return server


# ── Read Operations ────────────────────────────────────────────────

def fetch_inbox(folder: str = "INBOX", limit: int = 30, offset: int = 0) -> list[dict]:
    """Fetch email headers from inbox. Returns newest first."""
    conn = _connect_imap()
    try:
        conn.select(folder, readonly=True)
        _, data = conn.search(None, "ALL")
        uids = data[0].split()
        if not uids:
            return []

        # Newest first, apply pagination
        uids = list(reversed(uids))
        page = uids[offset:offset + limit]

        messages = []
        for uid in page:
            _, msg_data = conn.fetch(uid, "(FLAGS RFC822.HEADER)")
            if not msg_data or not msg_data[0]:
                continue

            # Parse flags
            flags_data = msg_data[0][0] if isinstance(msg_data[0], tuple) else b""
            is_read = b"\\Seen" in flags_data

            # Parse headers
            raw_headers = msg_data[0][1] if isinstance(msg_data[0], tuple) else msg_data[0]
            msg = email.message_from_bytes(raw_headers)

            subject = _decode_header_value(msg.get("Subject", ""))
            sender = _decode_header_value(msg.get("From", ""))
            date_str = msg.get("Date", "")
            to = _decode_header_value(msg.get("To", ""))

            # Parse sender name
            sender_name, sender_addr = email.utils.parseaddr(sender)

            # Parse date to timestamp
            try:
                date_tuple = email.utils.parsedate_tz(date_str)
                timestamp = email.utils.mktime_tz(date_tuple) if date_tuple else 0
            except Exception:
                timestamp = 0

            messages.append({
                "uid": uid.decode(),
                "subject": subject,
                "sender": sender_addr,
                "sender_name": sender_name or sender_addr.split("@")[0],
                "to": to,
                "date": date_str,
                "timestamp": timestamp,
                "is_read": is_read,
                "snippet": subject[:100],
            })

        return messages
    finally:
        conn.logout()


def fetch_email(uid: str, folder: str = "INBOX") -> Optional[dict]:
    """Fetch a single email by UID with full body."""
    conn = _connect_imap()
    try:
        conn.select(folder)
        _, msg_data = conn.fetch(uid.encode(), "(RFC822)")
        if not msg_data or not msg_data[0]:
            return None

        raw = msg_data[0][1] if isinstance(msg_data[0], tuple) else msg_data[0]
        msg = email.message_from_bytes(raw)

        subject = _decode_header_value(msg.get("Subject", ""))
        sender = _decode_header_value(msg.get("From", ""))
        to = _decode_header_value(msg.get("To", ""))
        date_str = msg.get("Date", "")
        sender_name, sender_addr = email.utils.parseaddr(sender)

        text_body, html_body = _extract_body(msg)

        try:
            date_tuple = email.utils.parsedate_tz(date_str)
            timestamp = email.utils.mktime_tz(date_tuple) if date_tuple else 0
        except Exception:
            timestamp = 0

        # Mark as read
        conn.store(uid.encode(), "+FLAGS", "\\Seen")

        return {
            "uid": uid,
            "subject": subject,
            "sender": sender_addr,
            "sender_name": sender_name or sender_addr.split("@")[0],
            "to": to,
            "date": date_str,
            "timestamp": timestamp,
            "body_text": text_body,
            "body_html": html_body,
        }
    finally:
        conn.logout()


def get_unread_count(folder: str = "INBOX") -> int:
    """Get count of unread emails."""
    conn = _connect_imap()
    try:
        conn.select(folder, readonly=True)
        _, data = conn.search(None, "UNSEEN")
        return len(data[0].split()) if data[0] else 0
    finally:
        conn.logout()


# ── Send Operations ────────────────────────────────────────────────

def send_email(to: str, subject: str, body: str, reply_to_uid: Optional[str] = None, is_html: bool = False) -> bool:
    """Send an email from contact@agonaut.io."""
    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = f"Agonaut <{GMAIL_ADDRESS}>"
        msg["To"] = to
        msg["Subject"] = subject
        msg["Date"] = email.utils.formatdate(localtime=True)

        if is_html:
            msg.attach(MIMEText(body, "html", "utf-8"))
        else:
            msg.attach(MIMEText(body, "plain", "utf-8"))

        server = _connect_smtp()
        try:
            server.send_message(msg)
            logger.info(f"Email sent to {to}: {subject}")
            return True
        finally:
            server.quit()
    except Exception as e:
        logger.error(f"Failed to send email to {to}: {e}")
        return False


def forward_email(uid: str, to: str, comment: str = "", folder: str = "INBOX") -> bool:
    """Forward an email to another address."""
    original = fetch_email(uid, folder)
    if not original:
        return False

    subject = f"Fwd: {original['subject']}"
    body = f"{comment}\n\n---------- Forwarded message ----------\n"
    body += f"From: {original['sender_name']} <{original['sender']}>\n"
    body += f"Date: {original['date']}\n"
    body += f"Subject: {original['subject']}\n"
    body += f"To: {original['to']}\n\n"
    body += original.get("body_text", "") or "(HTML content — see original)"

    return send_email(to, subject, body)
