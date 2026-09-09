"use client";

import { useState, useEffect } from "react";

interface ListingModalProps {
  cardId: string;
  templateId: string;
  userId: string;
  onClose: () => void;
  onListed: (listingId: string, price: number) => void;
}

export default function ListingModal({ cardId, templateId, userId, onClose, onListed }: ListingModalProps) {
  const [price, setPrice] = useState("");
  const [fvm, setFvm] = useState<number | null>(null);
  const [floor, setFloor] = useState<number | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFvm();
    fetchSuggestion();
  }, [templateId]);

  async function fetchFvm() {
    try {
      const res = await fetch(`/api/marketplace/fvm?templateId=${templateId}`, { credentials: "include" });
      const data = await res.json();
      if (data.fvm !== null) {
        setFvm(data.fvm);
        setFloor(Math.round(data.fvm * 0.7));
      }
    } catch {}
  }

  async function fetchSuggestion() {
    try {
      const res = await fetch(`/api/marketplace/suggest?templateId=${templateId}`, { credentials: "include" });
      const data = await res.json();
      if (data.suggestion) setSuggestion(data.suggestion);
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const priceNum = parseInt(price);
    if (!priceNum || priceNum <= 0) {
      setError("Enter a valid price");
      return;
    }
    if (floor && priceNum < floor) {
      setError(`Minimum price is ${floor} Crystal (FVM floor)`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cardId, price: priceNum }),
      });
      const data = await res.json();
      if (res.ok) {
        onListed(data.listing?.listingId || "", priceNum);
        onClose();
      } else {
        setError(data.error || "Failed to create listing");
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div
        className="p-6 w-full max-w-sm"
        style={{
          background: "rgba(15, 19, 36, 0.95)",
          border: "1px solid rgba(255,196,102,0.3)",
          borderRadius: "20px",
          boxShadow: "0 0 40px rgba(0,0,0,0.5), 0 0 20px rgba(255,196,102,0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--silver-mist)" }}>
          List for Sale
        </h3>

        {fvm !== null && (
          <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(255,196,102,0.08)", border: "1px solid rgba(255,196,102,0.2)" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "var(--aurora-gold)" }}>
              Fair Value Market
            </p>
            <p className="text-sm" style={{ color: "var(--silver-mist)" }}>
              {fvm} Crystal (min: {floor} Crystal)
            </p>
          </div>
        )}

        {suggestion && (
          <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(184,172,255,0.08)", border: "1px solid rgba(184,172,255,0.2)" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "var(--cosmic-violet)" }}>
              AI Price Suggestion
            </p>
            <p className="text-sm" style={{ color: "var(--silver-mist)" }}>
              {suggestion}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="text-xs font-semibold block mb-1" style={{ color: "var(--silver-mist-dim)" }}>
            Price (Crystal)
          </label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            min={floor || 1}
            placeholder={floor ? `Min ${floor}` : "Enter price"}
            className="w-full p-3 rounded-lg mb-3 text-sm"
            style={{
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "var(--silver-mist)",
            }}
          />

          {error && (
            <p className="text-xs mb-3" style={{ color: "var(--aurora-pink)" }}>
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? "Listing..." : "List Card"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
