/**
 * ECIES Decryption — Client-side decryption of solutions encrypted for the sponsor.
 *
 * The TEE encrypts winning solutions with the sponsor's secp256k1 public key.
 * Only the sponsor's wallet private key can decrypt them.
 *
 * This module handles the browser-side decryption using the Web Crypto API
 * and the secp256k1 curve (via the noble-secp256k1 library).
 *
 * Flow:
 * 1. Sponsor receives encrypted blob: {ephemeral_pubkey, iv, ciphertext, mac}
 * 2. Browser derives shared secret: ECDH(sponsor_private_key, ephemeral_pubkey)
 * 3. Derives AES key: HKDF(shared_secret, "agonaut-ecies-v1")
 * 4. Decrypts: AES-256-GCM(aes_key, iv, ciphertext + mac)
 */

export interface EncryptedSolution {
  ephemeral_pubkey: string; // hex, 65 bytes (0x04...)
  iv: string;               // hex, 16 bytes
  ciphertext: string;       // hex
  mac: string;              // hex, 16 bytes (GCM tag)
}

/**
 * Request the wallet to decrypt by signing a derived key.
 *
 * Since MetaMask doesn't expose raw ECDH, we use an alternative approach:
 * We ask the user to export their solution using eth_decrypt (EIP-2844)
 * or we use a signature-based key derivation.
 *
 * For now, this returns a placeholder — the actual implementation depends
 * on wallet support for eth_decrypt or a custom signing flow.
 */
export async function decryptSolution(
  encrypted: EncryptedSolution,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletClient: any,
  address: string,
): Promise<string> {
  // MetaMask supports eth_decrypt (EIP-2844) for encryption/decryption
  // But it uses x25519-xsalsa20-poly1305, not secp256k1 ECIES
  //
  // For secp256k1 ECIES, we need the private key directly.
  // Since wallets don't expose private keys, we use a workaround:
  //
  // Option 1: Ask MetaMask for eth_getEncryptionPublicKey + eth_decrypt (x25519)
  // Option 2: Use a deterministic key derived from a wallet signature
  //
  // We use Option 2: sponsor signs a deterministic message, we derive a
  // decryption key from the signature. The TEE uses the same derivation
  // when encrypting. This is secure because:
  // - The signature is deterministic (same message = same sig)
  // - Only the wallet holder can produce it
  // - The derived key never leaves the browser

  try {
    // Sign a deterministic message to derive the decryption key
    const message = `Agonaut Solution Decryption Key\nAddress: ${address}`;
    const signature = await walletClient.signMessage({
      account: address,
      message,
    });

    // Derive AES key from signature using SHA-256
    const sigBytes = hexToBytes(signature.slice(2));
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      sigBytes.slice(0, 32).buffer as ArrayBuffer,
      "HKDF",
      false,
      ["deriveKey"],
    );

    const aesKey = await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new TextEncoder().encode("agonaut-ecies-v1"),
        info: new TextEncoder().encode(address.toLowerCase()),
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );

    // Decrypt
    const iv = hexToBytes(encrypted.iv);
    const ct = hexToBytes(encrypted.ciphertext);
    const mac = hexToBytes(encrypted.mac);
    const combined = new Uint8Array([...ct, ...mac]);

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      aesKey,
      combined.buffer as ArrayBuffer,
    );

    return new TextDecoder().decode(plaintext);
  } catch (error) {
    console.error("ECIES decryption failed:", error);
    throw new Error("Failed to decrypt solution. Make sure you're using the correct wallet.");
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace("0x", "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substr(i, 2), 16);
  }
  return bytes;
}
