/**
 * Pieces shared by the wallet pages (ADR-031).
 *
 * /wallet holds what the user already has; /wallet/move is where they choose
 * what to send there. Both draw cards and both head their sections the same
 * way, so the vocabulary lives here rather than being copied and drifting.
 */
import type { ReactNode } from "react";
import Image from "next/image";

export type WalletCard = {
  cardId?: string | null;
  tokenId: number | null;
  templateId?: string;
  templateName?: string;
  artworkUrl?: string;
  rarity: number;
  displayStatus?: string;
  isListed?: boolean;
};

export const RARITY = ["Common", "Rare", "Epic", "Legendary"];

export const RARITY_COLORS = [
  "var(--rarity-common)",
  "var(--rarity-rare)",
  "var(--rarity-epic)",
  "var(--rarity-legendary)",
];

export const RARITY_GLOW = ["", "glow-rare", "glow-epic", "glow-legendary"];

export const EXPLORER = "https://testnet.monadvision.com/address/";

/**
 * Cards returnable in one action.
 *
 * Matches DAILY_SPONSORED_LIMIT in lib/privy-server, which is the real
 * ceiling: every return is one sponsored transfer. Offering more than a user
 * could actually complete would only fail halfway. Kept here rather than
 * imported because that module pulls in the Privy server client.
 */
export const MAX_RETURN_BATCH = 20;

/** Privy's sponsorship lands asynchronously, so a move is confirmed by polling. */
export const POLL_INTERVAL_MS = 3000;
export const POLL_MAX_ATTEMPTS = 20;

/** The violet section heading used across the app. */
export function Eyebrow({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-4">
      <p
        className="text-[0.72rem] uppercase tracking-[0.22em]"
        style={{ color: "var(--cosmic-violet)" }}
      >
        {children}
      </p>
      {right}
    </div>
  );
}

/**
 * A card, drawn the way every other Gachard surface draws one.
 *
 * The wallet pages used to render their own tile: `.card-surface`, the rarity
 * glow moved onto the artwork and switched on only while selected, and the
 * rarity written as a small coloured line. None of that matched
 * `components/CardItem.tsx`, which is the reference the rest of the app
 * follows, so the same card looked like a different object depending on the
 * page it was on.
 *
 * The frame is `.glass` with the rarity colour as its border and the rarity
 * glow always on, exactly as CardItem does it — a Legendary is a Legendary
 * whether or not it happens to be ticked. Selection is a white outline outside
 * that border, so the two never compete for the same edge.
 *
 * White, specifically, and not the electric blue used elsewhere on these
 * pages: --rarity-rare IS --electric-blue, so a selected Rare card had a blue
 * border with a blue outline around it and read as nothing more than a
 * slightly thicker edge. White belongs to no rarity, so selection looks the
 * same on all four.
 *
 * `children` is the per-card action area. /wallet puts the send-away field
 * there; /wallet/move passes nothing.
 */
export function CardFrame({
  card,
  selected,
  onToggle,
  disabled,
  testIdPrefix,
  children,
}: {
  card: WalletCard;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
  testIdPrefix: string;
  children?: ReactNode;
}) {
  const r = Math.max(0, Math.min(3, card.rarity ?? 0)) as 0 | 1 | 2 | 3;
  const label = RARITY[r];

  return (
    <li
      className={`glass glass-hover overflow-hidden p-2 sm:p-2.5 flex flex-col transition-all ${RARITY_GLOW[r]}`}
      style={{
        borderColor: RARITY_COLORS[r],
        ...(selected
          ? { outline: "2px solid rgba(255,255,255,0.95)", outlineOffset: "2px" }
          : {}),
      }}
    >
      {/* Only the card picks. On /wallet the field below needs its own clicks. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Select ${card.templateName ?? `card ${card.tokenId}`}`}
        onClick={onToggle}
        disabled={disabled}
        className="text-left w-full group disabled:opacity-50"
        data-testid={`${testIdPrefix}-pick-${card.tokenId}`}
      >
        <div
          className="relative w-full rounded-xl overflow-hidden mb-2 bg-white/5"
          style={{ aspectRatio: "5/7" }}
          data-testid={`${testIdPrefix}-visual-${card.tokenId}`}
        >
          {card.artworkUrl ? (
            <Image
              src={card.artworkUrl}
              alt={card.templateName ?? card.templateId ?? `Card ${card.tokenId}`}
              fill
              sizes="(max-width:768px) 40vw, 20vw"
              className="object-contain transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-3xl text-white/30">◆</span>
            </div>
          )}
          <span
            className="absolute top-2 right-2 z-10 flex items-center justify-center rounded-md text-[0.7rem] font-semibold transition-all"
            style={{
              width: 20,
              height: 20,
              background: selected ? "#FFFFFF" : "rgba(0,0,0,0.5)",
              border: `1px solid ${selected ? "#FFFFFF" : "rgba(255,255,255,0.35)"}`,
              color: selected ? "#0B0E1A" : "transparent",
            }}
          >
            ✓
          </span>
        </div>

        <div className="px-1">
          <p className="text-xs font-medium text-white truncate" title={card.templateName ?? ""}>
            {card.templateName ?? `Card #${card.tokenId}`}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-1 mt-1">
            <span className={`tag tag-${label.toLowerCase()} text-[0.55rem]`}>{label}</span>
            <span className="text-[0.55rem] text-white/40 whitespace-nowrap">#{card.tokenId}</span>
          </div>
        </div>
      </button>

      {children}
    </li>
  );
}
