"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";

const RARITY_COLORS = [
  "var(--rarity-common)",
  "var(--rarity-rare)",
  "var(--rarity-epic)",
  "var(--rarity-legendary)",
] as const;
const RARITY_RGB = [
  "156,163,175",
  "0,204,255",
  "184,172,255",
  "255,196,102",
] as const;
const RARITY_LABELS = ["Common", "Rare", "Epic", "Legendary"] as const;
const AURA = ["", "aura-rare", "aura-epic", "aura-legendary"] as const;

export interface RevealedCard {
  tokenId?: number | string;
  rarity: number;
  template?: {
    id?: string;
    name?: string;
    artworkUrl?: string;
  };
}

export interface RevealSuccess {
  cards: RevealedCard[];
  newBalance?: number;
  entropy?: boolean;
  error?: undefined;
}

export interface RevealError {
  cards?: undefined;
  error: string;
}

export type RevealResult = RevealSuccess | RevealError;

interface PackRevealProps {
  result: RevealResult;
  packLabel?: string;
  packType?: "standard" | "booster";
}

type RevealPhase = "ready" | "requesting" | "bursting" | "revealing" | "done";

function SparkBurst() {
  const sparks = useMemo(() => {
    const arr = [];
    const rgbs = ["255,196,102", "184,172,255", "0,204,255", "255,107,186", "255,255,255"];
    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 120 + Math.random() * 200;
      arr.push({
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
        dur: 700 + Math.random() * 700,
        size: 4 + Math.random() * 8,
        color: rgbs[Math.floor(Math.random() * rgbs.length)],
      });
    }
    return arr;
  }, []);

  return (
    <>
      {sparks.map((s, i) => (
        <span
          key={i}
          className="spark"
          style={{
            // @ts-expect-error CSS vars
            "--dx": `${s.dx}px`,
            "--dy": `${s.dy}px`,
            "--dur": `${s.dur}ms`,
            width: s.size,
            height: s.size,
            background: `rgb(${s.color})`,
            boxShadow: `0 0 12px rgba(${s.color},0.9)`,
          }}
        />
      ))}
    </>
  );
}

export default function PackReveal({ result, packLabel = "Your Pack", packType = "booster" }: PackRevealProps) {
  const [phase, setPhase] = useState<RevealPhase>("ready");
  const [revealedCount, setRevealedCount] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const cards = "cards" in result && result.cards ? result.cards : [];
  const sortedCards = useMemo(
    () => [...cards].sort((a, b) => a.rarity - b.rarity),
    [cards]
  );
  const bestRarity = useMemo(
    () => sortedCards.reduce((m, c) => Math.max(m, c.rarity), 0),
    [sortedCards]
  );

  useEffect(() => {
    return () => timers.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (phase !== "revealing") return;
    if (revealedCount >= sortedCards.length) {
      const t = setTimeout(() => setPhase("done"), 500);
      timers.current.push(t);
      return;
    }
    const timer = setTimeout(() => setRevealedCount((c) => c + 1), 380);
    timers.current.push(timer);
    return () => clearTimeout(timer);
  }, [phase, revealedCount, sortedCards.length]);

  if ("error" in result && result.error) {
    const isInsufficient = result.error.toLowerCase().includes("insufficient");
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-5"
        data-testid="pack-reveal-error"
      >
        <div
          className="max-w-md w-full p-6 rounded-2xl text-center"
          style={{
            background: "rgba(255,107,186,0.1)",
            color: "var(--aurora-pink)",
            border: "1px solid rgba(255,107,186,0.3)",
          }}
        >
          <p className="mb-4">{result.error}</p>
          <div className="flex items-center justify-center gap-3">
            {isInsufficient && (
              <Link href="/topup" className="btn-primary text-sm" data-testid="pack-reveal-topup-btn">
                Top Up
              </Link>
            )}
            <button onClick={() => window.location.reload()} className="btn-ghost text-sm">
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isEntropy = "cards" in result && (result as RevealSuccess).entropy === true;

  const handleOpen = () => {
    if (phase !== "ready") return;

    if (isEntropy) {
      // Entropy mode: brief "requesting" phase while on-chain randomness resolves
      setPhase("requesting");
      const t = setTimeout(() => {
        setPhase("bursting");
        const t2 = setTimeout(() => {
          setRevealedCount(0);
          setPhase("revealing");
        }, 1400);
        timers.current.push(t2);
      }, 2000);
      timers.current.push(t);
    } else {
      setPhase("bursting");
      const t = setTimeout(() => {
        setRevealedCount(0);
        setPhase("revealing");
      }, 1400);
      timers.current.push(t);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto"
      style={{ background: "rgba(5,7,18,0.92)", backdropFilter: "blur(12px)" }}
      data-testid="pack-reveal-section"
    >
      {/* Close button */}
      {phase === "done" && (
        <button
          onClick={() => window.location.reload()}
          className="absolute top-5 right-5 z-50 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          data-testid="reveal-close"
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* ─── READY / REQUESTING / BURSTING ─── */}
      {(phase === "ready" || phase === "requesting" || phase === "bursting") && (
        <div className="text-center px-4">
          <h2 className="font-display uppercase text-2xl sm:text-3xl md:text-4xl mb-2">
            <span className="text-gradient-aurora">
              {phase === "requesting" ? "Generating Randomness" : "Pack Ready"}
            </span>
          </h2>
          <p className="text-white/50 text-xs sm:text-sm mb-4 sm:mb-8">
            {phase === "requesting"
              ? "Verifying on-chain randomness…"
              : phase === "bursting"
                ? "Unsealing…"
                : "Your pack is ready to open"}
          </p>

          <div className="relative mx-auto flex items-center justify-center" style={{ height: "min(360px, 50vh)" }}>
            {/* ambient glow */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] sm:w-[300px] sm:h-[300px] rounded-full pulse-glow"
              aria-hidden
              style={{
                background: "radial-gradient(circle, rgba(255,196,102,0.3) 0%, rgba(184,172,255,0.15) 40%, transparent 70%)",
                filter: "blur(20px)",
              }}
            />

            {/* burst FX */}
            {phase === "bursting" && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                <SparkBurst />
                <div className="burst-flash" style={{ animationDelay: "700ms" }} />
                <div className="burst-ring" style={{ animationDelay: "780ms" }} />
                <div className="burst-ring delay-1" style={{ animationDelay: "780ms" }} />
              </div>
            )}

            {/* Pack image */}
            <div
              className="relative z-10 pack-breathe"
              style={{
                opacity: phase === "bursting" ? 0 : 1,
                transition: "opacity 300ms ease 700ms",
              }}
            >
              <div className="relative w-[140px] h-[196px] sm:w-[180px] sm:h-[252px] md:w-[200px] md:h-[280px]">
                <Image
                  src={`/packs/${packType}.webp`}
                  alt={packLabel}
                  fill
                  className="object-contain drop-shadow-2xl"
                  sizes="(max-width: 640px) 140px, (max-width: 768px) 180px, 200px"
                  priority
                />
              </div>
              <p className="font-display uppercase text-sm sm:text-base text-white/80 tracking-wider mt-2 sm:mt-3 text-center">
                {packLabel}
              </p>
              <span className="chip mt-1.5 sm:mt-2 mx-auto"><span className="chip-dot" />Sealed</span>
            </div>
          </div>

          {phase === "ready" && (
            <button
              onClick={handleOpen}
              className="btn-primary mt-4 sm:mt-6 text-base sm:text-lg px-6 sm:px-8 py-2.5 sm:py-3"
              data-testid="pack-open-btn"
            >
              Open Pack
            </button>
          )}
        </div>
      )}

      {/* ─── REVEALING / DONE ─── */}
      {(phase === "revealing" || phase === "done") && (
        <div className="w-full max-w-5xl px-3 sm:px-5 py-4 sm:py-8 overflow-y-auto">
          <div className="text-center mb-4 sm:mb-8">
            <h2 className="font-display uppercase text-xl sm:text-2xl md:text-3xl mb-1">
              <span className="text-gradient-aurora">
                {phase === "done" ? "Pack Opened" : "Revealing…"}
              </span>
            </h2>
            {phase === "done" && bestRarity >= 2 && (
              <p
                className="label-pop text-xs sm:text-sm uppercase tracking-[0.2em] font-semibold"
                style={{ color: RARITY_COLORS[bestRarity] }}
                data-testid="best-pull-banner"
              >
                ✦ {RARITY_LABELS[bestRarity]} pull! ✦
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4 justify-items-center">
            {sortedCards.map((card, i) => {
              const key = card.tokenId ?? card.template?.id ?? `${card.template?.name}-${i}`;
              const rarity = Math.max(0, Math.min(3, card.rarity)) as 0 | 1 | 2 | 3;
              const isRevealed = i < revealedCount;

              if (!isRevealed) {
                return (
                  <div
                    key={key}
                    className="w-full max-w-[140px] sm:max-w-[160px] md:max-w-[180px] rounded-2xl"
                    style={{
                      aspectRatio: "5/7",
                      background: "linear-gradient(135deg, #14162e, #1b1f3a)",
                      border: "1px dashed rgba(255,255,255,0.1)",
                      opacity: 0.4,
                    }}
                    data-testid={`card-reveal-${i}`}
                  />
                );
              }

              return (
                <div
                  key={key}
                  className="card-pop w-full max-w-[140px] sm:max-w-[160px] md:max-w-[180px]"
                  style={{ animationDelay: `${(i - Math.max(0, revealedCount - 1)) * 40}ms` }}
                  data-testid={`card-reveal-${i}`}
                >
                  <div
                    className={`relative rounded-2xl overflow-hidden ${rarity >= 2 ? "shine-sweep " + AURA[rarity] : ""}`}
                    style={{ aspectRatio: "5/7", border: `2px solid ${RARITY_COLORS[rarity]}` }}
                  >
                    {card.template?.artworkUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={card.template.artworkUrl}
                        alt={card.template.name ?? "card"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ background: `rgba(${RARITY_RGB[rarity]},0.12)` }}
                      >
                        <span className="text-4xl" style={{ color: RARITY_COLORS[rarity] }}>◆</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {phase === "done" && (
            <div className="mt-4 sm:mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/collection" className="btn-primary" data-testid="reveal-view-collection">
                View Collection
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <button onClick={() => window.location.reload()} className="btn-ghost" data-testid="reveal-buy-again">
                Buy Another
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
