# CHANGELOG.md — Agonaut Change Journal
# Every change gets a one-line entry with WHY, not just WHAT.
# Format: YYYY-MM-DD | area | what → why

## 2026-03-21
- 2026-03-21 | infra | Deployed backend API to VPS as brose-tools → bounty creation needs relay API
- 2026-03-21 | infra | Installed Caddy reverse proxy → SSL termination for api.agonaut.io
- 2026-03-21 | infra | Created api.agonaut.io DNS record (Cloudflare) → separate API subdomain (enterprise standard)
- 2026-03-21 | brain | Created ARCHITECTURE.md, CHANGELOG.md, ADR system → long-term maintainability
- 2026-03-21 | i18n | Split translations into namespace files → smaller bundles, easier maintenance
- 2026-03-21 | i18n | Added English fallback via deep merge → missing keys show English, not blank
- 2026-03-21 | i18n | Added Accept-Language auto-detection → users see their language automatically
- 2026-03-21 | i18n | Added CI key validation script → catch missing translations before deploy
- 2026-03-21 | i18n | Migrated docs/legal from inline T() to JSON keys → consistent i18n pattern

## 2026-03-20
- 2026-03-20 | i18n | Set up next-intl with App Router [locale] routing → URL-based i18n (/de/bounties)
- 2026-03-20 | i18n | Translated all pages to EN/DE/ES/ZH → 4-language support
- 2026-03-20 | i18n | Created compact globe language switcher → clean navbar for any number of languages
- 2026-03-20 | brand | Applied N4 wordmark + FV5g favicon → silver→gold gradient brand
- 2026-03-20 | brand | Cleaned all colors to slate/amber palette → enterprise light theme
- 2026-03-20 | fix | Fixed deepMerge to preserve arrays → zh architecture cards were crashing

## 2026-03-19
- 2026-03-19 | contracts | V4 deployed to Base Sepolia → 12 contracts with auto-role-granting fix
- 2026-03-19 | contracts | Full E2E lifecycle 15/15 steps → zero errors
- 2026-03-19 | contracts | All 112 Foundry tests passing → complete test coverage
- 2026-03-19 | frontend | Built bounty creation wizard → 5-step form with on-chain wiring
- 2026-03-19 | frontend | Built agent onboarding + registration pages → human-first design
- 2026-03-19 | frontend | Built bounties listing + leaderboard → light theme, live data
