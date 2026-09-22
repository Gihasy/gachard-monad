"use client";

/**
 * "For Advanced Users" on /profile (ADR-028, extended for ADR-031).
 *
 * Connecting the wallet is the decision. There used to be a second one: an
 * Advanced Access switch that separately allowed cards to leave, on the
 * reasoning that someone might hold a wallet and still not want that. In
 * practice it asked the same question twice — a wallet exists here for exactly
 * one purpose — and it could only ever be off by accident, leaving /wallet/move
 * blocked with no sign of why from this page.
 *
 * Nothing about the consumer surfaces changes. /collection and the rest carry
 * no wallet actions for anyone, which is enforced by their not existing there
 * rather than by a setting (ADR-002). Choosing which cards move still happens
 * only on /wallet/move.
 *
 * The warning is not decoration. Everything it describes is hard or impossible
 * to undo: a card sent to an outside address cannot be recovered, and the
 * wallet link is permanent. It is stated whether or not a wallet is connected
 * yet, because it stays true either way.
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


  // Must be the embedded Privy wallet specifically. useWallets() also returns
  // external wallets (an injected MetaMask, say), and wallets[0] can be one of
  // those. Saving an external address is not cosmetic: it is the address cards
  // get exported to, and the server cannot send from a wallet Privy does not
  // own, so the card could never be brought back (ADR-031).
  const wallet = wallets.find((w) => w.walletClientType === "privy");
  const isConnected = authenticated && !!wallet;


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
      } catch {
        setError("Could not connect that wallet.");
      } finally {
        setSaving(false);
      }
    })();
  }, [ready, isConnected, saved, saving, wallet, user]);

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
          What this means
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
          <div className="flex flex-wrap gap-2">
            <Link
              href="/wallet"
              className="btn-ghost !py-2 !px-4 !text-[0.7rem]"
              data-testid="open-wallet-page"
            >
              Open wallet →
            </Link>
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
