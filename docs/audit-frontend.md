# Agonaut Frontend Security & Functionality Audit

**Auditor:** Brose Almighty (AI)  
**Date:** 2026-03-26  
**Scope:** 48 files in `frontend/src/` — all pages, components, hooks, lib modules  
**Status:** Pre-mainnet review

---

## Executive Summary

The frontend is well-built. React/Next.js with proper state management, fire-and-forget tracking, Zod validation, and clean encryption flows. No critical security vulnerabilities found. Several functional gaps and one medium security issue need attention.

**Findings: 0 Critical, 1 High, 2 Medium, 4 Low, 3 Functional Issues**

---

## Security Findings

### F-H1: ECIES Decryption Uses Signature-Derived Key — Incompatible with Backend ECIES [HIGH]

**File:** `src/lib/ecies.ts`  
**Impact:** Solution decryption will FAIL for sponsors.

The backend (`scoring-service/ecies_encrypt.py`) encrypts solutions using standard secp256k1 ECIES: ephemeral ECDH key exchange with the sponsor's actual public key. But the frontend `ecies.ts` uses a **completely different approach**: it derives a decryption key from a wallet signature (`signMessage`), not from ECDH.

These are incompatible cryptographic schemes. The frontend will never be able to decrypt what the backend encrypted.

The frontend comments even acknowledge this: *"Since wallets don't expose private keys, we use a workaround"* — but the workaround means the TEE would need to encrypt with the signature-derived key too, which it doesn't.

**Fix:** Either:
1. Use `eth_decrypt` (EIP-2844, MetaMask only — limited wallet support), OR
2. Have the TEE encrypt using the same signature-derived key scheme (change `ecies_encrypt.py` to match), OR
3. Use a dedicated encryption keypair derived from a wallet signature on both sides (the "deterministic key" approach — both sides sign the same message and derive the same AES key)

**Recommendation:** Option 3 is the most practical. The sponsor signs a deterministic message during bounty creation. The signature is used to derive a keypair. The TEE uses the same message+signature to derive the same key for encryption. The frontend uses the same message+signature to derive the key for decryption. This keeps keys out of the browser while maintaining compatibility.

### F-M1: Problem Encryption Key Sent to Backend in Plaintext [MEDIUM]

**File:** `src/app/[locale]/bounties/create/page.tsx` line ~335  

```javascript
body: JSON.stringify({
    ...
    problem_key: encrypted.key,  // AES-256 key in hex, sent over HTTPS
})
```

The AES key for the encrypted problem is sent to the backend over HTTPS. While HTTPS provides transport encryption, the backend stores this key and can decrypt the problem at will. This is the "platform-custodied keys" model (Option 1 in the architecture).

This is a **documented design decision** (V1 uses platform custody, V2 path to TEE escrow exists). But it should be clearly communicated to sponsors that for V1, the platform CAN technically read private bounty problems. The "zero-knowledge" marketing should be scoped to SOLUTIONS only (which use ECIES and are truly zero-knowledge).

**Recommendation:** Update privacy documentation to distinguish:
- Solutions: TRUE zero-knowledge (ECIES, platform cannot decrypt) ✅
- Problems: Platform-custodied (encrypted at rest, platform CAN decrypt if needed for scoring) ⚠️

### F-M2: `useState` Used as `useEffect` in Problem Viewer [MEDIUM]

**File:** `src/app/[locale]/bounties/[id]/problem/page.tsx` line ~39

```javascript
useState(() => {
    if (!roundAddress) return;
    fetch(...)...
});
```

`useState` with a callback is an initializer — it runs once on mount and NEVER re-runs. This means:
- If `roundAddress` changes (navigation), the metadata won't refetch
- The side effect runs during render (React Strict Mode will call it twice in dev)
- This is a misuse of `useState` — should be `useEffect`

**Fix:** Change to `useEffect(() => { ... }, [roundAddress])`.

---

## Low Findings

### F-L1: Validation Schema Allows 0.009 ETH (Testnet) Not 0.125 ETH (Mainnet)

**File:** `src/lib/validation.ts` line 18

```javascript
(val) => !isNaN(n) && n >= 0.009 && n <= 1000
```

The Zod schema validates bountyEth >= 0.009 (testnet minimum). For mainnet, this should be 0.125. The UI's `bountyEth` default is correctly "0.125" but validation allows lower.

**Fix:** Import `MIN_BOUNTY_DEPOSIT` from contracts.ts and use it in the schema.

### F-L2: `contracts.ts` Has Hardcoded Testnet Values

**File:** `src/lib/contracts.ts`

```javascript
export const ACTIVE_CHAIN_ID = BASE_SEPOLIA_ID;  // Must change for mainnet
export const BASESCAN_URL = "https://sepolia.basescan.org";  // Must change for mainnet
```

These need to be flipped before mainnet. Consider using `NEXT_PUBLIC_CHAIN_ID` env var.

### F-L3: Placeholder Bounties Still Shown When API Returns Empty

**File:** `src/app/[locale]/bounties/page.tsx` line ~75

If the API returns an empty array (`data.length === 0`), the state doesn't update and placeholders remain. This could confuse users on mainnet into thinking there are real bounties.

**Fix:** Set `setApiBounties([])` when API returns empty to hide placeholders.

### F-L4: No CSP (Content Security Policy) Headers

**File:** `next.config.js` (not present in src/)

No Content Security Policy headers are configured. The Sumsub WebSDK loads external scripts from `static.sumsub.com`. Without CSP, any injected script could exfiltrate data.

**Recommendation:** Add CSP headers in `next.config.js` allowing only: `self`, `static.sumsub.com`, `api.agonaut.io`, ConnectKit/WalletConnect origins.

---

## Functional Issues

### FUNC-1: Bounty Detail Page Missing

There is no `src/app/[locale]/bounties/[id]/page.tsx` — the bounty listing links to `/bounties/{id}` but that page doesn't exist. Users clicking a bounty card will get a 404.

The routes that DO exist under `[id]` are `/problem` and `/solution` — but the main detail page is missing.

**Fix:** Create a bounty detail page showing: title, description (if public), phase, prize pool, agents entered, deadline, phase timeline, and links to problem/solution viewers.

### FUNC-2: Agent Dashboard Loads Placeholder Data

**File:** `src/app/[locale]/dashboard/agent/page.tsx`

The agent dashboard shows hardcoded placeholder stats (ELO 1200, 0 ETH earned, etc.). It doesn't fetch real data from the API. The API key management section works, but the main dashboard is static.

### FUNC-3: Sponsor Dashboard Loads Placeholder Data

Same issue as FUNC-2 — `dashboard/sponsor/page.tsx` shows placeholders, not real data.

---

## What Works Well ✅

1. **Zod validation** on bounty creation — defense-in-depth before API call
2. **Fire-and-forget tracking** — never blocks UX, uses `navigator.sendBeacon` on unload
3. **KYC gate** fails closed — defaults to "NONE" on API error
4. **Activity tracker** properly deduplicates page views
5. **Privacy UI** — clear 🌐/🔒 markers, dynamic fee calculation, encrypted field indicators
6. **Bounty listing** — 🔐 badge for private bounties, real API data with placeholder fallback
7. **No `dangerouslySetInnerHTML` with user data** — only used for hardcoded JSON-LD
8. **Client-side encryption** generates fresh random keys per bounty (no key reuse)
9. **Solution viewer** uses wallet signature with timestamp (replay-resistant)

---

## Summary

| Severity | Count | Action |
|----------|-------|--------|
| Critical | 0 | — |
| High | 1 | F-H1: ECIES incompatibility — solutions can't be decrypted |
| Medium | 2 | F-M1: Problem key custody docs, F-M2: useState misuse |
| Low | 4 | Testnet values, placeholders, CSP |
| Functional | 3 | Missing bounty detail page, placeholder dashboards |

## Priority Actions

1. **F-H1:** Fix ECIES decryption compatibility — this is a BLOCKER (sponsors can't read solutions)
2. **F-M2:** Fix useState → useEffect in problem viewer
3. **FUNC-1:** Create bounty detail page (users will 404 without it)
4. **F-L1/L2:** Flip testnet → mainnet values before launch
5. **F-L3:** Handle empty API response in bounty listing
