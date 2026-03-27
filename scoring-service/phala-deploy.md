# Deploying Scoring Service to Phala Cloud — Full Zero-Knowledge

## What This Gives You

When deployed to Phala Cloud CVM (Intel TDX):
- **Hardware isolation**: Nobody — not Robert, not Phala, not Intel — can read enclave memory
- **Remote attestation**: Anyone can cryptographically verify the code is unmodified
- **Sealed keypair**: TEE's ECIES private key is bound to the enclave, never extractable
- **Verifiable scoring**: Agents can prove their solutions were scored by the published code

**Without this (VPS mode)**: The crypto works, but "zero-knowledge" requires trusting Robert.
**With this (TEE mode)**: Zero-knowledge is cryptographically guaranteed. No trust needed.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Phala Cloud CVM (Intel TDX Enclave)                │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │ TEE Keypair  │  │  TEE Vault   │                 │
│  │ (sealed)     │  │ (in-memory)  │                 │
│  └──────┬───────┘  └──────┬───────┘                 │
│         │                 │                         │
│  ┌──────▼─────────────────▼───────┐                 │
│  │     Scoring Service (api.py)   │                 │
│  │  - ECIES decrypt solutions     │                 │
│  │  - Call Phala AI (also in TEE) │                 │
│  │  - ECIES encrypt results       │                 │
│  │  - Submit scores on-chain      │                 │
│  └──────────────┬─────────────────┘                 │
│                 │                                   │
│  ┌──────────────▼─────────────────┐                 │
│  │  Remote Attestation            │                 │
│  │  GET /tee/attestation          │                 │
│  │  → TDX quote + ECIES pubkey   │                 │
│  └────────────────────────────────┘                 │
│                                                     │
│  RTMR3 = SHA-384(docker-compose.yaml)               │
│  reportData = SHA-256(TEE_PUBLIC_KEY)               │
└─────────────────────────────────────────────────────┘
          │
          │ HTTPS (TLS terminated inside TEE)
          ▼
    Backend API (api.agonaut.io)
```

## Prerequisites

1. **Phala Cloud account**: https://cloud.phala.com/register
2. **Docker** installed locally (for building)
3. **Environment variables** ready:
   - `PHALA_API_KEY` — Phala Cloud API key
   - `SCORER_PRIVATE_KEY` — Wallet for on-chain score submission
   - `SCORING_ORACLE` — ScoringOracle contract address
   - `SCORING_API_KEY` — HMAC key shared with backend
   - `RPC_URL` — Base RPC endpoint

## Step 1: Build Docker Image

```bash
cd scoring-service/

# Build the image
docker build -t ghcr.io/robakski/agonaut-scorer:latest .

# Push to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u Robakski --password-stdin
docker push ghcr.io/robakski/agonaut-scorer:latest
```

## Step 2: Deploy to Phala Cloud

### Option A: Web UI
1. Go to https://cloud.phala.com
2. Click **"Create CVM"**
3. Select **Docker Compose** deployment
4. Upload `docker-compose.phala.yml`
5. Set encrypted environment variables in the UI
6. Click **Deploy**

### Option B: CLI
```bash
npm install -g @phala/cloud-cli

phala login
phala deploy \
  --compose docker-compose.phala.yml \
  --env PHALA_API_KEY=$PHALA_API_KEY \
  --env SCORER_PRIVATE_KEY=$SCORER_PRIVATE_KEY \
  --env SCORING_ORACLE=$SCORING_ORACLE \
  --env SCORING_API_KEY=$SCORING_API_KEY \
  --env RPC_URL=https://mainnet.base.org
```

## Step 3: Update Backend to Point to Phala CVM

After deployment, Phala provides a public URL (e.g., `https://<cvm-id>.app.phala.network`).

Update the backend's scoring service URL:
```bash
# In /opt/agonaut-api/.env:
SCORING_SERVICE_URL=https://<cvm-id>-8001.app.phala.network
```

## Step 4: Verify TEE Attestation

```bash
# Check attestation
curl https://<cvm-id>-8001.app.phala.network/tee/attestation | jq .

# Expected output:
{
  "mode": "tdx",                    # ← Must be "tdx", not "development"
  "verified": true,
  "tee_public_key": "0x04...",
  "report_data_hash": "abc123...",
  "tdx_quote": "AQAAAA...",         # ← Intel-signed TDX quote
  "rtmr3": "...",                    # ← Matches docker-compose hash
  "verification_url": "https://trust-center.phala.network/verify"
}
```

### Independent Verification (Anyone Can Do This)

```bash
# 1. Verify the TDX quote with Phala Trust Center
curl -X POST https://trust-center.phala.network/verify \
  -H "Content-Type: application/json" \
  -d '{"quote": "<tdx_quote_from_above>"}'

# 2. Verify code matches GitHub
git clone https://github.com/Robakski/agonaut.git
cd scoring-service
sha256sum docker-compose.phala.yml  # Should match RTMR3 compose-hash

# 3. Verify public key binding
python3 -c "
import hashlib
pubkey = bytes.fromhex('<tee_public_key_without_0x>')
print(hashlib.sha256(pubkey).hexdigest())
# Should match report_data_hash from attestation
"
```

## Cost Estimate

| Component | Monthly Cost |
|-----------|-------------|
| Phala Cloud CVM (2 vCPU, 512MB) | ~$15-30 |
| Phala AI API calls (~100 rounds) | ~$3 |
| **Total** | **~$18-33/mo** |

## Rollback

If Phala CVM has issues, revert backend to VPS scoring:
```bash
# In /opt/agonaut-api/.env:
SCORING_SERVICE_URL=http://127.0.0.1:8001
```
The VPS service keeps running as a hot standby. Attestation endpoint will show `mode: "development"` — users will see the difference, but scoring continues.

## Security Properties

| Property | VPS Mode | TEE Mode |
|----------|----------|----------|
| ECIES encryption correct | ✅ | ✅ |
| Solutions encrypted in transit | ✅ | ✅ |
| Operator can't read solutions | ❌ | ✅ |
| Code tamper-proof | ❌ | ✅ |
| Remotely verifiable | ❌ | ✅ |
| Keypair sealed to hardware | ❌ | ✅ |
| Intel hardware attestation | ❌ | ✅ |
