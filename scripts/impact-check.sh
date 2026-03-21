#!/bin/bash
# IMPACT ANALYSIS — Check what depends on a file before changing it
# Usage: bash scripts/impact-check.sh <file-path>
set -euo pipefail

if [ $# -eq 0 ]; then
    echo "Usage: bash scripts/impact-check.sh <file-path>"
    echo "Example: bash scripts/impact-check.sh frontend/src/components/Navbar.tsx"
    exit 1
fi

TARGET="$1"
BASENAME=$(basename "$TARGET" | sed 's/\.[^.]*$//')
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🎯 IMPACT ANALYSIS: $TARGET"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. What imports this file?
echo -e "\n${YELLOW}[1/5] Files that import '$BASENAME':${NC}"
grep -rn "$BASENAME" --include="*.tsx" --include="*.ts" --include="*.json" \
    frontend/src/ frontend/messages/ 2>/dev/null | grep -v node_modules | grep -v ".next" | head -20 || echo "  (none)"

# 2. What does this file import?
echo -e "\n${YELLOW}[2/5] Dependencies (what this file imports):${NC}"
if [ -f "$TARGET" ]; then
    grep -E "^import|^from" "$TARGET" 2>/dev/null | head -20 || echo "  (none)"
else
    echo "  File not found"
fi

# 3. Translation keys used
echo -e "\n${YELLOW}[3/5] Translation namespaces used:${NC}"
if [ -f "$TARGET" ]; then
    grep -oE "useTranslations\(['\"]([^'\"]+)['\"]\)" "$TARGET" 2>/dev/null || echo "  (none)"
fi

# 4. Related ADRs
echo -e "\n${YELLOW}[4/5] Related ADRs:${NC}"
find memory/decisions/ -name "ADR-*.md" -exec grep -l "$BASENAME" {} \; 2>/dev/null || echo "  (none)"

# 5. Recent changes to this file
echo -e "\n${YELLOW}[5/5] Recent git history:${NC}"
if [ -f "$TARGET" ]; then
    git log --oneline -5 -- "$TARGET" 2>/dev/null || echo "  (no git history)"
else
    echo "  File not found"
fi

echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
