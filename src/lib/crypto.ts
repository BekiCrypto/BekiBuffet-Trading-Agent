import crypto from "crypto";

// ============================================================================
// BekiBuffet SaaS — Credential Encryption (AES-256-GCM)
// ============================================================================
// Encrypts sensitive data (broker API keys, API secrets) at rest.
// Uses a single master key (ENCRYPTION_KEY env var, 32-byte hex or base64).
// Each encryption produces a unique IV + auth tag, so identical plaintexts
// produce different ciphertexts.
//
// Key management:
//   - In development: a derived dev key is used if ENCRYPTION_KEY is unset
//   - In production: ENCRYPTION_KEY MUST be set (32 bytes = 64 hex chars)
//   - For rotation: decrypt with old key, re-encrypt with new key
// ============================================================================

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard IV length
const TAG_LENGTH = 16;

function getMasterKey(): Buffer {
  const keyEnv = process.env.ENCRYPTION_KEY;
  if (keyEnv) {
    // Accept hex (64 chars) or base64
    if (/^[0-9a-fA-F]{64}$/.test(keyEnv)) {
      return Buffer.from(keyEnv, "hex");
    }
    const decoded = Buffer.from(keyEnv, "base64");
    if (decoded.length === 32) return decoded;
  }
  // Development fallback — deterministic but NOT secure
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required in production. " +
        "Generate with: openssl rand -hex 32"
    );
  }
  // Dev key — derived from NEXTAUTH_SECRET for consistency
  const devSource = process.env.NEXTAUTH_SECRET || "dev-key-not-secure-do-not-use-in-production";
  return crypto.createHash("sha256").update(devSource).digest();
}

/**
 * Encrypt a plaintext string. Returns a base64 string containing
 * IV + ciphertext + auth tag, prefixed with "enc:" for identification.
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;
  try {
    const key = getMasterKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    // Format: enc:base64(iv + tag + ciphertext)
    const combined = Buffer.concat([iv, tag, encrypted]);
    return "enc:" + combined.toString("base64");
  } catch (e) {
    // If encryption fails (e.g., key issue), return plaintext in dev only
    if (process.env.NODE_ENV !== "production") {
      console.error("Encryption failed, returning plaintext (dev only):", e);
      return plaintext;
    }
    throw e;
  }
}

/**
 * Decrypt a string produced by encrypt(). If the input is not encrypted
 * (no "enc:" prefix), returns it as-is for backward compatibility.
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext || !ciphertext.startsWith("enc:")) {
    return ciphertext; // Not encrypted — return as-is
  }
  try {
    const key = getMasterKey();
    const combined = Buffer.from(ciphertext.slice(4), "base64");
    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (e) {
    console.error("Decryption failed:", e);
    throw new Error("Failed to decrypt credential");
  }
}

/**
 * Encrypt an object's sensitive fields in-place.
 * Usage: encryptFields(brokerAccount, ['apiKey', 'apiSecret'])
 */
export function encryptFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const result = { ...obj };
  for (const field of fields) {
    if (result[field] != null && typeof result[field] === "string") {
      result[field] = encrypt(result[field] as string) as any;
    }
  }
  return result;
}

/**
 * Decrypt an object's sensitive fields in-place.
 */
export function decryptFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const result = { ...obj };
  for (const field of fields) {
    if (result[field] != null && typeof result[field] === "string") {
      try {
        result[field] = decrypt(result[field] as string) as any;
      } catch {
        // Leave as-is if decryption fails (might be plaintext from old data)
      }
    }
  }
  return result;
}
