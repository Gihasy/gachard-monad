import { MongoClient } from "mongodb";

// Use MONGODB_URL env var — do not hardcode credentials
const MONGODB_URL = process.env.MONGODB_URL || "mongodb://localhost:27017";
const DATABASE_NAME = "gachard";

async function cleanState() {
  const client = new MongoClient(MONGODB_URL);
  await client.connect();
  const db = client.db(DATABASE_NAME);

  console.log("Connected to MongoDB Atlas\n");

  // Collections to clean (delete all documents)
  const cleanCollections = [
    "cards",
    "transactions",
    "redeem_codes",
    "rate_limits",
    "shipping_addresses",
    "payments",
  ];

  for (const name of cleanCollections) {
    const col = db.collection(name);
    const count = await col.countDocuments();
    if (count > 0) {
      const result = await col.deleteMany({});
      console.log(`  ${name}: deleted ${result.deletedCount} documents`);
    } else {
      console.log(`  ${name}: already empty`);
    }
  }

  // Reset demo user credits to 0
  const users = db.collection("users");
  const demoUsers = await users.find({ username: /^Demo/i }).toArray();
  if (demoUsers.length > 0) {
    const credits = db.collection("credits");
    for (const user of demoUsers) {
      await credits.deleteMany({ userId: user._id.toString() });
      console.log(`  credits for @${user.username}: reset to 0`);
    }
  }

  // Reset counters
  const counters = db.collection("counters");
  await counters.deleteMany({});
  console.log("  counters: reset");

  // Keep card_templates (not test data)
  const templates = await db.collection("card_templates").countDocuments();
  console.log(`\n  card_templates: kept (${templates} templates)`);

  // Summary
  const remainingCards = await db.collection("cards").countDocuments();
  const remainingTx = await db.collection("transactions").countDocuments();
  console.log(`\n--- Clean State Complete ---`);
  console.log(`  cards: ${remainingCards}`);
  console.log(`  transactions: ${remainingTx}`);
  console.log(`  users: ${await users.countDocuments()} (kept)`);
  console.log(`  card_templates: ${templates} (kept)\n`);

  await client.close();
}

cleanState().catch((err) => {
  console.error("Clean state failed:", err);
  process.exit(1);
});
