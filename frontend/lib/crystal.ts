import { getCollection } from "./mongodb";

/**
 * Dismantle reward rates per rarity (Crystal).
 * Proportional to FVM price ranges: Common < Rare < Epic < Legendary.
 */
export const DISMANTLE_RATES: Record<string, number> = {
  Common: 20,
  Rare: 50,
  Epic: 120,
  Legendary: 300,
};

const RARITY_NAMES = ["Common", "Rare", "Epic", "Legendary"];

export function getDismantleRate(rarity: number): number {
  return DISMANTLE_RATES[RARITY_NAMES[rarity]] ?? 0;
}

/**
 * Get user's Crystal balance.
 * Returns 0 if user has no Crystal record yet.
 */
export async function getCrystalBalance(userId: string): Promise<number> {
  const collection = await getCollection("crystal_balances");
  const record = await collection.findOne({ userId });
  return record?.balance ?? 0;
}

/**
 * Add Crystal to user's balance. Only called internally from dismantle flow.
 * No public endpoint exposes this directly.
 * Returns new balance.
 */
export async function addCrystal(userId: string, amount: number): Promise<number> {
  if (amount <= 0) throw new Error("Amount must be positive");

  const collection = await getCollection("crystal_balances");
  const result = await collection.findOneAndUpdate(
    { userId },
    {
      $inc: { balance: amount },
      $setOnInsert: { userId, createdAt: new Date().toISOString() },
      $set: { updatedAt: new Date().toISOString() },
    },
    { upsert: true, returnDocument: "after" }
  );

  return result?.balance ?? amount;
}

/**
 * Deduct Crystal from user's balance (marketplace purchase).
 * Returns new balance. Throws if insufficient.
 */
export async function deductCrystal(userId: string, amount: number): Promise<number> {
  if (amount <= 0) throw new Error("Amount must be positive");

  const collection = await getCollection("crystal_balances");
  const record = await collection.findOne({ userId });

  if (!record || record.balance < amount) {
    throw new Error("Insufficient crystal balance");
  }

  const result = await collection.findOneAndUpdate(
    { userId, balance: { $gte: amount } },
    {
      $inc: { balance: -amount },
      $set: { updatedAt: new Date().toISOString() },
    },
    { returnDocument: "after" }
  );

  if (!result) throw new Error("Insufficient crystal balance");
  return result.balance;
}
