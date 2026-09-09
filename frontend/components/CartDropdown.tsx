"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

interface CartListing {
  listingId: string;
  cardId: string;
  templateName: string;
  artworkUrl: string | null;
  rarity: number;
  price: number;
}

interface CartDropdownProps {
  cartIds: string[];
  onRemove: (listingId: string) => void;
  onClose: () => void;
}

const RARITY_NAMES = ["Common", "Rare", "Epic", "Legendary"];
const RARITY_COLORS: Record<number, string> = {
  0: "#9CA3AF",
  1: "var(--electric-blue)",
  2: "var(--cosmic-violet)",
  3: "var(--aurora-gold)",
};

export default function CartDropdown({ cartIds, onRemove, onClose }: CartDropdownProps) {
  const [items, setItems] = useState<CartListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (cartIds.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch("/api/marketplace/listings", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const allListings = data.listings || [];
        const cartItems = cartIds
          .map((id) => allListings.find((l: CartListing) => l.listingId === id))
          .filter(Boolean) as CartListing[];
        setItems(cartItems);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [cartIds]);

  const totalPrice = items.reduce((sum, item) => sum + item.price, 0);

  return (
    <div
      className="absolute right-0 top-full mt-2 w-80 rounded-2xl overflow-hidden z-50"
      style={{
        background: "rgba(15, 19, 36, 0.97)",
        border: "1px solid rgba(0,204,255,0.3)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 20px rgba(0,204,255,0.1)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-sm font-semibold" style={{ color: "var(--silver-mist)" }}>
          Cart ({items.length})
        </span>
        <button onClick={onClose} className="text-white/40 hover:text-white text-xs">Close</button>
      </div>

      {/* Items */}
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-white/40 text-xs">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-center text-white/40 text-xs">Cart is empty</div>
        ) : (
          items.map((item) => (
            <div key={item.listingId} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5">
              {item.artworkUrl ? (
                <img src={item.artworkUrl} alt={item.templateName} className="w-8 h-11 object-contain rounded shrink-0" />
              ) : (
                <div className="w-8 h-11 bg-white/5 rounded flex items-center justify-center text-[8px] text-white/30 shrink-0">?</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: "var(--silver-mist)" }}>{item.templateName}</p>
                <p className="text-[9px]" style={{ color: RARITY_COLORS[item.rarity] }}>{RARITY_NAMES[item.rarity]}</p>
              </div>
              <span className="text-xs font-semibold shrink-0" style={{ color: "var(--aurora-gold)" }}>{item.price}</span>
              <button
                onClick={() => onRemove(item.listingId)}
                className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 hover:brightness-125"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="px-4 py-3 border-t border-white/10">
          <div className="flex justify-between mb-3">
            <span className="text-xs" style={{ color: "var(--silver-mist-dim)" }}>Total</span>
            <span className="text-sm font-bold" style={{ color: "var(--aurora-gold)" }}>{totalPrice} Crystal</span>
          </div>
          <Link
            href="/cart"
            className="btn-primary w-full block text-center !py-2 !text-xs"
            onClick={onClose}
          >
            Checkout
          </Link>
        </div>
      )}
    </div>
  );
}
