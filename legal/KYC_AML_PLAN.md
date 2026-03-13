# Agonaut — KYC/AML Compliance Plan

**Status:** Draft — requires legal review before implementation
**Jurisdiction:** Germany / EU

---

## 1. Regulatory Framework

### Applicable Laws
| Regulation | Scope | Key Requirements |
|-----------|-------|-----------------|
| **GwG** (Geldwäschegesetz) | German AML law | KYC, risk assessment, SAR filing, record-keeping |
| **AMLD 5/6** (EU Anti-Money Laundering Directives) | EU-wide | Customer due diligence, beneficial ownership |
| **MiCA** (Markets in Crypto-Assets) | EU crypto regulation | Crypto-asset service provider requirements |
| **GDPR** | Data protection | Privacy-compliant identity verification |
| **EU Sanctions Regulations** | Sanctions compliance | Screening against EU/UN/OFAC lists |

### Do We Need a BaFin License?
**This is the critical question that needs professional legal advice.**

Possible classifications:
- **Not a financial service** — if we're purely a skill-based competition platform (most likely)
- **Crypto-asset service provider under MiCA** — if handling ETH constitutes "custody" or "transfer" (unlikely — smart contracts are self-custodial)
- **Payment service** — extremely unlikely (we don't move fiat)

**Action required:** Engage a German fintech/crypto lawyer to confirm classification before launch.

---

## 2. Risk Assessment

### Money Laundering Risk Factors

| Factor | Risk Level | Reasoning |
|--------|-----------|-----------|
| Crypto-native (ETH only) | MEDIUM | Pseudonymous but on-chain traceable |
| Self-custodial (no deposits with us) | LOW | We never hold user funds directly |
| Smart contract escrow | MEDIUM | Funds locked in contracts during rounds |
| International user base | MEDIUM | Users from many jurisdictions |
| Bounty payouts | MEDIUM | Could be used to transfer value |
| Entry fees | LOW | Small amounts (0.003 ETH) |
| Large bounties | HIGH | Could be used for layering |

### Potential Abuse Scenarios
1. **Layering via bounties** — Criminal posts large bounty, accomplice "wins," funds appear as legitimate prize winnings.
2. **Structuring** — Multiple small bounties to avoid thresholds.
3. **Sanctions evasion** — Sanctioned person uses crypto wallet to participate.

---

## 3. KYC Tiers

### Tier 0: No Verification Required
- Agent registration (small entry fees only)
- Browsing, viewing bounties
- **Limit:** Cannot create bounties or receive payouts above threshold

### Tier 1: Basic Verification
- **Triggers:** Creating a bounty OR cumulative payouts exceed 1,000 EUR equivalent
- **Required:**
  - Full legal name
  - Date of birth
  - Country of residence
  - Government-issued photo ID (passport, national ID, driver's license)
  - Sanctions list screening
- **Method:** Automated via KYC provider (e.g., Sumsub, Onfido, IDnow)

### Tier 2: Enhanced Due Diligence (EDD)
- **Triggers:** Single bounty > 10,000 EUR equivalent OR cumulative volume > 50,000 EUR equivalent OR risk flags
- **Required:**
  - Everything in Tier 1, plus:
  - Proof of address (utility bill, bank statement, <3 months old)
  - Source of funds declaration
  - Beneficial ownership declaration (if entity)
- **Method:** Automated + manual review

### Tier 3: Entity Verification
- **Triggers:** Legal entity (company) as Sponsor
- **Required:**
  - Everything in Tier 2, plus:
  - Company registration documents
  - Ultimate beneficial owner (UBO) identification (>25% ownership)
  - Director identification
  - Company bank statement or equivalent

---

## 4. Sanctions Screening

### Process
1. **On registration** (Tier 1+): Screen against EU, OFAC, UN, and UK sanctions lists.
2. **Ongoing:** Re-screen all verified users when sanctions lists are updated.
3. **Wallet screening:** Use a blockchain analytics tool (e.g., Chainalysis, Elliptic, TRM Labs) to check wallet addresses against known sanctioned/high-risk addresses.

### Blocked Jurisdictions (Full Embargo)
Users from these jurisdictions are prohibited entirely:
- North Korea (DPRK)
- Iran
- Syria
- Cuba
- Crimea, Donetsk, Luhansk regions (Ukraine — Russian-occupied)
- Russia (depending on scope of current EU sanctions — review regularly)
- Myanmar (in connection with military junta)
- Any jurisdiction added to EU comprehensive sanctions

### Restricted Jurisdictions (Enhanced Due Diligence)
Users from these jurisdictions require Tier 2 verification regardless of volume:
- [To be determined based on FATF grey/black lists at launch]

---

## 5. Transaction Monitoring

### Automated Monitoring
Implement automated monitoring for:
- Unusually large bounty deposits relative to typical platform activity.
- Rapid creation and settlement of bounties (potential layering).
- Multiple bounties between the same wallet pairs (potential wash trading for fund transfer).
- Wallets linked to known high-risk addresses (via blockchain analytics).
- Patterns consistent with structuring (splitting large amounts into sub-threshold transactions).

### Manual Review Triggers
Flag for manual review when:
- A single bounty exceeds 15,000 EUR equivalent.
- Cumulative monthly volume for a wallet exceeds 50,000 EUR equivalent.
- Automated monitoring flags suspicious patterns.
- A user is from a high-risk jurisdiction.
- A user's stated source of funds is inconsistent with activity.

---

## 6. Suspicious Activity Reporting (SAR)

### Process
1. **Detection** — automated monitoring or manual identification of suspicious activity.
2. **Internal review** — designated AML officer reviews the case.
3. **Filing** — if suspicion is confirmed, file a SAR with the German FIU (goAML portal) within 3 business days.
4. **Do NOT tip off** — never inform the user that a SAR has been filed (§47 GwG tipping-off prohibition).
5. **Record** — maintain internal records of all SAR decisions (filed and not filed) for 5 years.

### Who Files
Designate an AML Compliance Officer (Geldwäschebeauftragter) responsible for:
- SAR filing decisions
- Ongoing risk assessment updates
- Staff training (if applicable)
- Regulatory communication

---

## 7. Record Keeping

### Requirements (GwG §8)
| Record | Retention | Format |
|--------|-----------|--------|
| KYC documents (IDs, proof of address) | 5 years after relationship ends | Secure encrypted storage |
| Transaction records | 5 years after transaction | Database + on-chain |
| SAR records | 5 years after filing | Encrypted, restricted access |
| Risk assessments | 5 years after update | Internal documentation |
| Sanctions screening results | 5 years | Automated log |

### GDPR Compliance
All record-keeping must comply with GDPR data minimization principles:
- Collect only what's legally required.
- Delete when retention period expires.
- Provide access upon user request (Art. 15 GDPR), except for SAR-related records (which are exempt).

---

## 8. Implementation Roadmap

### Phase 1: Pre-Launch (Required)
- [ ] **Legal opinion** — engage German crypto/fintech lawyer for regulatory classification
- [ ] **BaFin consultation** — confirm whether license/registration is needed
- [ ] **AML officer** — designate (can be Robert initially for small-scale launch)
- [ ] **Sanctions list** — compile and implement blocked jurisdiction list
- [ ] **Basic wallet screening** — integrate a free/low-cost chain analysis tool
- [ ] **ToS + Privacy Policy** — finalize and publish

### Phase 2: Launch (Tier 0 + 1)
- [ ] **KYC provider** — integrate automated ID verification (Sumsub/IDnow)
- [ ] **Tier system** — implement verification triggers in the application
- [ ] **Sanctions screening** — automated on registration
- [ ] **Basic transaction monitoring** — flag large bounties for review
- [ ] **Record-keeping system** — secure storage for KYC documents

### Phase 3: Scale (All Tiers)
- [ ] **Enhanced monitoring** — integrate blockchain analytics (Chainalysis/TRM)
- [ ] **Entity verification** — KYB (Know Your Business) flow
- [ ] **Automated SAR detection** — ML-based suspicious pattern detection
- [ ] **Regular audits** — external AML compliance audits
- [ ] **Staff training** — formal AML training program (if team grows)

---

## 9. Budget Estimates

| Item | Cost | Timing |
|------|------|--------|
| Legal opinion (crypto lawyer) | €500-2,000 (one-time) | Pre-launch |
| KYC provider (Sumsub/IDnow) | €0.50-2.00 per verification | Ongoing |
| Blockchain analytics (basic) | Free tier available (TRM, Scorechain) | Launch |
| Blockchain analytics (full) | €200-500/month | Scale phase |
| AML audit | €2,000-5,000/year | Annually |
| BaFin registration (if needed) | €0-10,000 depending on classification | Pre-launch |

### Low-Budget Launch Strategy
1. Start with **free tier** blockchain analytics (TRM Labs offers a free screening tool).
2. Use **Sumsub** (pay-per-verification, no monthly minimum) for KYC.
3. Robert acts as **AML officer** initially.
4. Get the **legal opinion first** — it determines everything else.

---

## 10. Open Questions (For Lawyer)

1. Does Agonaut need a BaFin registration or MiCA CASP license?
2. Is a skill-based competition with crypto prizes classified as gambling under German/EU law?
3. At what bounty size do KYC requirements become legally mandatory (vs. best practice)?
4. Are we a "Verpflichteter" (obligated entity) under GwG for AML purposes?
5. Do we need to register with the German FIU even before any suspicious activity?
6. What are the implications of operating globally from Germany — do we need to comply with US (FinCEN), UK (FCA), or other jurisdictions' AML rules?
7. How does the self-custodial nature of our platform (smart contract escrow, not us holding funds) affect our regulatory obligations?
8. Do we need a German Impressum (legal notice) on the website? (Almost certainly yes.)

---

**⚠️ CRITICAL: This document is a compliance PLAN, not legal advice. It must be reviewed and approved by a qualified German lawyer specializing in crypto/fintech regulation before implementation. Do not rely on this document alone for regulatory compliance.**
