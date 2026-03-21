# ADR-002: Namespace-based i18n with next-intl
**Date:** 2026-03-21
**Status:** accepted
**Area:** i18n

## Context
Frontend needs multi-language support. Started with single JSON files per locale, migrated to namespace files for scalability.

## Decision
- next-intl v4 with App Router `[locale]` routing
- Namespace files: `messages/<locale>/<namespace>.json`
- English fallback via deep merge (missing key → English, not blank)
- Accept-Language auto-detection in middleware
- CI validation script: `npx tsx scripts/check-i18n.ts`
- ICU message format for plurals

## Alternatives Considered
1. **Single JSON per locale** — rejected, files too large, merge conflicts with sub-agents
2. **react-i18next** — rejected, next-intl is the standard for App Router
3. **Cookie-based locale** — rejected, URL-based is better for SEO

## Consequences
- ✅ Adding language = copy en/ folder + translate + 2 config lines
- ✅ Adding page = one small namespace file per locale
- ✅ Sub-agents can work on different namespaces without conflicts
- ⚠️ Deep merge converts arrays to objects — fixed with Array.isArray check
- ⚠️ `t.raw()` returns merged result, must preserve array types

## Reversal Risk
High. All pages depend on this pattern. Would require rewriting every page. Don't reverse.

## Files Affected
- `src/i18n/request.ts` — deep merge + fallback logic
- `src/i18n/routing.ts` — locale list
- `src/middleware.ts` — auto-detection
- `src/components/Navbar.tsx` — language switcher
- `messages/*/` — all translation files
- Every page under `src/app/[locale]/`
