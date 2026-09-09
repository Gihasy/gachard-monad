import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const PRICE_RANGES: Record<number, { min: number; max: number; count: [number, number] }> = {
  0: { min: 50, max: 150, count: [6, 7] },
  1: { min: 200, max: 500, count: [5, 6] },
  2: { min: 600, max: 1200, count: [3, 4] },
  3: { min: 1500, max: 3000, count: [2, 3] },
};

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPrice(min: number, max: number) {
  return Math.round(randomInt(min, max) / 10) * 10;
}

function pastDate(daysAgo: number, jitterDays = 3) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo + randomInt(-jitterDays, jitterDays));
  d.setHours(randomInt(8, 22), randomInt(0, 59), randomInt(0, 59));
  return d.toISOString();
}

export async function POST(req: NextRequest) {
  try {
    // Simple token auth — only allow with correct secret
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    if (token !== process.env.ENCRYPTION_SECRET_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const usersCol = await getCollection("users");
    const cardsCol = await getCollection("cards");
    const txCol = await getCollection("transactions");
    const templatesCol = await getCollection("card_templates");

    const users = await usersCol.find({}).toArray();
    if (users.length < 6) {
      return NextResponse.json({ error: `Need at least 6 users. Found: ${users.length}` }, { status: 400 });
    }

    const cards = await cardsCol.find({ status: "Digital" }).sort({ tokenId: 1 }).toArray();
    if (cards.length < 10) {
      return NextResponse.json({ error: `Need at least 10 Digital cards. Found: ${cards.length}` }, { status: 400 });
    }

    // Clear existing sold transactions
    const deleteResult = await txCol.deleteMany({ type: "sold" });

    const transactions: Record<string, unknown>[] = [];
    let txTimestamp = 21;

    // Ownership chains
    const cardsByRarity = new Map<number, typeof cards>();
    for (const card of cards) {
      const r = card.rarity ?? 0;
      if (!cardsByRarity.has(r)) cardsByRarity.set(r, []);
      cardsByRarity.get(r)!.push(card);
    }

    const chain1Card = cardsByRarity.get(3)?.[0] || cardsByRarity.get(2)?.[0] || cards[0];
    const chain2Card = cardsByRarity.get(2)?.[0] || cardsByRarity.get(1)?.[0] || cards[1];
    const chain3Card = cardsByRarity.get(1)?.[0] || cards[2];

    const chainConfigs = [
      { card: chain1Card, trades: 5, basePrice: chain1Card.rarity === 3 ? 2000 : 800, variance: 300 },
      { card: chain2Card, trades: 4, basePrice: chain2Card.rarity === 2 ? 900 : 400, variance: 200 },
      { card: chain3Card, trades: 3, basePrice: chain3Card.rarity === 1 ? 350 : 100, variance: 100 },
    ];

    const log: string[] = [];

    for (const chain of chainConfigs) {
      const chainUsers = users.slice(0, chain.trades + 1);
      let price = chain.basePrice;

      for (let i = 0; i < chain.trades; i++) {
        price = Math.max(50, price + randomInt(-chain.variance, chain.variance));
        price = Math.round(price / 10) * 10;
        const rarity = chain.card.rarity ?? 0;
        const fromUser = chainUsers[i];
        const toUser = chainUsers[i + 1];

        transactions.push({
          _id: new ObjectId(),
          userId: toUser._id.toString(),
          type: "sold",
          tokenId: chain.card.tokenId,
          tokenIds: [chain.card.tokenId],
          rarity,
          rarities: [rarity],
          templateIds: [chain.card.templateId],
          amount: price,
          purchasePrice: price,
          txHash: null,
          status: "confirmed",
          contractAddress: process.env.CONTRACT_ADDRESS || "",
          fromAddress: fromUser.walletAddress || "0x0000000000000000000000000000000000000000",
          toAddress: toUser.walletAddress || "0x0000000000000000000000000000000000000000",
          error: "",
          createdAt: pastDate(txTimestamp - i * 2),
          updatedAt: pastDate(txTimestamp - i * 2),
        });
      }
      log.push(`Chain: ${chain.card.cardId} (${["Common", "Rare", "Epic", "Legendary"][chain.card.rarity ?? 0]}) — ${chain.trades} trades`);
    }

    // Independent transactions
    const usedCardIds = new Set(chainConfigs.map((c) => c.card.cardId));

    for (const [rarityStr, config] of Object.entries(PRICE_RANGES)) {
      const rarity = parseInt(rarityStr);
      const count = randomInt(config.count[0], config.count[1]);
      const rarityCards = cards.filter((c) => (c.rarity ?? 0) === rarity && !usedCardIds.has(c.cardId));

      for (let i = 0; i < count && i < rarityCards.length; i++) {
        const card = rarityCards[i];
        usedCardIds.add(card.cardId);
        const price = randomPrice(config.min, config.max);
        const sellerIdx = randomInt(0, users.length - 1);
        let buyerIdx = randomInt(0, users.length - 1);
        while (buyerIdx === sellerIdx) buyerIdx = randomInt(0, users.length - 1);

        transactions.push({
          _id: new ObjectId(),
          userId: users[buyerIdx]._id.toString(),
          type: "sold",
          tokenId: card.tokenId,
          tokenIds: [card.tokenId],
          rarity,
          rarities: [rarity],
          templateIds: [card.templateId],
          amount: price,
          purchasePrice: price,
          txHash: null,
          status: "confirmed",
          contractAddress: process.env.CONTRACT_ADDRESS || "",
          fromAddress: users[sellerIdx].walletAddress || "0x0000000000000000000000000000000000000000",
          toAddress: users[buyerIdx].walletAddress || "0x0000000000000000000000000000000000000000",
          error: "",
          createdAt: pastDate(txTimestamp - i * 3),
          updatedAt: pastDate(txTimestamp - i * 3),
        });
      }
      log.push(`Independent: ${count} ${["Common", "Rare", "Epic", "Legendary"][rarity]} transactions`);
    }

    // === WASH-TRADING DEMO CASE ===
    const washCard = cardsByRarity.get(1)?.[1] || cardsByRarity.get(1)?.[0] || cards[3];
    const washUserA = users[0];
    const washUserB = users[1];
    const washPrices = [300, 600, 1200];
    const washRiskScores = [45, 72, 92];

    for (let i = 0; i < 3; i++) {
      const fromUser = i % 2 === 0 ? washUserA : washUserB;
      const toUser = i % 2 === 0 ? washUserB : washUserA;
      const daysBack = 5 - i;

      transactions.push({
        _id: new ObjectId(),
        userId: toUser._id.toString(),
        type: "sold",
        tokenId: washCard.tokenId,
        tokenIds: [washCard.tokenId],
        rarity: washCard.rarity ?? 1,
        rarities: [washCard.rarity ?? 1],
        templateIds: [washCard.templateId],
        amount: washPrices[i],
        purchasePrice: washPrices[i],
        txHash: null,
        status: "confirmed",
        contractAddress: process.env.CONTRACT_ADDRESS || "",
        fromAddress: fromUser.walletAddress || "0x0000000000000000000000000000000000000000",
        toAddress: toUser.walletAddress || "0x0000000000000000000000000000000000000000",
        error: "",
        createdAt: pastDate(daysBack),
        updatedAt: pastDate(daysBack),
        riskScore: washRiskScores[i],
        flagged: washRiskScores[i] >= 70,
        riskReasoning: washRiskScores[i] >= 70
          ? "Pola wash-trading terdeteksi: pasangan wallet yang sama berulang kali dengan harga meningkat tajam"
          : "Transaksi awal dalam pola yang baru terbentuk",
      });
    }
    log.push(`Wash-trading demo: 3 trades on ${washCard.cardId} between ${washUserA.username} and ${washUserB.username}`);

    // Insert all
    if (transactions.length > 0) {
      await txCol.insertMany(transactions);
    }

    // Update chain cards owner to final buyer
    for (const chain of chainConfigs) {
      const chainUsers = users.slice(0, chain.trades + 1);
      const finalOwner = chainUsers[chain.trades];
      await cardsCol.updateOne(
        { cardId: chain.card.cardId },
        {
          $set: {
            ownerAddress: finalOwner.walletAddress || "",
            lastOwner: finalOwner.walletAddress || "",
            updatedAt: new Date().toISOString(),
          },
        }
      );
      log.push(`Updated card ${chain.card.cardId} owner to ${finalOwner.username || finalOwner._id}`);
    }

    return NextResponse.json({
      success: true,
      deleted: deleteResult.deletedCount,
      seeded: transactions.length,
      log,
    });
  } catch (error) {
    console.error("[seed-marketplace]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
