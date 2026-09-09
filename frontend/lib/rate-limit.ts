import { getCollection } from "./mongodb";

interface RateLimitEntry {
  _id?: string;
  userId: string;
  action: string;
  windowStart: string;
  count: number;
}

const MAX_ATTEMPTS_PER_MINUTE = 5; // ADR-006

/**
 * Check and increment rate limit for a user action.
 * Returns true if allowed, false if rate limit exceeded.
 * Uses MongoDB for consistency across stateless serverless functions.
 */
export async function checkRateLimit(
  userId: string,
  action: string
): Promise<{ allowed: boolean; remaining: number }> {
  const collection = await getCollection("rate_limits");

  const now = new Date();
  const windowStart = new Date(
    Math.floor(now.getTime() / 60000) * 60000
  ).toISOString();

  const entry = await collection.findOne({
    userId,
    action,
    windowStart,
  });

  if (!entry) {
    // First attempt in this window
    await collection.insertOne({
      userId,
      action,
      windowStart,
      count: 1,
    });
    return { allowed: true, remaining: MAX_ATTEMPTS_PER_MINUTE - 1 };
  }

  if (entry.count >= MAX_ATTEMPTS_PER_MINUTE) {
    return { allowed: false, remaining: 0 };
  }

  // Increment counter
  await collection.updateOne(
    { _id: entry._id },
    { $inc: { count: 1 } }
  );

  return {
    allowed: true,
    remaining: MAX_ATTEMPTS_PER_MINUTE - entry.count - 1,
  };
}
