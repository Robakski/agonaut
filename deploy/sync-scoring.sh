#!/bin/bash
# Agonaut Scoring Service — Atomic Sync & Restart
set -euo pipefail

SRC="/home/brose/.openclaw/workspace/products/agonaut/scoring-service"
DEST="/opt/agonaut-scoring"
SERVICE="agonaut-scoring"
USER="brose-tools"
GROUP="brose-tools"
BACKUP_DIR="$DEST/.backup-$(date +%s)"

echo "=== Agonaut Scoring Service Sync ==="

if [ ! -f "$SRC/api.py" ]; then
    echo "ERROR: Source not found at $SRC"
    exit 1
fi

echo "[1/4] Backing up..."
mkdir -p "$BACKUP_DIR"
for item in "$DEST"/*.py; do
    [ -e "$item" ] && cp "$item" "$BACKUP_DIR/" 2>/dev/null || true
done

echo "[2/4] Syncing files..."
rsync -a --delete \
    --exclude='.env' \
    --exclude='venv/' \
    --exclude='__pycache__/' \
    --exclude='.backup-*' \
    --exclude='data/' \
    "$SRC/" "$DEST/"

echo "[3/4] Fixing permissions..."
chown -R "$USER:$GROUP" "$DEST"
chmod 600 "$DEST/.env" 2>/dev/null || true

echo "[4/4] Restarting service..."
systemctl restart "$SERVICE"
sleep 3

HEALTH=$(curl -sf http://127.0.0.1:8001/health 2>&1 || echo "FAILED")
if echo "$HEALTH" | grep -q '"ok"\|"healthy"'; then
    echo "=== Sync Complete — Service Healthy ==="
    ls -dt "$DEST"/.backup-* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true
else
    echo "=== HEALTH CHECK FAILED — Rolling back ==="
    for item in "$BACKUP_DIR"/*; do
        [ -e "$item" ] && cp "$item" "$DEST/" 2>/dev/null || true
    done
    chown -R "$USER:$GROUP" "$DEST"
    systemctl restart "$SERVICE"
    echo "Rolled back. Check: journalctl -u $SERVICE --since '5 min ago'"
    exit 1
fi
