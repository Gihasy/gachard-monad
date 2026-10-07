/**
 * Has anything minted tokens that Gachard did not mint? (ADR-036)
 *
 * The admin key is `owner()` of GachardCard and can call `mintBatch` without
 * limit. Those tokens are worthless inside Gachard — every action starts from
 * a `cards` document, and only `/api/mint` creates one — but silent minting is
 * still the first thing a compromised key would do, and noticing it in minutes
 * rather than days is what decides whether there is time to react.
 *
 * **Why this compares deltas and not totals.** `nextTokenId` only ever rises;
 * card rows get deleted. Clean-slate wipes the collection while the tokens
 * stay on chain forever, and a test fixture does the same on a smaller scale.
 * A check that compared "tokens on chain" with "cards in the database" would
 * alarm after every one of those, and an alarm that cries wolf is worse than
 * no alarm because it trains people to dismiss it.
 *
 * So a baseline is stored, and each run asks a narrower question: since the
 * last check, did `nextTokenId` move further than the mints Gachard recorded?
 * Deletions below the baseline cannot affect that, which is why clean-slate
 * leaves it undisturbed.
 *
 * **The baseline only advances on a clean result.** If something unexplained
 * is found, the baseline is held where it is, so the alarm persists until a
 * person deals with it. A detector that quietly absorbs the thing it detected
 * is a detector that reports one anomaly and then goes silent forever.
 */
import { ethers } from "ethers";
import { getCollection } from "./mongodb";
import { getProvider } from "./blockchain";

const BASELINE_ID = "token-supply";

/**
 * Its own minimal ABI rather than a line added to the shared `GACHARD_ABI`.
 * That constant is used by mint, print, redeem, transfer and burn; widening it
 * for one read puts a monitoring concern inside the path that moves cards.
 * The balances route already keeps PackEntropy's ABI local for the same
 * reason.
 */
const SUPPLY_ABI = ["function nextTokenId() view returns (uint256)"];

export type SupplyIntegrity = {
  /** `nextTokenId` on chain. The next id to be issued, so minted = this − 1. */
  chainNextTokenId: number;
  /** What it was when the baseline was last trusted. */
  baselineNextTokenId: number;
  /** Tokens the chain issued since the baseline. */
  chainMinted: number;
  /** Tokens Gachard recorded minting in the same window. */
  recordedMinted: number;
  /** chainMinted − recordedMinted. Anything above zero wants an explanation. */
  unexplained: number;
  baselineAt: string | null;
  checkedAt: string;
};

export async function checkSupplyIntegrity(): Promise<SupplyIntegrity> {
  const address = (process.env.CONTRACT_ADDRESS || "").trim();
  if (!ethers.isAddress(address)) {
    throw new Error("CONTRACT_ADDRESS is not set or not an address");
  }
  const contract = new ethers.Contract(address, SUPPLY_ABI, getProvider());
  const chainNextTokenId = Number(await contract.nextTokenId());

  const baselines = await getCollection("chain_baseline");
  const existing = await baselines.findOne({ _id: BASELINE_ID as never });

  const now = new Date().toISOString();

  // First run: adopt the current state rather than reporting every token ever
  // minted as unexplained. There is nothing to compare against yet, and
  // pretending otherwise would make the first reading useless.
  if (!existing) {
    await baselines.insertOne({
      _id: BASELINE_ID as never,
      nextTokenId: chainNextTokenId,
      recordedAt: now,
    });
    return {
      chainNextTokenId,
      baselineNextTokenId: chainNextTokenId,
      chainMinted: 0,
      recordedMinted: 0,
      unexplained: 0,
      baselineAt: now,
      checkedAt: now,
    };
  }

  const baselineNextTokenId = Number(existing.nextTokenId);
  const baselineAt: string = existing.recordedAt;
  const chainMinted = Math.max(0, chainNextTokenId - baselineNextTokenId);

  // What Gachard itself minted in the window. Counted from the tokenIds each
  // mint transaction recorded, not from the cards collection — a card row can
  // be deleted, a transaction row is the record that the mint happened.
  const txs = await getCollection("transactions");
  const mints = await txs
    .find({ type: "mint", createdAt: { $gt: baselineAt } })
    .project({ tokenIds: 1 })
    .toArray();
  const recordedMinted = mints.reduce(
    (n, tx) => n + (Array.isArray(tx.tokenIds) ? tx.tokenIds.length : 0),
    0
  );

  const unexplained = Math.max(0, chainMinted - recordedMinted);

  if (unexplained === 0) {
    await baselines.updateOne(
      { _id: BASELINE_ID as never },
      { $set: { nextTokenId: chainNextTokenId, recordedAt: now } }
    );
  }

  return {
    chainNextTokenId,
    baselineNextTokenId,
    chainMinted,
    recordedMinted,
    unexplained,
    baselineAt,
    checkedAt: now,
  };
}
