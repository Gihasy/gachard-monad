"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import CardDetailModal from "@/components/CardDetailModal";
import { useWishlist } from "@/hooks/useWishlist";
import { useCart } from "@/hooks/useCart";

interface Listing {
  listingId: string;
  cardId: string;
  tokenId: number;
  templateId: string;
  sellerId: string;
  price: number;
  status: string;
  artworkUrl: string | null;
  templateName: string;
  rarity: number;
  fvm: number | null;
  fvmSource: string;
  createdAt: string;
}

const RARITY_NAMES = ["Common", "Rare", "Epic", "Legendary"];
const RARITY_COLORS: Record<number, string> = {
  0: "#9CA3AF",
  1: "var(--electric-blue)",
  2: "var(--cosmic-violet)",
  3: "var(--aurora-gold)",
};

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "price-high", label: "Price: High to Low" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "fvm-high", label: "FVM: High to Low" },
  { value: "fvm-low", label: "FVM: Low to High" },
  { value: "popular", label: "Popular" },
];

export default function MarketplacePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ text: string; ok: boolean } | null>(null);
  const [filter, setFilter] = useState<number | null>(null);
  const [sort, setSort] = useState<string>("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const [detailCard, setDetailCard] = useState<{ cardId: string; tokenId: number } | null>(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [confirmBuy, setConfirmBuy] = useState<Listing | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [wishlistCounts, setWishlistCounts] = useState<Record<string, number>>({});
  const [user, setUser] = useState<{ user_id: string; username: string } | null>(null);
  const { toggleWishlist, isWishlisted } = useWishlist();
  const { addToCart, isInCart: isInCartFn } = useCart();

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      const u = JSON.parse(stored);
      setUser(u);
      fetch("/api/crystal", { credentials: "include" })
        .then((r) => r.json())
        .then((d: { balance?: number }) => setBalance(d.balance ?? 0))
        .catch(() => setBalance(0));
    }
  }, []);

  useEffect(() => {
    fetchListings();
    fetchInsight();
  }, []);

  useEffect(() => {
    if (!sortOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [sortOpen]);

  async function fetchListings() {
    setLoading(true);
    try {
      const res = await fetch("/api/marketplace/listings", { credentials: "include" });
      const data = await res.json();
      const listingsData = data.listings || [];
      setListings(listingsData);

      // Fetch wishlist counts for all listings
      if (listingsData.length > 0) {
        const cardIds = listingsData.map((l: Listing) => l.cardId).join(",");
        try {
          const statsRes = await fetch(`/api/marketplace/wishlist-stats?cardIds=${cardIds}`, { credentials: "include" });
          const statsData = await statsRes.json();
          setWishlistCounts(statsData.stats || {});
        } catch {
          setWishlistCounts({});
        }
      }
    } catch {
      setListings([]);
    }
    setLoading(false);
  }

  async function fetchInsight() {
    try {
      const res = await fetch("/api/marketplace/insight", { credentials: "include" });
      const data = await res.json();
      setInsight(data.insight || null);
    } catch {
      setInsight(null);
    }
  }

  async function handleBuy(listingId: string) {
    if (!user) {
      setShowLoginPrompt(true);
      return;
    }
    setBuying(listingId);
    try {
      const res = await fetch(`/api/marketplace/listings/${listingId}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchListings();
        setNotification({ text: "Purchase successful!", ok: true });
        window.dispatchEvent(new Event("balance-change"));
      } else {
        setNotification({ text: data.error || "Purchase failed", ok: false });
      }
    } catch {
      setNotification({ text: "Network error", ok: false });
    }
    setBuying(null);
  }

  const filtered = (filter !== null
    ? listings.filter((l) => l.rarity === filter)
    : listings
  ).sort((a, b) => {
    switch (sort) {
      case "price-high": return b.price - a.price;
      case "price-low": return a.price - b.price;
      case "newest": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "oldest": return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "fvm-high": return (b.fvm ?? 0) - (a.fvm ?? 0);
      case "fvm-low": return (a.fvm ?? 0) - (b.fvm ?? 0);
      case "popular": return (wishlistCounts[b.cardId] || 0) - (wishlistCounts[a.cardId] || 0);
      default: return 0;
    }
  });

  return (
    <PageShell
      title={<span className="text-gradient-aurora">Trade Cards</span>}
      description="Buy and sell digital cards with other collectors."
    >
      {insight && (
        <div className="glass p-4 sm:p-5 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--aurora-gold)" }}>
              Market Insight
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--silver-mist)" }}>
            {insight}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {/* Rarity filter */}
        <button
          onClick={() => setFilter(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
            filter === null ? "btn-primary !py-1.5 !px-3 !text-xs" : "btn-ghost !py-1.5 !px-3 !text-xs"
          }`}
        >
          All
        </button>
        {[0, 1, 2, 3].map((r) => (
          <button
            key={r}
            onClick={() => setFilter(filter === r ? null : r)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filter === r ? "btn-primary !py-1.5 !px-3 !text-xs" : "btn-ghost !py-1.5 !px-3 !text-xs"
            }`}
          >
            {RARITY_NAMES[r]}
          </button>
        ))}

        {/* Sort dropdown */}
        <div ref={sortRef} className="relative ml-auto">
          <button
            onClick={() => setSortOpen((v) => !v)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "var(--silver-mist)",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
              <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="18" x2="8" y2="18" />
            </svg>
            {SORT_OPTIONS.find((o) => o.value === sort)?.label || "Sort"}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, transform: sortOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {sortOpen && (
            <div
              className="absolute right-0 mt-1.5 py-1.5 rounded-xl z-40 min-w-[180px]"
              style={{
                background: "rgba(15, 19, 36, 0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(16px)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              }}
            >
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setSort(opt.value); setSortOpen(false); }}
                  className="w-full text-left px-4 py-2 text-xs font-medium transition-colors"
                  style={{
                    color: sort === opt.value ? "var(--aurora-gold)" : "var(--silver-mist)",
                    background: sort === opt.value ? "rgba(255,196,102,0.08)" : "transparent",
                  }}
                  onMouseEnter={(e) => { if (sort !== opt.value) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                  onMouseLeave={(e) => { if (sort !== opt.value) e.currentTarget.style.background = "transparent"; }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass animate-pulse h-64 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass p-8 sm:p-12 text-center">
          <p className="text-lg font-semibold mb-2" style={{ color: "var(--silver-mist)" }}>
            No listings yet
          </p>
          <p className="text-sm mb-4" style={{ color: "var(--silver-mist-dim)" }}>
            Be the first to list a card for trade!
          </p>
          <Link href="/collection" className="btn-primary inline-block">
            Go to Collection
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((listing) => (
            <div key={listing.listingId} className="glass glass-hover p-3 flex flex-col">
              <button
                type="button"
                className="relative mb-3 cursor-pointer group rounded-lg overflow-hidden"
                onClick={() => setDetailCard({ cardId: listing.cardId, tokenId: listing.tokenId })}
                style={{ background: "none", border: "none", padding: 0 }}
              >
                {listing.artworkUrl ? (
                  <img
                    src={listing.artworkUrl}
                    alt={listing.templateName}
                    className="w-full aspect-[5/7] object-contain transition-transform duration-200 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full aspect-[5/7] bg-white/5 flex items-center justify-center text-xs" style={{ color: "var(--silver-mist-dim)" }}>
                    No artwork
                  </div>
                )}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.35)" }}
                >
                  <span className="text-xs font-semibold uppercase tracking-widest text-white">
                    View Info
                  </span>
                </div>
              </button>

              <p className="text-sm font-semibold truncate" style={{ color: "var(--silver-mist)" }}>
                {listing.templateName}
              </p>
              <p className="text-xs mb-1" style={{ color: "var(--silver-mist-dim)" }}>
                #{listing.cardId}
              </p>

              {listing.fvm !== null && (
                <p className="text-[11px] mb-2" style={{ color: "var(--silver-mist-dim)" }}>
                  FVM: <span style={{ color: "var(--crystal)" }}>{listing.fvm} Crystal</span>
                </p>
              )}

              <div className="mt-auto">
                {/* Price + icons row */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base font-bold" style={{ color: "var(--crystal)" }}>
                    {listing.price} Crystal
                  </span>
                  <div className="flex items-center gap-1.5">
                    {/* Wishlist heart */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!user) { setShowLoginPrompt(true); return; }
                        toggleWishlist(listing.cardId);
                      }}
                      className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                      style={{
                        background: isWishlisted(listing.cardId) ? "rgba(255,107,186,0.2)" : "rgba(255,255,255,0.05)",
                        border: `1px solid ${isWishlisted(listing.cardId) ? "rgba(255,107,186,0.5)" : "rgba(255,255,255,0.1)"}`,
                      }}
                      title={isWishlisted(listing.cardId) ? "Remove from wishlist" : "Add to wishlist"}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={isWishlisted(listing.cardId) ? "#FF6BBA" : "none"} stroke={isWishlisted(listing.cardId) ? "#FF6BBA" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                      {(wishlistCounts[listing.cardId] || 0) > 0 && (
                        <span className="text-[9px] font-bold ml-0.5" style={{ color: "var(--aurora-pink)" }}>
                          {wishlistCounts[listing.cardId]}
                        </span>
                      )}
                    </button>

                    {/* Cart */}
                    {(() => {
                      const isOwnListing = !!(user && listing.sellerId === user.user_id);
                      const alreadyInCart = isInCartFn(listing.listingId);
                      const disabled = alreadyInCart || isOwnListing;
                      return (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!user) { setShowLoginPrompt(true); return; }
                            addToCart(listing.listingId);
                          }}
                          disabled={disabled}
                          className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                          style={{
                            background: alreadyInCart ? "rgba(0,204,255,0.2)" : "rgba(255,255,255,0.05)",
                            border: `1px solid ${alreadyInCart ? "rgba(0,204,255,0.5)" : "rgba(255,255,255,0.1)"}`,
                            opacity: disabled ? 0.5 : 1,
                            cursor: disabled ? "not-allowed" : "pointer",
                          }}
                          title={alreadyInCart ? "Already in cart" : isOwnListing ? "Your listing" : "Add to cart"}
                        >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={alreadyInCart ? "var(--electric-blue)" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="9" cy="21" r="1" />
                        <circle cx="20" cy="21" r="1" />
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                      </svg>
                    </button>
                      );
                    })()}
                  </div>
                </div>

                {/* Buy button — full width */}
                {(!user || listing.sellerId !== user.user_id) && (
                  <button
                    onClick={() => {
                      if (!user) { setShowLoginPrompt(true); return; }
                      setConfirmBuy(listing);
                    }}
                    disabled={buying === listing.listingId}
                    className="btn-primary !py-2 !text-xs w-full"
                  >
                    {buying === listing.listingId ? "Processing..." : "Buy Now"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Card Detail Modal */}
      {detailCard && (
        <CardDetailModal
          cardId={detailCard.cardId}
          tokenId={detailCard.tokenId}
          onClose={() => setDetailCard(null)}
        />
      )}

      {/* Buy Confirmation Modal */}
      {confirmBuy && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => setConfirmBuy(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{
              background: "rgba(15, 19, 36, 0.95)",
              border: "1px solid rgba(255,196,102,0.3)",
              boxShadow: "0 0 40px rgba(0,0,0,0.5), 0 0 20px rgba(255,196,102,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-1" style={{ color: "var(--silver-mist)" }}>
              Confirm Purchase
            </h3>
            <p className="text-sm mb-4" style={{ color: "var(--silver-mist-dim)" }}>
              {confirmBuy.templateName} <span className="font-mono text-xs">#{confirmBuy.cardId}</span>
            </p>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span style={{ color: "var(--silver-mist-dim)" }}>Price</span>
                <span className="font-semibold" style={{ color: "var(--crystal)" }}>{confirmBuy.price} Crystal</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: "var(--silver-mist-dim)" }}>Your Balance</span>
                <span className="font-semibold" style={{ color: balance !== null && balance >= confirmBuy.price ? "#00ff88" : "var(--aurora-pink)" }}>
                  {balance !== null ? `${balance.toLocaleString()} Crystal` : "Loading…"}
                </span>
              </div>
              {balance !== null && balance < confirmBuy.price && (
                <p className="text-xs text-center py-1.5 rounded-lg" style={{ background: "rgba(255,107,186,0.1)", border: "1px solid rgba(255,107,186,0.2)", color: "var(--aurora-pink)" }}>
                  Insufficient balance. You need {(confirmBuy.price - balance).toLocaleString()} more Crystal.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              {balance !== null && balance < confirmBuy.price ? (
                <>
                  <button onClick={() => setConfirmBuy(null)} className="btn-ghost flex-1 !py-2.5 !text-xs">Cancel</button>
                  <Link href="/dismantle" className="btn-crystal flex-1 !py-2.5 !text-xs text-center" onClick={() => setConfirmBuy(null)}>Dismantle</Link>
                </>
              ) : (
                <>
                  <button onClick={() => setConfirmBuy(null)} className="btn-ghost flex-1 !py-2.5 !text-xs">No</button>
                  <button
                    onClick={() => { handleBuy(confirmBuy.listingId); setConfirmBuy(null); }}
                    className="btn-primary flex-1 !py-2.5 !text-xs"
                  >
                    Yes, Buy
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Login Prompt Modal */}
      {showLoginPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowLoginPrompt(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{
              background: "rgba(15, 19, 36, 0.95)",
              border: "1px solid rgba(184,172,255,0.3)",
              boxShadow: "0 0 40px rgba(0,0,0,0.5), 0 0 20px rgba(184,172,255,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-2" style={{ color: "var(--silver-mist)" }}>
              Login Required
            </h3>
            <p className="text-sm mb-5" style={{ color: "var(--silver-mist-dim)" }}>
              You need to login to buy cards on the marketplace.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLoginPrompt(false)}
                className="btn-ghost flex-1 !py-2.5"
              >
                Cancel
              </button>
              <Link
                href="/login?next=/trade"
                className="btn-primary flex-1 !py-2.5 text-center"
                onClick={() => setShowLoginPrompt(false)}
              >
                Login
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Notification Modal */}
      {notification && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => setNotification(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 text-center"
            style={{
              background: "rgba(15, 19, 36, 0.95)",
              border: `1px solid ${notification.ok ? "rgba(0,255,136,0.3)" : "rgba(255,107,186,0.3)"}`,
              boxShadow: `0 0 40px rgba(0,0,0,0.5), 0 0 20px ${notification.ok ? "rgba(0,255,136,0.1)" : "rgba(255,107,186,0.1)"}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{
                background: notification.ok ? "rgba(0,255,136,0.15)" : "rgba(255,107,186,0.15)",
              }}
            >
              {notification.ok ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00ff88" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l4 4 10-10" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff6bba" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              )}
            </div>
            <h3 className="text-base font-semibold mb-2" style={{ color: notification.ok ? "#00ff88" : "var(--aurora-pink)" }}>
              {notification.ok ? "Purchase Successful" : "Purchase Failed"}
            </h3>
            <p className="text-sm mb-5" style={{ color: "var(--silver-mist-dim)" }}>
              {notification.text}
            </p>
            <button
              onClick={() => setNotification(null)}
              className="btn-primary w-full !py-2.5"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
