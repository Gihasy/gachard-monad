/**
 * Has anything minted tokens that Gachard did not mint? (ADR-036)
 *
 * The admin key is `owner()` of GachardCard and can call `mintBatch` without
 * limit. Those tokens are worthless inside Gachard — every action starts from
 * a `cards` document, and only `/api/mint` creates one — but silent minting is
 * still the first thing a compromised key would do, and noticing it in minutes
 * rather than days is what decides whether there is time to react.
 *
 * **How it knows.** Token ids are issued sequentially, so one number settles
 * it: the highest id Gachard has ever acknowledged. If the chain is about to
 * issue 292 and we have acknowledged up to 291, everything is accounted for.
 * If the chain is at 350 and we still know 291, then 59 tokens appeared that
 * nothing here minted.
 *
 * **Why not count mint transactions.** The first version did, and it was
 * wrong in a way that took a false alarm in production to see. `recordedMinted`
 * came from the `transactions` collection, which clean-slate deletes and test
 * fixtures tidy away. Mint five tokens, delete the rows, and the detector
 * reports five unexplained — correctly, by its own logic, and uselessly. The
 * comment above it even claimed clean-slate could not trip it.
 *
 * An alarm that cries wolf is worse than no alarm, because it teaches people
 * to dismiss it. So the high-water mark lives in `chain_baseline`, which
 * nothing deletes, and is advanced by the fulfil path when tokens are actually
 * confirmed on chain. Deleting cards, transactions or whole collections cannot
 * move it.
 *
 * **It stays loud.** The mark only advances through a real mint. An
 * unexplained reading persists until the tokens are explained, because a
 * detector that quietly absorbs what it detected reports one anomaly and then
 * goes silent forever.
 */
import { ethers } from "ethers";
import { getCollection } from "./mongodb";
import { getProvider } from "./blockchain";

const BASELINE_ID = "token-supply";

/**
 * Its own minimal ABI rather than a line added to the shared `GACHARD_ABI`.
 * That constant is used by mint, print, redeem, transfer and burn; widening it
 * for one read puts a monitoring concern inside the path that moves cards.
 */
const SUPPLY_ABI = ["function nextTokenId() view returns (uint256)"];

export type SupplyIntegrity = {
  /** `nextTokenId` on chain. The next id to be issued, so the last one is this − 1. */
  chainNextTokenId: number;
  /** The highest token id Gachard has acknowledged minting. */
  highestKnownTokenId: number;
  /** Tokens on chain beyond what Gachard knows about. Above zero wants an explanation. */
  unexplained: number;
  updatedAt: string | null;
  checkedAt: string;
};

/**
 * Record that Gachard minted up to this token id.
 *
 * Called from the fulfil path once `CardMinted` events confirm what landed.
 * `$max` rather than `$set`: two fulfils can race, and a late one carrying an
 * older id must not drag the mark backwards and invent an alarm.
 */
export async function recordMintedUpTo(tokenIds: number[]): Promise<void> {
  const highest = tokenIds.reduce((a, b) => (b > a ? b : a), 0);
  if (highest <= 0) return;
  const baselines = await getCollection("chain_baseline");
  await baselines.updateOne(
    { _id: BASELINE_ID as never },
    { $max: { highestKnownTokenId: highest }, $set: { updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
}

export async function checkSupplyIntegrity(): Promise<SupplyIntegrity> {
  const address = (process.env.CONTRACT_ADDRESS || "").trim();
  if (!ethers.isAddress(address)) {
    throw new Error("CONTRACT_ADDRESS is not set or not an address");
  }
  const contract = new ethers.Contract(address, SUPPLY_ABI, getProvider());
  const chainNextTokenId = Number(await contract.nextTokenId());
  const lastIssued = Math.max(0, chainNextTokenId - 1);

  const baselines = await getCollection("chain_baseline");
  const existing = await baselines.findOne({ _id: BASELINE_ID as never });
  const now = new Date().toISOString();

  // First run: adopt the chain. There is nothing to compare against yet, and
  // reporting every token ever minted as unexplained would make the first
  // reading useless.
  if (!existing || typeof existing.highestKnownTokenId !== "number") {
    await baselines.updateOne(
      { _id: BASELINE_ID as never },
      { $set: { highestKnownTokenId: lastIssued, updatedAt: now } },
      { upsert: true }
    );
    return {
      chainNextTokenId,
      highestKnownTokenId: lastIssued,
      unexplained: 0,
      updatedAt: now,
      checkedAt: now,
    };
  }

  const highestKnownTokenId = Number(existing.highestKnownTokenId);

  return {
    chainNextTokenId,
    highestKnownTokenId,
    unexplained: Math.max(0, lastIssued - highestKnownTokenId),
    updatedAt: existing.updatedAt ?? null,
    checkedAt: now,
  };
}
