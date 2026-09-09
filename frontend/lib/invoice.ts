/**
 * Generate a human-friendly invoice ID from a MongoDB ObjectId.
 * Format: GC-YYYYMMDD-XXXX (e.g. GC-20260727-a3f1)
 *
 * ObjectId contains a 4-byte timestamp in its first 8 hex chars.
 * The last 4 chars come from the ObjectId's random/counter portion
 * to ensure uniqueness even within the same day.
 */
export function generateInvoiceId(objectId: string): string {
  // ObjectId first 8 hex chars = unix timestamp (seconds, big-endian)
  const timestamp = parseInt(objectId.substring(0, 8), 16) * 1000;
  const date = new Date(timestamp);

  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, "0");
  const dd = date.getDate().toString().padStart(2, "0");

  // Last 4 hex chars of ObjectId (unique per counter/random)
  const unique = objectId.substring(objectId.length - 4);

  return `GC-${yyyy}${mm}${dd}-${unique}`;
}
