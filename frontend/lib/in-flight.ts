import { getCollection } from "@/lib/mongodb";

/**
 * Everything that started and has not finished (ADR-037, check 1).
 *
 * The bugs that cost this project the most time all looked like success: a
 * Privy send recorded with no hash, a marketplace purchase whose `pending*`
 * fields nothing ever read, a mint waiting on a seed that never came. No
 * request failed and nothing was logged. Each was a record sitting in a state
 * it should have left minutes earlier, found by someone reading the database
 * by hand. This is that reading, done for them.
 *
 * **Transactions are the primary source.** Every flow that can hang — mint,
 * purchase, dismantle, print, redeem, the three Privy flows — writes a
 * `transactions` row as `pending` or `entropy_pending` before it waits on
 * anything. One row per operation, so one stuck operation is one line.
 *
 * **Cards are listed only when their transaction is not pending.** A card
 * still marked in flight while its transaction is pending is the same problem
 * seen twice. A card still in flight while its transaction says confirmed, or
 * has no transaction at all, is the worse problem: the record has already
 * declared success. That is exactly how the stuck purchase hid — the sweep
 * marked the row confirmed while the card and the money both disagreed.
 *
 * Reads the database only. It has to keep working when the chain does not,
 * because a dead RPC is precisely when things pile up in flight.
 *
 * No user identifiers in the output: the admin console is public (ADR-032).
 */

export const STUCK_AFTER_MINUTES = 10;
const MAX_ROWS = 50;

export type InFlightRow = {
  source: "transaction" | "card";
  kind: string;
  status: string;
  cardId: string | null;
  tokenId: number | null;
  txHash: string | null;
  ageMinutes: number;
};

export type InFlightReport = {
  checkedAt: string;
  stuckAfterMinutes: number;
  inFlight: number;
  stuck: number;
  rows: InFlightRow[];
};

const TX_KIND: Record<string, string> = {
  mint: "Mint",
  sold: "Marketplace purchase",
  dismantled: "Dismantle",
  print: "Print request",
  redeem: "Redeem",
  privy_export: "Export to own wallet",
  privy_import: "Import from own wallet",
  privy_send: "Send out of Gachard",
};

function minutesSince(value: unknown, now: number): number {
  const t = value ? new Date(value as string).getTime() : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 60000)) : 0;
}

/** Which in-flight state a card is in, or null if it is settled. */
function cardKind(card: Record<string, unknown>): string | null {
  if (card.status === "pending") return card.pendingBuyerId ? "Marketplace purchase" : "Mint";
  if (card.exportPending === true) return "Export to own wallet";
  if (card.importTxId && !card.importTxHash) return "Import from own wallet";
  if (card.releaseTxId && !card.releaseTxHash) return "Send out of Gachard";
  return null;
}

export async function findInFlight(now = Date.now()): Promise<InFlightReport> {
  const txCol = await getCollection("transactions");
  const cardsCol = await getCollection("cards");

  const txs = await txCol
    .find({ status: { $in: ["pending", "entropy_pending"] } })
    .project({ type: 1, status: 1, tokenId: 1, tokenIds: 1, txHash: 1, privyTxId: 1, createdAt: 1 })
    .toArray();

  // What a pending transaction already accounts for, so the card behind it
  // is not listed a second time.
  const pendingTxIds = new Set(txs.map((t) => t._id.toString()));
  const pendingHashes = new Set(txs.map((t) => t.txHash).filter(Boolean) as string[]);
  const pendingPrivyIds = new Set(txs.map((t) => t.privyTxId).filter(Boolean) as string[]);
  const pendingTokenIds = new Set<number>();
  for (const t of txs) {
    if (typeof t.tokenId === "number") pendingTokenIds.add(t.tokenId);
    for (const id of (t.tokenIds as unknown[] | undefined) ?? []) if (typeof id === "number") pendingTokenIds.add(id);
  }

  const cards = await cardsCol
    .find({
      $or: [
        { status: "pending" },
        { exportPending: true },
        { importTxId: { $exists: true, $nin: [null, ""] }, importTxHash: { $exists: false } },
        { releaseTxId: { $exists: true, $nin: [null, ""] }, releaseTxHash: { $exists: false } },
      ],
    })
    .project({
      cardId: 1, tokenId: 1, status: 1, txId: 1, updatedAt: 1, createdAt: 1,
      pendingBuyerId: 1, pendingTxHash: 1, exportPending: 1,
      importTxId: 1, importTxHash: 1, releaseTxId: 1, releaseTxHash: 1,
    })
    .toArray();

  const rows: InFlightRow[] = txs.map((t) => ({
    source: "transaction",
    kind: TX_KIND[t.type as string] ?? String(t.type),
    status: t.status as string,
    cardId: null,
    tokenId: typeof t.tokenId === "number" ? t.tokenId : null,
    txHash: (t.txHash as string) || null,
    ageMinutes: minutesSince(t.createdAt, now),
  }));

  for (const c of cards) {
    const kind = cardKind(c);
    if (!kind) continue;
    const covered =
      (c.txId && pendingTxIds.has(String(c.txId))) ||
      (c.pendingTxHash && pendingHashes.has(String(c.pendingTxHash))) ||
      (c.importTxId && pendingPrivyIds.has(String(c.importTxId))) ||
      (c.releaseTxId && pendingPrivyIds.has(String(c.releaseTxId))) ||
      (typeof c.tokenId === "number" && pendingTokenIds.has(c.tokenId));
    if (covered) continue;
    rows.push({
      source: "card",
      kind,
      status: String(c.status),
      cardId: (c.cardId as string) ?? null,
      tokenId: typeof c.tokenId === "number" ? c.tokenId : null,
      txHash: (c.pendingTxHash as string) || null,
      ageMinutes: minutesSince(c.updatedAt ?? c.createdAt, now),
    });
  }

  rows.sort((a, b) => b.ageMinutes - a.ageMinutes);
  const stuck = rows.filter((r) => r.ageMinutes >= STUCK_AFTER_MINUTES);

  return {
    checkedAt: new Date(now).toISOString(),
    stuckAfterMinutes: STUCK_AFTER_MINUTES,
    inFlight: rows.length,
    stuck: stuck.length,
    rows: stuck.slice(0, MAX_ROWS),
  };
}
