/**
 * Reconcile exported cards against chain truth (ADR-031, stage 6).
 *
 * Every write in the export flow happens after an on-chain action, so any of
 * them can be lost: the transfer lands and the database update fails, the
 * client closes before polling settles a claim, an import confirms with
 * nobody listening. In all of those the chain is right and MongoDB is stale.
 *
 * This module only ever moves MongoDB towards what the chain already says. It
 * never sends a transaction, so running it is cheap, idempotent and cannot
 * spend sponsorship budget. That is deliberate: a repair path that can also
 * act is a repair path that can make things worse.
 *
 * "Exported" lives only in MongoDB (ADR-026's precedent), so the on-chain
 * question is simply who holds the token.
 */
import { ObjectId } from "mongodb";
import { getCollection } from "./mongodb";
import { getBalance } from "./blockchain";
import { getSponsoredStatus } from "./privy-server";

export interface ReconcileResult {
  cardId: string;
  changed: boolean;
  from: string;
  to?: string;
  reason: string;
}

interface CardDoc {
  _id: ObjectId;
  cardId?: string;
  tokenId?: number | null;
  status?: string;
  ownerAddress?: string;
  privyWalletAddress?: string;
  exportClaimTxId?: string;
  exportClaimTxHash?: string;
  exportClaimStatus?: string;
  exportPending?: boolean;
  importTxId?: string;
  importTxHash?: string;
  releaseTxId?: string;
  releaseTxHash?: string;
}

const CLEAR_EXPORT_CYCLE = {
  exportPending: "",
  privyWalletAddress: "",
  exportClaimTxId: "",
  exportClaimTxHash: "",
  exportClaimBlock: "",
  exportClaimStatus: "",
  exportClaimUserOpHash: "",
  importTxId: "",
  importUserOpHash: "",
};

/**
 * Mark a sponsored import's history row as confirmed.
 *
 * Matched by the Privy transaction id when the card still carries one, and
 * otherwise by the newest pending import for that token — a card whose
 * importTxId was lost still has a row that should not say "Processing".
 */
async function settleImportTransaction(importTxId: string | undefined, tokenId: number) {
  const txs = await getCollection("transactions");
  const now = new Date().toISOString();

  if (importTxId) {
    const byId = await txs.updateOne(
      { privyTxId: importTxId, status: "pending" },
      { $set: { status: "confirmed", updatedAt: now } }
    );
    if (byId.matchedCount > 0) return;
  }

  // findOneAndUpdate, not updateOne: the driver ignores a sort on updateOne,
  // and without one an older failed attempt could be the row that gets
  // settled instead of the current return.
  await txs.findOneAndUpdate(
    { type: "privy_import", tokenId, status: "pending" },
    { $set: { status: "confirmed", updatedAt: now } },
    { sort: { createdAt: -1 } }
  );
}

/**
 * Fill in a sponsored send's hash and mark its history row confirmed.
 *
 * The send route writes `privyTxId` and `txHash: null`, because Privy answers
 * with a transaction id and the hash does not exist until the bundler lands
 * it. Nothing ever came back for it: `releaseTxId` was written in one place
 * and read in none, so the row said "Processing" for good while the card had
 * long since arrived at its destination.
 */
async function settleSendTransaction(releaseTxId: string, tokenId: number, hash: string) {
  const txs = await getCollection("transactions");
  const now = new Date().toISOString();

  const byId = await txs.updateOne(
    { privyTxId: releaseTxId, status: "pending" },
    { $set: { status: "confirmed", txHash: hash, updatedAt: now } }
  );
  if (byId.matchedCount > 0) return;

  // findOneAndUpdate for the sort, as with imports: without one an older
  // abandoned attempt could be settled instead of this transfer.
  await txs.findOneAndUpdate(
    { type: "privy_send", tokenId, status: "pending" },
    { $set: { status: "confirmed", txHash: hash, updatedAt: now } },
    { sort: { createdAt: -1 } }
  );
}

export async function reconcileExportedCard(card: CardDoc): Promise<ReconcileResult> {
  const cards = await getCollection("cards");
  const label = card.cardId ?? String(card._id);
  const from = card.status ?? "unknown";
  const noop = (reason: string): ReconcileResult => ({ cardId: label, changed: false, from, reason });

  if (card.tokenId === null || card.tokenId === undefined) {
    return noop("no tokenId yet");
  }
  if (!card.ownerAddress) {
    return noop("no custodial address on the card");
  }

  const tokenId = Number(card.tokenId);
  const custodialHolds = (await getBalance(card.ownerAddress, tokenId)) > 0n;
  const privyHolds = card.privyWalletAddress
    ? (await getBalance(card.privyWalletAddress, tokenId)) > 0n
    : false;

  // The card is back with the platform but the database still says otherwise.
  // Covers an import that confirmed unobserved, and an export whose transfer
  // never actually landed.
  if (custodialHolds && card.status === "Exported") {
    // Read before the unset below clears it.
    const importTxId = card.importTxId;

    await cards.updateOne(
      { _id: card._id },
      {
        $set: { status: "Digital", importStatus: "confirmed", importedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        $unset: CLEAR_EXPORT_CYCLE,
      }
    );

    // The history row has to move with the card. A sponsored transfer is
    // recorded with txHash null, because Privy answers with a transaction id
    // and the hash does not exist yet, so the generic confirmer in /api/cards
    // skips it — it only looks at rows that already have a hash. Left alone
    // the row reads "Processing" forever while the card sits happily back in
    // the collection, which is what a user actually notices.
    await settleImportTransaction(importTxId, tokenId);

    return { cardId: label, changed: true, from, to: "Digital", reason: "custodial wallet holds the token" };
  }

  // The transfer landed but the status write did not. Without this the card
  // looks tradable while the platform cannot move it, and every action on it
  // would fail at the contract.
  if (privyHolds && card.status === "Digital") {
    await cards.updateOne(
      { _id: card._id },
      { $set: { status: "Exported", updatedAt: new Date().toISOString() }, $unset: { exportPending: "" } }
    );
    return { cardId: label, changed: true, from, to: "Exported", reason: "token is held by the user's wallet" };
  }

  // State agrees; settle anything still in flight by asking Privy once.
  if (privyHolds && card.status === "Exported") {
    if (card.importTxId && !card.importTxHash) {
      const imp = await getSponsoredStatus(card.importTxId);
      if (imp.failed) {
        await cards.updateOne(
          { _id: card._id },
          { $set: { importStatus: "failed", updatedAt: new Date().toISOString() }, $unset: { importTxId: "", importUserOpHash: "" } }
        );
        return { cardId: label, changed: true, from, to: from, reason: "import failed, cleared so it can be retried" };
      }
      return noop(`import still ${imp.status}`);
    }

    if (card.exportClaimTxId && !card.exportClaimTxHash) {
      let claim;
      try {
        claim = await getSponsoredStatus(card.exportClaimTxId);
      } catch (e) {
        // Privy does not know this transaction. Without clearing it the card
        // is trapped for good: it cannot be imported, because import demands a
        // confirmed claim, and it cannot be re-claimed, because one is already
        // recorded. Dropping the unknown id costs nothing and lets the user
        // claim again.
        if (/404|not found/i.test(e instanceof Error ? e.message : String(e))) {
          await cards.updateOne(
            { _id: card._id },
            { $set: { exportClaimStatus: "unknown", updatedAt: new Date().toISOString() }, $unset: { exportClaimTxId: "", exportClaimUserOpHash: "" } }
          );
          return { cardId: label, changed: true, from, to: from, reason: "claim id unknown to Privy, cleared so it can be claimed again" };
        }
        throw e;
      }
      if (claim.confirmed && claim.hash) {
        await cards.updateOne(
          { _id: card._id },
          { $set: { exportClaimTxHash: claim.hash, exportClaimStatus: "confirmed", exportClaimedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }
        );
        return { cardId: label, changed: true, from, to: from, reason: "claim settled" };
      }
      if (claim.failed) {
        // Clear it so the user can claim again. Without this the card is
        // stuck: it cannot be imported, because import requires a confirmed
        // claim, and it cannot be re-claimed, because one is already recorded.
        await cards.updateOne(
          { _id: card._id },
          { $set: { exportClaimStatus: "failed", updatedAt: new Date().toISOString() }, $unset: { exportClaimTxId: "", exportClaimUserOpHash: "" } }
        );
        return { cardId: label, changed: true, from, to: from, reason: "claim failed, cleared so it can be retried" };
      }
      return noop(`claim still ${claim.status}`);
    }
    return noop("consistent");
  }

  // An export that was started and never landed. Clear the marker so the card
  // stops being scanned and stops looking half-exported.
  if (custodialHolds && card.status === "Digital" && card.exportPending) {
    await cards.updateOne(
      { _id: card._id },
      { $set: { updatedAt: new Date().toISOString() }, $unset: CLEAR_EXPORT_CYCLE }
    );
    return { cardId: label, changed: true, from, to: "Digital", reason: "export never landed, marker cleared" };
  }

  // A card sent to an address outside Gachard. Neither of our wallets holds
  // it, which is the correct and final state — but the transfer's hash was
  // never collected, so this has to be handled before the "neither wallet"
  // fallthrough below, which would otherwise read a successful transfer as a
  // possible burn.
  if (card.status === "Released" && card.releaseTxId && !card.releaseTxHash) {
    let rel;
    try {
      rel = await getSponsoredStatus(card.releaseTxId);
    } catch (e) {
      // Privy does not recognise the id. Nothing can be settled from it, and
      // retrying forever costs an API call per sweep, so record that the hash
      // is unobtainable and stop asking.
      if (/404|not found/i.test(e instanceof Error ? e.message : String(e))) {
        await cards.updateOne(
          { _id: card._id },
          { $set: { releaseStatus: "unknown", updatedAt: new Date().toISOString() }, $unset: { releaseTxId: "" } }
        );
        return { cardId: label, changed: true, from, to: from, reason: "release id unknown to Privy, stopped asking" };
      }
      throw e;
    }

    if (rel.confirmed && rel.hash) {
      await cards.updateOne(
        { _id: card._id },
        { $set: { releaseTxHash: rel.hash, releaseStatus: "confirmed", updatedAt: new Date().toISOString() } }
      );
      await settleSendTransaction(card.releaseTxId, tokenId, rel.hash);
      return { cardId: label, changed: true, from, to: from, reason: "release settled" };
    }

    if (rel.failed) {
      // The transfer never landed, so the card never left. Marking it Released
      // was premature — the send route writes that status before the bundler
      // has confirmed anything — and leaving it there strands a card the user
      // still owns behind a status that says it is gone.
      if (privyHolds) {
        const txs = await getCollection("transactions");
        await txs.updateOne(
          { privyTxId: card.releaseTxId, status: "pending" },
          { $set: { status: "failed", updatedAt: new Date().toISOString() } }
        );
        await cards.updateOne(
          { _id: card._id },
          {
            $set: { status: "Exported", updatedAt: new Date().toISOString() },
            $unset: { releaseTxId: "", releasedTo: "", releasedAt: "" },
          }
        );
        return { cardId: label, changed: true, from, to: "Exported", reason: "release failed, card is still in the wallet" };
      }
      return noop("release failed but the wallet does not hold the token either");
    }

    return noop(`release still ${rel.status}`);
  }

  // Neither wallet holds it. Most likely burned; say so rather than guessing.
  if (!custodialHolds && !privyHolds) {
    return noop("token held by neither wallet, left alone");
  }

  return noop("consistent");
}

/**
 * Find cards that could be out of sync and reconcile a bounded batch.
 *
 * Bounded because each card costs at least one RPC read and these routes run
 * under maxDuration = 10 (ADR-018), the same reason confirm-all batches.
 *
 * Scoped by custodial address, not by user id. This took a `userId` and
 * filtered `query.userId`, but no card document has ever had that field —
 * cards are keyed to their owner by `ownerAddress` — so every scoped call
 * matched nothing and silently reconciled zero cards.
 */
/**
 * Reconcile only the cards that look stuck, for one owner.
 *
 * reconcileExportedCards scans anything that could conceivably have drifted,
 * which is right for a sweep and wrong for a page load: every candidate costs
 * at least one RPC read, and a user holding three exported cards paid for all
 * three on every request. Measured at 13-16 seconds against /api/cards, while
 * /collection gives up after six and renders an empty vault.
 *
 * "Stuck" is narrower than "exported". A card sitting happily in someone's
 * wallet needs no repair; the ones that do are mid-flight — an import that was
 * started and never settled, or a transfer whose post-write was lost.
 */
export async function reconcileStuckTransfers(
  limit: number,
  ownerAddress: string
): Promise<ReconcileResult[]> {
  const cards = await getCollection("cards");
  const candidates = (await cards
    .find({
      ownerAddress,
      $or: [
        { importTxId: { $exists: true }, importTxHash: { $exists: false } },
        { releaseTxId: { $exists: true }, releaseTxHash: { $exists: false } },
        { exportPending: true },
      ],
    })
    .sort({ updatedAt: 1 })
    .limit(limit)
    .toArray()) as unknown as CardDoc[];

  const results: ReconcileResult[] = [];
  for (const card of candidates) {
    try {
      results.push(await reconcileExportedCard(card));
    } catch (e) {
      console.warn(`[privy-reconcile] ${card.cardId ?? card._id}: `, e);
    }
  }
  return results;
}

export async function reconcileExportedCards(
  limit = 10,
  ownerAddress?: string
): Promise<ReconcileResult[]> {
  const cards = await getCollection("cards");
  // exportPending and a lingering privyWalletAddress are what make a lost
  // post-transfer write discoverable. Without them a drifted card still reads
  // as plain Digital and would never be scanned (found by stage 6 test A).
  const query: Record<string, unknown> = {
    $or: [
      { status: "Exported" },
      { importTxId: { $exists: true } },
      { releaseTxId: { $exists: true }, releaseTxHash: { $exists: false } },
      { exportPending: true },
      { privyWalletAddress: { $exists: true } },
    ],
  };
  if (ownerAddress) query.ownerAddress = ownerAddress;

  const candidates = (await cards
    .find(query)
    .sort({ updatedAt: 1 })
    .limit(limit)
    .toArray()) as unknown as CardDoc[];

  const results: ReconcileResult[] = [];
  for (const card of candidates) {
    try {
      results.push(await reconcileExportedCard(card));
    } catch (e) {
      results.push({
        cardId: card.cardId ?? String(card._id),
        changed: false,
        from: card.status ?? "unknown",
        reason: `error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  return results;
}
