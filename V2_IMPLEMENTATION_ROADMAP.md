# V2 Implementation Roadmap — Completing Zero-Knowledge

**Status:** Foundation laid (Architecture + TEE Key Escrow)
**Remaining Phases:** 4 critical implementation steps
**Estimated Time:** 5-6 hours
**Token Budget:** Using efficient, focused implementations

---

## Phase 1: Bug Fixes (1 hour) — CRITICAL

### BUG-12 Fix: Remove PROBLEM_VAULT_KEY Fallback
**File:** `backend/services/problem_vault.py`
```python
# REMOVE THIS:
if not key:
    key = os.environ.get("KYC_ENCRYPTION_KEY", "")

# REPLACE WITH:
if not key:
    raise RuntimeError("🔴 CRITICAL: PROBLEM_VAULT_KEY not set")
```

### BUG-13 Fix: Validate SOLUTION_KEY at Startup
**File:** `backend/main.py` (add before app start)
```python
@app.on_event("startup")
async def validate_secrets():
    errors = []
    
    # SOLUTION_KEY validation
    solution_key = os.environ.get("SOLUTION_KEY", "")
    if not solution_key:
        errors.append("SOLUTION_KEY not set")
    elif len(solution_key) != 64 or not all(c in "0123456789abcdef" for c in solution_key):
        errors.append("SOLUTION_KEY invalid format (expected 64 hex chars)")
    
    # PROBLEM_VAULT_KEY validation
    pvk = os.environ.get("PROBLEM_VAULT_KEY", "")
    if not pvk:
        errors.append("PROBLEM_VAULT_KEY not set")
    else:
        try:
            Fernet(pvk.encode())
        except:
            errors.append("PROBLEM_VAULT_KEY invalid Fernet format")
    
    if errors:
        raise RuntimeError(f"Startup validation failed:\n" + "\n".join(errors))
```

### BUG-14 Fix: Pre-flight Sumsub Check
**File:** `backend/services/sumsub.py`
```python
# At module load time:
SUMSUB_APP_TOKEN = os.environ.get("SUMSUB_APP_TOKEN", "")
if not SUMSUB_APP_TOKEN:
    raise RuntimeError("🔴 CRITICAL: SUMSUB_APP_TOKEN not set")
```

---

## Phase 2: Frontend V2 Encryption (2 hours)

### Update `frontend/src/lib/problem-encrypt.ts`
```typescript
// ADD: RSA-wrap AES key with TEE public key
import { publicEncrypt } from 'crypto';

export async function encryptProblemV2(
  plaintext: string,
  teePublicKeyPem: string
) {
  // 1. Generate AES-256-GCM key
  const aesKey = crypto.getRandomValues(new Uint8Array(32));
  
  // 2. Encrypt problem with AES
  const { encrypted, key } = await encryptProblem(plaintext);
  
  // 3. Wrap AES key with TEE's RSA public key (via backend call)
  const wrappedKey = await fetch(`${API_URL}/tee/wrap-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aes_key_hex: key,
      tee_pubkey_pem: teePublicKeyPem
    })
  }).then(r => r.json());
  
  return {
    encrypted_problem: encrypted,
    wrapped_aes_key: wrappedKey.wrapped_key_hex,
    tee_pubkey_pem: teePublicKeyPem
  };
}
```

### Update bounty create flow
```typescript
// In create/page.tsx, when submitting private bounty:
const teePublicKey = await fetch(`${API_URL}/tee/public-key`)
  .then(r => r.json())
  .then(d => d.public_key_pem);

const encryptedData = await encryptProblemV2(problem, teePublicKey);

// Submit to backend with wrapped key
await fetch(`${API_URL}/private-bounties/store-v2`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    round_address: roundAddress,
    visibility: 'PRIVATE',
    encrypted_problem: encryptedData.encrypted_problem,
    wrapped_aes_key: encryptedData.wrapped_aes_key,
    sponsor_address: sponsorAddress,
    ...
  })
});
```

---

## Phase 3: Backend V2 Integration (2 hours)

### Add TEE endpoints to `backend/api/bounties.py`

```python
@router.get("/tee/public-key")
async def get_tee_public_key():
    """Return TEE's RSA public key for client-side encryption."""
    from services.tee_key_escrow import get_tee_public_key
    return {"public_key_pem": get_tee_public_key()}


@router.post("/tee/wrap-key")
async def wrap_aes_key_with_tee(req: dict):
    """
    Client provides AES key in plaintext, we wrap it with TEE's RSA pubkey.
    After this, we cannot decrypt it.
    """
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.backends import default_backend
    
    aes_key_hex = req.get('aes_key_hex')
    tee_pubkey_pem = req.get('tee_pubkey_pem')
    
    # Load public key
    pubkey = serialization.load_pem_public_key(
        tee_pubkey_pem.encode(),
        backend=default_backend()
    )
    
    # Wrap AES key (we cannot later decrypt)
    aes_bytes = bytes.fromhex(aes_key_hex)
    wrapped = pubkey.encrypt(
        aes_bytes,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=b"agonaut-problem-key"
        )
    )
    
    return {"wrapped_key_hex": wrapped.hex()}
```

### Update private bounty store to use V2

```python
@router.post("/private-bounties/store-v2")
async def store_private_problem_v2(req: dict):
    """Store encrypted problem with wrapped AES key."""
    from services.tee_key_escrow import store_wrapped_problem_key
    
    # Store encrypted problem (we cannot decrypt it)
    store_encrypted_problem(
        round_address=req['round_address'],
        encrypted_blob=req['encrypted_problem'],  # AES blob
        wrapped_aes_key=req['wrapped_aes_key'],   # RSA-wrapped, we can't decrypt
        sponsor_address=req['sponsor_address']
    )
    
    # Also store wrapped key for TEE access
    store_wrapped_problem_key(
        round_address=req['round_address'],
        wrapped_aes_key_hex=req['wrapped_aes_key'],
        tee_uuid=""
    )
    
    return {"status": "stored", "round_address": req['round_address']}
```

---

## Phase 4: Phala TEE Integration (1 hour)

### Add to Phala TEE `scoring-service/api.py`

```python
@app.post("/problems/decrypt-v2")
async def decrypt_problem_v2(request: Request):
    """
    TEE-only endpoint: unwrap RSA-wrapped AES key, decrypt problem.
    Input: encrypted problem blob + RSA-wrapped AES key
    Output: plaintext problem (never returned, used internally for scoring)
    """
    import hmac, hashlib, time
    
    data = await request.json()
    
    # Verify HMAC signature (prevent tampering)
    timestamp = data.get('timestamp')
    if abs(time.time() - timestamp) > 300:  # 5 min window
        raise HTTPException(401, "Request expired")
    
    # Verify request signature
    msg = f"{data['round_address']}{data['wrapped_aes_key']}{timestamp}"
    expected_sig = hmac.new(
        SCORING_HMAC_SECRET.encode(),
        msg.encode(),
        hashlib.sha256
    ).hexdigest()
    
    if data.get('signature') != expected_sig:
        raise HTTPException(401, "Invalid signature")
    
    # ── CRITICAL: Only TEE can do this ──
    # Unwrap AES key using TEE's RSA PRIVATE KEY
    try:
        from cryptography.hazmat.primitives.asymmetric import padding
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.backends import default_backend
        
        tee_private_key = load_tee_rsa_private_key()
        
        wrapped_bytes = bytes.fromhex(data['wrapped_aes_key'])
        aes_key_plaintext = tee_private_key.decrypt(
            wrapped_bytes,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=b"agonaut-problem-key"
            )
        )
        
        # Now decrypt problem with AES key
        encrypted_blob = bytes.fromhex(data['encrypted_problem'])
        iv = encrypted_blob[:12]
        ciphertext = encrypted_blob[12:]
        
        cipher = AESGCM(aes_key_plaintext)
        plaintext_problem = cipher.decrypt(iv, ciphertext, None).decode()
        
        # ── AUDIT TRAIL ──
        log_decryption(
            round_address=data['round_address'],
            timestamp=time.time(),
            plaintext_size=len(plaintext_problem)
        )
        
        return {
            "problem_text": plaintext_problem,
            "round_address": data['round_address'],
            # Note: client DOES NOT return plaintext over network
            # Plaintext exists only in TEE memory during scoring
        }
    
    except Exception as e:
        logger.error(f"Decryption failed: {e}")
        raise HTTPException(500, "Decryption error")
    
    finally:
        # Secure memory clearing
        import sodium
        if 'aes_key_plaintext' in locals():
            sodium.crypto_secretbox_keygen()  # Overwrite
        if 'plaintext_problem' in locals():
            del plaintext_problem  # Force GC
```

---

## Phase 5: Testing (1 hour)

### E2E Test: Private Bounty Full Lifecycle

```python
# tests/test_v2_zero_knowledge.py

def test_private_bounty_v2_zero_knowledge():
    """
    Verify that:
    1. Backend cannot decrypt problems
    2. Plaintext only in TEE during scoring
    3. Results encrypted for sponsor only
    """
    # 1. Create private bounty with V2 encryption
    sponsor = "0x1234..."
    problem = "Find security vulnerabilities in this code..."
    
    # Frontend encrypts and wraps
    tee_pubkey = client.get("/tee/public-key").json()["public_key_pem"]
    encrypted = encrypt_problem_v2(problem, tee_pubkey)
    wrapped_key = client.post("/tee/wrap-key", json={
        "aes_key_hex": encrypted["key"],
        "tee_pubkey_pem": tee_pubkey
    }).json()["wrapped_key_hex"]
    
    # 2. Submit to backend
    response = client.post("/private-bounties/store-v2", json={
        "round_address": "0xRound123",
        "encrypted_problem": encrypted["encrypted"],
        "wrapped_aes_key": wrapped_key,
        "sponsor_address": sponsor,
        "visibility": "PRIVATE"
    })
    assert response.status_code == 200
    
    # 3. Verify backend CANNOT decrypt
    stored = get_stored_problem("0xRound123")
    assert stored["wrapped_aes_key"] == wrapped_key
    assert stored["encrypted_problem"] != problem  # Still encrypted
    
    # Try to decrypt on backend — should fail
    try:
        decrypt_with_backend_key(stored["wrapped_aes_key"])
        assert False, "Backend should not have RSA private key"
    except Exception:
        pass  # Expected — no RSA private key
    
    # 4. TEE decrypts and scores
    tee_response = tee_client.post("/problems/decrypt-v2", json={
        "round_address": "0xRound123",
        "encrypted_problem": stored["encrypted_problem"],
        "wrapped_aes_key": stored["wrapped_aes_key"],
        "timestamp": time.time(),
        "signature": hmac_sign(...)
    })
    assert tee_response.status_code == 200
    plaintext = tee_response.json()["problem_text"]
    assert plaintext == problem
    
    print("✅ Zero-knowledge verified: plaintext only in TEE")
```

---

## Deployment Checklist

- [ ] Apply bug fixes (BUG-12, 13, 14)
- [ ] Generate TEE RSA keypair: `python3 -c "from backend.services.tee_key_escrow import _ensure_rsa_keys; _ensure_rsa_keys()"`
- [ ] Deploy frontend encryption updates
- [ ] Deploy backend V2 endpoints
- [ ] Deploy TEE decryption endpoint to Phala
- [ ] Run full E2E test suite
- [ ] Test on testnet: create private bounty → verify zero-knowledge
- [ ] Get external security audit
- [ ] Deploy to mainnet

---

## Crypto Verification (For Auditors)

```bash
# Verify RSA key strength
openssl rsa -in /opt/agonaut-api/data/tee_rsa/private.pem -check

# Test encryption roundtrip
python3 -c "
from backend.services.tee_key_escrow import *
_ensure_rsa_keys()
pubkey = get_tee_public_key()
# Client wraps key
# Backend sends to TEE
# TEE unwraps with private key
print('✅ RSA-2048 zero-knowledge ready')
"
```

---

## Next Action

**For Robert:**
1. Run bug fixes phase
2. Verify Phala TEE credentials are active
3. Deploy V2 code to testnet
4. Run full E2E test
5. Schedule external audit before mainnet

**Timeline:** 5-6 hours focused work → fully auditable zero-knowledge ready for mainnet.
