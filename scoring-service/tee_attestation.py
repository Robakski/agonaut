"""
TEE Remote Attestation — Cryptographic proof of enclave integrity.

This module provides remote attestation that proves:
1. The scoring service is running inside a genuine Intel TDX enclave
2. The code is exactly what's published (hash matches)
3. The TEE keypair was generated inside the enclave
4. Nobody — not even the operator — can access enclave memory

Verification flow (for anyone to check):
1. Call GET /tee/attestation → returns TDX quote + TEE public key
2. Verify quote with Intel DCAP or Phala Trust Center
3. Confirm RTMR3 matches the published docker-compose hash
4. Confirm reportData contains the TEE's ECIES public key
5. Trust is now cryptographic, not operator-based

Works in two modes:
- TEE mode (Phala CVM): Real TDX attestation via dstack guest agent
- Dev mode (VPS/local): Returns unverified self-report (clearly marked)
"""

import os
import json
import hashlib
import logging
import time
from pathlib import Path
from typing import Optional

log = logging.getLogger("tee_attestation")

# dstack guest agent socket path (available inside Phala CVM)
DSTACK_SOCK = "/var/run/dstack.sock"

# Cache attestation for 5 minutes (generating quotes is expensive)
_attestation_cache: dict = {}
_cache_ttl = 300


def is_tee_environment() -> bool:
    """Detect if we're running inside a real TEE (Phala CVM with dstack).

    Checks for dstack socket OR tappd socket (older Phala versions).
    Also checks DSTACK_APP_ID env var as fallback (set by prelaunch script).
    """
    return (
        os.path.exists(DSTACK_SOCK)
        or os.path.exists("/var/run/tappd.sock")
        or bool(os.environ.get("DSTACK_APP_ID"))
    )


def get_attestation(tee_public_key_hex: str) -> dict:
    """Generate a remote attestation report binding the TEE's public key.

    The reportData field contains the SHA-256 of the TEE's ECIES public key.
    This cryptographically binds the key to the enclave — proving the key
    was generated inside THIS enclave and never left.

    Args:
        tee_public_key_hex: The TEE's ECIES public key (hex, 0x04...)

    Returns:
        dict with attestation proof (TDX quote or dev-mode self-report)
    """
    now = time.time()

    # Return cached attestation if fresh
    cached = _attestation_cache.get("latest")
    if cached and (now - cached.get("generated_at", 0)) < _cache_ttl:
        return cached

    if is_tee_environment():
        try:
            result = _get_tdx_attestation(tee_public_key_hex)
        except Exception as e:
            log.error(f"TDX attestation failed (falling back to dev mode): {e}")
            result = _get_dev_attestation(tee_public_key_hex)
            result["tdx_error"] = str(e)
    else:
        result = _get_dev_attestation(tee_public_key_hex)

    result["generated_at"] = now
    _attestation_cache["latest"] = result
    return result


def _get_tdx_attestation(tee_public_key_hex: str) -> dict:
    """Get real TDX attestation from dstack guest agent.

    The guest agent provides:
    - TDX quote (signed by Intel hardware)
    - RTMR values (code measurements)
    - reportData binding (our public key hash)
    """
    import urllib.request

    # reportData = SHA-256 of TEE public key (32 bytes, hex-encoded, padded to 64 bytes)
    pubkey_bytes = bytes.fromhex(tee_public_key_hex.replace("0x", ""))
    report_data = hashlib.sha256(pubkey_bytes).hexdigest()
    # Pad to 64 bytes (128 hex chars) as required by TDX
    report_data_padded = report_data.ljust(128, '0')

    try:
        # Call dstack guest agent via Unix socket
        payload = json.dumps({"reportData": f"0x{report_data_padded}"}).encode()

        # urllib doesn't support Unix sockets natively — use raw HTTP
        import socket
        import http.client

        class UnixHTTPConnection(http.client.HTTPConnection):
            def __init__(self, socket_path):
                super().__init__("localhost")
                self.socket_path = socket_path

            def connect(self):
                self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                self.sock.connect(self.socket_path)

        conn = UnixHTTPConnection(DSTACK_SOCK)

        # Try dstack v2 API path first, then v1 (tappd) path
        quote_data = None
        for api_path in ["/GetQuote", "/prpc/Tappd.GetQuote"]:
            try:
                conn2 = UnixHTTPConnection(DSTACK_SOCK)
                conn2.request("POST", api_path, body=payload,
                              headers={"Content-Type": "application/json"})
                resp = conn2.getresponse()
                body = resp.read()
                conn2.close()
                if resp.status == 200:
                    quote_data = json.loads(body)
                    log.info(f"TDX quote obtained via {api_path}")
                    break
                else:
                    log.debug(f"TDX quote path {api_path} returned {resp.status}")
            except Exception as path_err:
                log.debug(f"TDX quote path {api_path} failed: {path_err}")
                continue

        if not quote_data:
            raise RuntimeError("All dstack API paths failed for GetQuote")

        log.info("TDX attestation generated successfully")

        return {
            "mode": "tdx",
            "verified": True,
            "tee_public_key": tee_public_key_hex,
            "report_data_hash": report_data,
            "tdx_quote": quote_data.get("quote", ""),
            "rtmr0": quote_data.get("rtmr0", ""),
            "rtmr1": quote_data.get("rtmr1", ""),
            "rtmr2": quote_data.get("rtmr2", ""),
            "rtmr3": quote_data.get("rtmr3", ""),
            "verification_url": "https://trust-center.phala.network/verify",
            "how_to_verify": (
                "1. Submit the tdx_quote to Phala Trust Center or Intel DCAP verifier. "
                "2. Confirm report_data_hash matches SHA-256 of tee_public_key. "
                "3. Confirm RTMR3 matches the published docker-compose hash on GitHub. "
                "4. This proves the scoring service is running unmodified inside Intel TDX."
            ),
        }

    except Exception as e:
        log.error(f"TDX attestation failed: {e}")
        return {
            "mode": "tdx_error",
            "verified": False,
            "error": str(e),
            "tee_public_key": tee_public_key_hex,
        }


def _get_dev_attestation(tee_public_key_hex: str) -> dict:
    """Development mode — returns self-report (NOT cryptographically verified).

    Clearly marked as unverified. Anyone checking this endpoint will see
    that the service is NOT running in a hardware TEE.
    """
    pubkey_bytes = bytes.fromhex(tee_public_key_hex.replace("0x", ""))
    report_data = hashlib.sha256(pubkey_bytes).hexdigest()

    # Hash the source files for transparency (not a security measure — just info)
    code_hashes = {}
    for fname in ["scorer.py", "api.py", "ecies_encrypt.py", "tee_vault.py", "tee_keypair.py", "tee_attestation.py"]:
        fpath = Path(__file__).parent / fname
        if fpath.exists():
            code_hashes[fname] = hashlib.sha256(fpath.read_bytes()).hexdigest()

    return {
        "mode": "development",
        "verified": False,
        "warning": (
            "⚠️ NOT RUNNING IN TEE — This is a development/staging deployment. "
            "The operator (Robert) CAN theoretically access enclave memory. "
            "For production zero-knowledge guarantees, deploy to Phala Cloud CVM. "
            "See: https://github.com/Robakski/agonaut/blob/main/scoring-service/phala-deploy.md"
        ),
        "tee_public_key": tee_public_key_hex,
        "report_data_hash": report_data,
        "code_hashes": code_hashes,
        "how_to_verify": (
            "This deployment does NOT provide cryptographic attestation. "
            "To verify zero-knowledge guarantees, the service must be deployed "
            "to Phala Cloud CVM (Intel TDX). Check /tee/attestation after "
            "migration — the 'mode' field will change from 'development' to 'tdx'."
        ),
    }


def get_code_measurement() -> str:
    """Get deterministic hash of all scoring service source files.

    This is what RTMR3 should match when deployed in TEE.
    Anyone can compute this from the GitHub source to verify.
    """
    files = sorted([
        "scorer.py", "api.py", "ecies_encrypt.py",
        "tee_vault.py", "tee_keypair.py", "tee_attestation.py",
        "onchain.py", "requirements.txt",
    ])

    hasher = hashlib.sha256()
    for fname in files:
        fpath = Path(__file__).parent / fname
        if fpath.exists():
            hasher.update(fname.encode())
            hasher.update(fpath.read_bytes())

    return hasher.hexdigest()
