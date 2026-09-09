"use client";

import Image from "next/image";

interface PackCardProps {
  type: "standard" | "booster";
  price: number;
  cardCount: number;
  guaranteedRare: number;
  onBuy: () => Promise<void> | void;
  loading?: boolean;
}

const PACK_STYLES = {
  standard: {
    label: "Standard Pack",
    accent: "var(--electric-blue)",
    accentRgb: "0,204,255",
    gradient: "linear-gradient(135deg, rgba(0,204,255,0.08), rgba(0,204,255,0.02))",
  },
  booster: {
    label: "Booster Pack",
    accent: "var(--aurora-gold)",
    accentRgb: "255,196,102",
    gradient: "linear-gradient(135deg, rgba(255,196,102,0.08), rgba(255,196,102,0.02))",
  },
} as const;

export default function PackCard({
  type,
  price,
  cardCount,
  guaranteedRare,
  onBuy,
  loading = false,
}: PackCardProps) {
  const s = PACK_STYLES[type];

  return (
    <div
      className="group relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
      data-testid={`pack-card-${type}`}
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: s.gradient }}
      />

      {/* Image */}
      <div className="relative w-full aspect-[4/5] bg-black/20" data-testid={`pack-image-${type}`}>
        <Image
          src={`/packs/${type}.webp`}
          alt={s.label}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, 320px"
        />
        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 p-5 flex flex-col gap-4">
        {/* Title + Stats */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3">
          <h3 className="font-display text-base uppercase tracking-wider" style={{ color: s.accent }}>
            {s.label}
          </h3>
          <div className="flex items-center gap-3 text-xs text-white/50">
            <span>{cardCount} cards</span>
            <span className="w-px h-3 bg-white/10" />
            <span style={{ color: s.accent }}>{guaranteedRare} rare+</span>
          </div>
        </div>

        {/* Price + Button */}
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-1">
            <span className="font-display text-2xl" style={{ color: "var(--aurora-gold)" }}>
              {price.toLocaleString()}
            </span>
            <span className="text-[0.65rem] text-white/40 uppercase tracking-widest">cr</span>
          </div>
          <button
            onClick={onBuy}
            disabled={loading}
            className="flex-1 btn-gold !py-3 !text-sm disabled:opacity-50"
            data-testid={`pack-buy-${type}`}
          >
            {loading ? "Opening…" : "Buy & Open"}
          </button>
        </div>
      </div>
    </div>
  );
}
