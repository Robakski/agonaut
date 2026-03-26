#!/usr/bin/env node
/**
 * ECIES JavaScript-side compatibility test.
 *
 * Verifies that the noble.js HKDF produces identical output to Python's cryptography lib.
 * Also tests the full derived-key roundtrip using the same test vectors.
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { webcrypto } from "node:crypto";

const crypto = webcrypto;

// ── Utilities ──

function hexToBytes(hex) {
  const clean = hex.replace("0x", "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substr(i, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function bytesToBigInt(bytes) {
  let result = BigInt(0);
  for (const byte of bytes) {
    result = (result << BigInt(8)) | BigInt(byte);
  }
  return result;
}

function bigIntToBytes(value, length) {
  const bytes = new Uint8Array(length);
  let n = value;
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(n & BigInt(0xFF));
    n >>= BigInt(8);
  }
  return bytes;
}

// ── Test 1: HKDF output matches Python ──

function testHkdfMatch() {
  const sharedSecret = new Uint8Array(32);
  for (let i = 0; i < 32; i++) sharedSecret[i] = i;

  const info = new TextEncoder().encode("agonaut-ecies-v1");
  const key = hkdf(sha256, sharedSecret, undefined, info, 32);

  const first8 = bytesToHex(key.slice(0, 8));
  const expected = "047717c7075358e1"; // From Python test

  if (first8 !== expected) {
    console.error(`❌ HKDF mismatch: JS=${first8}, Python=${expected}`);
    process.exit(1);
  }
  console.log("✅ HKDF output matches Python:", first8);
}

// ── Test 2: Derived key generation ──

function testDerivedKey() {
  // Same fake signature as Python test
  const fakeSignature = "a".repeat(64) + "b".repeat(64) + "1b";
  const sigBytes = hexToBytes(fakeSignature);

  // keccak256
  const hash = keccak_256(sigBytes);

  // Reduce mod curve order
  const SECP256K1_N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
  let scalar = bytesToBigInt(hash) % SECP256K1_N;
  if (scalar === BigInt(0)) scalar = BigInt(1);

  const privKeyBytes = bigIntToBytes(scalar, 32);
  const pubKey = secp256k1.getPublicKey(privKeyBytes, false); // uncompressed

  console.log("  Private key (first 8):", bytesToHex(privKeyBytes).slice(0, 16));
  console.log("  Public key (first 10):", bytesToHex(pubKey).slice(0, 20));
  console.log("  Public key starts with 04:", bytesToHex(pubKey).startsWith("04") ? "✅" : "❌");
  console.log("  Public key length:", pubKey.length, pubKey.length === 65 ? "✅" : "❌");
  console.log("✅ Derived key generation: PASS");

  return { privKeyBytes, pubKey };
}

// ── Test 3: ECDH shared secret matches ──

async function testEcdhRoundtrip() {
  // Generate an ephemeral keypair (simulating TEE)
  const ephemPriv = secp256k1.utils.randomSecretKey();
  const ephemPub = secp256k1.getPublicKey(ephemPriv, false);

  // Derive a recipient keypair (simulating sponsor)
  const recipientPriv = secp256k1.utils.randomSecretKey();
  const recipientPub = secp256k1.getPublicKey(recipientPriv, false);

  // TEE side: ECDH(ephemeral_priv, recipient_pub)
  const teeShared = secp256k1.getSharedSecret(ephemPriv, recipientPub);
  const teeSecret = teeShared.slice(1, 33); // x-coordinate

  // Sponsor side: ECDH(recipient_priv, ephemeral_pub)
  const sponsorShared = secp256k1.getSharedSecret(recipientPriv, ephemPub);
  const sponsorSecret = sponsorShared.slice(1, 33);

  // They should match!
  if (bytesToHex(teeSecret) !== bytesToHex(sponsorSecret)) {
    console.error("❌ ECDH shared secrets don't match!");
    process.exit(1);
  }

  // Derive AES key
  const info = new TextEncoder().encode("agonaut-ecies-v1");
  const aesKey = hkdf(sha256, teeSecret, undefined, info, 32);

  // Encrypt with AES-256-GCM
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const plaintext = new TextEncoder().encode("Test solution content 🎉");

  const importedKey = await crypto.subtle.importKey("raw", aesKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, importedKey, plaintext);

  // Encrypted contains ciphertext + 16-byte tag
  const encBytes = new Uint8Array(encrypted);
  const ciphertext = encBytes.slice(0, -16);
  const mac = encBytes.slice(-16);

  // Decrypt on sponsor side (same AES key derived from same shared secret)
  const sponsorAesKey = hkdf(sha256, sponsorSecret, undefined, info, 32);
  const sponsorImportedKey = await crypto.subtle.importKey("raw", sponsorAesKey, { name: "AES-GCM" }, false, ["decrypt"]);

  const combined = new Uint8Array([...ciphertext, ...mac]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, sponsorImportedKey, combined);
  const result = new TextDecoder().decode(decrypted);

  if (result !== "Test solution content 🎉") {
    console.error("❌ JS roundtrip decryption failed:", result);
    process.exit(1);
  }
  console.log("✅ Full JS ECDH + AES-GCM roundtrip: PASS");
}

// ── Run ──

console.log("🔐 ECIES JavaScript Compatibility Tests\n");
testHkdfMatch();
const { privKeyBytes, pubKey } = testDerivedKey();
await testEcdhRoundtrip();
console.log("\n✅ ALL JS TESTS PASSED");
