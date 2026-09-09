import { getCollection } from "./mongodb";

/**
 * Get user's credit balance (in cents/sen).
 * Returns 0 if user has no credit record yet.
 */
export async function getCreditBalance(userId: string): Promise<number> {
  const collection = await getCollection("credits");
  const record = await collection.findOne({ userId });
  return record?.balance ?? 0;
}

/**
 * Add credits to user's balance (top-up).
 * Amount in cents (e.g., 500 = $5.00).
 * Returns new balance.
 */
export async function addCredits(userId: string, amountCents: number): Promise<number> {
  if (amountCents <= 0) throw new Error("Amount must be positive");
  if (amountCents > 10000) throw new Error("Max top-up is $100.00");

  const collection = await getCollection("credits");
  const result = await collection.findOneAndUpdate(
    { userId },
    {
      $inc: { balance: amountCents },
      $setOnInsert: { userId, createdAt: new Date().toISOString() },
      $set: { updatedAt: new Date().toISOString() },
    },
    { upsert: true, returnDocument: "after" }
  );

  return result?.balance ?? amountCents;
}

/**
 * Deduct credits from user's balance (buy pack).
 * Returns new balance. Throws if insufficient.
 */
export async function deductCredits(userId: string, amountCents: number): Promise<number> {
  if (amountCents <= 0) throw new Error("Amount must be positive");

  const collection = await getCollection("credits");
  const record = await collection.findOne({ userId });

  if (!record || record.balance < amountCents) {
    throw new Error("Insufficient credit balance");
  }

  const result = await collection.findOneAndUpdate(
    { userId, balance: { $gte: amountCents } },
    {
      $inc: { balance: -amountCents },
      $set: { updatedAt: new Date().toISOString() },
    },
    { returnDocument: "after" }
  );

  if (!result) throw new Error("Insufficient credit balance");
  return result.balance;
}
