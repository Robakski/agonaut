#!/bin/bash
# Agonaut Backend API — One-shot deployment script
# Run as root: sudo bash setup-api.sh
set -euo pipefail

echo "=== Agonaut API Deployment ==="

# 1. Create directory
echo "[1/8] Creating /opt/agonaut-api..."
mkdir -p /opt/agonaut-api
chown brose-tools:brose-tools /opt/agonaut-api

# 2. Copy backend code
echo "[2/8] Copying backend code..."
cp -r /home/brose/.openclaw/workspace/products/agonaut/backend/* /opt/agonaut-api/
chown -R brose-tools:brose-tools /opt/agonaut-api

# 3. Create Python venv and install deps
echo "[3/8] Creating Python venv..."
sudo -u brose-tools python3 -m venv /opt/agonaut-api/venv
sudo -u brose-tools /opt/agonaut-api/venv/bin/pip install --quiet -r /opt/agonaut-api/requirements.txt
echo "    Installed packages:"
sudo -u brose-tools /opt/agonaut-api/venv/bin/pip list --format=columns 2>/dev/null | grep -iE "fastapi|uvicorn|web3|pydantic|httpx" || true

# 4. Create .env with contract addresses
echo "[4/8] Creating .env..."
cat > /opt/agonaut-api/.env << 'ENVEOF'
# Agonaut API Configuration
# Base Sepolia (testnet)
RPC_URL=https://sepolia.base.org
CHAIN_ID=84532

# V4 Contract Addresses (Base Sepolia)
BOUNTY_FACTORY=0x99C1500edfD3CbD70B6be258dB033c7A8dd5A8B8
ARENA_REGISTRY=0xc8096d0db341e3a4b372bccfe95b840bc680c2d5
SCORING_ORACLE=
ELO_SYSTEM=
TREASURY=
SEASON_MANAGER=
ARBITRATION_DAO=
BOUNTY_MARKETPLACE=

# Operator key (leave empty for now — read-only API first)
OPERATOR_PRIVATE_KEY=

# Server
HOST=127.0.0.1
PORT=8000
DEBUG=false

# Compliance (not configured yet)
TRM_API_KEY=
PHALA_API_KEY=
ENVEOF
chown brose-tools:brose-tools /opt/agonaut-api/.env
chmod 600 /opt/agonaut-api/.env

# 5. Create systemd service
echo "[5/8] Creating systemd service..."
cat > /etc/systemd/system/agonaut-api.service << 'SVCEOF'
[Unit]
Description=Agonaut Backend API (brose-tools)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=3

[Service]
Type=simple
User=brose-tools
Group=brose-tools
WorkingDirectory=/opt/agonaut-api
ExecStart=/opt/agonaut-api/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --workers 1 --log-level warning
Restart=on-failure
RestartSec=10

# === HARD SAFETY LIMITS ===
MemoryMax=256M
MemoryHigh=200M
CPUQuota=50%

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/agonaut-api
PrivateTmp=yes

# Environment
EnvironmentFile=/opt/agonaut-api/.env

[Install]
WantedBy=multi-user.target
SVCEOF

# 6. Install Caddy (reverse proxy with auto-SSL)
echo "[6/8] Installing Caddy..."
if ! command -v caddy &>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    apt-get update -qq
    apt-get install -y -qq caddy
    echo "    Caddy installed: $(caddy version)"
else
    echo "    Caddy already installed: $(caddy version)"
fi

# 7. Configure Caddy for api.agonaut.io
echo "[7/8] Configuring Caddy..."
cat > /etc/caddy/Caddyfile << 'CADDYEOF'
api.agonaut.io {
    reverse_proxy 127.0.0.1:8000

    # Rate limiting headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
        Access-Control-Allow-Origin https://agonaut.io
        Access-Control-Allow-Methods "GET, POST, OPTIONS"
        Access-Control-Allow-Headers "Content-Type, Authorization"
    }

    log {
        output file /var/log/caddy/agonaut-api.log {
            roll_size 10mb
            roll_keep 3
        }
    }
}
CADDYEOF
mkdir -p /var/log/caddy

# 8. Start everything
echo "[8/8] Starting services..."
systemctl daemon-reload
systemctl enable agonaut-api.service
systemctl start agonaut-api.service
systemctl enable caddy
systemctl restart caddy

# Wait and check
sleep 4
echo ""
echo "=== Status ==="
if systemctl is-active --quiet agonaut-api.service; then
    echo "✅ agonaut-api.service is RUNNING"
else
    echo "❌ agonaut-api failed. Logs:"
    journalctl -u agonaut-api.service -n 10 --no-pager
fi

if systemctl is-active --quiet caddy; then
    echo "✅ caddy is RUNNING"
else
    echo "❌ caddy failed. Logs:"
    journalctl -u caddy -n 10 --no-pager
fi

echo ""
echo "Testing local API..."
curl -s http://127.0.0.1:8000/api/v1/health 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "(API not responding yet — check logs)"

echo ""
echo "=== Done ==="
echo "API:     https://api.agonaut.io/api/v1/health"
echo "Docs:    https://api.agonaut.io/api/docs"
echo "Logs:    journalctl -u agonaut-api.service -f"
echo "Caddy:   journalctl -u caddy -f"
