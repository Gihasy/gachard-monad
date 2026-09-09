import { createHash, randomBytes } from "crypto";

/**
 * Generate random redeem code (12+ karakter alfanumerik).
 * Kode plaintext TIDAK pernah disimpan di DB atau on-chain.
 */
export function generateRedeemCode(): string {
  return randomBytes(12).toString("base64url"); // ~16 karakter
}

/**
 * Hash redeem code untuk dikirim ke kontrak.
 * Menggunakan keccak256 agar kompatibel dengan Solidity.
 */
export function hashRedeemCode(code: string): string {
  const hash = createHash("sha3-256").update(code).digest("hex");
  return "0x" + hash;
}
