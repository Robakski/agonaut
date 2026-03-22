#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Agonaut Scoring Service — VPS Deployment
#
# Runs as brose-tools on port 8001. Backend (port 8000) calls this.
# Caddy reverse proxies both behind api.agonaut.io.
#
# Usage: sudo bash setup-scoring-service.sh
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SERVICE_DIR="/opt/agonaut-scoring"
REPO_DIR="/home/brose/.openclaw/workspace/products/agonaut/scoring-service"
VENV_DIR="$SERVICE_DIR/venv"
SERVICE_NAME="agonaut-scoring"
USER="brose-tools"
GROUP="brose-tools"

echo "=== Agonaut Scoring Service Deployment ==="

# 1. Create service directory
echo "[1/6] Creating service directory..."
mkdir -p "$SERVICE_DIR"
chown "$USER:$GROUP" "$SERVICE_DIR"

# 2. Copy scoring service files
echo "[2/6] Copying scoring service..."
cp "$REPO_DIR/scorer.py" "$SERVICE_DIR/"
cp "$REPO_DIR/api.py" "$SERVICE_DIR/"
cp "$REPO_DIR/onchain.py" "$SERVICE_DIR/"
cp "$REPO_DIR/requirements.txt" "$SERVICE_DIR/"
chown -R "$USER:$GROUP" "$SERVICE_DIR"

# 3. Create venv and install deps
echo "[3/6] Setting up Python venv..."
if [ ! -d "$VENV_DIR" ]; then
    sudo -u "$USER" python3 -m venv "$VENV_DIR"
fi
sudo -u "$USER" "$VENV_DIR/bin/pip" install -q -r "$SERVICE_DIR/requirements.txt"

# 4. Create .env (if not exists)
echo "[4/6] Checking .env..."
if [ ! -f "$SERVICE_DIR/.env" ]; then
    cat > "$SERVICE_DIR/.env" << 'ENVEOF'
# Scoring Service Environment
# Fill in PHALA_API_KEY after signing up at https://dashboard.phala.network

# RPC
RPC_URL=https://sepolia.base.org
CHAIN_ID=84532

# ScoringOracle contract (Base Sepolia)
SCORING_ORACLE=0xb7597d71e00cd1c45c51dd093ce0d3dbd5b86e91

# Scorer wallet (has SCORER_ROLE on ScoringOracle)
# SECURITY: Never commit private keys. Set manually during deployment:
#   read -sp "Scorer private key: " SCORER_PRIVATE_KEY
SCORER_PRIVATE_KEY=
SCORER_ADDRESS=

# Phala TEE (fill in after signup)
PHALA_API_KEY=
PHALA_API_URL=https://api.redpill.ai/v1

# Scoring model
SCORING_MODEL=deepseek/deepseek-chat-v3-0324

# Solution decryption key (generated per round, passed dynamically)
SOLUTION_KEY=
ENVEOF
    chmod 600 "$SERVICE_DIR/.env"
    chown "$USER:$GROUP" "$SERVICE_DIR/.env"
    echo "  → .env created at $SERVICE_DIR/.env"
    echo "  → IMPORTANT: Add PHALA_API_KEY after signing up!"
else
    echo "  → .env already exists, skipping"
fi

# 5. Create systemd service
echo "[5/6] Creating systemd service..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << SVCEOF
[Unit]
Description=Agonaut Scoring Service (TEE-backed AI scoring)
After=network.target agonaut-api.service
Wants=agonaut-api.service

[Service]
Type=simple
User=$USER
Group=$GROUP
WorkingDirectory=$SERVICE_DIR
EnvironmentFile=$SERVICE_DIR/.env
ExecStart=$VENV_DIR/bin/uvicorn api:app --host 127.0.0.1 --port 8001 --workers 1
Restart=on-failure
RestartSec=10

# Resource limits (scoring is CPU-intensive but brief)
MemoryMax=512M
CPUQuota=75%

# Security
ProtectSystem=strict
ReadWritePaths=$SERVICE_DIR
NoNewPrivileges=true
PrivateTmp=true

# Restart limits
StartLimitIntervalSec=300
StartLimitBurst=3

[Install]
WantedBy=multi-user.target
SVCEOF

# 6. Enable and start
echo "[6/6] Starting service..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"

echo ""
echo "=== Scoring Service Deployed ==="
echo "  Service: $SERVICE_NAME.service"
echo "  Port:    127.0.0.1:8001"
echo "  Dir:     $SERVICE_DIR"
echo "  Health:  curl http://127.0.0.1:8001/health"
echo ""
echo "  NEXT: Add PHALA_API_KEY to $SERVICE_DIR/.env"
echo "  Then:  sudo systemctl restart $SERVICE_NAME"
