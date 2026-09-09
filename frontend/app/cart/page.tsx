"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { useCart } from "@/hooks/useCart";
import { useRouter } from "next/navigation";

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

const RARITY_NAMES = ["Common", "Rare", "Epic", "Legendary"];
const RARITY_COLORS: Record<number, string> = {
  0: "#9CA3AF",
  1: "var(--electric-blue)",
  2: "var(--cosmic-violet)",
  3: "var(--aurora-gold)",
};

export default function CartPage() {
  const router = useRouter();
  const { cart, removeFromCart, clearCart } = useCart();
  const [items, setItems] = useState<CartListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ user_id: string; username: string } | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [results, setResults] = useState<{ listingId: string; success: boolean; error?: string }[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
  }, []);

  useEffect(() => {
    if (cart.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch("/api/marketplace/listings", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const allListings = data.listings || [];
        const cartItems = cart
          .map((id) => allListings.find((l: CartListing) => l.listingId === id))
          .filter(Boolean) as CartListing[];
        setItems(cartItems);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [cart]);

  const totalPrice = items.reduce((sum, item) => sum + item.price, 0);

  async function handleCheckout() {
    if (!user) {
      router.push("/login?next=/cart");
      return;
    }
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
    purchasedIds.forEach((id) => removeFromCart(id));
    if (purchasedIds.length === items.length) {
      clearCart();
    }
    if (purchasedIds.length > 0) {
      window.dispatchEvent(new Event("balance-change"));
    }
  }

  return (
    <PageShell
      eyebrow="Shopping"
      title="Your Cart"
      description="Review items and checkout when ready."
    >
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass animate-pulse h-20 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="glass p-8 sm:p-12 text-center">
          <p className="text-lg font-semibold mb-2" style={{ color: "var(--silver-mist)" }}>
            Cart is empty
          </p>
          <p className="text-sm mb-4" style={{ color: "var(--silver-mist-dim)" }}>
            Browse the marketplace and add cards to your cart.
          </p>
          <Link href="/trade" className="btn-primary inline-block">
            Go to Trade
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-3 mb-6">
            {items.map((item) => {
              const result = results.find((r) => r.listingId === item.listingId);
              return (
                <div
                  key={item.listingId}
                  className="glass p-4 flex items-center gap-4"
                  style={{
                    background: result?.success ? "rgba(0,255,136,0.05)" : result?.error ? "rgba(255,107,186,0.05)" : undefined,
                    borderColor: result?.success ? "rgba(0,255,136,0.2)" : result?.error ? "rgba(255,107,186,0.2)" : undefined,
                  }}
                >
                  {item.artworkUrl ? (
                    <img src={item.artworkUrl} alt={item.templateName} className="w-14 h-20 object-contain rounded-lg shrink-0" />
                  ) : (
                    <div className="w-14 h-20 bg-white/5 rounded-lg flex items-center justify-center text-xs text-white/30 shrink-0">?</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--silver-mist)" }}>{item.templateName}</p>
                    <p className="text-[11px]" style={{ color: RARITY_COLORS[item.rarity] }}>{RARITY_NAMES[item.rarity]}</p>
                    <p className="text-[10px] mt-1" style={{ color: "var(--silver-mist-dim)" }}>#{item.cardId}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold" style={{ color: "var(--crystal)" }}>{item.price} Crystal</p>
                    {result?.success && <p className="text-[10px] text-green-400 mt-1">Purchased</p>}
                    {result?.error && <p className="text-[10px] text-red-400 mt-1">{result.error}</p>}
                  </div>
                  {!result && (
                    <button
                      onClick={() => removeFromCart(item.listingId)}
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all hover:brightness-125"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="glass p-5">
            <div className="flex justify-between mb-4">
              <span className="text-sm" style={{ color: "var(--silver-mist-dim)" }}>Total ({items.length} items)</span>
              <span className="text-xl font-bold" style={{ color: "var(--crystal)" }}>{totalPrice} Crystal</span>
            </div>
            {results.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-center" style={{ color: results.every(r => r.success) ? "var(--electric-blue)" : "var(--aurora-pink)" }}>
                  {results.filter(r => r.success).length} of {results.length} purchased successfully
                </p>
                <Link href="/trade" className="btn-primary w-full block text-center">
                  Back to Trade
                </Link>
              </div>
            ) : (
              <div className="flex gap-3">
                <button onClick={clearCart} className="btn-ghost flex-1">
                  Clear Cart
                </button>
                <button
                  onClick={handleCheckout}
                  disabled={checkingOut}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {checkingOut ? "Processing..." : `Checkout (${items.length} items)`}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </PageShell>
  );
}
