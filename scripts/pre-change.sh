#!/bin/bash
# PRE-CHANGE CHECKLIST — Run before ANY code modification
# Usage: bash scripts/pre-change.sh [file-or-area]
set -euo pipefail

TARGET="${1:-all}"
FRONTEND="frontend"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔍 PRE-CHANGE CHECKLIST"
echo "  Target: $TARGET"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Check current build status
echo -e "\n${YELLOW}[1/5] Current build status${NC}"
if cd "$FRONTEND" && npx next build --no-lint 2>/dev/null | tail -3; then
    echo -e "${GREEN}✅ Build passes${NC}"
else
    echo -e "${RED}❌ Build already broken — fix before making changes${NC}"
    exit 1
fi
cd ..

# 2. Check i18n key sync
echo -e "\n${YELLOW}[2/5] Translation key sync${NC}"
cd "$FRONTEND"
if npx tsx scripts/check-i18n.ts 2>/dev/null; then
    echo -e "${GREEN}✅ All locales in sync${NC}"
else
    echo -e "${RED}❌ Translation keys out of sync${NC}"
fi
cd ..

# 3. Check git status
echo -e "\n${YELLOW}[3/5] Git status${NC}"
if git diff --quiet && git diff --cached --quiet; then
    echo -e "${GREEN}✅ Working tree clean${NC}"
else
    echo -e "${YELLOW}⚠️  Uncommitted changes:${NC}"
    git diff --stat
fi

# 4. Check Foundry tests
echo -e "\n${YELLOW}[4/5] Foundry tests${NC}"
if command -v forge &>/dev/null && [ -d "contracts" ]; then
    cd contracts
    if forge test --summary 2>/dev/null | tail -3; then
        echo -e "${GREEN}✅ All contract tests pass${NC}"
    else
        echo -e "${RED}❌ Contract tests failing${NC}"
    fi
    cd ..
else
    echo -e "${YELLOW}⚠️  Forge not available, skipping${NC}"
fi

# 5. Impact analysis for specific file
echo -e "\n${YELLOW}[5/5] Impact analysis${NC}"
if [ "$TARGET" != "all" ] && [ -f "$TARGET" ]; then
    BASENAME=$(basename "$TARGET" .tsx)
    BASENAME=$(basename "$BASENAME" .ts)
    echo "Files that import/reference '$BASENAME':"
    grep -rl "$BASENAME" --include="*.tsx" --include="*.ts" --include="*.json" frontend/src/ frontend/messages/ 2>/dev/null | head -20 || echo "  (none found)"
else
    echo "  Pass a specific file path for impact analysis"
fi

echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Pre-change check complete."
echo "  Proceed with changes carefully."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
