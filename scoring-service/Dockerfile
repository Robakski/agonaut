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

# Security: non-root scorer user
RUN groupadd -r scorer && useradd -r -g scorer -d /app -s /sbin/nologin scorer \
    && apt-get update && apt-get install -y --no-install-recommends gosu && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code (ALL files — this is what gets measured by RTMR3)
WORKDIR /app
COPY scorer.py api.py onchain.py ecies_encrypt.py \
     tee_keypair.py tee_vault.py tee_attestation.py \
     entrypoint.sh requirements.txt ./
RUN chmod +x entrypoint.sh

# Data directory for sealed keypair (mounted as encrypted volume in TEE)
RUN mkdir -p /app/data && chown -R scorer:scorer /app

# Note: container starts as root for entrypoint (socket permissions),
# then drops to scorer via gosu. See entrypoint.sh.

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')" || exit 1

EXPOSE 8001

# Entrypoint fixes socket permissions then drops to scorer user
ENTRYPOINT ["/app/entrypoint.sh"]
