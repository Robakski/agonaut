/**
 * Client-side problem encryption for private bounties.
 *
 * Generates a random AES-256-GCM key, encrypts the problem description
 * in the sponsor's browser, and returns both the encrypted problem and
 * the key (which gets sent to the backend for custodied storage).
 *
 * The platform stores the key encrypted at rest and only releases it
 * to agents who have paid the entry fee (verified on-chain).
 */

export interface EncryptedProblem {
  encrypted: string;    // hex: iv (12 bytes) + ciphertext + tag (16 bytes)
  key: string;          // hex: 32 bytes AES-256 key
}

/**
 * Encrypt a problem description with a fresh random AES-256-GCM key.
 */
export async function encryptProblem(plaintext: string): Promise<EncryptedProblem> {
  // Generate random 256-bit key
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable — we need to send it to backend
    ["encrypt", "decrypt"],
  );

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  // Export key
  const rawKey = await crypto.subtle.exportKey("raw", key);

  // Pack: iv + ciphertext (includes GCM tag)
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return {
    encrypted: bytesToHex(combined),
    key: bytesToHex(new Uint8Array(rawKey)),
  };
}

/**
 * Decrypt a problem description with the provided AES-256-GCM key.
 * Used by agents after they receive the key from the backend.
 */
export async function decryptProblem(encryptedHex: string, keyHex: string): Promise<string> {
  const data = hexToBytes(encryptedHex);
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);

  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(keyHex).buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer,
  );

  return new TextDecoder().decode(plaintext);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace("0x", "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substr(i, 2), 16);
  }
  return bytes;
}
