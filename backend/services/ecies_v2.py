"""
ECIES Encryption for Solutions (V2 Zero-Knowledge)

Solutions submitted by agents are encrypted with the sponsor's ECIES public key.
The platform CANNOT decrypt these solutions (we don't have the sponsor's private key).
Only the sponsor can decrypt with their derived private key.

This is true zero-knowledge: cryptographically impossible for platform to see solutions.
"""

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
import os
import json


def generate_rsa_key_pair():
    """
    Generate RSA-2048 keypair for wrapping problem encryption keys.
    (Future: for wrapping problem AES keys that go to TEE)
    """
    from cryptography.hazmat.primitives.asymmetric import rsa
    
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend()
    )
    public_key = private_key.public_key()
    
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )
    
    return private_pem.decode(), public_pem.decode()


# Module-level RSA keys (loaded at startup from env or generated)
_rsa_private_key = None
_rsa_public_key = None


def get_rsa_public_key_pem():
    """Get the backend's RSA-2048 public key (for problem key wrapping)."""
    global _rsa_public_key
    if _rsa_public_key is None:
        # Try to load from env or file
        key_path = "/opt/agonaut-api/data/rsa_public.pem"
        if os.path.exists(key_path):
            with open(key_path, "r") as f:
                _rsa_public_key = f.read()
        else:
            # Generate new pair
            privkey, pubkey = generate_rsa_key_pair()
            _rsa_public_key = pubkey
            os.makedirs("/opt/agonaut-api/data", exist_ok=True)
            # Store private key securely (should be protected by host HSM in production)
            with open(key_path.replace("public", "private"), "w") as f:
                f.write(privkey)
            with open(key_path, "w") as f:
                f.write(pubkey)
    return _rsa_public_key


def get_rsa_private_key():
    """Get the backend's RSA-2048 private key (for problem key unwrapping)."""
    global _rsa_private_key
    if _rsa_private_key is None:
        key_path = "/opt/agonaut-api/data/rsa_private.pem"
        if os.path.exists(key_path):
            with open(key_path, "r") as f:
                key_pem = f.read()
            _rsa_private_key = serialization.load_pem_private_key(
                key_pem.encode(),
                password=None,
                backend=default_backend()
            )
        else:
            raise RuntimeError(
                "RSA private key not found. "
                "Run: python3 -c \"from services.ecies_v2 import generate_rsa_key_pair, get_rsa_public_key_pem; get_rsa_public_key_pem()\""
            )
    return _rsa_private_key


def wrap_problem_key_with_rsa(problem_aes_key_hex: str, rsa_public_key_pem: str) -> str:
    """
    Wrap (RSA-encrypt) the problem AES key using the backend's RSA-2048 public key.
    
    Returns hex-encoded ciphertext.
    """
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives import hashes
    
    pubkey_obj = serialization.load_pem_public_key(
        rsa_public_key_pem.encode(),
        backend=default_backend()
    )
    
    plaintext = bytes.fromhex(problem_aes_key_hex)
    ciphertext = pubkey_obj.encrypt(
        plaintext,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=b"agonaut-problem-key"
        )
    )
    
    return ciphertext.hex()


def unwrap_problem_key_with_rsa(wrapped_key_hex: str) -> str:
    """
    Unwrap (RSA-decrypt) the problem AES key using backend's private key.
    
    Returns hex-encoded AES key.
    """
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives import hashes
    
    privkey = get_rsa_private_key()
    ciphertext = bytes.fromhex(wrapped_key_hex)
    
    plaintext = privkey.decrypt(
        ciphertext,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=b"agonaut-problem-key"
        )
    )
    
    return plaintext.hex()
