import { getCollection } from "./mongodb";

export interface OddsEntry {
  rarity: number;   // 0=Common, 1=Rare, 2=Epic, 3=Legendary
  weight: number;   // bobot relatif
  label: string;
}

// Default odds table (bisa di-override dari MongoDB, lihat ADR-009)
const DEFAULT_ODDS: OddsEntry[] = [
  { rarity: 0, weight: 70, label: "Common" },
  { rarity: 1, weight: 20, label: "Rare" },
  { rarity: 2, weight: 8, label: "Epic" },
  { rarity: 3, weight: 2, label: "Legendary" },
];

/**
 * Get odds table from MongoDB or fall back to defaults.
 */
export async function getOddsTable(): Promise<OddsEntry[]> {
  try {
    const collection = await getCollection("odds");
    const stored = await collection.findOne({ name: "default" } as Record<string, unknown>);
    if (stored && (stored as Record<string, unknown>).entries) {
      return (stored as Record<string, unknown>).entries as OddsEntry[];
    }
  } catch {
    // Collection might not exist yet
  }
  return DEFAULT_ODDS;
}

/**
 * Weighted random pick based on odds table.
 * Returns rarity value (0-3).
 */
export async function pickRarity(): Promise<number> {
  const odds = await getOddsTable();
  const totalWeight = odds.reduce((sum, o) => sum + o.weight, 0);
  let random = Math.random() * totalWeight;

  for (const entry of odds) {
    random -= entry.weight;
    if (random <= 0) {
      return entry.rarity;
    }
  }

  return 0; // Fallback Common
}

/**
 * Weighted random pick ONLY among Rare/Epic/Legendary.
 * Normalisasi bobot dari odds table asli (20/8/2 → 100%).
 */
export async function pickGuaranteedRareOrBetter(): Promise<number> {
  const odds = await getOddsTable();
  const rareOdds = odds.filter((o) => o.rarity >= 1);

  if (rareOdds.length === 0) return 1; // Fallback Rare

  const totalWeight = rareOdds.reduce((sum, o) => sum + o.weight, 0);
  let random = Math.random() * totalWeight;

  for (const entry of rareOdds) {
    random -= entry.weight;
    if (random <= 0) {
      return entry.rarity;
    }
  }

  return 1; // Fallback Rare
}

/**
 * Build array of rarities for a pack.
 * @param packSize - Total kartu dalam pack (default 8)
 * @param guaranteedCount - Jumlah kartu dijamin Rare+ (default 1)
 * Shuffle sebelum dikembalikan supaya slot jaminan tidak selalu di posisi sama.
 */
export async function buildPackRarities(
  packSize: number = 8,
  guaranteedCount: number = 1
): Promise<number[]> {
  const rarities: number[] = [];

  // kartu random biasa
  const randomCount = packSize - guaranteedCount;
  for (let i = 0; i < randomCount; i++) {
    rarities.push(await pickRarity());
  }

  // kartu dijamin Rare+
  for (let i = 0; i < guaranteedCount; i++) {
    rarities.push(await pickGuaranteedRareOrBetter());
  }

  // Shuffle (Fisher-Yates)
  for (let i = rarities.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rarities[i], rarities[j]] = [rarities[j], rarities[i]];
  }

  return rarities;
}
