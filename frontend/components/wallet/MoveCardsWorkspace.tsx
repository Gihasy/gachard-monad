"use client";

/**
 * Choosing which cards leave Gachard (ADR-002, ADR-031).
 *
 * Its own page rather than a second grid on /wallet. /wallet answers "what do
 * I hold?" and this answers "what should I move?", and two card grids stacked
 * on one screen made neither read as the main list. It also means the page
 * that performs the irreversible step is one the user navigated to on purpose.
 *
 * Mounts its own PrivyProvider, the island pattern used everywhere Privy
 * appears, so the SDK never loads on a consumer surface.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  getAccessToken,
  PrivyProvider,
  usePrivy,
  useSignTypedData,
  useWallets,
} from "@privy-io/react-auth";
import {
  buildExportIntentDomain,
  EXPORT_BATCH_SIGNING_TYPES,
  MAX_EXPORT_BATCH,
} from "@/lib/export-intent";
import { privyConfig } from "@/lib/privy-config";
import {
  CardFrame,
  Eyebrow,
  POLL_INTERVAL_MS,
  POLL_MAX_ATTEMPTS,
  type WalletCard,
} from "./shared";

/** A panel that explains why nothing can be chosen yet, and where to go. */
function Blocked({
  title,
  children,
  href,
  action,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  href: string;
  action: string;
  testId: string;
}) {
  return (
    <section className="glass p-6 sm:p-8 max-w-xl" data-testid={testId}>
      <Eyebrow>{title}</Eyebrow>
      <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--text-tertiary)" }}>
        {children}
      </p>
      <Link href={href} className="btn-primary !py-2.5 !px-6 !text-xs">
        {action}
      </Link>
    </section>
  );
}

function Workspace() {
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const { signTypedData } = useSignTypedData();

  const [movable, setMovable] = useState<WalletCard[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [advanced, setAdvanced] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const embedded = wallets.find((w) => w.walletClientType === "privy");
  const address = embedded?.address ?? null;

  // Without delegation a card can leave and never come back, because the
  // wallet is the user's and the server cannot sign for it.
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
      // A listed card is promised to a buyer, and one without a token id is
      // not on chain yet, so neither can leave.
      setMovable(
        all.filter(
          (c) =>
            c.displayStatus === "Digital" && c.tokenId !== null && !c.isListed && !!c.cardId
        )
      );
    } catch {
      setErr("Could not load your cards.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The signature names the user, so this has to be the id the server checks
  // it against.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("user");
      if (raw) setUserId(JSON.parse(raw)?.user_id ?? "");
    } catch {
      /* moving a card will ask them to sign in again */
    }
  }, []);

  useEffect(() => {
    fetch("/api/user/advanced", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAdvanced(d?.enabled === true))
      .catch(() => setAdvanced(false));
  }, []);

  // This page has its own Privy login, so it binds too. Otherwise a user who
  // arrives here directly is connected in the browser but unknown to the
  // server, and every move fails. The server derives the identity from the
  // token; nothing about the wallet is asserted from here (ADR-031).
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

  const poll = useCallback(async (cardId: string) => {
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      const res = await fetch(`/api/privy/status/${cardId}`);
      const body = await res.json().catch(() => null);
      if (body?.settled) return body;
      if (body?.claimStatus === "failed") {
        throw new Error("That did not go through. Please try again.");
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    // Not a failure: the work may still land. Saying so beats implying loss.
    return null;
  }, []);

  /**
   * Move the chosen cards.
   *
   * One signature for the whole selection, then one request per card. The
   * signature used to be per card, which meant a Privy dialog for each one --
   * five cards, five modals, and a user clicking through them without reading
   * any. The requests stay per card because ADR-018 caps a function at ten
   * seconds and several sponsored transfers would not fit.
   *
   * A failure stops the run rather than pressing on, so the count reported
   * back is always the count that actually moved. The rest of the selection
   * keeps its signature and is simply not used; nothing is left half-signed.
   */
  const move = useCallback(async () => {
    const chosen = movable.filter((c) => selected.has(c.cardId!));
    if (chosen.length === 0 || !address) return;
    if (!userId) {
      setErr("Please sign in again.");
      return;
    }
    if (chosen.length > MAX_EXPORT_BATCH) {
      setErr(`You can move up to ${MAX_EXPORT_BATCH} cards at once.`);
      return;
    }

    setBusy(true);
    setErr(null);
    setNote(null);

    // Order is part of the signed struct, so the array sent to the server has
    // to be the one that was signed, element for element.
    const tokenIds = chosen.map((c) => Number(c.tokenId));
    const nonce = crypto.randomUUID();
    const deadline = Math.floor(Date.now() / 1000) + 600;

    let signature: string;
    try {
      setProgress(
        chosen.length === 1
          ? "Confirm the signature…"
          : `Confirm one signature for ${chosen.length} cards…`
      );
      // uint256 values go as strings: the digest is identical either way, and
      // this is the shape already proven against Privy's eth_signTypedData_v4.
      // v3 resolves to { signature }, not the string.
      const res = await signTypedData({
        domain: buildExportIntentDomain(),
        types: EXPORT_BATCH_SIGNING_TYPES as unknown as Record<
          string,
          { name: string; type: string }[]
        >,
        primaryType: "ExportBatch",
        message: {
          tokenIds: tokenIds.map(String),
          to: address,
          userId,
          nonce,
          deadline: String(deadline),
        },
      });
      signature = res.signature;
    } catch (e) {
      setBusy(false);
      setProgress(null);
      // Dismissing the dialog is a choice, not a fault. Nothing has moved.
      setErr(e instanceof Error && /reject|denied|cancel/i.test(e.message)
        ? null
        : "Could not get your signature. Please try again.");
      return;
    }

    let moved = 0;
    for (const [i, card] of chosen.entries()) {
      setProgress(`Moving card ${i + 1} of ${chosen.length}…`);
      try {
        const prep = await fetch("/api/privy/export/prepare", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cardId: card.cardId, tokenIds, signature, nonce, deadline }),
        });
        const prepBody = await prep.json().catch(() => null);
        if (!prep.ok) throw new Error(prepBody?.error ?? "Could not move that card.");

        const claim = await fetch("/api/privy/export/claim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cardId: card.cardId }),
        });
        const claimBody = await claim.json().catch(() => null);
        if (!claim.ok) throw new Error(claimBody?.error ?? "Could not finish the handover.");

        await poll(card.cardId!);
        moved++;
      } catch (e) {
        const why = e instanceof Error ? e.message : "Something went wrong.";
        setErr(
          moved > 0
            ? `${why} ${moved} card${moved === 1 ? "" : "s"} moved before this one.`
            : why
        );
        break;
      }
    }

    setBusy(false);
    setProgress(null);
    setSelected(new Set());
    if (moved > 0) setNote(`${moved} card${moved === 1 ? "" : "s"} moved to your wallet.`);
    await load();
  }, [movable, selected, address, userId, signTypedData, poll, load]);

  if (!ready || advanced === null) {
    return (
      <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
        Loading…
      </p>
    );
  }

  if (!advanced) {
    return (
      <Blocked
        title="Not turned on"
        href="/profile"
        action="Go to profile"
        testId="move-blocked-advanced"
      >
        Advanced access is off, so cards cannot leave Gachard. Turn it on in your profile and
        they will be listed here to choose from.
      </Blocked>
    );
  }

  if (!authenticated || !address) {
    return (
      <section className="glass p-6 sm:p-8 max-w-xl" data-testid="move-setup">
        <Eyebrow>Sign in to your wallet</Eyebrow>
        <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--text-tertiary)" }}>
          Use the same email you use for Gachard. Your cards move to the wallet only you
          control.
        </p>
        <button onClick={login} className="btn-primary !py-2.5 !px-6 !text-xs" data-testid="move-login">
          Continue
        </button>
      </section>
    );
  }

  if (!delegated) {
    return (
      <Blocked
        title="Permission needed"
        href="/wallet"
        action="Open wallet"
        testId="move-blocked-delegation"
      >
        Gachard needs your permission to move cards in this wallet. Without it a card that
        leaves can never be returned. Grant it under Gachard access, then come back.
      </Blocked>
    );
  }

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="glass p-6">
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            Loading…
          </p>
        </div>
      ) : movable.length === 0 ? (
        <div className="glass p-8 text-center max-w-xl" data-testid="move-empty">
          <p className="text-3xl mb-3" style={{ color: "var(--border-strong)" }}>
            ◆
          </p>
          <p className="text-sm mb-5" style={{ color: "var(--text-tertiary)" }}>
            Nothing to move. Cards listed for sale, or still being minted, stay where they are.
          </p>
          <Link href="/collection" className="btn-ghost !py-2 !px-4 !text-[0.7rem]">
            Back to collection
          </Link>
        </div>
      ) : (
        <>
          <Eyebrow
            right={
              <span className="text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>
                {selected.size} of {movable.length} selected
              </span>
            }
          >
            Choose cards
          </Eyebrow>

          <ul className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
            {movable.map((c) => {
              const id = c.cardId!;
              return (
                <CardFrame
                  key={id}
                  card={c}
                  selected={selected.has(id)}
                  disabled={busy}
                  testIdPrefix="move"
                  onToggle={() =>
                    setSelected((sel) => {
                      const next = new Set(sel);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                />
              );
            })}
          </ul>

          {/* Sticky, because the grid can run past a screen and the action
              should never be something the user has to scroll back for. */}
          <div
            className="sticky bottom-4 glass px-4 py-3 flex flex-wrap items-center justify-between gap-3"
            data-testid="move-bar"
          >
            <p className="text-[0.7rem]" style={{ color: "var(--text-tertiary)" }}>
              {progress ??
                (selected.size === 0
                  ? "Pick the cards you want to hold yourself."
                  : "You will be asked to sign once, for all of them.")}
            </p>
            <div className="flex items-center gap-2">
              {selected.size > 0 && !busy && (
                <button
                  onClick={() => setSelected(new Set())}
                  className="btn-ghost !py-2 !px-3 !text-[0.65rem]"
                  data-testid="move-clear"
                >
                  Clear
                </button>
              )}
              <button
                onClick={move}
                disabled={selected.size === 0 || busy}
                className="btn-primary !py-2 !px-5 !text-[0.68rem] disabled:opacity-40"
                data-testid="move-confirm"
              >
                {busy
                  ? "Moving…"
                  : selected.size === 0
                    ? "Move cards"
                    : `Move ${selected.size} ${selected.size === 1 ? "card" : "cards"}`}
              </button>
            </div>
          </div>
        </>
      )}

      {note && (
        <div className="glass p-4 flex flex-wrap items-center justify-between gap-3" data-testid="move-note">
          <p className="text-sm" style={{ color: "var(--electric-blue)" }}>
            {note}
          </p>
          <Link href="/wallet" className="btn-ghost !py-2 !px-4 !text-[0.7rem]">
            See them in your wallet →
          </Link>
        </div>
      )}
      {err && (
        <p className="text-sm" style={{ color: "var(--aurora-pink)" }} data-testid="move-error">
          {err}
        </p>
      )}
    </div>
  );
}

export default function MoveCardsWorkspace() {
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
