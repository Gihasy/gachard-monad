import { getCollection } from "./mongodb";

export interface CardTemplate {
  templateId: string;
  rarity: number;   // 0=Common, 1=Rare, 2=Epic, 3=Legendary
  name: string;
  artworkUrl: string;
}

// Default templates — artworkUrl sesuai nama file di public/cards/
const DEFAULT_TEMPLATES: CardTemplate[] = [
  { templateId: "common-1", rarity: 0, name: "Common Card A", artworkUrl: "/cards/common-1.webp" },
  { templateId: "common-2", rarity: 0, name: "Common Card B", artworkUrl: "/cards/common-2.webp" },
  { templateId: "rare-1", rarity: 1, name: "Rare Card A", artworkUrl: "/cards/rare-1.webp" },
  { templateId: "rare-2", rarity: 1, name: "Rare Card B", artworkUrl: "/cards/rare-2.webp" },
  { templateId: "epic-1", rarity: 2, name: "Epic Card A", artworkUrl: "/cards/epic-1.webp" },
  { templateId: "epic-2", rarity: 2, name: "Epic Card B", artworkUrl: "/cards/epic-2.webp" },
  { templateId: "legendary-1", rarity: 3, name: "Legendary Card A", artworkUrl: "/cards/legendary-1.webp" },
  { templateId: "legendary-2", rarity: 3, name: "Legendary Card B", artworkUrl: "/cards/legendary-2.webp" },
];

/**
 * Seed card_templates collection with defaults if empty.
 */
export async function seedCardTemplates(): Promise<void> {
  const collection = await getCollection("card_templates");
  const count = await collection.countDocuments();
  if (count === 0) {
    await collection.insertMany(DEFAULT_TEMPLATES);
  }
}

/**
 * Update artworkUrl for all templates based on templateId.
 * Called once after artwork files are added to public/cards/.
 */
export async function updateArtworkUrls(): Promise<number> {
  const collection = await getCollection("card_templates");
  let updated = 0;
  for (const template of DEFAULT_TEMPLATES) {
    const result = await collection.updateOne(
      { templateId: template.templateId },
      { $set: { artworkUrl: template.artworkUrl } }
    );
    updated += result.modifiedCount;
  }
  return updated;
}

/**
 * Pick a random card template for the given rarity.
 */
export async function pickCardTemplate(rarity: number): Promise<CardTemplate> {
  const collection = await getCollection("card_templates");
  const templates = (await collection.find({ rarity }).toArray()) as unknown as CardTemplate[];

  if (templates.length === 0) {
    // Fallback to defaults if DB is empty
    const fallback = DEFAULT_TEMPLATES.filter((t) => t.rarity === rarity);
    return fallback[Math.floor(Math.random() * fallback.length)];
  }

  return templates[Math.floor(Math.random() * templates.length)];
}
