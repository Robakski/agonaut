# ADR-001: Cloudflare for SSL/Proxy on API
**Date:** 2026-03-21
**Status:** accepted
**Area:** infra

## Context
Backend API needs HTTPS for api.agonaut.io. Caddy's ACME HTTP-01 challenge failed (chicken-and-egg: can't get cert without HTTPS, can't serve HTTPS without cert). Let's Encrypt was unreliable on this VPS.

## Decision
Use Cloudflare as the SSL/proxy layer with Origin Certificate:
- Cloudflare handles public SSL (client → Cloudflare)
- Cloudflare Origin Certificate installed on Caddy (Cloudflare → origin)
- SSL mode: Full (Strict) — encrypted end-to-end
- Caddy remains as reverse proxy (127.0.0.1:8000 → port 443)

## Alternatives Considered
1. **Caddy with ACME** — failed, HTTP-01 challenge didn't work
2. **Cloudflare Flexible** — HTTP between CF and origin, not encrypted, rejected as non-enterprise
3. **nginx + certbot** — more complexity, same ACME problem
4. **Direct port exposure** — no SSL, unacceptable

## Consequences
- ✅ End-to-end encryption
- ✅ Free DDoS protection, WAF, rate limiting from Cloudflare
- ✅ Origin cert valid 15 years, no renewal hassle
- ⚠️ Dependency on Cloudflare (acceptable — industry standard)
- ⚠️ Must keep Cloudflare proxy enabled (orange cloud) on api record

## Reversal Risk
Low. Switch DNS to direct, install regular cert, update Caddy config. ~30 min work.
