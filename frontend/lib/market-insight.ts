import { getCollection } from "./mongodb";
import { getFVM } from "./fvm";

const MIMO_API_KEY = process.env.MIMO_API_KEY!;
const MIMO_BASE_URL = process.env.MIMO_BASE_URL || "https://token-plan-sgp.xiaomimimo.com/v1";
const MIMO_MODEL = process.env.MIMO_MODEL || "MiMo-V2.5-Pro";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function generateMarketInsight(): Promise<string> {
  const collection = await getCollection("market_insights");

  // Check cache
  const cached = await collection.findOne({
    expiresAt: { $gt: new Date().toISOString() },
  });
  if (cached) return cached.insight;

  // Gather data: sold transactions from last 2 weeks
  const txCol = await getCollection("transactions");
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();

  const recentSold = await txCol
    .find({ type: "sold", status: "confirmed", createdAt: { $gte: twoWeeksAgo } })
    .toArray();

  const previousSold = await txCol
    .find({ type: "sold", status: "confirmed", createdAt: { $gte: fourWeeksAgo, $lt: twoWeeksAgo } })
    .toArray();

  // Group by rarity
  const rarityNames = ["Common", "Rare", "Epic", "Legendary"];
  const statsByRarity: Record<string, { recent: number[]; previous: number[] }> = {};
  for (let r = 0; r < 4; r++) {
    statsByRarity[rarityNames[r]] = {
      recent: recentSold.filter((tx) => tx.rarity === r).map((tx) => tx.amount || 0),
      previous: previousSold.filter((tx) => tx.rarity === r).map((tx) => tx.amount || 0),
    };
  }

  // Build summary for LLM
  let dataSummary = "Data tren harga 2 minggu terakhir (dalam Crystal):\n";
  for (const [rarity, data] of Object.entries(statsByRarity)) {
    const recentAvg = data.recent.length > 0
      ? Math.round(data.recent.reduce((a, b) => a + b, 0) / data.recent.length)
      : null;
    const prevAvg = data.previous.length > 0
      ? Math.round(data.previous.reduce((a, b) => a + b, 0) / data.previous.length)
      : null;
    const change = recentAvg && prevAvg ? ((recentAvg - prevAvg) / prevAvg * 100).toFixed(1) : "N/A";
    dataSummary += `- ${rarity}: ${data.recent.length} transaksi, rata-rata ${recentAvg ?? "–"} Crystal, perubahan ${change}%\n`;
  }

  // Call the LLM
  const insight = await callMiMo(
    `Berdasarkan data tren harga kartu collectible berikut, tulis ringkasan 2-3 kalimat dalam bahasa Indonesia yang insightful untuk kolektor kartu. Sebutkan rarity mana yang paling bergerak dan kemungkinan alasannya (kelangkaan, demand, tren pasar). Gunakan nada profesional dan menarik.\n\n${dataSummary}`
  );

  // Cache
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MS).toISOString();
  await collection.deleteMany({});
  await collection.insertOne({
    insight,
    generatedAt: now.toISOString(),
    expiresAt,
  });

  return insight;
}

export async function suggestListingPrice(templateId: string): Promise<string | null> {
  const fvmResult = await getFVM(templateId);
  if (fvmResult.fvm === null) return null;

  const templatesCol = await getCollection("card_templates");
  const template = await templatesCol.findOne({ templateId });
  if (!template) return null;

  const txCol = await getCollection("transactions");
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();

  const recentSold = await txCol
    .find({ type: "sold", rarity: template.rarity, status: "confirmed", createdAt: { $gte: twoWeeksAgo } })
    .toArray();
  const previousSold = await txCol
    .find({ type: "sold", rarity: template.rarity, status: "confirmed", createdAt: { $gte: fourWeeksAgo, $lt: twoWeeksAgo } })
    .toArray();

  const recentAvg = recentSold.length > 0
    ? Math.round(recentSold.reduce((s, tx) => s + (tx.amount || 0), 0) / recentSold.length)
    : fvmResult.fvm;
  const prevAvg = previousSold.length > 0
    ? Math.round(previousSold.reduce((s, tx) => s + (tx.amount || 0), 0) / previousSold.length)
    : fvmResult.fvm;

  const trendPct = prevAvg > 0 ? ((recentAvg - prevAvg) / prevAvg * 100).toFixed(1) : "0";
  const trendDirection = parseFloat(trendPct) > 5 ? "naik" : parseFloat(trendPct) < -5 ? "turun" : "stabil";

  const rarityName = ["Common", "Rare", "Epic", "Legendary"][template.rarity];
  const floor = Math.round(fvmResult.fvm * 0.7);

  const prompt = `Kartu ini rarity ${rarityName}, nilai pasar rata-rata ${fvmResult.fvm} Crystal, tren harga rarity ini sedang ${trendDirection} (${trendPct}%). Harga minimum yang diizinkan sistem: ${floor} Crystal.

Berikan rekomendasi range harga listing yang wajar dalam 1-2 kalimat bahasa Indonesia, actionable untuk penjual. Sebutkan angka spesifik. Jangan gunakan format markdown.`;

  return callMiMo(prompt);
}

/**
 * Single AI provider for the whole app (ADR-030) — same endpoint and key that
 * lib/risk-score.ts uses, so there is one credential to configure rather than two.
 */
async function callMiMo(prompt: string): Promise<string> {
  const res = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MIMO_API_KEY}`,
    },
    body: JSON.stringify({
      model: MIMO_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a collectible card market analyst. Reply in Indonesian, plain prose, no markdown.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    throw new Error(`MiMo API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}
