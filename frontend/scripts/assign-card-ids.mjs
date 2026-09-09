import { MongoClient } from "mongodb";
import { randomBytes } from "crypto";

// Use MONGODB_URL env var — do not hardcode credentials
const MONGODB_URL = process.env.MONGODB_URL || "mongodb://localhost:27017";
const DATABASE_NAME = "gachard";

function generateCardId() {
  return randomBytes(3).toString("hex").slice(0, 5);
}

async function assignCardIds() {
  const client = new MongoClient(MONGODB_URL);
  await client.connect();
  const db = client.db(DATABASE_NAME);
  const cards = db.collection("cards");

  const allCards = await cards.find({}).toArray();
  console.log(`Found ${allCards.length} cards\n`);

  for (const card of allCards) {
    const cardId = generateCardId();
    await cards.updateOne({ _id: card._id }, { $set: { cardId } });
    console.log(`  Card #${card.tokenId ?? "?"}: assigned cardId=${cardId}`);
  }

  console.log(`\nDone. ${allCards.length} cards updated.`);
  await client.close();
}

assignCardIds().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
