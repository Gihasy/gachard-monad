"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import CardItem from "@/components/CardItem";

type SessionUser = { user_id: string; username: string; email?: string };
type Card = {
  cardId?: string | null;
  tokenId: number | null;
  templateId: string;
  rarity: number;
  displayStatus?: string;
  artworkUrl?: string;
  templateName?: string;
  requestedAt?: string | null;
  deliveredAt?: string | null;
  claimId?: string | null;
  isNew?: boolean;
  isListed?: boolean;
  listingId?: string | null;
  listingPrice?: number | null;
};

export default function Profil() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [crystalBalance, setCrystalBalance] = useState<number | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [redeemCardId, setRedeemCardId] = useState("");
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [page, setPage] = useState(0);
  const CARDS_PER_PAGE = 6;
  type Tx = {
    id: string;
    type: string;
    tokenId: number | null;
    cardId: string | null;
    tokenIds: number[] | null;
    cardIds: string[] | null;
    status: string;
    amount: number | null;
    createdAt: string;
  };
  const [transactions, setTransactions] = useState<Tx[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("user");
    if (!stored) {
      window.location.replace("/login?next=/profile");
      return;
    }
    try {
      setUser(JSON.parse(stored));
      setReady(true);
    } catch {
      window.localStorage.removeItem("user");
      window.location.replace("/login?next=/profile");
    }
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    fetch("/api/credits", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { balance?: number }) => {
        if (!cancelled) setBalance(d.balance ?? 0);
      })
      .catch(() => {
        if (!cancelled) setBalance(0);
      });

    fetch("/api/crystal", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { balance?: number }) => {
        if (!cancelled) setCrystalBalance(d.balance ?? 0);
      })
      .catch(() => {});

    fetch("/api/cards", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { cards?: Card[] }) => {
        if (!cancelled) {
          setCards(d.cards ?? []);
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
        }
      })
      .catch(() => {});

    fetch("/api/transactions", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { transactions?: Tx[] }) => {
        if (!cancelled) setTransactions(d.transactions ?? []);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  const stats = {
    total: cards.length,
    legendary: cards.filter((c) => c.rarity === 3).length,
    epic: cards.filter((c) => c.rarity === 2).length,
    rare: cards.filter((c) => c.rarity === 1).length,
    common: cards.filter((c) => c.rarity === 0).length,
    digital: cards.filter((c) => (c.displayStatus ?? "Digital") === "Digital").length,
    inProgress: cards.filter((c) => c.displayStatus === "In Progress").length,
    physical: cards.filter((c) => c.displayStatus === "Physical").length,
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("gachard_cart");
    localStorage.removeItem("gachard_wishlist");
    document.cookie = "gachard_uid=; path=/; max-age=0; SameSite=Lax";
    window.dispatchEvent(new Event("auth-change"));
    window.dispatchEvent(new CustomEvent("gachard-cart-change"));
    router.push("/");
  };

  const handleRedeem = async () => {
    if (!user || !redeemCardId.trim() || !redeemCode.trim()) return;
    setRedeemLoading(true);
    setRedeemMessage(null);
    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          cardId: redeemCardId.trim().toLowerCase(),
          code: redeemCode.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRedeemMessage({
          text: `Card #${redeemCardId} redeemed successfully! It's now in your collection.`,
          ok: true,
        });
        setRedeemCardId("");
        setRedeemCode("");
        fetch("/api/cards", { credentials: "include" })
          .then((r) => r.json())
          .then((d: { cards?: Card[] }) => setCards(d.cards ?? []))
          .catch(() => {});
      } else {
        setRedeemMessage({ text: data.error || "Redeem failed", ok: false });
      }
    } catch {
      setRedeemMessage({ text: "Network error", ok: false });
    } finally {
      setRedeemLoading(false);
    }
  };

  if (!ready || !user) return null;

  return (
    <PageShell
      testId="profile-page"
      title={
        <>
          <span className="text-gradient-aurora">Profile</span>
        </>
      }
      description="Your Gachard identity, credit balance, and collection at a glance."
      actions={
        <>
          <Link href="/creators" className="btn-primary" data-testid="profile-creators-btn">
            Become a Creator
          </Link>
          <button
            onClick={handleLogout}
            className="btn-ghost"
            data-testid="profile-logout-btn"
          >
            Log out
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:gap-6 lg:gap-8 lg:grid-cols-[1fr_1.6fr]">
        {/* Left column: Profile + Stats + Redeem */}
        <div className="space-y-4 sm:space-y-6">
          {/* Identity + Balance */}
          <div className="glass p-4 sm:p-6 lg:p-8" data-testid="profile-identity">
            <div className="flex items-center gap-3 sm:gap-5 mb-4 sm:mb-6">
              <div
                className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 rounded-2xl sm:rounded-3xl flex items-center justify-center shrink-0 font-display text-2xl sm:text-3xl text-white"
                style={{
                  background:
                    "linear-gradient(135deg, var(--cosmic-violet-deep), var(--aurora-pink) 60%, var(--electric-blue))",
                  boxShadow: "0 12px 40px -8px rgba(138,92,255,0.5)",
                }}
                data-testid="profile-avatar"
              >
                {user?.username?.charAt(0).toUpperCase() ?? "G"}
              </div>
              <div className="min-w-0">
                <p
                  className="font-display text-lg sm:text-xl lg:text-2xl text-white truncate"
                  data-testid="profile-username"
                >
                  @{user?.username ?? "player"}
                </p>
                {user?.email && (
                  <p className="text-sm text-white/60 truncate">
                    {user.email}
                  </p>
                )}
              </div>
            </div>

            <div
              className="p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl flex items-center justify-between gap-3"
              style={{
                background:
                  "linear-gradient(135deg, rgba(255,196,102,0.12), rgba(255,107,186,0.06))",
                border: "1px solid rgba(255,196,102,0.3)",
              }}
              data-testid="profile-balance"
            >
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.22em] text-white/60 mb-1">
                  Credit Balance
                </p>
                <p
                  className="font-display text-lg sm:text-xl lg:text-2xl"
                  style={{ color: "var(--aurora-gold)" }}
                >
                  {(balance ?? 0).toLocaleString()}
                </p>
              </div>
              <Link
                href="/topup"
                className="btn-gold !py-2 !px-3 sm:!py-2.5 sm:!px-4 !text-[0.6rem] sm:!text-[0.7rem] whitespace-nowrap"
                data-testid="profile-balance-topup"
              >
                Top Up
              </Link>
            </div>

            <div
              className="p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl flex items-center justify-between gap-3"
              style={{
                background:
                  "linear-gradient(135deg, rgba(125,249,255,0.12), rgba(184,172,255,0.06))",
                border: "1px solid rgba(125,249,255,0.3)",
              }}
              data-testid="profile-crystal-balance"
            >
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.22em] text-white/60 mb-1">
                  Crystal Balance
                </p>
                <p
                  className="font-display text-lg sm:text-xl lg:text-2xl"
                  style={{ color: "var(--crystal)" }}
                >
                  {(crystalBalance ?? 0).toLocaleString()}
                </p>
              </div>
              <Link
                href="/dismantle"
                className="btn-crystal !py-2 !px-3 sm:!py-2.5 sm:!px-4 !text-[0.6rem] sm:!text-[0.7rem] whitespace-nowrap"
                data-testid="profile-crystal-dismantle"
              >
                Dismantle
              </Link>
            </div>
          </div>

          {/* Collection Stats */}
          <div className="glass p-4 sm:p-6" data-testid="profile-stats">
            <p
              className="text-[0.65rem] sm:text-[0.72rem] uppercase tracking-[0.22em] mb-3 sm:mb-4"
              style={{ color: "var(--cosmic-violet)" }}
            >
              Collection Stats
            </p>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <StatBlock label="Total" value={stats.total} color="#FFFFFF" />
              <StatBlock label="Digital" value={stats.digital} color="var(--electric-blue)" />
              <StatBlock label="In Progress" value={stats.inProgress} color="var(--aurora-gold)" />
              <StatBlock label="Physical" value={stats.physical} color="#00ff88" />
              <StatBlock label="Legendary" value={stats.legendary} color="var(--aurora-gold)" />
              <StatBlock label="Epic" value={stats.epic} color="var(--cosmic-violet)" />
            </div>

            {/* Rarity distribution bar */}
            <div className="mt-4 sm:mt-5">
              <p className="text-[0.55rem] sm:text-[0.6rem] uppercase tracking-widest text-white/40 mb-1.5 sm:mb-2">Rarity Mix</p>
              <div className="flex h-2.5 rounded-full overflow-hidden bg-white/[0.05]" data-testid="profile-rarity-bar">
                {stats.total > 0 ? (
                  [
                    { v: stats.common, c: "var(--rarity-common)" },
                    { v: stats.rare, c: "var(--rarity-rare)" },
                    { v: stats.epic, c: "var(--rarity-epic)" },
                    { v: stats.legendary, c: "var(--rarity-legendary)" },
                  ].map((seg, i) => (
                    <div key={i} style={{ width: `${(seg.v / stats.total) * 100}%`, background: seg.c }} />
                  ))
                ) : (
                  <div className="w-full" style={{ background: "rgba(255,255,255,0.05)" }} />
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                {[
                  { label: "Common", v: stats.common, c: "var(--rarity-common)" },
                  { label: "Rare", v: stats.rare, c: "var(--rarity-rare)" },
                  { label: "Epic", v: stats.epic, c: "var(--rarity-epic)" },
                  { label: "Legendary", v: stats.legendary, c: "var(--rarity-legendary)" },
                ].map((seg) => (
                  <span key={seg.label} className="inline-flex items-center gap-1.5 text-[0.65rem] text-white/55">
                    <span className="w-2 h-2 rounded-full" style={{ background: seg.c }} />
                    {seg.label} · {seg.v}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Redeem Card */}
          <div
            className="glass p-4 sm:p-6"
            data-testid="profile-redeem"
            style={{ borderColor: "rgba(0,255,136,0.2)" }}
          >
            <p
              className="text-[0.65rem] sm:text-[0.72rem] uppercase tracking-[0.22em] mb-2 sm:mb-3"
              style={{ color: "#00ff88" }}
            >
              Redeem a Physical Card
            </p>
            <p className="text-[0.7rem] sm:text-xs text-white/50 mb-3 sm:mb-4">
              Received a physical card? Enter the Card ID and the redeem code printed on the card to transfer ownership to your account.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-[0.65rem] uppercase tracking-widest text-white/40 mb-1.5">
                  Card ID
                </label>
                <div
                  className="flex items-center bg-white/[0.04] border border-white/[0.1] rounded-xl px-4 py-2.5"
                >
                  <span className="text-sm text-white/40 mr-1 font-mono">#</span>
                  <input
                    type="text"
                    value={redeemCardId}
                    onChange={(e) => setRedeemCardId(e.target.value)}
                    placeholder="8a866"
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
                    data-testid="redeem-card-input"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[0.65rem] uppercase tracking-widest text-white/40 mb-1.5">
                  Redeem Code
                </label>
                <input
                  type="text"
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value)}
                  placeholder="e.g. xIdVoe2A0TWZvNOR"
                  className="w-full bg-white/[0.04] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 font-mono"
                  data-testid="redeem-code-input"
                />
              </div>
              <button
                onClick={handleRedeem}
                disabled={redeemLoading || !redeemCardId.trim() || !redeemCode.trim()}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,204,255,0.15))",
                  border: "1px solid rgba(0,255,136,0.4)",
                  color: "#00ff88",
                }}
                data-testid="redeem-submit-btn"
              >
                {redeemLoading ? "Redeeming..." : "Redeem Card"}
              </button>
            </div>
            {redeemMessage && (
              <div
                className="mt-3 p-3 rounded-xl text-sm"
                style={{
                  background: redeemMessage.ok ? "rgba(0,255,136,0.08)" : "rgba(255,107,186,0.08)",
                  border: redeemMessage.ok
                    ? "1px solid rgba(0,255,136,0.3)"
                    : "1px solid rgba(255,107,186,0.3)",
                  color: redeemMessage.ok ? "#00ff88" : "#ff6bba",
                }}
                data-testid="redeem-message"
              >
                {redeemMessage.text}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Card Collection */}
        <div>
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <p
              className="text-[0.65rem] sm:text-[0.72rem] uppercase tracking-[0.22em]"
              style={{ color: "var(--cosmic-violet)" }}
            >
              Your Collection
            </p>
            <Link
              href="/collection"
              className="text-xs text-white/50 hover:text-white transition-colors"
            >
              View All →
            </Link>
          </div>

          {cards.length === 0 ? (
            <div
              className="glass p-6 sm:p-8 lg:p-10 text-center"
              data-testid="profile-empty"
              style={{
                background:
                  "linear-gradient(135deg, rgba(184,172,255,0.10), rgba(255,107,186,0.05))",
                borderColor: "rgba(184,172,255,0.25)",
              }}
            >
              <p className="text-white/70 mb-4">
                You haven't opened any packs yet. Your journey starts with your
                first card.
              </p>
              <Link href="/collect" className="btn-primary" data-testid="profile-first-pack">
                Open First Pack
              </Link>
            </div>
          ) : (
            <>
              {(() => {
                const visibleCards = cards.filter((c) => c.displayStatus !== "Burned");
                const totalPages = Math.ceil(visibleCards.length / CARDS_PER_PAGE);
                return (
              <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
                {visibleCards.slice(page * CARDS_PER_PAGE, (page + 1) * CARDS_PER_PAGE).map((card, i) => (
                  <CardItem
                    key={card.tokenId ?? `card-${i}`}
                    cardId={card.cardId}
                    tokenId={card.tokenId}
                    templateId={card.templateId}
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

              {/* Pagination */}
              {visibleCards.length > CARDS_PER_PAGE && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-colors disabled:opacity-30"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                    data-testid="profile-prev-page"
                  >
                    ‹
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i)}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-medium transition-colors"
                      style={{
                        background: i === page ? "rgba(184,172,255,0.2)" : "rgba(255,255,255,0.05)",
                        border: `1px solid ${i === page ? "rgba(184,172,255,0.4)" : "rgba(255,255,255,0.08)"}`,
                        color: i === page ? "white" : "rgba(255,255,255,0.5)",
                      }}
                      data-testid={`profile-page-${i + 1}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-colors disabled:opacity-30"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                    data-testid="profile-next-page"
                  >
                    ›
                  </button>
                </div>
              )}
              </>
              );
              })()}
            </>
          )}
        </div>
      </div>

      {/* Transaction History */}
      {transactions.length > 0 && (
        <div className="mt-8" data-testid="profile-transactions">
          <p
            className="text-[0.72rem] uppercase tracking-[0.22em] mb-4"
            style={{ color: "var(--cosmic-violet)" }}
          >
            Transaction History
          </p>
          <div className="glass overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-4 py-3 text-[0.65rem] uppercase tracking-widest text-white/40 font-medium">Invoice</th>
                    <th className="text-left px-4 py-3 text-[0.65rem] uppercase tracking-widest text-white/40 font-medium">Type</th>
                    <th className="text-left px-4 py-3 text-[0.65rem] uppercase tracking-widest text-white/40 font-medium">Details</th>
                    <th className="text-left px-4 py-3 text-[0.65rem] uppercase tracking-widest text-white/40 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-[0.65rem] uppercase tracking-widest text-white/40 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]" data-testid={`tx-row-${tx.id}`}>
                      <td className="px-4 py-3 font-mono text-xs text-white/80">{tx.id}</td>
                      <td className="px-4 py-3">
                        <span
                          className="text-[0.6rem] uppercase tracking-widest px-2 py-0.5 rounded"
                          style={{
                            background:
                              tx.type === "topup"
                                ? "rgba(0,255,136,0.12)"
                                : tx.type === "mint"
                                ? "rgba(0,204,255,0.12)"
                                : tx.type === "print"
                                ? "rgba(255,196,102,0.12)"
                                : "rgba(184,172,255,0.12)",
                            color:
                              tx.type === "topup"
                                ? "#00ff88"
                                : tx.type === "mint"
                                ? "var(--electric-blue)"
                                : tx.type === "print"
                                ? "var(--aurora-gold)"
                                : "var(--cosmic-violet)",
                          }}
                        >
                          {tx.type === "topup" ? "Top Up" : tx.type === "mint" ? "Pack" : tx.type === "print" ? "Print" : tx.type === "redeem" ? "Redeem" : tx.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/60 text-xs">
                        {tx.type === "topup" && tx.amount
                          ? `${tx.amount.toLocaleString()} Credit`
                          : tx.type === "mint" && tx.cardIds?.length
                          ? `${tx.cardIds.length} cards`
                          : tx.type === "mint" && tx.tokenIds
                          ? `${tx.tokenIds.length} cards`
                          : tx.type === "mint"
                          ? "—"
                          : (tx.type === "sold" || tx.type === "dismantled") && tx.amount
                          ? `${tx.amount.toLocaleString()} Crystal`
                          : tx.cardId
                          ? `#${tx.cardId}`
                          : tx.tokenId
                          ? `#${tx.tokenId}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-[0.6rem] uppercase tracking-widest px-2 py-0.5 rounded"
                          style={{
                            background:
                              tx.status === "Success"
                                ? "rgba(0,204,255,0.12)"
                                : tx.status === "Failed"
                                ? "rgba(255,107,186,0.12)"
                                : "rgba(255,196,102,0.12)",
                            color:
                              tx.status === "Success"
                                ? "var(--electric-blue)"
                                : tx.status === "Failed"
                                ? "var(--aurora-pink)"
                                : "var(--aurora-gold)",
                          }}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-white/50">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function StatBlock({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-white/[0.03] border border-white/[0.06] text-center"
      data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <p className="font-display text-base sm:text-lg lg:text-xl" style={{ color }}>
        {value}
      </p>
      <p className="text-[0.5rem] sm:text-[0.6rem] uppercase tracking-widest text-white/50 mt-0.5">
        {label}
      </p>
    </div>
  );
}
