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
 * It is its own section at the foot of the profile sidebar, not a row in the
 * balance card above it. That card is about balances: two rows, each a label
 * and a number. A wallet has no number of that kind, and sitting beside Top up
 * would make a permanent, unchangeable link look as routine as adding credit.
 * ADR-028 also scoped advanced features away from the everyday surface on
 * purpose.
 *
 * It was below the card grid until the sidebar became its home, which put the
 * one thing a user has to go looking for underneath a paginated list. Last in
 * the sidebar is findable without being promoted above Collection Stats, which
 * everyone has and this is not.
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
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  getAccessToken,
  PrivyProvider,
  usePrivy,
  useWallets,
} from "@privy-io/react-auth";
import { privyConfig } from "@/lib/privy-config";
import { PrivyMark } from "@/components/wallet/shared";

/**
 * Everything that is hard or impossible to undo, said before it is offered.
 *
 * Rendered into document.body rather than in place. `.glass` sets
 * backdrop-filter, which makes the section a containing block for fixed
 * positioning, so `fixed inset-0` covered the section instead of the viewport
 * and the dialog sat wherever the section sat — 332px left of centre once this
 * moved into the profile sidebar. It looked correct while the section was full
 * width, and correct on phones, because globals.css turns backdrop-filter off
 * below 768px. A portal is immune to wherever the section is placed next.
 */
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

  if (typeof document === "undefined") return null;

  return createPortal(
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
    </div>,
    document.body
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
    <section className="glass p-4 sm:p-6" data-testid="advanced-section">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
        <p
          className="text-[0.65rem] sm:text-[0.72rem] uppercase tracking-[0.22em]"
          style={{ color: "var(--cosmic-violet)" }}
        >
          For advanced users
        </p>
        <PrivyMark />
      </div>

      {/* Stacked, not side by side. This sits in the profile sidebar, about
          440px at desktop width, where a row would leave the text in a column
          too narrow to read comfortably. */}
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <p className="text-[0.7rem] sm:text-xs leading-relaxed text-white/50">
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
            className="btn-primary !py-2.5 !text-xs w-full"
            data-testid="privy-setup-btn"
          >
            Access
          </button>
        ) : (
          <Link
            href="/wallet"
            className="btn-primary !py-2.5 !text-xs w-full text-center"
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
