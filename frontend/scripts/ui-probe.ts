/**
 * Temporary UI probe fixture. Creates one throwaway user with cards so the
 * wallet pages can be opened in a browser, then removes everything again.
 *
 * Run: npx tsx scripts/ui-probe.ts up    (prints a session cookie)
 *      npx tsx scripts/ui-probe.ts down  (deletes everything it made)
 */
import { MongoClient, ObjectId } from "mongodb";
import { createHmac } from "crypto";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env.local");
for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) {
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[t.slice(0, i).trim()] = v;
  }
}

const EMAIL = "ui-probe@gachard.test";
// Valid hex: a placeholder with letters outside a-f makes ethers attempt ENS
// resolution and throw on every balance read.
const ADDRESS = "0x00000000000000000000000000000000000cafe0";
const PRIVY_ADDRESS = "0x1111111111111111111111111111111111111111";

async function main() {
  const mode = process.argv[2] ?? "up";
  const client = new MongoClient(process.env.MONGODB_URL!);
  await client.connect();
  const db = client.db(process.env.DATABASE_NAME || "gachard");

  if (mode === "down") {
    const u = await db.collection("users").findOne({ email: EMAIL });
    const c = await db.collection("cards").deleteMany({ ownerAddress: ADDRESS });
    const d = await db.collection("users").deleteMany({ email: EMAIL });
    console.log(`removed ${c.deletedCount} card(s), ${d.deletedCount} user(s)`, u?._id?.toString() ?? "");
    await client.close();
    return;
  }

  const advanced = process.argv[3] !== "off";
  const withPrivy = process.argv[4] !== "nowallet";

  await db.collection("cards").deleteMany({ ownerAddress: ADDRESS });
  await db.collection("users").deleteMany({ email: EMAIL });

  const userId = new ObjectId();
  await db.collection("users").insertOne({
    _id: userId,
    email: EMAIL,
    username: "ui-probe",
    walletAddress: ADDRESS,
    crystalBalance: 0,
    createdAt: new Date().toISOString(),
    advancedMode: advanced,
    ...(withPrivy
      ? { privyUserId: "did:privy:uiprobe", privyWalletAddress: PRIVY_ADDRESS, privyWalletId: "probe" }
      : {}),
  });

  // Real templates, so the artwork the page renders is the artwork users see.
  const templates = await db.collection("card_templates").find({}).limit(7).toArray();
  if (templates.length < 7) throw new Error("need at least 7 templates in the database");

  const now = new Date().toISOString();
  const mk = (i: number, extra: Record<string, unknown>) => ({
    cardId: `ui-probe-${i}`,
    tokenId: 900000 + i,
    templateId: templates[i].templateId,
    rarity: templates[i].rarity ?? i % 4,
    ownerAddress: ADDRESS,
    status: "Digital",
    fulfillmentStatus: null,
    isListed: false,
    viewed: true,
    createdAt: now,
    ...extra,
  });

  await db.collection("cards").insertMany([
    mk(0, {}),                                        // movable
    mk(1, {}),                                        // movable
    mk(2, {}),                                        // movable
    mk(3, { isListed: true, listingId: "probe-l1" }), // listed: must NOT be movable
    mk(4, { status: "Exported" }),                    // already in the wallet
    mk(5, { status: "Exported" }),                    // already in the wallet
    mk(6, { status: "Exported" }),                    // already in the wallet
  ]);

  const ts = Math.floor(Date.now() / 1000);
  const payload = `${userId.toString()}.${ts}`;
  const sig = createHmac("sha256", Buffer.from(process.env.ENCRYPTION_SECRET_KEY!, "utf8"))
    .update(payload)
    .digest("hex");

  console.log(JSON.stringify({
    userId: userId.toString(),
    token: `${payload}.${sig}`,
    advancedMode: advanced,
    privyLinked: withPrivy,
    cards: { movable: 3, listed: 1, inWallet: 3 },
  }));
  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
