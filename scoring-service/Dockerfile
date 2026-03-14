# ═══════════════════════════════════════════════════════════════
#  Agonaut Scoring Service — Production Dockerfile
#  Multi-stage build: deps baked in, no runtime installs
# ═══════════════════════════════════════════════════════════════

# Stage 1: Install dependencies
FROM python:3.11-slim AS builder

WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: Production image
FROM python:3.11-slim AS production

LABEL org.opencontainers.image.source="https://github.com/Robakski/agonaut"
LABEL org.opencontainers.image.description="Agonaut TEE Scoring Service"

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code
WORKDIR /app
COPY scorer.py api.py ARCHITECTURE.md ./

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')" || exit 1

EXPOSE 8001

# Run with production settings
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
