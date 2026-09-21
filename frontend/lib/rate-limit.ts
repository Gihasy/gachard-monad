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

/**
 * Check and increment a per-day limit for a user action.
 *
 * Separate from checkRateLimit() on purpose: that one is fixed at
 * MAX_ATTEMPTS_PER_MINUTE for the redeem flow (ADR-006/ADR-019) and is not
 * safe to parameterise underneath its existing callers. This one takes an
 * explicit cap and a 24h window, and is used to bound gas sponsorship spend
 * (ADR-031), where the cost of an unbounded loop is real money rather than
 * a brute-force risk.
 */
export async function checkDailyLimit(
  userId: string,
  action: string,
  max: number
): Promise<{ allowed: boolean; remaining: number }> {
  const collection = await getCollection("rate_limits");

  const now = new Date();
  const windowStart = new Date(
    Math.floor(now.getTime() / 86400000) * 86400000
  ).toISOString();

  const entry = await collection.findOne({ userId, action, windowStart });

  if (!entry) {
    await collection.insertOne({ userId, action, windowStart, count: 1 });
    return { allowed: true, remaining: max - 1 };
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0 };
  }

  await collection.updateOne({ _id: entry._id }, { $inc: { count: 1 } });
  return { allowed: true, remaining: max - entry.count - 1 };
}
