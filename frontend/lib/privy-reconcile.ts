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
  rarity?: number;
  templateId?: string;
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
 *
 * The hash is fetched, not left null. This settled the status and stopped
 * there, so a completed return kept `txHash: null` for good and the wallet's
 * activity table showed it as having never touched the chain — when the
 * transfer is exactly what put the card back. The same gap was fixed for
 * outbound sends and missed here, because only the send path was traced.
 *
 * Asking is best effort. By the time this runs the card is demonstrably home,
 * so the status is settled whether or not Privy answers; only the hash
 * depends on it.
 */
async function settleImportTransaction(importTxId: string | undefined, tokenId: number) {
  const txs = await getCollection("transactions");
  const now = new Date().toISOString();

  let hash: string | null = null;
  if (importTxId) {
    try {
      const st = await getSponsoredStatus(importTxId);
      if (st.confirmed && st.hash) hash = st.hash;
    } catch {
      /* settle without it rather than leave the row reading "Processing" */
    }
  }

  const settled: Record<string, unknown> = { status: "confirmed", updatedAt: now };
  if (hash) settled.txHash = hash;

  if (importTxId) {
    const byId = await txs.updateOne(
      { privyTxId: importTxId, status: "pending" },
      { $set: settled }
    );
    if (byId.matchedCount > 0) return;
  }

  // findOneAndUpdate, not updateOne: the driver ignores a sort on updateOne,
  // and without one an older failed attempt could be the row that gets
  // settled instead of the current return.
  await txs.findOneAndUpdate(
    { type: "privy_import", tokenId, status: "pending" },
    { $set: settled },
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

  // The card was sent outside Gachard and has come back.
  //
  // Nothing in this app did that. Someone moved the token from the outside
  // address to the user's wallet directly on chain, and there is no webhook,
  // no Privy transaction id and no history row to find it by — the chain is
  // the only record that it happened. Without this branch the card fell all
  // the way through to "consistent" below, which is the one answer that was
  // certainly wrong: the database said Released while the wallet held the
  // token, so it appeared nowhere on /wallet and could not be returned.
  //
  // Exported is precisely what "in the user's own wallet" means, so the card
  // rejoins the normal cycle and Return works on it again. The release fields
  // are cleared because they now describe a journey that was undone; leaving
  // them would make the next sweep try to settle a transfer that no longer
  // describes where the card is.
  //
  // Placed after the settle branch above deliberately. A card that comes back
  // before its outbound transfer was ever settled is repaired in two passes —
  // the hash is recorded first, the status second — which costs one extra
  // sweep and keeps the outbound hash rather than discarding it.
  if (privyHolds && card.status === "Released") {
    // Record it, or it happened nowhere a person can see. /wallet's activity
    // table and the admin console both read the transactions collection, so a
    // repair that only touches the card document leaves a card that visibly
    // moved with no trace of moving.
    //
    // No hash. Gachard did not carry this transfer and cannot cheaply find
    // it: this RPC limits eth_getLogs to a 100-block range, and the arrival
    // may be thousands of blocks back by the time anyone presses Refresh.
    // Searching would mean dozens of sequential calls inside a ten-second
    // request, which is not a trade worth making for a display field.
    //
    // No counterparty either. The card records where it was sent, and it
    // probably came back from there — but "probably" written into a ledger
    // reads as fact, and a wrong address is worse than an honest blank.
    //
    // Confirmed, not pending: the token is demonstrably in the wallet. This
    // row describes something that has already finished.
    //
    // Written before the status changes, and only in this branch, so it
    // cannot run twice: the next sweep sees Exported and never arrives here.
    // The owner, looked up rather than read off the card. No card document
    // has a userId — they are keyed to their owner by ownerAddress — and a
    // row written with a null one would be invisible to /api/privy/history,
    // which selects by userId. The history table would stay empty and this
    // whole record would have been for nothing.
    const users = await getCollection("users");
    const owner = await users.findOne({ walletAddress: card.ownerAddress });

    const txs = await getCollection("transactions");
    await txs.insertOne({
      userId: owner?._id?.toString() ?? null,
      type: "privy_receive",
      tokenId,
      tokenIds: [tokenId],
      rarity: card.rarity ?? 0,
      templateIds: card.templateId ? [card.templateId] : [],
      txHash: null,
      status: "confirmed",
      contractAddress: process.env.CONTRACT_ADDRESS ?? null,
      fromAddress: null,
      toAddress: card.privyWalletAddress,
      detectedBy: "reconcile",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await cards.updateOne(
      { _id: card._id },
      {
        $set: { status: "Exported", updatedAt: new Date().toISOString() },
        $unset: {
          releasedTo: "",
          releasedAt: "",
          releaseTxId: "",
          releaseTxHash: "",
          releaseStatus: "",
        },
      }
    );
    return { cardId: label, changed: true, from, to: "Exported", reason: "a released card is back in the user's wallet" };
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
