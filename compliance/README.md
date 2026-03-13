# Agonaut Compliance Module

## Components

### sanctions.py — Sanctions Screening (ACTIVE)
Three-layer wallet and jurisdiction screening:
1. **OFAC SDN list** — 20+ known sanctioned wallet addresses (Tornado Cash, Lazarus Group, Garantex)
2. **Jurisdiction blocking** — 6 fully blocked countries, 16 EDD countries (FATF grey list)
3. **TRM Labs API** — on-chain risk scoring (optional, free tier: 1,000/month)

**Usage in API middleware:**
```python
from compliance.sanctions import screen_user

result = screen_user(wallet_address, "create_bounty", ip_address=request.remote_addr)
if result.blocked:
    return 403, result.reason
if result.edd_required:
    require_enhanced_verification()
```

**Maintenance:**
- Update `sanctioned_wallets.json` quarterly from OFAC SDN list
- Review FATF grey list updates (published 3x/year)
- Review EU sanctions changes (frequent due to geopolitics)

### kyc_tiers.py — KYC Tier Management (READY TO ACTIVATE)
Tiered verification requirements:

| Tier | Verification | Triggers |
|------|-------------|----------|
| 0 | None | Browse, connect, agent entry fees |
| 1 | Government ID | Create bounties, payouts > €1,000 |
| 2 | ID + address + source of funds | Bounties > €10K, volume > €50K |
| 3 | Company docs + UBO | Entity sponsors |

Currently in **gate mode** — determines required tier and blocks/allows actions.
KYC provider integration (Sumsub/IDnow) plugs into `set_verified()` when ready.

### sanctioned_wallets.json — Extra Sanctioned Addresses
Updatable without code changes. Add addresses as OFAC publishes new designations.

### screening_log.jsonl — Audit Trail (Auto-generated)
Append-only log of every sanctions screening. Required for regulatory compliance.
Retain for 5 years per GwG §8.

## Setup

### Minimum (Launch — €0)
```bash
# No API keys needed — OFAC list is hardcoded, jurisdiction check works by country code
python sanctions.py  # Test it
python kyc_tiers.py  # Test it
```

### With TRM Labs (Free Tier — 1,000 screenings/month)
```bash
# Sign up: https://www.trmlabs.com/products/screening
export TRM_API_KEY="your_key_here"
python sanctions.py 0x722122dF12D4e14e13Ac3b6895a86e84145b6967  # Test Tornado Cash address
```

### With GeoIP (IP-based jurisdiction detection)
```bash
# Download free MaxMind GeoLite2 database: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
pip install geoip2
export GEOIP_DB_PATH="/path/to/GeoLite2-Country.mmdb"
```

## Integration Points

### API Middleware (when backend is built)
Every API request that involves wallet interaction should call `screen_user()`:
- `POST /bounty` → screen sponsor wallet
- `POST /commit` → screen agent wallet
- `POST /claim` → screen claimer wallet + check KYC tier

### Smart Contract Level
On-chain, there's no sanctions check (permissionless). The screening happens at the
API/frontend layer. This is standard — Uniswap, Aave, and all major DeFi protocols
do the same (frontend blocks, contracts are permissionless).

### Frontend
Block sanctioned jurisdictions at the UI level:
- Check IP on page load
- Show "service unavailable in your region" for blocked countries
- This is defense-in-depth — users can bypass (VPN), but we demonstrate compliance effort

## Regulatory Notes

- **We are NOT a financial service** (self-custodial smart contracts)
- **We implement these measures voluntarily** to demonstrate good faith
- **When Robert registers a company**, activate KYC provider and formalize the program
- **Legal opinion needed** before launch to confirm our obligations
- **All screening logs retained 5 years** per German AML record-keeping requirements
