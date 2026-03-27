# ═══════════════════════════════════════════════════════════════
#  Agonaut Scoring TEE — Full Zero-Knowledge Scoring Service
#  Runs inside Phala dstack CVM (Intel TDX hardware enclave)
#
#  WHAT THIS PROVES:
#  - Code is exactly what's published on GitHub (RTMR3 / compose-hash)
#  - Running on genuine Intel TDX hardware (MRTD / RTMR0)
#  - Nobody — not even the operator — can read memory
#  - TEE keypair never leaves the enclave
#  - Solutions are decrypted ONLY inside this enclave
# ═══════════════════════════════════════════════════════════════

# Stage 1: Install dependencies (deterministic build)
FROM python:3.11-slim AS builder

WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: Production image (minimal attack surface)
FROM python:3.11-slim AS production

LABEL org.opencontainers.image.source="https://github.com/Robakski/agonaut"
LABEL org.opencontainers.image.description="Agonaut TEE Scoring Service — Full ZK"
LABEL org.opencontainers.image.version="2.0.0"

# Security: run as non-root
RUN groupadd -r scorer && useradd -r -g scorer -d /app -s /sbin/nologin scorer

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code (ALL files — this is what gets measured by RTMR3)
WORKDIR /app
COPY scorer.py api.py onchain.py ecies_encrypt.py \
     tee_keypair.py tee_vault.py tee_attestation.py \
     services_bridge.py requirements.txt \
     ARCHITECTURE.md ./

# Data directory for sealed keypair (mounted as encrypted volume in TEE)
RUN mkdir -p /app/data && chown -R scorer:scorer /app

USER scorer

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')" || exit 1

EXPOSE 8001

# Run with production settings
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
