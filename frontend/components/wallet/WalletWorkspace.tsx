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
 * .card-surface with .glass-hover for tiles, .chip for state, .form-field
 * for inputs, and the rarity tokens for card frames. Irreversible actions
 * are the one deliberate deviation: aurora-pink, used nowhere else on this
 * page, so "this cannot be undone" registers before the label is read.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
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
  Eyebrow,
  EXPLORER,
  MAX_RETURN_BATCH,
  RARITY,
  RARITY_COLORS,
  RARITY_GLOW,
  type WalletCard,
} from "./shared";

const SIGNER_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID ?? "";

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
  const [sendTo, setSendTo] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [returnNote, setReturnNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
      setCards(all.filter((c) => c.displayStatus === "In Your Wallet"));
    } catch {
      /* the page still renders without the list */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);


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
    async (key: string, run: () => Promise<Response>, okNote: string) => {
      setBusy(key);
      setErr(null);
      setNote(null);
      try {
        const res = await run();
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "That did not work.");
        setNote(okNote);
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Something went wrong.");
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
   * Sequential, and it stops at the first failure so the count reported back
   * is the count that actually returned. Privy's sponsorship settles
   * asynchronously, so /api/cards is re-read once at the end rather than after
   * every card.
   */
  const returnSelected = useCallback(async () => {
    const chosen = cards.filter((c) => picked.has(c.cardId ?? String(c.tokenId)));
    if (chosen.length === 0) return;

    setBusy("return-batch");
    setErr(null);
    setNote(null);
    let done = 0;

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
        setErr(
          done > 0
            ? `${why} ${done} card${done === 1 ? "" : "s"} returned before this one.`
            : why
        );
        break;
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
          <div className="card-surface px-4 py-3 flex items-center gap-3">
            <p
              className="text-[0.8rem] font-mono break-all flex-1"
              style={{ color: "var(--text-secondary)" }}
              data-testid="wallet-address"
            >
              {address}
            </p>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(address).then(
                  () => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  },
                  () => {}
                );
              }}
              className="btn-ghost !py-1.5 !px-3 !text-[0.6rem] shrink-0"
              data-testid="wallet-copy"
            >
              {copied ? "Copied" : "Copy"}
            </button>
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
                {/* Always offered, even with the switch off: /wallet/move says
                    why it cannot proceed and where to change it, which beats a
                    button that silently is not there. */}
                <Link
                  href="/wallet/move"
                  className="btn-primary !py-2 !px-4 !text-[0.68rem]"
                  data-testid="wallet-move-cards"
                >
                  Move Cards
                </Link>
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
                None yet. Use Move Cards to bring one here.
              </p>
            </div>
          ) : (
            <>
              <ul className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                {cards.map((c) => {
                  const id = c.cardId ?? String(c.tokenId);
                  const on = picked.has(id);
                  const colour = RARITY_COLORS[c.rarity] ?? RARITY_COLORS[0];
                  const addr = (sendTo[id] ?? "").trim();
                  return (
                    <li
                      key={id}
                      className="card-surface glass-hover p-3 flex flex-col transition-all"
                      style={{
                        borderColor: on ? "var(--electric-blue)" : undefined,
                        background: on ? "rgba(0,204,255,0.07)" : undefined,
                      }}
                    >
                      {/* Only the card itself selects. The send-away field
                          below needs its own clicks. */}
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`Select ${c.templateName ?? `card ${c.tokenId}`}`}
                        disabled={busy !== null}
                        onClick={() =>
                          setPicked((s) => {
                            const next = new Set(s);
                            if (next.has(id)) next.delete(id);
                            else next.add(id);
                            return next;
                          })
                        }
                        className="text-left w-full disabled:opacity-50"
                        data-testid={`wallet-pick-${c.tokenId}`}
                      >
                      <div
                        className={`relative w-full rounded-xl overflow-hidden mb-3 bg-white/5 ${on ? RARITY_GLOW[c.rarity] ?? "" : ""}`}
                        style={{ aspectRatio: "5/7", border: `1px solid ${colour}33` }}
                        data-testid={`wallet-card-visual-${c.tokenId}`}
                      >
                        {c.artworkUrl ? (
                          <Image
                            src={c.artworkUrl}
                            alt={c.templateName ?? c.templateId ?? `Card ${c.tokenId}`}
                            fill
                            sizes="(max-width:640px) 45vw, 20vw"
                            className="object-contain"
                            style={{ opacity: on ? 1 : 0.78 }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-3xl" style={{ color: "var(--border-strong)" }}>
                              ◆
                            </span>
                          </div>
                        )}
                        <span
                          className="absolute top-2 right-2 flex items-center justify-center rounded-md text-[0.7rem] font-semibold"
                          style={{
                            width: 20,
                            height: 20,
                            background: on ? "var(--electric-blue)" : "rgba(0,0,0,0.45)",
                            border: `1px solid ${on ? "var(--electric-blue)" : "var(--border-strong)"}`,
                            color: on ? "#0B0E1A" : "transparent",
                          }}
                        >
                          ✓
                        </span>
                      </div>

                      <p
                        className="text-[0.78rem] leading-tight truncate"
                        title={c.templateName ?? ""}
                      >
                        {c.templateName ?? `Card #${c.tokenId}`}
                      </p>
                      <p
                        className="text-[0.6rem] uppercase tracking-[0.12em]"
                        style={{ color: colour }}
                      >
                        {RARITY[c.rarity] ?? "Card"} · #{c.tokenId}
                      </p>
                      </button>

                      {/* Irreversible, so it is set apart by a rule rather than
                          sitting flush with the reversible action above it. */}
                      <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <div className="form-field">
                          <input
                            value={sendTo[id] ?? ""}
                            onChange={(e) => setSendTo((s) => ({ ...s, [id]: e.target.value }))}
                            placeholder="0x… send elsewhere"
                            spellCheck={false}
                            className="!text-[0.62rem] !py-2 !px-2.5 !rounded-lg font-mono"
                            data-testid={`wallet-send-input-${c.tokenId}`}
                          />
                        </div>
                        <button
                          onClick={() =>
                            act(
                              `send-${id}`,
                              post("/api/privy/send", { cardId: c.cardId, to: addr }),
                              "Sent. This card has left Gachard for good."
                            )
                          }
                          disabled={busy !== null || !addr}
                          className="w-full mt-2 py-2 text-[0.62rem] rounded-xl transition-all disabled:opacity-40"
                          style={{
                            background: addr ? "rgba(255,107,186,0.12)" : "rgba(255,255,255,0.05)",
                            border: `1px solid ${addr ? "rgba(255,107,186,0.35)" : "var(--border-strong)"}`,
                            color: addr ? "var(--aurora-pink)" : "var(--text-tertiary)",
                          }}
                          data-testid={`wallet-send-${c.tokenId}`}
                        >
                          {busy === `send-${id}` ? "Sending…" : "Send away"}
                        </button>
                      </div>
                    </li>
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
                Sending a card elsewhere is permanent. Gachard cannot bring it back.
              </p>
            </>
          )}
        </section>

      </div>

      {/* Full control. Full width rather than in the sidebar: on a phone it
          would otherwise sit between the access card and the cards, putting a
          destructive action in the middle of the reading path. */}
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
