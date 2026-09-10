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

/**
 * Deterministic shuffle from a hex seed (for Pyth Entropy integration).
 * Produces identical rarities given the same seed, packSize, and guaranteedCount.
 * Uses seeded xorshift64 PRNG + Fisher-Yates shuffle.
 */
export function buildPackRaritiesFromSeed(
  seed: string,
  packSize: number,
  guaranteedCount: number
): number[] {
  const seedBigInt = BigInt(seed);
  let rng = seedBigInt;

  const xorshift64 = (x: bigint): bigint => {
    x ^= x << 13n;
    x ^= x >> 7n;
    x ^= x << 17n;
    return x & 0xFFFFFFFFFFFFFFFFn;
  };

  const mapRarity = (random01: number): number => {
    if (random01 < 700) return 0; // Common 70%
    if (random01 < 900) return 1; // Rare 20%
    if (random01 < 980) return 2; // Epic 8%
    return 3;                      // Legendary 2%
  };

  const rarities: number[] = [];

  // Random slots
  const randomCount = packSize - guaranteedCount;
  for (let i = 0; i < randomCount; i++) {
    rng = xorshift64(rng);
    const random01 = Number(rng % 1000n);
    rarities.push(mapRarity(random01));
  }

  // Guaranteed Rare+ slots
  const rareWeights = [20, 8, 2]; // Rare, Epic, Legendary
  const rareTotal = 30;
  for (let i = 0; i < guaranteedCount; i++) {
    rng = xorshift64(rng);
    const randomVal = Number(rng % BigInt(rareTotal));
    if (randomVal < 20) rarities.push(1);      // Rare
    else if (randomVal < 28) rarities.push(2);  // Epic
    else rarities.push(3);                       // Legendary
  }

  // Fisher-Yates shuffle with seed
  for (let i = rarities.length - 1; i > 0; i--) {
    rng = xorshift64(rng);
    const j = Number(rng % BigInt(i + 1));
    [rarities[i], rarities[j]] = [rarities[j], rarities[i]];
  }

  return rarities;
}
