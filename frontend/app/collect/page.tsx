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

export default function PacksPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [reveal, setReveal] = useState<RevealResult | null>(null);
  const [loadingType, setLoadingType] = useState<"standard" | "booster" | null>(null);
  const [lastPack, setLastPack] = useState<"standard" | "booster">("standard");

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
          setReveal(data as RevealResult);
          // Refresh balance
          fetch("/api/credits", { credentials: "include" })
            .then((r) => r.json())
            .then((d) => setBalance(d.balance ?? 0))
            .catch(() => {});
          window.dispatchEvent(new Event("balance-change"));

          // Poll for card confirmation every 3 seconds for up to 2 minutes
          const txId = data.txId;
          if (txId) {
            let attempts = 0;
            const maxAttempts = 40; // 40 * 3s = 120s
            const pollInterval = setInterval(async () => {
              attempts++;
              if (attempts >= maxAttempts) {
                clearInterval(pollInterval);
                return;
              }
              try {
                // Fetch cards to trigger auto-reconciliation
                const cardsRes = await fetch("/api/cards", { credentials: "include" });
                if (cardsRes.ok) {
                  const cardsData = await cardsRes.json();
                  // Check if any cards from this mint are still pending
                  const hasPending = cardsData.cards?.some(
                    (c: { status: string; createdAt: string }) =>
                      c.status === "pending" && new Date(c.createdAt).getTime() > Date.now() - 300000
                  );
                  if (!hasPending) {
                    clearInterval(pollInterval);
                    // Update reveal data with confirmed cards
                    window.dispatchEvent(new Event("cards-updated"));
                  }
                }
              } catch {
                // Ignore polling errors
              }
            }, 3000);
          }
        } else {
          setReveal({ error: data.error || "Failed to open pack" });
        }
      } catch {
        setReveal({ error: "Network error. Please try again." });
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
        />
      )}
    </PageShell>
  );
}
