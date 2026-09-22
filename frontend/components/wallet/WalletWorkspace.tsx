"use client";

/**
 * What the user's own wallet holds, and what can be done with it (ADR-031).
 *
 * Split out of /collection deliberately. The collection is the consumer
 * surface and ADR-002 says it stays free of wallet actions; this page is
 * where a user who wants control goes, and it is allowed to be explicit.
 *
 * Choosing which cards to move lives on /wallet/move, not here. The cards
 * already in the wallet are the point of this page, and a second grid of
 * candidates above them meant neither read as the main list.
 *
 * Mounts its own PrivyProvider, the same island pattern as /profile, so the
 * SDK never loads on pack opening or anywhere else.
 *
 * Presentation uses the shared vocabulary rather than one-off styling: the
 * violet eyebrow that heads every section in the app, .glass for surfaces,
 * .card-surface with .glass-hover for settings panels, CardFrame for cards
 * so they match /collection exactly, .chip for state, .form-field
 * for inputs, and the rarity tokens for card frames. Irreversible actions
 * are the one deliberate deviation: aurora-pink, used nowhere else on this
 * page, so "this cannot be undone" registers before the label is read.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import WalletHistory from "./WalletHistory";
import Image from "next/image";
import Link from "next/link";
import {
  getAccessToken,
  PrivyProvider,
  useExportWallet,
  usePrivy,
  useSigners,
  useWallets,
} from "@privy-io/react-auth";
import { privyConfig } from "@/lib/privy-config";
import {
  CardFrame,
  Eyebrow,
  PrivyMark,
  TransferDialog,
  WalletAddress,
  MoveCardsBanner,
  EXPLORER,
  MAX_RETURN_BATCH,
  type WalletCard,
} from "./shared";

const SIGNER_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID ?? "";


/**
 * Whether to offer "Reveal private key".
 *
 * Off for now, by request. Kept as a flag rather than deleted because the
 * capability itself is the point of ADR-028's amendment — the wallet is the
 * user's and they can walk away with it — and because a revealed key cannot be
 * un-revealed, so this is a switch worth being able to find and flip
 * deliberately rather than a feature to rewrite later from memory.
 */
const SHOW_KEY_EXPORT = false;

function Workspace() {
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const { addSigners, removeSigners } = useSigners();
  const { exportWallet } = useExportWallet();

  const [cards, setCards] = useState<WalletCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // The card being transferred out. The destination lives in the dialog, which
  // is the only place it is ever typed.
  const [transferring, setTransferring] = useState<WalletCard | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const embedded = wallets.find((w) => w.walletClientType === "privy");
  const address = embedded?.address ?? null;

  const delegated = useMemo(
    () =>
      (user?.linkedAccounts ?? []).some((a) => {
        const w = a as { type?: string; walletClientType?: string; delegated?: boolean };
        return w.type === "wallet" && w.walletClientType === "privy" && w.delegated === true;
      }),
    [user]
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cards", { credentials: "include" });
      const body = await res.json().catch(() => null);
      const all: WalletCard[] = body?.cards ?? body ?? [];
      const held = all.filter((c) => c.displayStatus === "In Your Wallet");
      setCards(held);

      // A selection can outlive the card it points at — a refresh after a
      // return, or a transfer made in another tab. Left alone, Return would
      // offer to send back a card that is not here and fail one request per
      // ghost. Identity is preserved when nothing was dropped, so a refresh
      // that changes nothing does not re-render the grid.
      const present = new Set(held.map((c) => c.cardId ?? String(c.tokenId)));
      setPicked((prev) => {
        const kept = [...prev].filter((id) => present.has(id));
        return kept.length === prev.size ? prev : new Set(kept);
      });
    } catch {
      /* the page still renders without the list */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Reload the list on demand.
   *
   * Privy settles sponsored transfers asynchronously, so a card can arrive or
   * leave seconds after the page rendered and nothing here would know. The
   * only way to find out was to reload the whole page, which also logs the
   * Privy session back in and costs a few seconds.
   *
   * `loading` is deliberately not reused: it swaps the grid for the word
   * "Loading…", so a refresh would make the cards disappear and come back.
   * The list stays on screen and only the button says anything.
   */
  const refresh = useCallback(async () => {
    if (refreshing || busy !== null) return;
    setRefreshing(true);
    setErr(null);
    setNote(null);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load, refreshing, busy]);


  // This page has its own Privy login, so it has to bind too. Otherwise a
  // user who never opens /profile is connected here but unknown to the
  // server, and every action fails with "no self-custody wallet on file".
  //
  // The server derives the identity from this token; nothing about the
  // wallet is asserted from the browser (ADR-031).
  const [bound, setBound] = useState(false);
  useEffect(() => {
    if (!ready || !authenticated || !address || bound) return;
    let cancelled = false;
    (async () => {
      try {
        const authToken = await getAccessToken();
        if (!authToken || cancelled) return;
        const res = await fetch("/api/user/privy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ authToken }),
        });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) setErr(body?.error ?? "Could not connect this wallet.");
        else setBound(true);
      } catch {
        if (!cancelled) setErr("Could not connect this wallet.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, address, bound]);

  const act = useCallback(
    async (key: string, run: () => Promise<Response>, okNote: string): Promise<boolean> => {
      setBusy(key);
      setErr(null);
      setNote(null);
      try {
        const res = await run();
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "That did not work.");
        setNote(okNote);
        await load();
        return true;
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Something went wrong.");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [load]
  );

  const post = (path: string, payload: unknown) => () =>
    fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

  /**
   * Return the selected cards, one request each.
   *
   * No signature here, unlike moving out: the wallet already delegated to
   * Gachard, which is what lets the server send on the user's behalf. So a
   * batch needs no batched signature — only a selection.
   *
   * Sequential, but a failure no longer stops the run. These cards are
   * independent of each other, and the first version broke on the first
   * refusal — so one card whose claim never settled blocked two perfectly
   * returnable ones behind it, and the user saw a message about a card they
   * had not singled out. Stopping is right for dependent steps and wrong for a
   * list of separate ones. Both counts are reported instead.
   *
   * Privy's sponsorship settles asynchronously, so /api/cards is re-read once
   * at the end rather than after every card.
   */
  /**
   * Finish a claim that never settled.
   *
   * Export sends a sponsored claim from the user's wallet, and import refuses a
   * card without a confirmed one. A card whose claim was never sent — an older
   * export, or one whose call failed — could therefore never come back, and
   * nothing on the page said so or offered a way out. It could only be
   * transferred away, which is a strange thing to corner someone into.
   */
  const finishClaim = useCallback(
    async (card: WalletCard) => {
      const id = card.cardId ?? String(card.tokenId);
      setClaiming(id);
      setErr(null);
      setNote(null);
      try {
        const res = await fetch("/api/privy/export/claim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cardId: card.cardId }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "Could not finish the claim.");

        // Sponsorship settles asynchronously, so the claim is confirmed by
        // asking rather than assuming.
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const st = await fetch(`/api/privy/status/${card.cardId}`);
          const stBody = await st.json().catch(() => null);
          if (stBody?.claimStatus === "confirmed" || stBody?.settled) {
            setNote("Claim finished. This card can be returned now.");
            await load();
            return;
          }
          if (stBody?.claimStatus === "failed") {
            throw new Error("The claim did not go through. Please try again.");
          }
        }
        setNote("The claim is still settling. Refresh in a moment.");
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not finish the claim.");
      } finally {
        setClaiming(null);
      }
    },
    [load]
  );

  const returnSelected = useCallback(async () => {
    const chosen = cards.filter((c) => picked.has(c.cardId ?? String(c.tokenId)));
    if (chosen.length === 0) return;

    setBusy("return-batch");
    setErr(null);
    setNote(null);
    let done = 0;
    const skipped: string[] = [];

    for (const [i, card] of chosen.entries()) {
      setReturnNote(`Returning card ${i + 1} of ${chosen.length}…`);
      try {
        const res = await fetch("/api/privy/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cardId: card.cardId }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "That did not work.");
        done++;
      } catch (e) {
        const why = e instanceof Error ? e.message : "Something went wrong.";
        skipped.push(`${card.cardId ?? card.tokenId}: ${why}`);
      }
    }

    setBusy(null);
    setReturnNote(null);
    setPicked(new Set());
    if (done > 0) {
      setNote(
        `${done} card${done === 1 ? "" : "s"} on the way back to your collection.`
      );
    }
    // Named, not counted. "1 card was skipped" leaves the user hunting for
    // which one and why.
    if (skipped.length > 0) {
      setErr(
        `Left behind — ${skipped.join("; ")}`
      );
    }
    await load();
  }, [cards, picked, load]);

  if (!ready) {
    return (
      <div className="glass p-6 max-w-xl">
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          Loading…
        </p>
      </div>
    );
  }

  if (!authenticated || !address) {
    return (
      <div className="glass p-6 sm:p-8 max-w-xl" data-testid="wallet-setup-card">
        <Eyebrow>Get started</Eyebrow>
        <h2 className="text-lg mb-2" style={{ fontFamily: "var(--font-display)" }}>
          A wallet only you control
        </h2>
        <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--text-tertiary)" }}>
          Your cards can move into it and back out again, and you can take them anywhere you
          like. Nothing changes for the rest of Gachard.
        </p>
        <button onClick={login} className="btn-primary !py-2.5 !px-6 !text-xs" data-testid="wallet-setup">
          Set up
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* The way in, before the things it fills. See wallet/shared.tsx. */}
      <MoveCardsBanner />

      {/*
        Two columns on wide screens. The settings-shaped blocks are narrow by
        nature and the cards are the reason to be here, so the cards take the
        larger side; a single centred column left most of the viewport empty.
        Stacks in reading order on small screens: who you are, what Gachard
        may do, then your cards.
      */}
      <div className="grid gap-6 items-start lg:grid-cols-[21rem_minmax(0,1fr)]">
        <div className="space-y-6">
        {/* Identity */}
        <section className="glass p-6" data-testid="wallet-identity">
          <Eyebrow
            right={
              <a
                href={`${EXPLORER}${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[0.7rem] transition-all hover:brightness-125"
                style={{ color: "var(--electric-blue)" }}
              >
                Explorer ↗
              </a>
            }
          >
            Your wallet
          </Eyebrow>
          <WalletAddress address={address} />
          {/* Who actually holds this. It is the question the page exists to
              answer and, until now, the one page in the app that did not name
              anyone — the footer credits Monad and /profile credits Privy.
              Below the address rather than beside the heading, where it would
              compete with the explorer link. */}
          <div className="mt-3 flex justify-end">
            <PrivyMark />
          </div>
        </section>

        {/* Permission */}
        <section className="glass p-6" data-testid="wallet-access">
          <Eyebrow
            right={
              <span
                className="chip !py-1 !px-3 !text-[0.6rem]"
                style={{
                  borderColor: delegated ? "rgba(0,204,255,0.3)" : "rgba(255,196,102,0.3)",
                  color: delegated ? "var(--electric-blue)" : "var(--aurora-gold)",
                }}
                data-testid="delegation-state"
              >
                <span
                  className="chip-dot"
                  style={{
                    background: delegated ? "var(--electric-blue)" : "var(--aurora-gold)",
                    boxShadow: `0 0 8px ${delegated ? "var(--electric-blue)" : "var(--aurora-gold)"}`,
                  }}
                />
                {delegated ? "Allowed" : "Not allowed"}
              </span>
            }
          >
            Gachard access
          </Eyebrow>
          <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-tertiary)" }}>
            {delegated
              ? "Gachard can move cards in this wallet on your behalf, which is what lets a card come back to your collection. Withdraw it whenever you like."
              : "Allow Gachard to move cards in this wallet, so a card you take out can be returned later. Without it, a card that leaves cannot come back."}
          </p>
          {!SIGNER_ID && (
            <p className="text-xs mb-3" style={{ color: "var(--aurora-pink)" }}>
              Not configured on this deployment.
            </p>
          )}
          <button
            onClick={async () => {
              setBusy("perm");
              setErr(null);
              setNote(null);
              try {
                if (delegated) {
                  await removeSigners({ address });
                  setNote("Access withdrawn.");
                } else {
                  await addSigners({ address, signers: [{ signerId: SIGNER_ID }] });
                  setNote("Access granted.");
                }
              } catch (e) {
                console.error("[privy] permission change failed:", e);
                setErr(e instanceof Error ? e.message : "Could not change access.");
              } finally {
                setBusy(null);
              }
            }}
            disabled={busy !== null || !SIGNER_ID}
            className={`${delegated ? "btn-ghost" : "btn-primary"} !py-2.5 !px-6 !text-xs disabled:opacity-50`}
            data-testid="delegation-toggle"
          >
            {busy === "perm" ? "…" : delegated ? "Withdraw access" : "Allow"}
          </button>
        </section>

        </div>

        {/* The main list: what this wallet actually holds. */}
        <section data-testid="wallet-cards">
          <Eyebrow
            right={
              <span className="flex items-center gap-3">
                {cards.length > 0 && (
                  <span className="text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>
                    {picked.size > 0
                      ? `${picked.size} of ${cards.length} selected`
                      : `${cards.length} ${cards.length === 1 ? "card" : "cards"}`}
                  </span>
                )}
                {/* Shown even when the list is empty — an empty wallet is
                    exactly when someone is waiting for a card to land. */}
                <button
                  onClick={refresh}
                  disabled={refreshing || busy !== null}
                  className="flex items-center gap-1.5 text-[0.65rem] px-2 py-1 rounded-lg transition-all disabled:opacity-40"
                  style={{
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-tertiary)",
                  }}
                  title="Check for cards that have arrived or left since this page loaded"
                  data-testid="wallet-refresh"
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className={refreshing ? "animate-spin" : undefined}
                    aria-hidden="true"
                  >
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                    <path d="M21 3v6h-6" />
                  </svg>
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              </span>
            }
          >
            Cards in this wallet
          </Eyebrow>

          {loading ? (
            <div className="glass p-6">
              <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                Loading…
              </p>
            </div>
          ) : cards.length === 0 ? (
            <div className="glass p-8 text-center">
              <p className="text-3xl mb-3" style={{ color: "var(--border-strong)" }}>
                ◆
              </p>
              <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                None yet. Choose cards above to bring some here.
              </p>
            </div>
          ) : (
            <>
              <ul className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                {cards.map((c) => {
                  const id = c.cardId ?? String(c.tokenId);
                  const on = picked.has(id);
                  return (
                    <CardFrame
                      key={id}
                      card={c}
                      selected={on}
                      disabled={busy !== null}
                      testIdPrefix="wallet-card"
                      onToggle={() =>
                        setPicked((s) => {
                          const next = new Set(s);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        })
                      }
                    >
                      {/* Irreversible, so it is set apart by a rule rather than
                          sitting flush with the reversible action above it. The
                          address is asked for in the dialog, not left sitting
                          open on every tile where a stray paste is one click
                          from permanent. */}
                      {c.exportClaimStatus !== "confirmed" && (
                        <div
                          className="mt-2 px-1 py-2 rounded-lg"
                          style={{
                            background: "rgba(255,196,102,0.07)",
                            border: "1px solid rgba(255,196,102,0.22)",
                          }}
                          data-testid={`wallet-unclaimed-${c.tokenId}`}
                        >
                          <p className="text-[0.6rem] leading-relaxed px-1 mb-1.5" style={{ color: "var(--text-tertiary)" }}>
                            This card was never claimed, so it cannot be returned yet.
                          </p>
                          <button
                            onClick={() => finishClaim(c)}
                            disabled={busy !== null || claiming !== null}
                            className="w-full py-1.5 text-[0.62rem] rounded-lg transition-all disabled:opacity-40"
                            style={{
                              background: "rgba(255,196,102,0.12)",
                              border: "1px solid rgba(255,196,102,0.35)",
                              color: "var(--aurora-gold)",
                            }}
                            data-testid={`wallet-finish-claim-${c.tokenId}`}
                          >
                            {claiming === id ? "Finishing…" : "Finish claiming"}
                          </button>
                        </div>
                      )}

                      <div className="mt-2 pt-2 px-1" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <button
                          onClick={() => setTransferring(c)}
                          disabled={busy !== null}
                          className="w-full py-2 text-[0.62rem] rounded-xl transition-all disabled:opacity-40"
                          style={{
                            background: "rgba(255,107,186,0.12)",
                            border: "1px solid rgba(255,107,186,0.35)",
                            color: "var(--aurora-pink)",
                          }}
                          data-testid={`wallet-transfer-${c.tokenId}`}
                        >
                          {busy === `send-${id}` ? "Transferring…" : "Transfer"}
                        </button>
                      </div>
                    </CardFrame>
                  );
                })}
              </ul>
              <div
                className="sticky bottom-4 glass mt-4 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                data-testid="wallet-return-bar"
              >
                <p className="text-[0.7rem]" style={{ color: "var(--text-tertiary)" }}>
                  {returnNote ??
                    (picked.size === 0
                      ? "Pick the cards you want back in your collection."
                      : picked.size > MAX_RETURN_BATCH
                        ? `Up to ${MAX_RETURN_BATCH} at a time.`
                        : "They become printable, listable and tradable again.")}
                </p>
                <div className="flex items-center gap-2">
                  {picked.size > 0 && busy === null && (
                    <button
                      onClick={() => setPicked(new Set())}
                      className="btn-ghost !py-2 !px-3 !text-[0.65rem]"
                      data-testid="wallet-return-clear"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={returnSelected}
                    disabled={picked.size === 0 || picked.size > MAX_RETURN_BATCH || busy !== null}
                    className="btn-primary !py-2 !px-5 !text-[0.68rem] disabled:opacity-40"
                    data-testid="wallet-return-selected"
                  >
                    {busy === "return-batch"
                      ? "Returning…"
                      : picked.size === 0
                        ? "Return to Gachard"
                        : `Return ${picked.size} ${picked.size === 1 ? "card" : "cards"}`}
                  </button>
                </div>
              </div>
              <p className="text-[0.65rem] mt-3" style={{ color: "var(--text-tertiary)" }}>
                Transferring a card elsewhere is permanent. Gachard cannot bring it back.
              </p>
            </>
          )}
        </section>

      </div>

      {/* Full width, below the cards. It is a reference table rather than
          something to act on, so it sits after everything actionable and
          before the destructive block at the foot. */}
      <WalletHistory />

      {/* Full control. Full width rather than in the sidebar: on a phone it
          would otherwise sit between the access card and the cards, putting a
          destructive action in the middle of the reading path. */}
      {SHOW_KEY_EXPORT && (
      <section
        className="glass p-6"
        style={{ borderColor: "rgba(255,107,186,0.18)" }}
        data-testid="wallet-full-control"
      >
        <Eyebrow>Take full control</Eyebrow>
        <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-tertiary)" }}>
          Reveal this wallet&apos;s private key to use it in another app. Anyone who has it owns
          the wallet, so keep it to yourself. Gachard never sees it.
        </p>
        <button
          onClick={() => exportWallet({ address })}
          disabled={busy !== null}
          className="py-2.5 px-6 text-xs rounded-xl transition-all disabled:opacity-50"
          style={{
            background: "rgba(255,107,186,0.12)",
            border: "1px solid rgba(255,107,186,0.35)",
            color: "var(--aurora-pink)",
          }}
          data-testid="wallet-export-key"
        >
          Reveal private key
        </button>
      </section>
      )}

      {transferring && (
        <TransferDialog
          card={transferring}
          busy={busy !== null}
          onCancel={() => setTransferring(null)}
          onConfirm={async (to) => {
            const card = transferring;
            const id = card.cardId ?? String(card.tokenId);
            const sent = await act(
              `send-${id}`,
              post("/api/privy/send", { cardId: card.cardId, to }),
              "Transferred. This card has left Gachard for good."
            );
            // On failure the dialog stays open with the address still typed,
            // so the attempt can be corrected rather than started over.
            if (!sent) return;
            setTransferring(null);
          }}
        />
      )}

      {(note || err) && (
        <div
          className="card-surface px-4 py-3"
          style={{ borderColor: err ? "rgba(255,107,186,0.35)" : "rgba(0,204,255,0.3)" }}
        >
          <p
            className="text-xs"
            style={{ color: err ? "var(--aurora-pink)" : "var(--electric-blue)" }}
            data-testid={err ? "wallet-error" : "wallet-note"}
          >
            {err ?? note}
          </p>
        </div>
      )}
    </div>
  );
}

export default function WalletWorkspace() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return null;

  return (
    <PrivyProvider
      appId={appId}
      config={privyConfig}
    >
      <Workspace />
    </PrivyProvider>
  );
}
