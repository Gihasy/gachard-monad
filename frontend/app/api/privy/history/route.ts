/**
 * What this wallet has sent and received, as Gachard recorded it.
 *
 * `/profile` already shows a transaction history, but it shows the account's:
 * packs opened, print requests, dismantles. Most of those never touch the
 * self-custody wallet. This route answers the narrower question the wallet page
 * asks — what came in, what went out — and adds the two things the profile
 * table deliberately leaves off: the transaction hash, and a direction.
 *
 * **Direction is derived, not hardcoded per type.** `privy_export` happens to
 * mean "in" today and `privy_import` "out", but that mapping is a fact about
 * this wallet's address appearing in `toAddress` or `fromAddress`, and reading
 * it from the addresses keeps the answer right if a type is added later or a
 * row is written by a path nobody remembers. A row that names the address in
 * neither field is reported as `null` rather than guessed at.
 *
 * **What this cannot see, and why the page says so.** These are Gachard's own
 * records, not the chain. A card minted by Gachard and moved by Gachard is
 * here; an NFT somebody airdropped to this address is not, and neither is a
 * transfer made from outside the app. Reading the wallet's full on-chain
 * history would mean indexing every token it has ever touched, which is a
 * different feature from this one. The honest scope is "cards from the Gachard
 * ecosystem", and the page states that rather than implying completeness.
 */
import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import { generateInvoiceId } from "@/lib/invoice";

/** Every type that moves a card into or out of the self-custody wallet. */
const WALLET_TYPES = ["privy_export", "privy_import", "privy_send"];

const LIMIT = 50;

type Direction = "in" | "out" | null;

function sameAddress(a: unknown, b: string): boolean {
  // Addresses are stored as they arrived, so casing varies between rows:
  // `toAddress` is checksummed, `fromAddress` is sometimes a word like
  // "vault". A case-sensitive compare silently reported every row as null.
  return typeof a === "string" && a.toLowerCase() === b.toLowerCase();
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const wallet: string | undefined = user.privyWalletAddress;
    if (!wallet) {
      // No wallet connected yet. An empty list, not an error — the page can
      // render its own "nothing here" state without special-casing a failure.
      return NextResponse.json(
        { walletAddress: null, transactions: [] },
        { headers: { "Cache-Control": "no-store, private" } }
      );
    }

    const txCollection = await getCollection("transactions");
    const cardsCollection = await getCollection("cards");

    const txs = await txCollection
      .find({ userId: user._id.toString(), type: { $in: WALLET_TYPES } })
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .toArray();

    // Resolve tokenId → cardId in one query rather than per row. A card the
    // user has since dismantled will not resolve, and the row falls back to
    // its tokenId rather than disappearing.
    const tokenIds = [
      ...new Set(
        txs.flatMap((tx) => {
          const ids: number[] = [];
          if (typeof tx.tokenId === "number") ids.push(tx.tokenId);
          if (Array.isArray(tx.tokenIds)) {
            for (const t of tx.tokenIds) if (typeof t === "number") ids.push(t);
          }
          return ids;
        })
      ),
    ];

    const tokenToCard = new Map<number, string>();
    if (tokenIds.length > 0) {
      const cards = await cardsCollection
        .find({ tokenId: { $in: tokenIds } })
        .project({ tokenId: 1, cardId: 1 })
        .toArray();
      for (const c of cards) {
        if (typeof c.tokenId === "number" && c.cardId) tokenToCard.set(c.tokenId, c.cardId);
      }
    }

    const transactions = txs.map((tx) => {
      let direction: Direction = null;
      if (sameAddress(tx.toAddress, wallet)) direction = "in";
      else if (sameAddress(tx.fromAddress, wallet)) direction = "out";

      // The other end of the movement — Gachard's custody wallet, or an
      // address the user chose. Shown so "out" is not just a word.
      const counterparty =
        direction === "in"
          ? (tx.fromAddress ?? null)
          : direction === "out"
            ? (tx.toAddress ?? null)
            : null;

      const tokenId = typeof tx.tokenId === "number" ? tx.tokenId : null;

      return {
        id: generateInvoiceId(tx._id.toString()),
        type: tx.type,
        direction,
        tokenId,
        cardId: tokenId !== null ? (tokenToCard.get(tokenId) ?? null) : null,
        txHash: tx.txHash ?? null,
        counterparty,
        status:
          tx.status === "confirmed"
            ? "Success"
            : tx.status === "failed"
              ? "Failed"
              : "Processing",
        createdAt: tx.createdAt,
      };
    });

    return NextResponse.json(
      { walletAddress: wallet, transactions },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    console.error("[privy/history]", error);
    return NextResponse.json(
      { error: "Could not load this wallet's history." },
      { status: 500, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}
