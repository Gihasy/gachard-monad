import QRCode from "qrcode";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.gachard.com";

/**
 * Generate QR data URL untuk kartu.
 * QR berisi URL ke halaman scan dengan cardId.
 */
export function generateQRData(cardId: string, origin?: string): string {
  const base = origin || BASE_URL;
  return `${base}/scan?cardId=${cardId}`;
}

/**
 * Generate QR code sebagai data URL (base64 PNG).
 */
export async function generateQRCode(cardId: string, origin?: string): Promise<string> {
  const data = generateQRData(cardId, origin);
  return QRCode.toDataURL(data, {
    width: 256,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

/**
 * Generate QR code sebagai PNG buffer.
 */
export async function generateQRCodeBuffer(cardId: string, origin?: string): Promise<Buffer> {
  const data = generateQRData(cardId, origin);
  return QRCode.toBuffer(data, {
    width: 256,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
