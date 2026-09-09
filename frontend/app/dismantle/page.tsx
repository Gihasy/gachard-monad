"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import PageShell from "@/components/PageShell";

const RARITY_COLORS = ["var(--rarity-common)", "var(--rarity-rare)", "var(--rarity-epic)", "var(--rarity-legendary)"];
const RARITY_GLOW = ["", "glow-rare", "glow-epic", "glow-legendary"];
const RARITY_LABELS = ["Common", "Rare", "Epic", "Legendary"];
const DISMANTLE_RATES = [20, 50, 120, 300];

type Card = {
  cardId: string | null;
  tokenId: number | null;
  templateId: string;
  templateName?: string;
  rarity: number;
  artworkUrl?: string;
  displayStatus?: string;
  isListed?: boolean;
};

export default function DismantlePage() {
  const [user, setUser] = useState<{ user_id: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [crystalBalance, setCrystalBalance] = useState<number | null>(null);

  // Lock state — persisted in localStorage per user
  const [locked, setLocked] = useState<Set<string>>(new Set());
  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Dismantle flow
  const [showConfirm, setShowConfirm] = useState(false);
  const [dismantling, setDismantling] = useState(false);
  const [result, setResult] = useState<{ crystal: number; count: number } | null>(null);

  // Mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("user");
    if (!stored) {
      window.location.replace("/login?next=/dismantle");
      return;
    }
    try {
      const u = JSON.parse(stored);
      setUser(u);
      setReady(true);
    } catch {
      window.localStorage.removeItem("user");
      window.location.replace("/login?next=/dismantle");
    }
  }, []);

  // Fetch cards + crystal balance
  const fetchData = useCallback(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      fetch("/api/cards", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/crystal", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([cardsData, crystalData]) => {
        const allCards: Card[] = cardsData.cards ?? [];
        // Only show Digital, not Listed
        const digital = allCards.filter(
          (c) => c.displayStatus === "Digital" && !c.isListed
        );
        setCards(digital);
        setCrystalBalance(crystalData.balance ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (ready && user) fetchData();
  }, [ready, user, fetchData]);

  // Load locked state from localStorage
  useEffect(() => {
    if (!user) return;
    try {
      const saved = localStorage.getItem(`gachard_locked_${user.user_id}`);
      if (saved) setLocked(new Set(JSON.parse(saved)));
    } catch {}
  }, [user]);

  // Save locked state
  const toggleLock = (cardId: string) => {
    setLocked((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      // Also deselect if locking
      if (next.has(cardId)) {
        setSelected((s) => {
          const ns = new Set(s);
          ns.delete(cardId);
          return ns;
        });
      }
      // Persist
      if (user) localStorage.setItem(`gachard_locked_${user.user_id}`, JSON.stringify([...next]));
      return next;
    });
  };

  const toggleSelect = (cardId: string) => {
    if (locked.has(cardId)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const selectAll = () => {
    const unlocked = cards.filter((c) => c.cardId && !locked.has(c.cardId)).map((c) => c.cardId!);
    setSelected(new Set(unlocked));
  };

  const deselectAll = () => setSelected(new Set());

  // Calculate totals
  const selectedCards = cards.filter((c) => c.cardId && selected.has(c.cardId));
  const totalCrystal = selectedCards.reduce((sum, c) => sum + (DISMANTLE_RATES[c.rarity] ?? 0), 0);

  // Dismantle
  const handleDismantle = async () => {
    if (!user || selectedCards.length === 0) return;
    setDismantling(true);
    let totalEarned = 0;
    let successCount = 0;

    for (const card of selectedCards) {
      try {
        const res = await fetch("/api/dismantle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ cardId: card.cardId, tokenId: card.tokenId }),
        });
        const data = await res.json();
        if (res.ok) {
          totalEarned += data.crystalReward ?? 0;
          successCount++;
        }
      } catch {
        // Continue with remaining cards
      }
    }

    setResult({ crystal: totalEarned, count: successCount });
    setDismantling(false);
    setShowConfirm(false);
    setSelected(new Set());
    // Refresh data
    fetchData();
    window.dispatchEvent(new Event("balance-change"));
  };

  if (!ready || !user) return null;

  return (
    <PageShell
      testId="dismantle-page"
      eyebrow="Burn to Earn"
      title={
        <>
          <span className="text-gradient-aurora">Dismantle</span> Cards
        </>
      }
      description="Select cards to permanently destroy them on the blockchain and receive Crystal."
    >
      {/* Crystal balance + back link */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <Link href="/profile" className="btn-ghost !py-2 !px-4 !text-xs">
          ← Back to Profile
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/50 uppercase tracking-widest">Crystal Balance:</span>
          <span className="font-display text-lg" style={{ color: "var(--crystal)" }}>
            {(crystalBalance ?? 0).toLocaleString()}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="glass p-16 text-center text-white/50">
          <span className="inline-block w-6 h-6 rounded-full border-2 border-white/20 border-t-white/70 animate-spin mb-3" />
          <p>Loading cards…</p>
        </div>
      ) : cards.length === 0 ? (
        <div className="glass p-16 text-center text-white/50">
          <p className="mb-2">No Digital cards available to dismantle.</p>
          <p className="text-xs text-white/30">Cards that are Listed, In Progress, or Physical cannot be dismantled.</p>
        </div>
      ) : (
        <>
          {/* Selection controls */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <button onClick={selectAll} className="btn-ghost !py-1.5 !px-3 !text-[0.65rem]">
                Select All Unlocked
              </button>
              <button onClick={deselectAll} className="btn-ghost !py-1.5 !px-3 !text-[0.65rem]">
                Deselect All
              </button>
            </div>
            <p className="text-xs text-white/40">
              <svg className="inline w-3.5 h-3.5 mr-1 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Locked cards cannot be selected for dismantle
            </p>
          </div>

          {/* Card grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
            {cards.map((card) => {
              if (!card.cardId) return null;
              const isLocked = locked.has(card.cardId);
              const isSelected = selected.has(card.cardId);
              const crystal = DISMANTLE_RATES[card.rarity] ?? 0;

              return (
                <div
                  key={card.cardId}
                  className={`glass overflow-hidden p-2 transition-all ${RARITY_GLOW[card.rarity] || ""} ${isSelected ? "ring-2" : ""}`}
                  style={{
                    borderColor: isSelected ? "var(--crystal)" : RARITY_COLORS[card.rarity],
                    opacity: isLocked ? 0.5 : 1,
                    boxShadow: isSelected ? "0 0 12px rgba(125,249,255,0.3), inset 0 0 12px rgba(125,249,255,0.1)" : undefined,
                  }}
                >
                  {/* Card artwork with select overlay */}
                  <div
                    className="relative w-full overflow-hidden rounded-lg mb-2 cursor-pointer"
                    style={{ aspectRatio: "5/7" }}
                    onClick={() => toggleSelect(card.cardId!)}
                  >
                    {card.artworkUrl ? (
                      <Image src={card.artworkUrl} alt={card.templateName ?? card.templateId} fill className="object-cover" sizes="200px" />
                    ) : (
                      <div className="w-full h-full bg-white/5 flex items-center justify-center text-xs text-white/30">No artwork</div>
                    )}
                    {/* Select checkbox overlay */}
                    <div
                      className="absolute top-2 left-2 w-6 h-6 rounded-md flex items-center justify-center transition-all"
                      style={{
                        background: isSelected ? "var(--crystal)" : "rgba(0,0,0,0.5)",
                        border: isSelected ? "none" : "1.5px solid rgba(255,255,255,0.3)",
                      }}
                    >
                      {isSelected && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0B0E1A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      )}
                    </div>
                    {/* Lock toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLock(card.cardId!);
                      }}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
                      style={{
                        background: isLocked ? "rgba(255,107,186,0.35)" : "rgba(11,14,26,0.8)",
                        border: isLocked ? "1.5px solid rgba(255,107,186,0.7)" : "1.5px solid rgba(255,255,255,0.35)",
                        backdropFilter: "blur(4px)",
                      }}
                      title={isLocked ? "Unlock card" : "Lock card (prevent dismantle)"}
                    >
                      {isLocked ? (
                        /* Locked padlock */
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="rgba(255,107,186,0.3)" stroke="#FF6BBA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      ) : (
                        /* Unlocked padlock */
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Card info */}
                  <p className="text-xs font-semibold truncate mb-0.5" style={{ color: "var(--silver-mist)" }}>
                    {card.templateName ?? card.templateId}
                  </p>
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[0.6rem] uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(255,255,255,0.06)", color: RARITY_COLORS[card.rarity] }}
                    >
                      {RARITY_LABELS[card.rarity]}
                    </span>
                    <span className="text-[0.65rem] font-semibold" style={{ color: "var(--crystal)" }}>
                      +{crystal}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary bar */}
          <div
            className="p-4 sm:p-5 flex items-center justify-between flex-wrap gap-4 sticky bottom-4 z-10 rounded-2xl"
            style={{
              background: "linear-gradient(135deg, rgba(20,24,48,0.98), rgba(30,20,50,0.98))",
              border: `1px solid ${selected.size > 0 ? "rgba(125,249,255,0.4)" : "rgba(184,172,255,0.2)"}`,
              boxShadow: selected.size > 0
                ? "0 -4px 30px rgba(125,249,255,0.15), 0 0 60px rgba(125,249,255,0.05)"
                : "0 -4px 30px rgba(0,0,0,0.6), 0 0 40px rgba(184,172,255,0.03)",
            }}
          >
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[0.6rem] uppercase tracking-widest text-white/50">Selected</p>
                <p className="font-display text-lg" style={{ color: selected.size > 0 ? "var(--crystal)" : "rgba(255,255,255,0.3)" }}>
                  {selected.size} card{selected.size !== 1 ? "s" : ""}
                </p>
              </div>
              <div>
                <p className="text-[0.6rem] uppercase tracking-widest text-white/50">You&apos;ll Receive</p>
                <p className="font-display text-lg" style={{ color: totalCrystal > 0 ? "var(--crystal)" : "rgba(255,255,255,0.3)" }}>
                  +{totalCrystal.toLocaleString()} Crystal
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={selected.size === 0}
              className="font-semibold py-3 px-8 rounded-full text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer hover:-translate-y-px"
              style={{
                background: selected.size > 0 ? "linear-gradient(135deg, rgba(255,107,186,0.9), rgba(184,172,255,0.9))" : "rgba(255,255,255,0.05)",
                color: selected.size > 0 ? "#fff" : "rgba(255,255,255,0.3)",
                border: "none",
                boxShadow: selected.size > 0 ? "0 8px 26px -8px rgba(255,107,186,0.55)" : "none",
              }}
            >
              Dismantle {selected.size > 0 ? `(${selected.size})` : ""}
            </button>
          </div>
        </>
      )}

      {/* Result toast */}
      {result && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 glass p-4 rounded-2xl flex items-center gap-4"
          style={{ border: "1px solid rgba(125,249,255,0.3)", boxShadow: "0 0 30px rgba(125,249,255,0.15)" }}
        >
          <span className="text-sm" style={{ color: "var(--crystal)" }}>
            +{result.crystal.toLocaleString()} Crystal earned from {result.count} card{result.count !== 1 ? "s" : ""}!
          </span>
          <button onClick={() => setResult(null)} className="text-white/40 hover:text-white text-xs">✕</button>
        </div>
      )}

      {/* Confirmation modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{
              background: "rgba(15,19,36,0.95)",
              border: "1px solid rgba(255,107,186,0.3)",
              boxShadow: "0 0 40px rgba(255,107,186,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-2" style={{ color: "var(--silver-mist)" }}>
              Dismantle {selected.size} Card{selected.size !== 1 ? "s" : ""}?
            </h3>
            <p className="text-sm mb-2" style={{ color: "var(--silver-mist-dim)" }}>
              This will permanently destroy {selected.size === 1 ? "this card" : "these cards"}. This cannot be undone.
            </p>

            {/* Breakdown */}
            <div className="glass p-3 mb-4 rounded-lg">
              {Object.entries(
                selectedCards.reduce((acc, c) => {
                  const label = RARITY_LABELS[c.rarity];
                  acc[label] = (acc[label] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)
              ).map(([rarity, count]) => (
                <div key={rarity} className="flex items-center justify-between text-xs py-0.5">
                  <span className="text-white/60">{count}× {rarity}</span>
                  <span style={{ color: "var(--crystal)" }}>+{count * (DISMANTLE_RATES[RARITY_LABELS.indexOf(rarity)] ?? 0)}</span>
                </div>
              ))}
              <div className="border-t border-white/10 mt-1 pt-1 flex items-center justify-between text-sm font-semibold">
                <span style={{ color: "var(--silver-mist)" }}>Total</span>
                <span style={{ color: "var(--crystal)" }}>+{totalCrystal.toLocaleString()} Crystal</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="btn-ghost flex-1 !py-2.5">
                Cancel
              </button>
              <button
                onClick={handleDismantle}
                disabled={dismantling}
                className="flex-1 !py-2.5 font-semibold rounded-full transition-transform hover:-translate-y-px cursor-pointer disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, rgba(255,107,186,0.9), rgba(184,172,255,0.9))",
                  color: "#fff",
                  border: "none",
                  boxShadow: "0 8px 26px -8px rgba(255,107,186,0.55)",
                }}
              >
                {dismantling ? "Dismantling…" : "Confirm Dismantle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
