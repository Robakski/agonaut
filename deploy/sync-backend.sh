#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Agonaut Backend — Atomic Sync & Restart
#
# Syncs the full backend codebase from repo to /opt/agonaut-api/,
# preserving .env and venv. Restarts service only if sync succeeds.
#
# Usage: sudo bash sync-backend.sh
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SRC="/home/brose/.openclaw/workspace/products/agonaut/backend"
DEST="/opt/agonaut-api"
SERVICE="agonaut-api"
USER="brose-tools"
GROUP="brose-tools"
BACKUP_DIR="/opt/agonaut-api/.backup-$(date +%s)"

echo "=== Agonaut Backend Sync ==="

# 1. Verify source exists
if [ ! -f "$SRC/main.py" ]; then
    echo "ERROR: Source not found at $SRC"
    exit 1
fi

# 2. Backup current deployment (excluding venv and .env)
echo "[1/5] Backing up current deployment..."
mkdir -p "$BACKUP_DIR"
for item in "$DEST"/*.py "$DEST"/api "$DEST"/services "$DEST"/routers; do
    [ -e "$item" ] && cp -r "$item" "$BACKUP_DIR/" 2>/dev/null || true
done
echo "  → Backup at $BACKUP_DIR"

# 3. Sync files (exclude .env, venv, __pycache__, .backup-*)
echo "[2/5] Syncing backend files..."
rsync -a --delete \
    --exclude='.env' \
    --exclude='venv/' \
    --exclude='__pycache__/' \
    --exclude='.backup-*' \
    --exclude='*.pyc' \
    --exclude='data/' \
    "$SRC/" "$DEST/"

# 4. Fix ownership
echo "[3/5] Fixing permissions..."
chown -R "$USER:$GROUP" "$DEST"
# Protect .env
chmod 600 "$DEST/.env" 2>/dev/null || true

# 5. Install any new dependencies
echo "[4/5] Checking dependencies..."
if [ -f "$DEST/requirements.txt" ]; then
    sudo -u "$USER" "$DEST/venv/bin/pip" install -q -r "$DEST/requirements.txt" 2>&1 | tail -3
fi

# 6. Restart service
echo "[5/5] Restarting service..."
systemctl restart "$SERVICE"
sleep 3

# 7. Verify health
HEALTH=$(curl -sf http://127.0.0.1:8000/api/v1/health 2>&1 || echo "FAILED")
if echo "$HEALTH" | grep -q '"healthy"'; then
    echo ""
    echo "=== Sync Complete — Service Healthy ==="
    echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"
    # Clean old backups (keep last 3)
    ls -dt "$DEST"/.backup-* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true
else
    echo ""
    echo "=== HEALTH CHECK FAILED — Rolling back ==="
    # Restore from backup
    for item in "$BACKUP_DIR"/*; do
        [ -e "$item" ] && cp -r "$item" "$DEST/" 2>/dev/null || true
    done
    chown -R "$USER:$GROUP" "$DEST"
    systemctl restart "$SERVICE"
    sleep 3
    echo "Rolled back. Check logs: journalctl -u $SERVICE --since '5 min ago'"
    exit 1
fi
