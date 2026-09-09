"use client";
import { useState, useEffect } from "react";

interface CartListing {
  listingId: string;
  cardId: string;
  templateId: string;
  templateName: string;
  artworkUrl: string | null;
  rarity: number;
  price: number;
  sellerId: string;
}

interface CartModalProps {
  cartIds: string[];
  userId: string | null;
  onClose: () => void;
  onRemove: (listingId: string) => void;
  onClear: () => void;
  onCheckoutComplete: () => void;
}

const RARITY_NAMES = ["Common", "Rare", "Epic", "Legendary"];
const RARITY_COLORS: Record<number, string> = {
  0: "#9CA3AF",
  1: "var(--electric-blue)",
  2: "var(--cosmic-violet)",
  3: "var(--aurora-gold)",
};

export default function CartModal({ cartIds, userId, onClose, onRemove, onClear, onCheckoutComplete }: CartModalProps) {
  const [items, setItems] = useState<CartListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [results, setResults] = useState<{ listingId: string; success: boolean; error?: string }[]>([]);

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

  async function handleCheckout() {
    if (!userId) return;
    setCheckingOut(true);
    const checkoutResults: { listingId: string; success: boolean; error?: string }[] = [];

    for (const item of items) {
      try {
        const res = await fetch(`/api/marketplace/listings/${item.listingId}/buy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (res.ok) {
          checkoutResults.push({ listingId: item.listingId, success: true });
        } else {
          checkoutResults.push({ listingId: item.listingId, success: false, error: data.error });
          break;
        }
      } catch {
        checkoutResults.push({ listingId: item.listingId, success: false, error: "Network error" });
        break;
      }
    }

    setResults(checkoutResults);
    setCheckingOut(false);

    const purchasedIds = checkoutResults.filter((r) => r.success).map((r) => r.listingId);
    purchasedIds.forEach((id) => onRemove(id));
    if (purchasedIds.length === items.length) {
      onClear();
    }
    onCheckoutComplete();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl flex flex-col overflow-hidden"
        style={{
          background: "rgba(15, 19, 36, 0.95)",
          border: "1px solid rgba(0,204,255,0.3)",
          boxShadow: "0 0 40px rgba(0,0,0,0.5), 0 0 20px rgba(0,204,255,0.1)",
          maxHeight: "80vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10 shrink-0">
          <h3 className="text-base font-semibold" style={{ color: "var(--silver-mist)" }}>
            Cart ({items.length})
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-8 text-center text-white/50 text-sm">Loading...</div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-white/50 text-sm">Cart is empty</div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const result = results.find((r) => r.listingId === item.listingId);
                return (
                  <div
                    key={item.listingId}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{
                      background: result?.success ? "rgba(0,255,136,0.08)" : result?.error ? "rgba(255,107,186,0.08)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${result?.success ? "rgba(0,255,136,0.2)" : result?.error ? "rgba(255,107,186,0.2)" : "rgba(255,255,255,0.06)"}`,
                    }}
                  >
                    {item.artworkUrl ? (
                      <img src={item.artworkUrl} alt={item.templateName} className="w-10 h-14 object-contain rounded" />
                    ) : (
                      <div className="w-10 h-14 bg-white/5 rounded flex items-center justify-center text-[10px] text-white/30">?</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--silver-mist)" }}>{item.templateName}</p>
                      <p className="text-[10px]" style={{ color: RARITY_COLORS[item.rarity] }}>{RARITY_NAMES[item.rarity]}</p>
                    </div>
                    <span className="text-sm font-semibold shrink-0" style={{ color: "var(--aurora-gold)" }}>{item.price}</span>
                    {!result && (
                      <button
                        onClick={() => onRemove(item.listingId)}
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: "rgba(255,255,255,0.05)" }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    )}
                    {result?.success && <span className="text-[10px] text-green-400 shrink-0">Purchased</span>}
                    {result?.error && <span className="text-[10px] text-red-400 shrink-0">{result.error}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="p-5 border-t border-white/10 shrink-0">
            <div className="flex justify-between mb-4">
              <span className="text-sm" style={{ color: "var(--silver-mist-dim)" }}>Total</span>
              <span className="text-lg font-bold" style={{ color: "var(--aurora-gold)" }}>{totalPrice} Crystal</span>
            </div>
            {results.length > 0 ? (
              <button onClick={onClose} className="btn-primary w-full">Done</button>
            ) : (
              <button
                onClick={handleCheckout}
                disabled={checkingOut || !userId}
                className="btn-primary w-full disabled:opacity-50"
              >
                {checkingOut ? "Processing..." : !userId ? "Login to Checkout" : `Checkout (${items.length} items)`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
