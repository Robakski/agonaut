# Agonaut MPC Relayer

Bridges scoring results from Partisia Blockchain → Base L2.

## Architecture

```
Partisia MPC Contract (scores solutions secretly)
        ↓ signed results
    relayer.py (this script)
        ↓ submits to Base
PartisiaMpcVerifier.sol (verifies MPC node signatures)
        ↓ verified scores
BountyRound.finalize() (distributes prizes)
```

## Trust Model

The relayer is NOT a trusted party. It simply ferries data between chains.
The MPC node signatures prove the results are authentic — anyone can run a relayer.

## Setup

```bash
pip install web3 requests

export BASE_RPC_URL="https://mainnet.base.org"
export PRIVATE_KEY="0x..."  # Relayer wallet (pays ~$0.01 gas per submission)
export VERIFIER_ADDRESS="0x..."  # PartisiaMpcVerifier on Base
export PBC_API_URL="https://reader.partisiablockchain.com"
export PBC_CONTRACT_ADDR="..."  # Agonaut scorer on Partisia
export POLL_INTERVAL=30

python relayer.py
```

## Round Mapping

The relayer needs to know which Partisia round_id maps to which Base L2 BountyRound address.
Maintain `round_map.json`:

```json
{
  "1": "0xBountyRoundAddress1...",
  "2": "0xBountyRoundAddress2..."
}
```

Future: auto-populate by listening to BountyFactory `RoundSpawned` events.

## Cost

Relayer pays gas for `submitMpcResult()` on Base L2 (~$0.01-0.05 per submission).
This is covered by protocol treasury or any volunteer relayer operator.
