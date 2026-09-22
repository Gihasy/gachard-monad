"use client";

/**
 * What this wallet has sent and received.
 *
 * Modelled on the Transaction History table on /profile — same glass surface,
 * same sticky header, same capped height so a long list does not push the rest
 * of the page away — but answering a different question. The profile table is
 * the account's ledger and is mostly packs, prints and dismantles. This one is
 * the wallet's, and carries the two columns that table leaves off: a direction,
 * and the transaction hash.
 *
 * The hash is the point of the whole section. Everything else here is Gachard
 * telling you what Gachard did; the hash is the part you can check without
 * taking our word for it, so it links straight out to the explorer.
 *
 * The scope note at the foot is not boilerplate. These rows come from Gachard's
 * database, not from the chain, so a token that arrived from outside the app
 * will not appear — and a wallet page that silently omitted it would be
 * claiming to be a block explorer. Saying what is counted is cheaper than
 * indexing every token the address has ever touched, and more honest than
 * leaving the reader to assume.
 */
import { useCallback, useEffect, useState } from "react";
import { Eyebrow } from "./shared";
import { friendlyTxType } from "@/lib/status-map";

const EXPLORER_TX = "https://testnet.monadvision.com/tx/";

/** Rows visible before the list starts scrolling. */
const VISIBLE_ROWS = 6;
const ROW_PX = 49;
const HEAD_PX = 41;

type HistoryRow = {
  id: string;
  type: string;
  direction: "in" | "out" | null;
  tokenId: number | null;
  cardId: string | null;
  txHash: string | null;
  counterparty: string | null;
  status: string;
  createdAt: string;
};

function short(hash: string) {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

/**
 * In, out, or neither.
 *
 * `null` is rendered rather than hidden or guessed. A row whose addresses match
 * this wallet in neither direction is a record worth seeing — it means
 * something wrote a wallet transaction that does not name the wallet, and
 * quietly labelling it "out" would bury that.
 */
function DirectionChip({ direction }: { direction: "in" | "out" | null }) {
  const style =
    direction === "in"
      ? { background: "rgba(0,255,136,0.12)", color: "#00ff88", border: "1px solid rgba(0,255,136,0.25)" }
      : direction === "out"
        ? { background: "rgba(255,196,102,0.12)", color: "var(--aurora-gold)", border: "1px solid rgba(255,196,102,0.25)" }
        : { background: "rgba(184,172,255,0.10)", color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" };

  return (
    <span
      className="text-[0.6rem] uppercase tracking-widest px-2 py-0.5 rounded"
      style={style}
      data-testid={`wallet-history-direction-${direction ?? "unknown"}`}
    >
      {direction === "in" ? "In" : direction === "out" ? "Out" : "—"}
    </span>
  );
}

export default function WalletHistory() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/privy/history", { credentials: "include" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Could not load this wallet's history.");
        return;
      }
      setRows(body?.transactions ?? []);
      setError(null);
    } catch {
      setError("Could not load this wallet's history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return null;

  return (
    <section data-testid="wallet-history">
      <Eyebrow
        right={
          rows.length > VISIBLE_ROWS ? (
            <span className="text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>
              {VISIBLE_ROWS} of {rows.length} shown, scroll for more
            </span>
          ) : undefined
        }
      >
        Wallet activity
      </Eyebrow>

      {error ? (
        <div className="glass p-6" data-testid="wallet-history-error">
          <p className="text-sm" style={{ color: "var(--aurora-pink)" }}>
            {error}
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="glass p-8 text-center" data-testid="wallet-history-empty">
          <p className="text-3xl mb-3" style={{ color: "var(--border-strong)" }}>
            ◆
          </p>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            Nothing has moved yet. Cards you send here, and cards you send back, will be listed
            with the transaction that carried them.
          </p>
        </div>
      ) : (
        <div className="glass overflow-hidden">
          <div
            className="overflow-x-auto overflow-y-auto"
            style={{ maxHeight: `calc(${ROW_PX}px * ${VISIBLE_ROWS} + ${HEAD_PX}px)` }}
            data-testid="wallet-history-scroll"
          >
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b border-white/[0.06] sticky top-0 z-10"
                  style={{ background: "rgba(13,13,26,0.96)", backdropFilter: "blur(8px)" }}
                >
                  <th className="text-left px-4 py-3 text-[0.65rem] uppercase tracking-widest text-white/40 font-medium">
                    Direction
                  </th>
                  <th className="text-left px-4 py-3 text-[0.65rem] uppercase tracking-widest text-white/40 font-medium">
                    Action
                  </th>
                  <th className="text-left px-4 py-3 text-[0.65rem] uppercase tracking-widest text-white/40 font-medium">
                    Card
                  </th>
                  <th className="text-left px-4 py-3 text-[0.65rem] uppercase tracking-widest text-white/40 font-medium">
                    Transaction
                  </th>
                  <th className="text-left px-4 py-3 text-[0.65rem] uppercase tracking-widest text-white/40 font-medium">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-[0.65rem] uppercase tracking-widest text-white/40 font-medium">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                    data-testid={`wallet-history-row-${tx.id}`}
                  >
                    <td className="px-4 py-3">
                      <DirectionChip direction={tx.direction} />
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                      {friendlyTxType(tx.type)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {tx.cardId ? `#${tx.cardId}` : tx.tokenId !== null ? `#${tx.tokenId}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {tx.txHash ? (
                        <a
                          href={`${EXPLORER_TX}${tx.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="transition-colors hover:brightness-125"
                          style={{ color: "var(--electric-blue)" }}
                          title={tx.txHash}
                          data-testid={`wallet-history-hash-${tx.id}`}
                        >
                          {short(tx.txHash)}
                        </a>
                      ) : (
                        // No hash means nothing was sent on chain for this row
                        // — a movement Gachard recorded but the network never
                        // saw. Worth showing as absent rather than blank.
                        <span style={{ color: "var(--text-tertiary)" }}>Off chain</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-[0.6rem] uppercase tracking-widest px-2 py-0.5 rounded"
                        style={
                          tx.status === "Success"
                            ? { background: "rgba(0,255,136,0.12)", color: "#00ff88" }
                            : tx.status === "Failed"
                              ? { background: "rgba(255,107,186,0.12)", color: "var(--aurora-pink)" }
                              : { background: "rgba(255,196,102,0.12)", color: "var(--aurora-gold)" }
                        }
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>
                      {new Date(tx.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[0.65rem] mt-3" style={{ color: "var(--text-tertiary)" }}>
        Cards from the Gachard ecosystem only. This is what Gachard moved on your behalf, not
        everything the address has ever touched — a token sent here from outside the app will not
        appear.
      </p>
    </section>
  );
}
