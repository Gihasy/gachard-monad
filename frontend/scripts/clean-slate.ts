/**
 * Clean Slate Script — Reset database for fresh demo data.
 * 
 * Deletes: cards, transactions, redeem_codes, rate_limits, shipping_addresses, payments
 * Keeps: users, card_templates
 * 
 * Usage: cd frontend && npx tsx scripts/clean-slate.ts
 */

import { MongoClient } from "mongodb";
import * as fs from "fs";
import * as path from "path";

// Read .env.local manually
const envPath = path.resolve(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
}

const MONGODB_URL = env.MONGODB_URL || process.env.MONGODB_URL || "";
const DATABASE_NAME = env.DATABASE_NAME || process.env.DATABASE_NAME || "gachard";

if (!MONGODB_URL) {
  console.error("MONGODB_URL not set in .env.local");
  process.exit(1);
}

async function cleanSlate() {
  const client = new MongoClient(MONGODB_URL);
  await client.connect();
  const db = client.db(DATABASE_NAME);

  console.log("=== Clean Slate: Deleting test data ===\n");

  const collections = [
    "cards",
    "transactions",
    "redeem_codes",
    "rate_limits",
    "shipping_addresses",
    "payments",
  ];

  let totalDeleted = 0;

  for (const name of collections) {
    const count = await db.collection(name).countDocuments();
    if (count > 0) {
      const result = await db.collection(name).deleteMany({});
      console.log(`  ${name}: deleted ${result.deletedCount}`);
      totalDeleted += result.deletedCount;
    } else {
      console.log(`  ${name}: already empty`);
    }
  }

  // Show what's preserved
  console.log("\n=== Preserved ===\n");
  const usersCount = await db.collection("users").countDocuments();
  const templatesCount = await db.collection("card_templates").countDocuments();
  console.log(`  users: ${usersCount}`);
  console.log(`  card_templates: ${templatesCount}`);

  console.log(`\n=== Done. Total deleted: ${totalDeleted} ===`);

  await client.close();
}

cleanSlate().catch((err) => {
  console.error("Clean slate failed:", err);
  process.exit(1);
});
