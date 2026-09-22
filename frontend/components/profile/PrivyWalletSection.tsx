"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getAccessToken, PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { monadTestnet } from "@/lib/monad-testnet";

function PrivyWalletContent() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Must be the embedded Privy wallet specifically. useWallets() also returns
  // external wallets (an injected MetaMask, say), and wallets[0] can be one of
  // those. Saving an external address here is not cosmetic: it is the address
  // cards get exported to, and the server cannot send from a wallet Privy does
  // not own, so the card could never be brought back (ADR-031).
  const wallet = wallets.find((w) => w.walletClientType === "privy");
  const isConnected = authenticated && !!wallet;

  // Save wallet info to backend when first connected
  // NOTE: useEffect MUST be before any early returns (Rules of Hooks)
  useEffect(() => {
    if (!ready || !isConnected || saved || saving) return;
    setSaving(true);
    // Send a token rather than a claim. The DID and the wallet address used
    // to be posted from here and written as given, which let anyone with a
    // Gachard session point the binding at a wallet of their own. The server
    // now derives both from this token (ADR-031).
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

  if (!isConnected) {
    return (
      <div className="glass p-6 mt-8">
        <h3 className="text-lg font-display text-white/90 mb-2">For Advanced Users</h3>
        <p className="text-sm text-white/50 mb-4">
          Want full control over your cards&apos; underlying technology? Set up advanced access
          to manage your data independently.
        </p>
        <button
          onClick={() => {
            setError(null);
            try { login(); } catch { setError("Something went wrong. Please try again."); }
          }}
          className="btn-ghost text-sm"
          data-testid="privy-setup-btn"
        >
          Set Up Advanced Access
        </button>
        {error && (
          <p className="mt-3 text-sm" style={{ color: "var(--aurora-pink)" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="glass p-6 mt-8">
      <h3 className="text-lg font-display text-white/90 mb-2">For Advanced Users</h3>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-green-400">✓</span>
        <span className="text-sm text-white/70">Advanced Access Enabled</span>
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="text-sm text-white/50 hover:text-white/70 transition-colors"
        data-testid="privy-toggle-details"
      >
        {expanded ? "Hide Technical Details ▴" : "Show Technical Details ▾"}
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
          <div>
            <p className="text-xs text-white/40 mb-1">Address</p>
            <p className="text-sm text-white/70 font-mono break-all">{wallet.address}</p>
            <Link
              href="/wallet"
              className="btn-ghost !py-2 !px-3 !text-[0.7rem] inline-block mt-2"
              data-testid="open-wallet-page"
            >
              Open wallet →
            </Link>
          </div>

          <div>
            <p className="text-xs text-white/40 mb-1">Network</p>
            <p className="text-sm text-white/70">Monad Testnet</p>
          </div>

          <a
            href={`https://testnet.monadvision.com/address/${wallet.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost text-sm inline-block"
            data-testid="privy-explorer-link"
          >
            View on Block Explorer
          </a>

          <div className="pt-2">
            <button
              onClick={() => {
                setExpanded(false);
                try { logout(); } catch { /* ignore */ }
              }}
              className="text-xs text-white/30 hover:text-white/50 transition-colors"
              data-testid="privy-disconnect-btn"
            >
              Disconnect Advanced Access
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PrivyWalletSection() {
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
      <PrivyWalletContent />
    </PrivyProvider>
  );
}
