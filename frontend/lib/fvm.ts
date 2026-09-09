import { getCollection } from "./mongodb";

export interface FVMResult {
  fvm: number | null;
  source: "template" | "rarity" | "none";
}

export async function getFVM(templateId: string): Promise<FVMResult> {
  const txCollection = await getCollection("transactions");

  // Level 1: same templateId
  const templateSold = await txCollection
    .find({ type: "sold", templateId, status: "confirmed", flagged: { $ne: true } })
    .toArray();

  if (templateSold.length > 0) {
    const avg =
      templateSold.reduce((sum, tx) => sum + (tx.amount || 0), 0) /
      templateSold.length;
    return { fvm: Math.round(avg), source: "template" };
  }

  // Level 2: same rarity
  const templatesCollection = await getCollection("card_templates");
  const template = await templatesCollection.findOne({ templateId });
  if (!template) return { fvm: null, source: "none" };

  const raritySold = await txCollection
    .find({ type: "sold", rarity: template.rarity, status: "confirmed", flagged: { $ne: true } })
    .toArray();

  if (raritySold.length > 0) {
    const avg =
      raritySold.reduce((sum, tx) => sum + (tx.amount || 0), 0) /
      raritySold.length;
    return { fvm: Math.round(avg), source: "rarity" };
  }

  return { fvm: null, source: "none" };
}

export function getFVMFloor(fvm: number | null): number | null {
  if (fvm === null) return null;
  return Math.round(fvm * 0.7);
}
