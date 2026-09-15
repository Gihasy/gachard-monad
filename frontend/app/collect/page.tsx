"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import PackCard from "@/components/PackCard";
import PackReveal, { type RevealResult } from "@/components/home/PackReveal";

interface SessionUser {
  user_id: string;
  username: string;
}

const PENDING_TX_KEY = "gachard_pending_tx";

interface PendingTx {
  txId: string;
  packType: "standard" | "booster";
  timestamp: number;
  userId: string;
  lastPolledAt?: number;
}

export default function PacksPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [reveal, setReveal] = useState<RevealResult | null>(null);
  const [loadingType, setLoadingType] = useState<"standard" | "booster" | null>(null);
  const [lastPack, setLastPack] = useState<"standard" | "booster">("standard");
  const [pendingTxId, setPendingTxId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("user");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        window.localStorage.removeItem("user");
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    fetch("/api/credits", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setBalance(d.balance ?? 0))
      .catch(() => setBalance(0));
  }, [ready, user]);

  // Auto-recover pending transaction from localStorage (timeout recovery)
  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;

    const recover = async () => {
      let raw: string | null = null;
      try { raw = localStorage.getItem(PENDING_TX_KEY); } catch { return; }
      if (!raw) return;

      let pending: PendingTx;
      try { pending = JSON.parse(raw); } catch { localStorage.removeItem(PENDING_TX_KEY); return; }

      // Expire after 1 hour
      if (Date.now() - pending.timestamp > 3600000) {
        localStorage.removeItem(PENDING_TX_KEY);
        return;
      }

      // Guard 1: only recover if same user
      if (pending.userId && pending.userId !== user.user_id) {
        localStorage.removeItem(PENDING_TX_KEY);
        return;
      }

      // Guard 2: skip if polled less than 5 seconds ago
      if (pending.lastPolledAt && Date.now() - pending.lastPolledAt < 5000) {
        return;
      }

      // Update lastPolledAt before polling
      try {
        localStorage.setItem(PENDING_TX_KEY, JSON.stringify({ ...pending, lastPolledAt: Date.now() }));
      } catch { /* ignore */ }

      setLastPack(pending.packType);
      setPendingTxId(pending.txId);
      setReveal({ entropy: true });
      setLoadingType(pending.packType);

      try {
        const res = await fetch("/api/mint/fulfill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ txId: pending.txId }),
        });
        const data = await res.json();
        if (cancelled) return;

        if (data.success || data.alreadyFulfilled) {
          setPendingTxId(null);
          localStorage.removeItem(PENDING_TX_KEY);
          setReveal({
            cards: data.cards.map((c: { rarity: number; tokenId?: number; template?: { templateId?: string; name?: string; artworkUrl?: string } }) => ({
              rarity: c.rarity,
              tokenId: c.tokenId,
              template: c.template ? {
                id: c.template.templateId,
                name: c.template.name,
                artworkUrl: c.template.artworkUrl,
              } : undefined,
            })),
          });
          window.dispatchEvent(new Event("cards-updated"));
          fetch("/api/credits", { credentials: "include" })
            .then((r) => r.json())
            .then((d) => setBalance(d.balance ?? 0))
            .catch(() => {});
        } else if (data.retry) {
          // Still pending — leave in localStorage, clear UI
          setReveal(null);
          setLoadingType(null);
        } else {
          // Real error — clear
          localStorage.removeItem(PENDING_TX_KEY);
          setPendingTxId(null);
          setReveal(null);
          setLoadingType(null);
        }
      } catch {
        if (!cancelled) {
          // Network error — leave in localStorage for next visit
          setReveal(null);
          setLoadingType(null);
        }
      }
    };

    recover();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  const handleBuy = useCallback(
    async (packType: "standard" | "booster") => {
      if (!user) {
        router.push("/login?next=/collect");
        return;
      }
      setLoadingType(packType);
      setLastPack(packType);
      setReveal(null);
      try {
        const res = await fetch("/api/mint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ packType }),
        });
        const data = await res.json();
        if (res.ok) {
          // Refresh balance immediately
          fetch("/api/credits", { credentials: "include" })
            .then((r) => r.json())
            .then((d) => setBalance(d.balance ?? 0))
            .catch(() => {});
          window.dispatchEvent(new Event("balance-change"));

          const rawTxId = data.rawTxId;

          // If entropy flow, poll fulfill endpoint from client
          if (data.entropy && rawTxId) {
            // Track pending txId for timeout recovery
            setPendingTxId(rawTxId);
            // Signal entropy flow to PackReveal (no cards yet — still loading)
            setReveal({ entropy: true });

            // Client-side polling loop
            const maxAttempts = 15; // 15 × 2s = 30s max
            const pollInterval = 2000; // 2 seconds between attempts
            let attempts = 0;
            let fulfilled = false;

            while (attempts < maxAttempts && !fulfilled) {
              attempts++;
              try {
                const fulfillRes = await fetch("/api/mint/fulfill", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ txId: rawTxId }),
                });
                const fulfillData = await fulfillRes.json();

                if (fulfillData.success) {
                  fulfilled = true;
                  setPendingTxId(null);
                  try { localStorage.removeItem(PENDING_TX_KEY); } catch { /* ignore */ }
                  setReveal({
                    cards: fulfillData.cards.map((c: { rarity: number; cardId?: string; tokenId?: number; template?: { templateId?: string; name?: string; artworkUrl?: string } }) => ({
                      rarity: c.rarity,
                      tokenId: c.tokenId,
                      template: c.template ? {
                        id: c.template.templateId,
                        name: c.template.name,
                        artworkUrl: c.template.artworkUrl,
                      } : undefined,
                    })),
                    newBalance: data.newBalance,
                  });
                  window.dispatchEvent(new Event("cards-updated"));
                } else if (fulfillData.retry) {
                  // Seed not ready yet — wait and retry
                  await new Promise(r => setTimeout(r, pollInterval));
                } else {
                  // Real error — don't retry this session
                  setReveal({
                    error: "Something went wrong finalizing your cards. Please try again.",
                    refunded: false,
                    code: "transient",
                  });
                  break;
                }
              } catch {
                // Network error — wait and retry
                await new Promise(r => setTimeout(r, pollInterval));
              }
            }

            // Timeout after max attempts
            if (!fulfilled) {
              // Save to localStorage so we can auto-recover on next visit
              try {
                localStorage.setItem(PENDING_TX_KEY, JSON.stringify({
                  txId: rawTxId,
                  packType,
                  timestamp: Date.now(),
                  userId: user?.user_id,
                }));
              } catch { /* localStorage quota — ignore */ }

              setReveal({
                error: "Taking longer than expected. Please try again.",
                refunded: false,
                code: "transient",
              });
            }
          } else {
            // Legacy flow - show immediately
            setReveal(data as RevealResult);

            // Poll for card confirmation
            if (data.txId) {
              let attempts = 0;
              const maxAttempts = 40;
              const pollInterval = setInterval(async () => {
                attempts++;
                if (attempts >= maxAttempts) {
                  clearInterval(pollInterval);
                  return;
                }
                try {
                  const cardsRes = await fetch("/api/cards", { credentials: "include" });
                  if (cardsRes.ok) {
                    const cardsData = await cardsRes.json();
                    const hasPending = cardsData.cards?.some(
                      (c: { status: string; createdAt: string }) =>
                        c.status === "pending" && new Date(c.createdAt).getTime() > Date.now() - 300000
                    );
                    if (!hasPending) {
                      clearInterval(pollInterval);
                      window.dispatchEvent(new Event("cards-updated"));
                    }
                  }
                } catch {
                  // Ignore polling errors
                }
              }, 3000);
            }
          }
        } else {
          // Refresh balance after error (refund may have occurred)
          fetch("/api/credits", { credentials: "include" })
            .then((r) => r.json())
            .then((d) => setBalance(d.balance ?? 0))
            .catch(() => {});
          window.dispatchEvent(new Event("balance-change"));

          setReveal({
            error: "Something went wrong. Please try again.",
            refunded: data.refunded !== false,
            code: data.code,
          });
        }
      } catch {
        setReveal({ error: "Something went wrong. Please try again.", refunded: true, code: "transient" });
      } finally {
        setLoadingType(null);
      }
    },
    [user, router]
  );

  if (!ready) return null;

  return (
    <PageShell
      testId="packs-page"
      title={
        <>
          <span className="text-gradient-aurora">Choose Your Pack</span>
        </>
      }
      description="Open packs to discover new cards and build your collection."
    >
      {/* Balance */}
      {balance !== null && (
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mb-8">
          <span className="text-sm text-white/60">Your Balance: </span>
          <span className="text-lg font-display" style={{ color: "var(--aurora-gold)" }}>
            {balance.toLocaleString()} Credit
          </span>
          <Link
            href="/topup"
            className="btn-gold !py-1.5 !px-3 !text-xs"
            data-testid="packs-topup-btn"
          >
            Top Up
          </Link>
        </div>
      )}

      {/* Pack Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
        <PackCard
          type="standard"
          price={500}
          cardCount={5}
          guaranteedRare={1}
          onBuy={() => handleBuy("standard")}
          loading={loadingType === "standard"}
        />
        <PackCard
          type="booster"
          price={800}
          cardCount={10}
          guaranteedRare={2}
          onBuy={() => handleBuy("booster")}
          loading={loadingType === "booster"}
        />
      </div>

      {/* Drop rates */}
      <div className="mt-12 max-w-3xl mx-auto">
        <p className="text-center text-[0.72rem] uppercase tracking-[0.22em] mb-4" style={{ color: "var(--cosmic-violet)" }}>
          Drop Rates
        </p>
        <div className="glass p-5 flex flex-wrap items-center justify-center gap-3">
          {[
            { label: "Common", color: "var(--rarity-common)", pct: "60%" },
            { label: "Rare", color: "var(--rarity-rare)", pct: "27%" },
            { label: "Epic", color: "var(--rarity-epic)", pct: "10%" },
            { label: "Legendary", color: "var(--rarity-legendary)", pct: "3%" },
          ].map((r) => (
            <div key={r.label} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color, boxShadow: `0 0 10px ${r.color}` }} />
              <span className="text-xs text-white/70">{r.label}</span>
              <span className="text-xs font-display" style={{ color: r.color }}>{r.pct}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Reveal */}
      {reveal && (
        <PackReveal
          result={reveal}
          packLabel={lastPack === "booster" ? "Booster Pack" : "Standard Pack"}
          packType={lastPack}
          onRetry={async () => {
            // For timeout cases: re-check the pending transaction before allowing new one
            if (pendingTxId) {
              const txId = pendingTxId;
              setReveal({ entropy: true }); // show loading state
              setLoadingType(lastPack);

              try {
                const res = await fetch("/api/mint/fulfill", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ txId }),
                });
                const data = await res.json();

                if (data.success || data.alreadyFulfilled) {
                  // Transaction completed in background — show cards
                  setPendingTxId(null);
                  try { localStorage.removeItem(PENDING_TX_KEY); } catch { /* ignore */ }
                  setReveal({
                    cards: data.cards.map((c: { rarity: number; cardId?: string; tokenId?: number; template?: { templateId?: string; name?: string; artworkUrl?: string } }) => ({
                      rarity: c.rarity,
                      tokenId: c.tokenId,
                      template: c.template ? {
                        id: c.template.templateId,
                        name: c.template.name,
                        artworkUrl: c.template.artworkUrl,
                      } : undefined,
                    })),
                  });
                  window.dispatchEvent(new Event("cards-updated"));
                  fetch("/api/credits", { credentials: "include" })
                    .then((r) => r.json())
                    .then((d) => setBalance(d.balance ?? 0))
                    .catch(() => {});
                } else if (data.retry) {
                  // Still processing — continue polling
                  let fulfilled = false;
                  for (let i = 0; i < 10; i++) {
                    await new Promise(r => setTimeout(r, 2000));
                    const pollRes = await fetch("/api/mint/fulfill", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({ txId }),
                    });
                    const pollData = await pollRes.json();
                    if (pollData.success || pollData.alreadyFulfilled) {
                      fulfilled = true;
                      setPendingTxId(null);
                      try { localStorage.removeItem(PENDING_TX_KEY); } catch { /* ignore */ }
                      setReveal({
                        cards: pollData.cards.map((c: { rarity: number; cardId?: string; tokenId?: number; template?: { templateId?: string; name?: string; artworkUrl?: string } }) => ({
                          rarity: c.rarity,
                          tokenId: c.tokenId,
                          template: c.template ? {
                            id: c.template.templateId,
                            name: c.template.name,
                            artworkUrl: c.template.artworkUrl,
                          } : undefined,
                        })),
                      });
                      window.dispatchEvent(new Event("cards-updated"));
                      fetch("/api/credits", { credentials: "include" })
                        .then((r) => r.json())
                        .then((d) => setBalance(d.balance ?? 0))
                        .catch(() => {});
                      break;
                    }
                    if (!pollData.retry) break; // real error, stop polling
                  }
                  if (!fulfilled) {
                    // Still not done — leave in localStorage for auto-recovery on next visit
                    setPendingTxId(null);
                    setReveal({
                      error: "Still processing — we'll check again when you return.",
                      refunded: false,
                      code: "transient",
                    });
                  }
                } else {
                  // Real error — clear pending, let user start fresh
                  setPendingTxId(null);
                  try { localStorage.removeItem(PENDING_TX_KEY); } catch { /* ignore */ }
                  setReveal({
                    error: "Something went wrong. Please try again.",
                    refunded: false,
                    code: "transient",
                  });
                }
              } catch {
                // Network error on retry — restore error state
                setReveal({
                  error: "Something went wrong. Please try again.",
                  refunded: false,
                  code: "transient",
                });
              } finally {
                setLoadingType(null);
              }
            } else {
              // No pending tx (transient error or insufficient credits) — reset for new purchase
              setReveal(null);
              setLoadingType(null);
            }
          }}
        />
      )}
    </PageShell>
  );
}
