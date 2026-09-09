import { createHmac, timingSafeEqual } from "crypto";
import { getCollection, parseObjectId } from "./mongodb";

export const SESSION_COOKIE_NAME = "gachard_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getSigningKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("ENCRYPTION_SECRET_KEY must be at least 32 characters");
  }
  return Buffer.from(secret, "utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", getSigningKey()).update(payload).digest("hex");
}

export function createSessionToken(userId: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${userId}.${timestamp}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string): { userId: string } | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [userId, timestampStr, signature] = parts;
  const payload = `${userId}.${timestampStr}`;

  // Verify HMAC signature
  const expectedSig = sign(payload);
  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");

  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  // Check expiration (30 days)
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return null;
  const ageSeconds = Math.floor(Date.now() / 1000) - timestamp;
  if (ageSeconds > SESSION_MAX_AGE || ageSeconds < 0) return null;

  // Validate userId is a valid ObjectId string
  try {
    parseObjectId(userId);
  } catch {
    return null;
  }

  return { userId };
}

export async function getAuthenticatedUser(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";

  // Try session cookie first
  const sessionMatch = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`));
  if (sessionMatch) {
    const token = decodeURIComponent(sessionMatch[1]);
    const session = verifySessionToken(token);
    if (session) {
      const usersCollection = await getCollection("users");
      const user = await usersCollection.findOne(
        { _id: parseObjectId(session.userId) } as Record<string, unknown>
      );
      if (user) return user;
    }
  }

  // Fallback: legacy gachard_uid cookie (pre-session-auth users)
  const legacyMatch = cookieHeader.match(/(?:^|;\s*)gachard_uid=([^;]*)/);
  if (legacyMatch) {
    const uid = decodeURIComponent(legacyMatch[1]);
    try {
      const usersCollection = await getCollection("users");
      const user = await usersCollection.findOne(
        { _id: parseObjectId(uid) } as Record<string, unknown>
      );
      if (user) return user;
    } catch {
      // invalid ObjectId format — ignore
    }
  }

  return null;
}
