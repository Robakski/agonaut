#!/usr/bin/env python3
"""
Problem Encryption/Decryption Compatibility Test

Verifies the full flow:
1. Frontend encryptProblem() → AES-256-GCM with random key
2. Backend stores encrypted blob + key (Fernet-wrapped)
3. Backend decrypts for scoring (get_problem_for_scoring)
4. Agent receives key → decrypts in browser (decryptProblem)

All steps use the same AES-256-GCM format:
  encrypted = hex(iv[12 bytes] + ciphertext + tag[16 bytes])
  key = hex(32 bytes)
"""

import os
import json

def test_aes_gcm_roundtrip():
    """Simulate the exact flow: frontend encrypt → backend decrypt."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    # Step 1: Simulate frontend encryptProblem()
    # Frontend generates random 32-byte key + 12-byte IV
    key = os.urandom(32)
    iv = os.urandom(12)

    # The sensitive payload (description + rubric as JSON)
    sensitive = json.dumps({
        "description": "Build a REST API rate limiter that handles 10K req/s",
        "rubric": {
            "criteria": [{
                "name": "Correctness",
                "checks": [
                    {"description": "Handles burst traffic", "weight": 5000, "required": True},
                    {"description": "Returns 429 on limit", "weight": 3000, "required": True},
                    {"description": "Configurable limits", "weight": 2000, "required": False},
                ]
            }]
        }
    })

    # Encrypt with AES-256-GCM
    aesgcm = AESGCM(key)
    ciphertext_and_tag = aesgcm.encrypt(iv, sensitive.encode("utf-8"), None)

    # Pack: iv + ciphertext + tag (all as hex)
    encrypted_hex = (iv + ciphertext_and_tag).hex()
    key_hex = key.hex()

    print(f"  Plaintext: {len(sensitive)} bytes")
    print(f"  Encrypted: {len(encrypted_hex)} hex chars")
    print(f"  Key: {key_hex[:16]}...")

    # Step 2: Simulate backend storage (Fernet-wrap the key)
    from cryptography.fernet import Fernet
    fernet_key = Fernet.generate_key()
    fernet = Fernet(fernet_key)
    key_enc = fernet.encrypt(key_hex.encode()).decode()

    print(f"  Fernet-wrapped key: {key_enc[:20]}...")

    # Step 3: Simulate backend get_problem_for_scoring (decrypt for TEE)
    # Unwrap Fernet
    recovered_key_hex = fernet.decrypt(key_enc.encode()).decode()
    assert recovered_key_hex == key_hex, "Fernet roundtrip failed!"

    # Decrypt AES-256-GCM
    encrypted_bytes = bytes.fromhex(encrypted_hex)
    recovered_iv = encrypted_bytes[:12]
    recovered_ct_tag = encrypted_bytes[12:]
    recovered_key = bytes.fromhex(recovered_key_hex)

    aesgcm2 = AESGCM(recovered_key)
    plaintext_bytes = aesgcm2.decrypt(recovered_iv, recovered_ct_tag, None)
    recovered_text = plaintext_bytes.decode("utf-8")

    assert recovered_text == sensitive, "AES-GCM roundtrip failed!"
    print("✅ Backend decryption: PASS")

    # Step 4: Simulate agent-side decryption (same as Step 3 but with raw key)
    # Agent receives: encrypted_hex + key_hex from backend
    agent_bytes = bytes.fromhex(encrypted_hex)
    agent_iv = agent_bytes[:12]
    agent_ct_tag = agent_bytes[12:]
    agent_key = bytes.fromhex(key_hex)

    aesgcm3 = AESGCM(agent_key)
    agent_plaintext = aesgcm3.decrypt(agent_iv, agent_ct_tag, None).decode("utf-8")

    assert agent_plaintext == sensitive, "Agent decryption failed!"

    # Parse the JSON
    parsed = json.loads(agent_plaintext)
    assert parsed["description"] == "Build a REST API rate limiter that handles 10K req/s"
    assert len(parsed["rubric"]["criteria"]) == 1
    assert len(parsed["rubric"]["criteria"][0]["checks"]) == 3

    print("✅ Agent decryption: PASS")
    print("✅ JSON parsing: PASS")


def test_unicode_and_special_chars():
    """Ensure unicode, emojis, and special chars survive encryption."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = os.urandom(32)
    iv = os.urandom(12)

    # Problem with unicode, emojis, and code blocks
    sensitive = json.dumps({
        "description": "Implement a SQL injection detector 🔒\n```sql\nSELECT * FROM users WHERE id = '{user_input}'\n```\nMüller's café has naïve résumé handling. 你好世界!",
        "rubric": {"criteria": [{"name": "检测能力", "checks": []}]}
    })

    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(iv, sensitive.encode("utf-8"), None)
    encrypted_hex = (iv + ct).hex()

    # Decrypt
    data = bytes.fromhex(encrypted_hex)
    plaintext = aesgcm.decrypt(data[:12], data[12:], None).decode("utf-8")
    parsed = json.loads(plaintext)

    assert "Müller" in parsed["description"]
    assert "你好世界" in parsed["description"]
    assert "🔒" in parsed["description"]
    assert parsed["rubric"]["criteria"][0]["name"] == "检测能力"

    print("✅ Unicode/emoji/special chars: PASS")


def test_large_problem():
    """Ensure large problems (50KB+) encrypt/decrypt correctly."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = os.urandom(32)
    iv = os.urandom(12)

    large_desc = "x" * 50_000
    sensitive = json.dumps({"description": large_desc, "rubric": {"criteria": []}})

    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(iv, sensitive.encode("utf-8"), None)
    encrypted_hex = (iv + ct).hex()

    data = bytes.fromhex(encrypted_hex)
    plaintext = aesgcm.decrypt(data[:12], data[12:], None).decode("utf-8")
    parsed = json.loads(plaintext)
    assert len(parsed["description"]) == 50_000

    print("✅ Large problem (50KB): PASS")


if __name__ == "__main__":
    print("🔐 Problem Encryption/Decryption Tests\n")
    test_aes_gcm_roundtrip()
    test_unicode_and_special_chars()
    test_large_problem()
    print("\n✅ ALL PROBLEM ENCRYPTION TESTS PASSED")
