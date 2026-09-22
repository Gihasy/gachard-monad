"use client";

/**
 * "For Advanced Users" on /profile (ADR-028, extended for ADR-031).
 *
 * Three lines and a button. The four-point warning used to sit here in full,
 * permanently, which meant most people scrolled past it — a warning that is
 * always on screen is wallpaper. It now opens with the button, at the moment
 * the decision is actually being made, and the same dialog is the only way
 * through to Privy.
 *
 * It stays its own section at the bottom rather than moving into the balance
 * card above. That card is about balances: two rows, each a label and a
 * number. A wallet has no number of that kind, and putting it beside Top up
 * would make a permanent, unchangeable link look as routine as adding credit.
 * ADR-028 also scoped advanced features away from the everyday surface on
 * purpose.
 *
 * Whether a wallet exists is visible without opening anything. Hiding that
 * behind the dialog would lose information rather than just tidy it away.
 *
 * Connecting the wallet is the decision. There used to be a second one: an
 * Advanced Access switch that separately allowed cards to leave. It asked the
 * same question twice — a wallet exists here for exactly one purpose — and
 * could only ever be off by accident, leaving /wallet/move blocked with no
 * sign of why from this page.
 *
 * Nothing about the consumer surfaces changes. /collection and the rest carry
 * no wallet actions for anyone, which is enforced by their not existing there
 * rather than by a setting (ADR-002). Choosing which cards move still happens
 * only on /wallet/move.
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

/** Everything that is hard or impossible to undo, said before it is offered. */
function WarningDialog({
  onClose,
  onContinue,
}: {
  onClose: () => void;
  onContinue: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      data-testid="advanced-warning-dialog"
    >
      <div
        className="glass w-full max-w-md p-6"
        style={{ borderColor: "rgba(255,196,102,0.3)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Before you connect a wallet"
      >
        <p
          className="text-[0.72rem] uppercase tracking-[0.22em] mb-4"
          style={{ color: "var(--aurora-gold)" }}
        >
          What this means
        </p>

        <ul
          className="space-y-3 text-[0.8rem] leading-relaxed mb-6"
          style={{ color: "var(--text-tertiary)" }}
          data-testid="advanced-warning"
        >
          <li>
            <span style={{ color: "var(--text-secondary)" }}>
              You become responsible for the wallet.
            </span>{" "}
            Gachard cannot recover a card you send to an outside address, and cannot undo it.
          </li>
          <li>
            <span style={{ color: "var(--text-secondary)" }}>The link is permanent.</span> Your
            wallet is tied to this Gachard account and its email, and cannot be swapped later.
          </li>
          <li>
            <span style={{ color: "var(--text-secondary)" }}>
              A card in your wallet leaves Gachard.
            </span>{" "}
            While it is out there it cannot be printed, listed or dismantled until you return it.
          </li>
          <li>
            <span style={{ color: "var(--text-secondary)" }}>
              Gachard needs your permission to help.
            </span>{" "}
            Returning a card requires access you grant, and you can withdraw it at any time.
          </li>
        </ul>

        <div className="flex gap-2">
          <button
            onClick={onContinue}
            className="btn-primary !py-2.5 !text-xs flex-1"
            data-testid="advanced-continue-btn"
          >
            I understand, continue
          </button>
          <button onClick={onClose} className="btn-ghost !py-2.5 !px-5 !text-xs">
            Cancel
          </button>
        </div>
        <p className="text-[0.68rem] mt-3" style={{ color: "var(--text-tertiary)" }}>
          Sign in with the same email you use for Gachard.
        </p>
      </div>
    </div>
  );
}

function PrivyWalletContent() {
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState(false);

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

  const proceed = useCallback(() => {
    setWarning(false);
    setError(null);
    try {
      login();
    } catch {
      setError("Something went wrong. Please try again.");
    }
  }, [login]);

  if (!ready) return null;

  return (
    <section className="glass p-6 mt-8" data-testid="advanced-section">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p
          className="text-[0.72rem] uppercase tracking-[0.22em]"
          style={{ color: "var(--cosmic-violet)" }}
        >
          For advanced users
        </p>
        <PrivyMark />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Hold your cards in a wallet only you control. Move them out of Gachard, bring them
            back, or take them somewhere else entirely.
          </p>
          {/* State without opening anything: a dialog should tidy the warning
              away, not the answer to "do I have one of these?". */}
          {isConnected && (
            <span
              className="chip !py-1 !px-3 !text-[0.6rem] mt-3 inline-flex"
              style={{ borderColor: "rgba(0,204,255,0.3)", color: "var(--electric-blue)" }}
              data-testid="wallet-connected-chip"
            >
              <span
                className="chip-dot"
                style={{
                  background: "var(--electric-blue)",
                  boxShadow: "0 0 8px var(--electric-blue)",
                }}
              />
              Wallet connected
            </span>
          )}
        </div>

        {!isConnected ? (
          <button
            onClick={() => setWarning(true)}
            className="btn-primary !py-2.5 !px-6 !text-xs shrink-0"
            data-testid="privy-setup-btn"
          >
            Access
          </button>
        ) : (
          <Link
            href="/wallet"
            className="btn-primary !py-2.5 !px-6 !text-xs shrink-0 text-center"
            data-testid="open-wallet-page"
          >
            Open wallet
          </Link>
        )}
      </div>

      {error && (
        <p className="mt-3 text-xs" style={{ color: "var(--aurora-pink)" }} data-testid="advanced-error">
          {error}
        </p>
      )}

      {warning && <WarningDialog onClose={() => setWarning(false)} onContinue={proceed} />}
    </section>
  );
}

export default function PrivyWalletSection() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return null;

  return (
    <PrivyProvider appId={appId} config={privyConfig}>
      <PrivyWalletContent />
    </PrivyProvider>
  );
}
