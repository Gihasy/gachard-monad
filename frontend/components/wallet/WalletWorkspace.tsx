"use client";

/**
 * Everything the self-custody wallet can do, in one place (ADR-031).
 *
 * Split out of /collection deliberately. The collection is the consumer
 * surface and ADR-002 says it stays free of wallet language; this page is
 * where a user who wants control goes, and it is allowed to be explicit.
 * /collection keeps only the entry point.
 *
 * Mounts its own PrivyProvider, the same island pattern as /profile, so the
 * SDK never loads on pack opening or anywhere else.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  PrivyProvider,
  useExportWallet,
  usePrivy,
  useSigners,
  useWallets,
} from "@privy-io/react-auth";
import { monadTestnet } from "@/lib/monad-testnet";

const SIGNER_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID ?? "";
const EXPLORER = "https://testnet.monadvision.com/address/";

type WalletCard = {
  cardId?: string | null;
  tokenId: number | null;
  templateId?: string;
  templateName?: string;
  artworkUrl?: string;
  rarity: number;
  displayStatus?: string;
};

const RARITY = ["Common", "Rare", "Epic", "Legendary"];
// Same tokens and glow classes the collection grid uses, so a card looks
// like itself wherever it is shown.
const RARITY_COLORS = [
  "var(--rarity-common)",
  "var(--rarity-rare)",
  "var(--rarity-epic)",
  "var(--rarity-legendary)",
];
const RARITY_GLOW = ["", "glow-rare", "glow-epic", "glow-legendary"];

function busyLabel(a: string | null) {
  return a === "claim" ? "Finishing…" : a === "return" ? "Returning…" : a === "send" ? "Sending…" : "…";
}

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

  if (!ready) return <p className="text-sm text-white/40">Loading…</p>;

  if (!authenticated || !address) {
    return (
      <div className="glass rounded-2xl p-5 space-y-3">
        <h2 className="text-base font-semibold">Set up your own wallet</h2>
        <p className="text-xs text-white/50">
          A wallet only you control. Your cards can move into it, and back, and you can take
          them anywhere.
        </p>
        <button onClick={login} className="btn-primary !py-2 !text-xs" data-testid="wallet-setup">
          Set up
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="glass rounded-2xl p-5 space-y-2">
        <h2 className="text-base font-semibold">Your wallet</h2>
        <p className="text-sm text-white/70 font-mono break-all" data-testid="wallet-address">
          {address}
        </p>
        <a
          href={`${EXPLORER}${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs"
          style={{ color: "var(--electric-blue)" }}
        >
          View on explorer →
        </a>
      </div>

      {/* Permission */}
      <div className="glass rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Gachard access</h2>
          <span
            className="text-[0.65rem] px-2 py-1 rounded-full"
            style={{
              background: delegated ? "rgba(0,204,255,0.12)" : "rgba(255,196,102,0.1)",
              color: delegated ? "var(--electric-blue)" : "var(--aurora-gold)",
            }}
            data-testid="delegation-state"
          >
            {delegated ? "Allowed" : "Not allowed"}
          </span>
        </div>
        <p className="text-xs text-white/50">
          {delegated
            ? "Gachard can move cards in this wallet on your behalf, which is what lets a card come back to your collection. You can withdraw this at any time."
            : "Allow Gachard to move cards in this wallet, so a card you take out can be returned later. Without it, a card that leaves cannot come back."}
        </p>
        {!SIGNER_ID && (
          <p className="text-xs" style={{ color: "var(--aurora-pink)" }}>
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
          className={`${delegated ? "btn-ghost" : "btn-primary"} !py-2 !text-xs disabled:opacity-50`}
          data-testid="delegation-toggle"
        >
          {busy === "perm" ? "…" : delegated ? "Withdraw access" : "Allow"}
        </button>
      </div>

      {/* Cards held here */}
      <div className="glass rounded-2xl p-5 space-y-3">
        <h2 className="text-base font-semibold">Cards in this wallet</h2>
        {loading ? (
          <p className="text-xs text-white/40">Loading…</p>
        ) : cards.length === 0 ? (
          <p className="text-xs text-white/50">
            None yet. Move a card here from your collection.
          </p>
        ) : (
          <>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {cards.map((c) => {
              const id = c.cardId ?? String(c.tokenId);
              const colour = RARITY_COLORS[c.rarity] ?? RARITY_COLORS[0];
              return (
                <li key={id} className="flex flex-col">
                  <div
                    className={`relative w-full rounded-xl overflow-hidden mb-2 bg-white/5 ${RARITY_GLOW[c.rarity] ?? ""}`}
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
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-3xl text-white/30">◆</span>
                      </div>
                    )}
                  </div>

                  <p className="text-[0.75rem] leading-tight truncate" title={c.templateName ?? ""}>
                    {c.templateName ?? `Card #${c.tokenId}`}
                  </p>
                  <p className="text-[0.6rem] mb-2" style={{ color: colour }}>
                    {RARITY[c.rarity] ?? "Card"} · #{c.tokenId}
                  </p>

                  <button
                    onClick={() =>
                      act(`return-${id}`, post("/api/privy/import", { cardId: c.cardId }), "Coming back to your collection.")
                    }
                    disabled={busy !== null}
                    className="btn-ghost !py-1.5 !px-2 !text-[0.6rem] w-full disabled:opacity-50"
                    data-testid={`wallet-return-${c.tokenId}`}
                  >
                    {busy === `return-${id}` ? busyLabel("return") : "Return to Gachard"}
                  </button>

                  <input
                    value={sendTo[id] ?? ""}
                    onChange={(e) => setSendTo((s) => ({ ...s, [id]: e.target.value }))}
                    placeholder="0x… send elsewhere"
                    className="w-full text-[0.6rem] rounded-lg px-2 py-1.5 font-mono mt-1.5"
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}
                    data-testid={`wallet-send-input-${c.tokenId}`}
                  />
                  <button
                    onClick={() =>
                      act(
                        `send-${id}`,
                        post("/api/privy/send", { cardId: c.cardId, to: sendTo[id] }),
                        "Sent. This card has left Gachard for good."
                      )
                    }
                    disabled={busy !== null || !(sendTo[id] ?? "").trim()}
                    className="btn-ghost !py-1.5 !px-2 !text-[0.6rem] w-full mt-1.5 disabled:opacity-50"
                    data-testid={`wallet-send-${c.tokenId}`}
                  >
                    {busy === `send-${id}` ? busyLabel("send") : "Send"}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[0.6rem] text-white/30">
            Sending a card elsewhere is permanent. Gachard cannot bring it back.
          </p>
          </>
        )}
      </div>

      {/* Full control */}
      <div className="glass rounded-2xl p-5 space-y-3">
        <h2 className="text-base font-semibold">Take full control</h2>
        <p className="text-xs text-white/50">
          Reveal this wallet&apos;s private key to use it in another app. Anyone who has it owns
          the wallet, so keep it to yourself. Gachard never sees it.
        </p>
        <button
          onClick={() => exportWallet({ address })}
          disabled={busy !== null}
          className="btn-ghost !py-2 !text-xs disabled:opacity-50"
          data-testid="wallet-export-key"
        >
          Reveal private key
        </button>
      </div>

      {note && (
        <p className="text-xs" style={{ color: "var(--electric-blue)" }} data-testid="wallet-note">
          {note}
        </p>
      )}
      {err && (
        <p className="text-xs" style={{ color: "var(--aurora-pink)" }} data-testid="wallet-error">
          {err}
        </p>
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
      config={{
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
        loginMethods: ["google", "email"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
      }}
    >
      <Workspace />
    </PrivyProvider>
  );
}
