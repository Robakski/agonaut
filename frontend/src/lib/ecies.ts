/**
 * ECIES Decryption — Client-side decryption of solutions encrypted for the sponsor.
 *
 * Architecture:
 * 1. During bounty creation, sponsor signs a deterministic message
 * 2. From that signature, we derive a secp256k1 keypair (private + public)
 * 3. The PUBLIC key is registered with the backend (stored in sponsor_keys DB)
 * 4. The TEE encrypts winning solutions using ECIES with that public key
 * 5. Here in the browser, we re-derive the SAME private key from the same signature
 * 6. We perform ECDH(derived_private_key, ephemeral_pubkey) to get the shared secret
 * 7. We derive the AES key via HKDF and decrypt
 *
 * Why signature-derived instead of raw wallet key?
 * - MetaMask/wallets don't expose the raw private key
 * - eth_decrypt uses x25519, not secp256k1 — incompatible
 * - Signing the same deterministic message always produces the same signature
 * - keccak256(signature) gives us a valid secp256k1 private key
 * - This is secure: only the wallet holder can produce the signature
 *
 * The deterministic message is: "Agonaut Encryption Keypair\nAddress: {address}"
 * This MUST match what the frontend sends during sponsor key registration.
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

export interface EncryptedSolution {
  ephemeral_pubkey: string; // hex, 65 bytes (0x04...)
  iv: string;               // hex, 16 bytes
  ciphertext: string;       // hex
  mac: string;              // hex, 16 bytes (GCM tag)
}

/**
 * The deterministic message used to derive the encryption keypair.
 * MUST match what's used during sponsor key registration.
 */
export function getEncryptionMessage(address: string): string {
  return `Agonaut Encryption Keypair\nAddress: ${address.toLowerCase()}`;
}

// secp256k1 curve order
const SECP256K1_N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");

/**
 * Derive a secp256k1 private key from a wallet signature.
 *
 * Takes keccak256 of the signature bytes, then reduces modulo the curve order
 * to ensure it's a valid private key.
 */
function derivePrivateKey(signature: string): Uint8Array {
  const sigBytes = hexToBytes(signature.replace("0x", ""));
  const hash = keccak_256(sigBytes);
  // Reduce modulo curve order to ensure valid private key
  const scalar = bytesToBigInt(hash) % SECP256K1_N;
  // Ensure non-zero (astronomically unlikely but be safe)
  const finalScalar = scalar === BigInt(0) ? BigInt(1) : scalar;
  return bigIntToBytes(finalScalar, 32);
}

/**
 * Derive the public key from a wallet signature.
 * Used during registration to send to the backend.
 */
export function derivePublicKey(signature: string): string {
  const privKey = derivePrivateKey(signature);
  const pubKey = secp256k1.getPublicKey(privKey, false); // uncompressed (65 bytes)
  return "0x" + bytesToHex(pubKey);
}

/**
 * Encrypt a solution for the sponsor using ECIES.
 *
 * V2 Architecture: Solutions are encrypted with the sponsor's derived ECIES public key.
 * Only the sponsor (who has the derived private key) can decrypt.
 * The platform and TEE CANNOT decrypt solutions.
 *
 * Flow:
 * 1. Sponsor's public key is already registered (from key registration)
 * 2. We generate a new ephemeral secp256k1 keypair
 * 3. ECDH(ephemeral_private, sponsor_public) → shared secret
 * 4. HKDF-SHA256 derives AES key from shared secret
 * 5. AES-256-GCM encrypts the solution
 * 6. Return: {ephemeral_pubkey, iv, ciphertext, mac}
 */
export async function encryptSolution(
  plaintext: string,
  sponsorPublicKey: string, // hex, from registration
): Promise<EncryptedSolution> {
  try {
    // Step 1: Generate ephemeral keypair
    const ephemeralPrivateKey = secp256k1.utils.randomSecretKey();
    const ephemeralPublicKey = secp256k1.getPublicKey(ephemeralPrivateKey, false); // uncompressed

    // Step 2: ECDH with sponsor's public key
    const sponsorPubBytes = hexToBytes(sponsorPublicKey.replace("0x", ""));
    const sharedPoint = secp256k1.getSharedSecret(ephemeralPrivateKey, sponsorPubBytes);
    // Extract x-coordinate (first 32 bytes after the 0x04 prefix)
    const sharedSecret = sharedPoint.slice(1, 33);

    // Step 3: HKDF to derive AES key — MUST match backend ecies_encrypt.py
    const info = new TextEncoder().encode("agonaut-ecies-v1");
    const aesKeyBytes = hkdf(sha256, sharedSecret, undefined, info, 32);

    // Step 4: Generate random IV and encrypt
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const plaintextBytes = new TextEncoder().encode(plaintext);

    const aesKey = await crypto.subtle.importKey(
      "raw",
      aesKeyBytes.buffer as ArrayBuffer,
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );

    const encryptedAndTag = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      aesKey,
      plaintextBytes.buffer as ArrayBuffer,
    );

    // Split ciphertext and GCM tag (tag is last 16 bytes)
    const encData = new Uint8Array(encryptedAndTag);
    const ciphertext = encData.slice(0, encData.length - 16);
    const mac = encData.slice(encData.length - 16);

    return {
      ephemeral_pubkey: "0x" + bytesToHex(ephemeralPublicKey),
      iv: "0x" + bytesToHex(iv),
      ciphertext: "0x" + bytesToHex(ciphertext),
      mac: "0x" + bytesToHex(mac),
    };
  } catch (error) {
    console.error("ECIES solution encryption failed:", error);
    throw new Error("Failed to encrypt solution. Check your wallet connection.");
  }
}

/**
 * Decrypt an ECIES-encrypted solution using the sponsor's wallet.
 *
 * 1. Signs the deterministic message to re-derive the private key
 * 2. Performs ECDH with the ephemeral public key
 * 3. Derives AES key via HKDF
 * 4. Decrypts with AES-256-GCM
 */
export async function decryptSolution(
  encrypted: EncryptedSolution,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletClient: any,
  address: string,
): Promise<string> {
  try {
    // Step 1: Sign deterministic message to get the same signature as registration
    const message = getEncryptionMessage(address);
    const signature = await walletClient.signMessage({
      account: address,
      message,
    });

    // Step 2: Derive private key from signature
    const privKey = derivePrivateKey(signature);

    // Step 3: Parse ephemeral public key from encrypted blob
    const ephemPubBytes = hexToBytes(encrypted.ephemeral_pubkey.replace("0x", ""));

    // Step 4: ECDH — shared secret = ECDH(our_private, ephemeral_public)
    const sharedPoint = secp256k1.getSharedSecret(privKey, ephemPubBytes);
    // getSharedSecret returns the full point (65 bytes uncompressed or 33 compressed)
    // We need just the x-coordinate (32 bytes) as the raw shared secret
    // noble returns uncompressed by default: 04 + x(32) + y(32)
    const sharedSecret = sharedPoint.slice(1, 33); // x-coordinate only

    // Step 5: HKDF to derive AES key — MUST match backend's ecies_encrypt.py
    // Backend uses: HKDF(SHA256, shared_secret, salt=None, info="agonaut-ecies-v1", length=32)
    const info = new TextEncoder().encode("agonaut-ecies-v1");
    const aesKeyBytes = hkdf(sha256, sharedSecret, undefined, info, 32);

    // Step 6: AES-256-GCM decrypt
    const iv = hexToBytes(encrypted.iv);
    const ct = hexToBytes(encrypted.ciphertext);
    const mac = hexToBytes(encrypted.mac);
    // GCM expects ciphertext + tag concatenated
    const combined = new Uint8Array([...ct, ...mac]);

    const aesKey = await crypto.subtle.importKey(
      "raw",
      aesKeyBytes.buffer as ArrayBuffer,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      aesKey,
      combined.buffer as ArrayBuffer,
    );

    return new TextDecoder().decode(plaintext);
  } catch (error) {
    console.error("ECIES decryption failed:", error);
    throw new Error(
      "Failed to decrypt solution. Make sure you're using the same wallet " +
      "that created the bounty and that you sign the message when prompted."
    );
  }
}

// ── Utility functions ──

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace("0x", "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substr(i, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = BigInt(0);
  for (const byte of bytes) {
    result = (result << BigInt(8)) | BigInt(byte);
  }
  return result;
}

function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let n = value;
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(n & BigInt(0xFF));
    n >>= BigInt(8);
  }
  return bytes;
}
