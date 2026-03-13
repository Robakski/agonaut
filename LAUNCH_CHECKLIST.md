# Agonaut Launch Checklist

**Last Updated:** 2026-03-13
**Status:** TESTNET LIVE 🟢 | Frontend at https://agonaut.io

---

## ✅ COMPLETED (March 13, 2026)

- [x] **5 wallets created** (Deployer, Admin, Operator, Scorer, Guardian)
- [x] **12 contracts deployed to Base Sepolia** — all roles properly transferred
- [x] **agonaut.io domain** purchased (Namecheap, €30/yr)
- [x] **Cloudflare DNS** configured (maria/toby nameservers, SSL active)
- [x] **Frontend deployed to Vercel** via GitHub (Robakski/agonaut)
- [x] **Phala Cloud account** created + $5 deposited + API key obtained
- [x] **17 frontend pages** live (bounties, docs, legal, leaderboard)
- [x] **Legal docs** written (ToS, Privacy Policy, KYC/AML Plan)
- [x] **Compliance modules** built (sanctions screening, KYC tiers)
- [x] **110 contract tests** passing, 0 failures
- [x] **Docker setup** for backend + scoring service
- [x] **Contract addresses** updated in frontend + docs

---

## 🟡 BEFORE PUBLIC LAUNCH — Robert's Items

### Impressum Details (LEGALLY REQUIRED — §5 TMG)
- [ ] Full legal name
- [ ] Street address + city + postal code
- [ ] Email address (contact@agonaut.io?)
- [ ] Phone number
- **Where:** Frontend `/legal/impressum`, ToS, Privacy Policy
- **Fine if missing:** Up to €50K

### Contact Emails
- [ ] Decide on email addresses (contact@, privacy@, security@agonaut.io)
- [ ] Set up email forwarding via Cloudflare or Namecheap
- **Where:** ToS §21, Privacy Policy §12

### Legal Entity (when revenue comes)
- [ ] Register UG (haftungsbeschränkt) — €1 minimum capital
- [ ] Notary appointment (~€300-500)

---

## 🟡 BEFORE PUBLIC LAUNCH — Brose's Items

- [ ] Integration test against live contracts
- [ ] Wire frontend to read live contract data
- [ ] Contract verification on Basescan
- [ ] Phala TEE scoring container deployment
- [ ] End-to-end test: create bounty → commit → score → settle
- [ ] Basescan API key (free)
- [ ] TRM Labs API key (free, 1000 screenings/month)
- [ ] IPFS provider for problem descriptions (Pinata free tier)

---

## 🟢 PHASE 2 / NICE TO HAVE

- [ ] GeoIP database (MaxMind free)
- [ ] KYC provider (Sumsub, ~€0.50-2/verification)
- [ ] Legal opinion (€500-2K)
- [ ] Twitter/X @agonaut account
- [ ] Discord community server
- [ ] Company registration (UG)

---

## 📊 Deployment Info

| Item | Value |
|------|-------|
| Frontend | https://agonaut.io (Vercel) |
| Chain | Base Sepolia (84532) |
| Git | github.com/Robakski/agonaut |
| Contracts | See `DEPLOYMENTS.md` |
| Scoring API | Port 8001 (Docker) |
| Backend API | Port 8000 (Docker) |
| Phala Cloud | Account active, $5 credit |
