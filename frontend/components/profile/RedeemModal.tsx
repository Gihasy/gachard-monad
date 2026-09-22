"use client";

/**
 * Redeem a physical card, in a dialog rather than a panel on /profile.
 *
 * It used to be a form sitting open in the sidebar, which gave permanent space
 * to something most people do once, if ever. As a dialog it is a button until
 * it is needed.
 *
 * The card is shown at the end because "redeemed successfully" is a claim the
 * user has to take on trust, and the artwork is the proof. That needs care:
 * /api/redeem waits up to eight seconds for the receipt and updates ownership
 * if it lands, but it can also return with the transfer still pending. So the
 * card is looked for, and when it is not there yet the dialog says the
 * transfer is on its way instead of pretending nothing happened or implying it
 * failed.
 */
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  RARITY,
  RARITY_COLORS,
  RARITY_GLOW,
} from "@/components/wallet/shared";

type Card = {
  cardId?: string | null;
  tokenId: number | null;
  templateId: string;
  rarity: number;
  artworkUrl?: string;
  templateName?: string;
};

type Phase = "form" | "working" | "found" | "pending";

const LOOKUP_ATTEMPTS = 5;
const LOOKUP_INTERVAL_MS = 2000;

export default function RedeemModal({
  onClose,
  onRedeemed,
}: {
  onClose: () => void;
  onRedeemed: (cards: Card[]) => void;
}) {
  const [cardId, setCardId] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);

  // Escape closes, but not mid-transfer: the request is already in flight and
  // closing would leave the user with no idea whether it worked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "working") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, phase]);

  const submit = useCallback(async () => {
    const id = cardId.trim().toLowerCase();
    const c = code.trim();
    if (!id || !c) return;

    setPhase("working");
    setError(null);
    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cardId: id, code: c }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Redeem failed. Please check the code and try again.");
        setPhase("form");
        return;
      }

      // Look for the card rather than assuming it arrived. Ownership moves
      // when the transfer confirms, which may be after this response.
      for (let i = 0; i < LOOKUP_ATTEMPTS; i++) {
        const cardsRes = await fetch("/api/cards", { credentials: "include" });
        const cardsBody = await cardsRes.json().catch(() => null);
        const cards: Card[] = cardsBody?.cards ?? [];
        onRedeemed(cards);
        const mine = cards.find((x) => (x.cardId ?? "").toLowerCase() === id);
        if (mine) {
          setCard(mine);
          setPhase("found");
          return;
        }
        if (i < LOOKUP_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, LOOKUP_INTERVAL_MS));
        }
      }
      setPhase("pending");
    } catch {
      setError("Network error. Please try again.");
      setPhase("form");
    }
  }, [cardId, code, onRedeemed]);

  const rarity = card ? Math.max(0, Math.min(3, card.rarity ?? 0)) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={() => phase !== "working" && onClose()}
      data-testid="redeem-modal"
    >
      <div
        className="glass w-full max-w-sm p-6"
        style={{ borderColor: "rgba(0,255,136,0.25)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Redeem a physical card"
      >
        {phase === "found" && card ? (
          <>
            <p
              className="text-[0.72rem] uppercase tracking-[0.22em] mb-4"
              style={{ color: "#00ff88" }}
            >
              Redeemed
            </p>
            <div
              className={`relative w-full rounded-xl overflow-hidden mb-3 bg-white/5 mx-auto ${RARITY_GLOW[rarity]}`}
              style={{
                aspectRatio: "5/7",
                maxWidth: 200,
                border: `1px solid ${RARITY_COLORS[rarity]}`,
              }}
              data-testid="redeem-card-visual"
            >
              {card.artworkUrl ? (
                <Image
                  src={card.artworkUrl}
                  alt={card.templateName ?? card.templateId}
                  fill
                  sizes="200px"
                  className="object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-3xl text-white/30">◆</span>
                </div>
              )}
            </div>
            <p className="text-sm font-medium text-white text-center truncate">
              Card ID: #{card.cardId}
            </p>
            <div className="flex items-center justify-center gap-2 mt-1.5 mb-5">
              <span className={`tag tag-${RARITY[rarity].toLowerCase()} text-[0.55rem]`}>
                {RARITY[rarity]}
              </span>
              <span className="text-[0.6rem] text-white/40">
                It is yours now, and in your collection.
              </span>
            </div>
            <div className="flex gap-2">
              <Link
                href="/collection"
                className="btn-primary !py-2.5 !text-xs flex-1 text-center"
                data-testid="redeem-view-collection"
              >
                View collection
              </Link>
              <button onClick={onClose} className="btn-ghost !py-2.5 !px-5 !text-xs">
                Close
              </button>
            </div>
          </>
        ) : phase === "pending" ? (
          <>
            <p
              className="text-[0.72rem] uppercase tracking-[0.22em] mb-3"
              style={{ color: "var(--aurora-gold)" }}
            >
              On its way
            </p>
            <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--text-tertiary)" }}>
              The code was accepted and the transfer is going through. The card will appear in
              your collection shortly — nothing more for you to do.
            </p>
            <div className="flex gap-2">
              <Link href="/collection" className="btn-primary !py-2.5 !text-xs flex-1 text-center">
                View collection
              </Link>
              <button onClick={onClose} className="btn-ghost !py-2.5 !px-5 !text-xs">
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <p
              className="text-[0.72rem] uppercase tracking-[0.22em] mb-2"
              style={{ color: "#00ff88" }}
            >
              Redeem a physical card
            </p>
            <p className="text-xs mb-5" style={{ color: "var(--text-tertiary)" }}>
              Enter the Card ID and the redeem code printed on the card. Ownership transfers to
              your account.
            </p>

            <label className="block text-[0.65rem] uppercase tracking-widest text-white/40 mb-1.5">
              Card ID
            </label>
            <div className="flex items-center bg-white/[0.04] border border-white/[0.1] rounded-xl px-4 py-2.5 mb-3">
              <span className="text-sm text-white/40 mr-1 font-mono">#</span>
              <input
                type="text"
                value={cardId}
                onChange={(e) => setCardId(e.target.value)}
                placeholder="8a866"
                autoFocus
                disabled={phase === "working"}
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none disabled:opacity-50"
                data-testid="redeem-card-input"
              />
            </div>

            <label className="block text-[0.65rem] uppercase tracking-widest text-white/40 mb-1.5">
              Redeem Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="e.g. xIdVoe2A0TWZvNOR"
              disabled={phase === "working"}
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 font-mono mb-4 disabled:opacity-50"
              data-testid="redeem-code-input"
            />

            {error && (
              <p className="text-xs mb-4" style={{ color: "#ff6bba" }} data-testid="redeem-error">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={phase === "working" || !cardId.trim() || !code.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,204,255,0.15))",
                  border: "1px solid rgba(0,255,136,0.4)",
                  color: "#00ff88",
                }}
                data-testid="redeem-submit-btn"
              >
                {phase === "working" ? "Redeeming…" : "Redeem Card"}
              </button>
              <button
                onClick={onClose}
                disabled={phase === "working"}
                className="btn-ghost !py-2.5 !px-5 !text-xs disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
