"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import CardItem from "@/components/CardItem";
import PageShell from "@/components/PageShell";

const RARITY_TABS = [
  { key: "all", label: "All", code: -1 },
  { key: "legendary", label: "Legendary", code: 3 },
  { key: "epic", label: "Epic", code: 2 },
  { key: "rare", label: "Rare", code: 1 },
  { key: "common", label: "Common", code: 0 },
];

type Card = {
  cardId?: string | null;
  templateId: string;
  templateName?: string;
  tokenId: number | null;
  rarity: number;
  artworkUrl?: string;
  displayStatus?: string;
  requestedAt?: string | null;
  deliveredAt?: string | null;
  claimId?: string | null;
  isNew?: boolean;
  isListed?: boolean;
  listingId?: string | null;
  listingPrice?: number | null;
};

export default function Koleksi() {
  const [user, setUser] = useState<{ user_id: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>("all");

  // Mount-only: hydrate session + trigger the middleware fallback if the
  // client happens to be reached without the cookie somehow. React setters
  // are stable and don't need to be in deps.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("user");
    if (!stored) {
      window.location.replace("/login");
      return;
    }
    try {
      setUser(JSON.parse(stored));
      setReady(true);
    } catch {
      window.location.replace("/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      setLoading(false);
    }, 6000);
    fetch("/api/cards", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { cards?: Card[] }) => {
        if (timedOut) return;
        clearTimeout(timer);
        setCards(d.cards ?? []);
        setLoading(false);
        // Mark new cards as viewed after 2 seconds
        const newCardIds = (d.cards ?? []).filter((c) => c.isNew).map((c) => c.cardId).filter(Boolean);
        if (newCardIds.length > 0) {
          setTimeout(() => {
            fetch("/api/cards/view", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ cardIds: newCardIds }),
            }).then(() => {
              setCards((prev) => prev.map((c) => ({ ...c, isNew: false })));
            }).catch(() => {});
          }, 2000);
        }
      })
      .catch(() => {
        clearTimeout(timer);
        setLoading(false);
      });
    return () => clearTimeout(timer);
  }, [ready, user]);

  const counts = useMemo(() => {
    const c = { all: cards.length, common: 0, rare: 0, epic: 0, legendary: 0 };
    cards.forEach((card) => {
      if (card.rarity === 0) c.common++;
      if (card.rarity === 1) c.rare++;
      if (card.rarity === 2) c.epic++;
      if (card.rarity === 3) c.legendary++;
    });
    return c as Record<string, number>;
  }, [cards]);

  const filtered = useMemo(() => {
    const visible = cards.filter((c) => c.displayStatus !== "Burned");
    if (tab === "all") return visible;
    const code = RARITY_TABS.find((t) => t.key === tab)?.code ?? -1;
    return visible.filter((c) => c.rarity === code);
  }, [cards, tab]);

  if (!ready || !user) return null;

  return (
    <PageShell
      testId="collection-page"
      eyebrow="Your Vault"
      title={
        <>
          My{" "}
          <span className="text-gradient-aurora">Collection</span>
        </>
      }
      description="Every card you own — physical, digital, or vaulted. Filter by rarity, request a print, or share via QR."
      actions={
        <Link href="/" className="btn-primary" data-testid="collection-buy-pack-btn">
          Buy a Pack
        </Link>
      }
    >
      {/* Rarity tabs */}
      <div
        className="flex flex-wrap gap-2 mb-8"
        data-testid="rarity-tabs"
        role="tablist"
      >
        {RARITY_TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="relative inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs uppercase tracking-[0.14em] font-medium transition-all"
              style={{
                background: active
                  ? "linear-gradient(135deg, rgba(184,172,255,0.18), rgba(255,107,186,0.12))"
                  : "rgba(255,255,255,0.04)",
                border: active
                  ? "1px solid rgba(184,172,255,0.5)"
                  : "1px solid rgba(255,255,255,0.10)",
                color: active ? "#FFFFFF" : "rgba(230,232,240,0.72)",
              }}
              data-testid={`tab-${t.key}`}
            >
              {t.label}
              <span
                className="text-[0.65rem] font-bold px-1.5 py-0.5 rounded"
                style={{
                  background: "rgba(11,14,26,0.5)",
                  color: active ? "var(--cosmic-violet)" : "rgba(230,232,240,0.5)",
                }}
              >
                {counts[t.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-5"
          data-testid="collection-loading"
        >
          {Array.from({ length: 8 }, (_, i) => `skeleton-${i}`).map((k) => (
            <div
              key={k}
              className="glass p-3"
              style={{ minHeight: 320 }}
            >
              <div className="aspect-[3/4] rounded-xl bg-white/5 mb-3" />
              <div className="h-4 rounded bg-white/5 mb-2" />
              <div className="h-3 rounded bg-white/5 w-2/3" />
            </div>
          ))}
        </div>
      ) : cards.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <div
          className="glass p-10 text-center"
          data-testid="collection-empty-filter"
        >
          <p className="text-white/70">No cards in this rarity yet.</p>
        </div>
      ) : (
        <div
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5"
          data-testid="collection-grid"
        >
          {filtered.map((card) => (
            <CardItem
              key={card.templateId + (card.tokenId ?? "")}
              cardId={card.cardId}
              tokenId={card.tokenId}
              templateId={card.templateId}
              templateName={card.templateName}
              rarity={card.rarity}
              artworkUrl={card.artworkUrl || ""}
              status={card.displayStatus || "Digital"}
              requestedAt={card.requestedAt}
              deliveredAt={card.deliveredAt}
              isNew={card.isNew}
              onStatusChange={(tokenId, newStatus) => {
                setCards((prev) =>
                  prev.map((c) =>
                    c.tokenId === tokenId ? { ...c, displayStatus: newStatus } : c
                  )
                );
              }}
              claimId={card.claimId}
              userId={user.user_id}
              isListed={card.isListed}
              listingId={card.listingId}
              listingPrice={card.listingPrice}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function EmptyState() {
  return (
    <div
      className="glass p-8 sm:p-10 lg:p-14 text-center max-w-xl mx-auto"
      data-testid="collection-empty"
    >
      <div
        className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center"
        style={{
          background:
            "linear-gradient(135deg, rgba(184,172,255,0.2), rgba(255,107,186,0.1))",
          border: "1px solid rgba(184,172,255,0.35)",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2l3 4h6l-4.8 5L18 20l-6-3.5L6 20l1.8-9L3 6h6l3-4z"
            stroke="var(--cosmic-violet)"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="font-display uppercase text-2xl text-white mb-3">
        Your vault is empty
      </h2>
      <p className="text-white/60 mb-6">
        Open your first pack and start your collection.
      </p>
      <Link href="/" className="btn-primary" data-testid="empty-buy-pack">
        Open First Pack
      </Link>
    </div>
  );
}
