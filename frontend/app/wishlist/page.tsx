"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { useWishlist } from "@/hooks/useWishlist";

interface WishlistListing {
  listingId: string;
  cardId: string;
  templateName: string;
  artworkUrl: string | null;
  rarity: number;
  price: number;
  fvm: number | null;
}

const RARITY_NAMES = ["Common", "Rare", "Epic", "Legendary"];
const RARITY_COLORS: Record<number, string> = {
  0: "#9CA3AF",
  1: "var(--electric-blue)",
  2: "var(--cosmic-violet)",
  3: "var(--aurora-gold)",
};

export default function WishlistPage() {
  const { wishlist, toggleWishlist } = useWishlist();
  const [items, setItems] = useState<WishlistListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (wishlist.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch("/api/marketplace/listings", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const all = data.listings || [];
        const matched = wishlist
          .map((cardId) => all.find((l: WishlistListing & { cardId: string }) => l.cardId === cardId))
          .filter(Boolean) as WishlistListing[];
        setItems(matched);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [wishlist]);

  return (
    <PageShell title="Wishlist" description="Cards you've saved for later.">
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass animate-pulse h-64 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="glass p-8 sm:p-12 text-center">
          <p className="text-lg font-semibold mb-2" style={{ color: "var(--silver-mist)" }}>
            No wishlisted cards
          </p>
          <p className="text-sm mb-4" style={{ color: "var(--silver-mist-dim)" }}>
            Browse the marketplace and save your favorites.
          </p>
          <Link href="/trade" className="btn-primary inline-block">
            Go to Trade
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item) => (
            <div key={item.cardId} className="glass glass-hover p-3 flex flex-col">
              {item.artworkUrl ? (
                <img
                  src={item.artworkUrl}
                  alt={item.templateName}
                  className="w-full aspect-[5/7] object-contain rounded-lg mb-3"
                />
              ) : (
                <div
                  className="w-full aspect-[5/7] bg-white/5 rounded-lg flex items-center justify-center text-xs mb-3"
                  style={{ color: "var(--silver-mist-dim)" }}
                >
                  No artwork
                </div>
              )}
              <p className="text-sm font-semibold truncate" style={{ color: "var(--silver-mist)" }}>
                {item.templateName}
              </p>
              <p className="text-[10px] mb-1" style={{ color: RARITY_COLORS[item.rarity] }}>
                {RARITY_NAMES[item.rarity]}
              </p>
              {item.fvm !== null && (
                <p className="text-[11px] mb-2" style={{ color: "var(--silver-mist-dim)" }}>
                  FVM: <span style={{ color: "var(--aurora-gold)" }}>{item.fvm} Crystal</span>
                </p>
              )}
              <div className="mt-auto flex items-center justify-between">
                <span className="text-base font-bold" style={{ color: "var(--aurora-gold)" }}>
                  {item.price} Crystal
                </span>
                <button
                  onClick={() => toggleWishlist(item.cardId)}
                  className="text-xs hover:text-white transition-colors"
                  style={{ color: "var(--silver-mist-dim)" }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
