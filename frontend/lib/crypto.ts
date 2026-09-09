import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getSecretKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("ENCRYPTION_SECRET_KEY must be at least 32 characters");
  }
  return Buffer.from(secret, "utf8").subarray(0, 32);
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns base64 string: iv (12 bytes) + authTag (16 bytes) + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getSecretKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  // Pack: iv + authTag + ciphertext (all base64)
  const packed = Buffer.concat([iv, authTag, Buffer.from(encrypted, "base64")]);
  return packed.toString("base64");
}

/**
 * Decrypt base64 string produced by encrypt().
 */
export function decrypt(packedBase64: string): string {
  const key = getSecretKey();
  const packed = Buffer.from(packedBase64, "base64");

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, undefined, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
