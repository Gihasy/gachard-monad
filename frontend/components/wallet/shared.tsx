/**
 * Pieces shared by the wallet pages (ADR-031).
 *
 * /wallet holds what the user already has; /wallet/move is where they choose
 * what to send there. Both draw cards and both head their sections the same
 * way, so the vocabulary lives here rather than being copied and drifting.
 */
import type { ReactNode } from "react";

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
