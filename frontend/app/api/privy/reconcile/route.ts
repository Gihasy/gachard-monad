/**
 * Check this user's cards against the chain, on request.
 *
 * `/api/cards` already reconciles, but narrowly and on a 2.5-second leash: it
 * looks only at cards that are visibly mid-flight, because it runs on every
 * page load and a broad scan there once took 13-16 seconds while /collection
 * gives up after six (ADR-018, and the comment in that route).
 *
 * That narrow scan cannot find a card that moved without Gachard's knowledge —
 * a token transferred into the wallet from an outside address, say. There is
 * no Privy transaction id and no pending row to key off; the chain is the only
 * record. Widening the page-load query is not the answer, because released
 * cards accumulate forever and every one of them would cost an RPC read on
 * every request.
 *
 * So this is the deliberate version: the user pressed Refresh, which is a
 * statement that they expect something to have changed. Scoped to their own
 * cards, bounded, and rate limited.
 *
 * It only ever moves MongoDB towards what the chain already says and never
 * sends a transaction, so it cannot spend sponsorship budget or make anything
 * worse.
 */
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { reconcileExportedCards } from "@/lib/privy-reconcile";

export const maxDuration = 10;

/**
 * Each candidate costs at least one RPC read, and this has ten seconds. Ten
 * cards is comfortably inside that and covers any realistic wallet; a user
 * with more can press Refresh again.
 */
const LIMIT = 10;

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user._id.toString();

    const rate = await checkRateLimit(userId, "privy_reconcile");
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Checking too often. Try again in a minute." },
        { status: 429, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    if (!user.walletAddress) {
      return NextResponse.json(
        { changed: 0, results: [] },
        { headers: { "Cache-Control": "no-store, private" } }
      );
    }

    const results = await reconcileExportedCards(LIMIT, user.walletAddress);

    return NextResponse.json(
      {
        changed: results.filter((r) => r.changed).length,
        // The reasons are the useful part when something looks wrong, and they
        // name only this user's own cards.
        results,
      },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    console.error("[privy/reconcile]", error);
    return NextResponse.json(
      { error: "Could not check your cards against the chain." },
      { status: 500, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}
