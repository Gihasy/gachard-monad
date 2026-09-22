"use client";

/**
 * "For Advanced Users" on /profile (ADR-028, extended for ADR-031).
 *
 * Two decisions live here and they are deliberately separate. Linking a Privy
 * wallet is one; allowing cards to leave Gachard is another. Someone can hold
 * a wallet and still not want that available, so the switch is its own control
 * rather than something the link implies.
 *
 * The switch has no effect on this page or on /collection. Choosing which
 * cards move happens only on /wallet, which keeps every consumer surface free
 * of wallet actions (ADR-002).
 *
 * The warning is not decoration. Everything below it is hard or impossible to
 * undo: a card sent to an outside address cannot be recovered, the wallet link
 * is permanent, and a revealed private key cannot be un-revealed. The section
 * says so before it offers any of it.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  getAccessToken,
  PrivyProvider,
  usePrivy,
  useWallets,
} from "@privy-io/react-auth";
import { privyConfig } from "@/lib/privy-config";

/**
 * The supplied Privy wordmark, used as given: white on transparent, only
 * scaled. It is someone else's brand, so it is not recoloured or redrawn to
 * match the Gachard palette.
 */
function PrivyMark() {
  return (
    <span className="inline-flex items-center gap-2 shrink-0">
      <span className="text-[0.7rem]" style={{ color: "var(--text-tertiary)" }}>
        Secured by
      </span>
      <Image
        src="/brand/privy.webp"
        alt="Privy"
        width={58}
        height={13}
        unoptimized
        className="opacity-80"
      />
    </span>
  );
}

function PrivyWalletContent() {
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [advanced, setAdvanced] = useState(false);
  const [linked, setLinked] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Must be the embedded Privy wallet specifically. useWallets() also returns
  // external wallets (an injected MetaMask, say), and wallets[0] can be one of
  // those. Saving an external address is not cosmetic: it is the address cards
  // get exported to, and the server cannot send from a wallet Privy does not
  // own, so the card could never be brought back (ADR-031).
  const wallet = wallets.find((w) => w.walletClientType === "privy");
  const isConnected = authenticated && !!wallet;

  const loadSetting = useCallback(async () => {
    try {
      const res = await fetch("/api/user/advanced", { credentials: "include" });
      const body = await res.json().catch(() => null);
      if (body) {
        setAdvanced(body.enabled === true);
        setLinked(body.linked === true);
      }
    } catch {
      /* leave it off rather than guessing */
    }
  }, []);

  useEffect(() => {
    loadSetting();
  }, [loadSetting]);

  // Bind on connect. Send a token rather than a claim: the DID and the wallet
  // address used to be posted from here and written as given, which let anyone
  // with a Gachard session point the binding at a wallet of their own. The
  // server derives both from this token now (ADR-031).
  useEffect(() => {
    if (!ready || !isConnected || saved || saving) return;
    setSaving(true);
    (async () => {
      try {
        const authToken = await getAccessToken();
        if (!authToken) throw new Error("no access token");
        const res = await fetch("/api/user/privy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ authToken }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setError(body?.error ?? "Could not connect that wallet.");
          return;
        }
        setSaved(true);
        setLinked(true);
      } catch {
        setError("Could not connect that wallet.");
      } finally {
        setSaving(false);
      }
    })();
  }, [ready, isConnected, saved, saving, wallet, user]);

  const toggle = useCallback(async () => {
    const next = !advanced;
    setToggling(true);
    setError(null);
    try {
      const res = await fetch("/api/user/advanced", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: next }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Could not save that setting.");
        return;
      }
      setAdvanced(next);
    } catch {
      setError("Could not save that setting.");
    } finally {
      setToggling(false);
    }
  }, [advanced]);

  if (!ready) return null;

  return (
    <section className="glass p-6 mt-8" data-testid="advanced-section">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <p
          className="text-[0.72rem] uppercase tracking-[0.22em]"
          style={{ color: "var(--cosmic-violet)" }}
        >
          For advanced users
        </p>
        <PrivyMark />
      </div>

      <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--text-tertiary)" }}>
        Hold your cards in a wallet only you control. Move them out of Gachard, bring them back,
        or take them somewhere else entirely.
      </p>

      {/* Said before anything is offered, not after. */}
      <div
        className="rounded-xl p-4 mb-5"
        style={{
          background: "rgba(255,196,102,0.06)",
          border: "1px solid rgba(255,196,102,0.22)",
        }}
        data-testid="advanced-warning"
      >
        <p
          className="text-[0.68rem] uppercase tracking-[0.14em] mb-2"
          style={{ color: "var(--aurora-gold)" }}
        >
          Before you turn this on
        </p>
        <ul className="space-y-1.5 text-[0.78rem] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          <li>
            <span style={{ color: "var(--text-secondary)" }}>You become responsible for the wallet.</span>{" "}
            Gachard cannot recover a card you send to an outside address, and cannot undo it.
          </li>
          <li>
            <span style={{ color: "var(--text-secondary)" }}>The link is permanent.</span> Your
            wallet is tied to this Gachard account and its email, and cannot be swapped later.
          </li>
          <li>
            <span style={{ color: "var(--text-secondary)" }}>A card in your wallet leaves Gachard.</span>{" "}
            While it is out there it cannot be printed, listed or dismantled until you return it.
          </li>
          <li>
            <span style={{ color: "var(--text-secondary)" }}>Gachard needs your permission to help.</span>{" "}
            Returning a card requires access you grant, and you can withdraw it at any time.
          </li>
        </ul>
      </div>

      {!isConnected ? (
        <>
          <button
            onClick={() => {
              setError(null);
              try {
                login();
              } catch {
                setError("Something went wrong. Please try again.");
              }
            }}
            className="btn-primary !py-2.5 !px-6 !text-xs"
            data-testid="privy-setup-btn"
          >
            Access
          </button>
          <p className="text-[0.68rem] mt-2" style={{ color: "var(--text-tertiary)" }}>
            Sign in with the same email you use for Gachard.
          </p>
        </>
      ) : (
        <div className="space-y-4">
          {/* The switch, separate from the link. */}
          <div className="card-surface px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm">Advanced access</p>
              <p className="text-[0.7rem]" style={{ color: "var(--text-tertiary)" }}>
                {advanced
                  ? "Choose cards to move on your wallet page."
                  : "Your cards stay as they are. Nothing can be moved out."}
              </p>
            </div>
            <button
              onClick={toggle}
              disabled={toggling || !linked}
              role="switch"
              aria-checked={advanced}
              aria-label="Advanced access"
              className="relative shrink-0 rounded-full transition-all disabled:opacity-40"
              style={{
                width: 46,
                height: 26,
                background: advanced ? "rgba(0,204,255,0.25)" : "rgba(255,255,255,0.08)",
                border: `1px solid ${advanced ? "rgba(0,204,255,0.5)" : "var(--border-strong)"}`,
              }}
              data-testid="advanced-toggle"
            >
              <span
                className="absolute rounded-full transition-all"
                style={{
                  width: 18,
                  height: 18,
                  top: 3,
                  left: advanced ? 23 : 3,
                  background: advanced ? "var(--electric-blue)" : "var(--text-tertiary)",
                  boxShadow: advanced ? "0 0 10px var(--electric-blue)" : "none",
                }}
              />
            </button>
          </div>

          <div className="card-surface px-4 py-3">
            <p className="text-[0.65rem] uppercase tracking-[0.14em] mb-1" style={{ color: "var(--text-tertiary)" }}>
              Wallet address
            </p>
            <p className="text-[0.78rem] font-mono break-all" style={{ color: "var(--text-secondary)" }}>
              {wallet.address}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/wallet"
              className="btn-ghost !py-2 !px-4 !text-[0.7rem]"
              data-testid="open-wallet-page"
            >
              Open wallet →
            </Link>
            <a
              href={`https://testnet.monadvision.com/address/${wallet.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost !py-2 !px-4 !text-[0.7rem]"
              data-testid="privy-explorer-link"
            >
              Explorer ↗
            </a>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs" style={{ color: "var(--aurora-pink)" }} data-testid="advanced-error">
          {error}
        </p>
      )}
    </section>
  );
}

export default function PrivyWalletSection() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return null;

  return (
    <PrivyProvider
      appId={appId}
      config={privyConfig}
    >
      <PrivyWalletContent />
    </PrivyProvider>
  );
}
