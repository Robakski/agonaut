# Deploying Scoring Service to Phala Cloud

## Prerequisites
- Phala Cloud account with $5+ credit
- Docker image pushed to a registry (Docker Hub or GitHub Container Registry)

## Step 1: Build and Push Docker Image

```bash
# Build
docker build -t agonaut-scorer:latest .

# Tag for Docker Hub (replace with your username)
docker tag agonaut-scorer:latest yourusername/agonaut-scorer:latest

# Push
docker push yourusername/agonaut-scorer:latest
```

## Step 2: Deploy to Phala Cloud

### Via Web UI
1. Go to https://cloud.phala.com
2. Click "Create CVM"
3. Use Docker Compose config
4. Paste contents of `docker-compose.yml`
5. Set environment variables in the UI
6. Deploy

### Via CLI
```bash
# Install Phala CLI
npm install -g @phala/cloud-cli

# Login
phala login --api-key $PHALA_API_KEY

# Deploy
phala deploy --compose docker-compose.yml \
  --env PHALA_API_KEY=$PHALA_API_KEY \
  --env SCORING_MODEL=deepseek-chat \
  --env SCORER_PRIVATE_KEY=$SCORER_PRIVATE_KEY \
  --env SCORING_ORACLE=$SCORING_ORACLE \
  --env RPC_URL=https://sepolia.base.org
```

## Step 3: Verify TEE Attestation
After deployment, Phala provides a TEE attestation URL. This proves the scoring
service is running inside a secure enclave and hasn't been tampered with.

## Environment Variables
| Variable | Required | Description |
|---|---|---|
| PHALA_API_KEY | Yes | Phala Cloud API key |
| SCORING_MODEL | No | LLM model (default: deepseek-chat) |
| SCORER_PRIVATE_KEY | Yes | Wallet key for on-chain score submission |
| SCORING_ORACLE | Yes | ScoringOracle contract address |
| RPC_URL | No | Base RPC endpoint (default: Base Sepolia) |
| LOG_LEVEL | No | Logging level (default: INFO) |

## Cost
- ~$0.03 per scoring round (DeepSeek V3 API call)
- CVM hosting: included in Phala Cloud credits
