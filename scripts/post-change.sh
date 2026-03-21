#!/bin/bash
# POST-CHANGE VERIFICATION — Run after ANY code modification
# Usage: bash scripts/post-change.sh
set -euo pipefail

FRONTEND="frontend"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
ERRORS=0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ POST-CHANGE VERIFICATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Frontend build
echo -e "\n${YELLOW}[1/6] Frontend build${NC}"
cd "$FRONTEND"
if npx next build --no-lint 2>&1 | tail -5; then
    echo -e "${GREEN}✅ Build passes${NC}"
else
    echo -e "${RED}❌ BUILD FAILED — DO NOT PUSH${NC}"
    ERRORS=$((ERRORS + 1))
fi

# 2. i18n validation
echo -e "\n${YELLOW}[2/6] Translation keys${NC}"
if npx tsx scripts/check-i18n.ts 2>/dev/null; then
    echo -e "${GREEN}✅ All locales in sync${NC}"
else
    echo -e "${RED}❌ Translation keys missing${NC}"
    ERRORS=$((ERRORS + 1))
fi
cd ..

# 3. Foundry tests
echo -e "\n${YELLOW}[3/6] Contract tests${NC}"
if command -v forge &>/dev/null && [ -d "contracts" ]; then
    cd contracts
    if forge test --summary 2>/dev/null | tail -3; then
        echo -e "${GREEN}✅ All contract tests pass${NC}"
    else
        echo -e "${RED}❌ Contract tests failing${NC}"
        ERRORS=$((ERRORS + 1))
    fi
    cd ..
else
    echo -e "${YELLOW}⚠️  Skipping (forge not available)${NC}"
fi

# 4. Check for common mistakes
echo -e "\n${YELLOW}[4/6] Common mistake scan${NC}"
cd "$FRONTEND"

# Check for hardcoded English in translated pages
HARDCODED=$(grep -rn "\"use client\"" src/app/\[locale\]/ --include="*.tsx" -l 2>/dev/null | while read f; do
    grep -L "useTranslations\|getTranslations" "$f" 2>/dev/null
done)
if [ -n "$HARDCODED" ]; then
    echo -e "${YELLOW}⚠️  Client pages without useTranslations: $HARDCODED${NC}"
fi

# Check for next/link instead of i18n Link
WRONG_LINK=$(grep -rn "from \"next/link\"" src/app/\[locale\]/ --include="*.tsx" 2>/dev/null | head -5)
if [ -n "$WRONG_LINK" ]; then
    echo -e "${YELLOW}⚠️  Using next/link instead of @/i18n/navigation:${NC}"
    echo "$WRONG_LINK"
fi

echo -e "${GREEN}✅ Scan complete${NC}"
cd ..

# 5. Git diff summary
echo -e "\n${YELLOW}[5/6] Change summary${NC}"
git diff --stat
echo ""
echo "Files changed: $(git diff --name-only | wc -l)"

# 6. Reminder
echo -e "\n${YELLOW}[6/6] Before pushing${NC}"
echo "  □ Update CHANGELOG.md with WHY"
echo "  □ Create ADR if this is an architecture change"
echo "  □ Update ARCHITECTURE.md if structure changed"
echo "  □ Atomic commit message (one logical change)"

echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -gt 0 ]; then
    echo -e "  ${RED}❌ $ERRORS ERRORS — FIX BEFORE PUSHING${NC}"
    exit 1
else
    echo -e "  ${GREEN}✅ All checks passed — safe to push${NC}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
