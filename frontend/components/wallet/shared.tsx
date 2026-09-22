"use client";

/**
 * Pieces shared by the wallet pages (ADR-031).
 *
 * /wallet holds what the user already has; /wallet/move is where they choose
 * what to send there. Both draw cards and both head their sections the same
 * way, so the vocabulary lives here rather than being copied and drifting.
 */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";

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
          {/*
            The same identifier /collection puts on the same card.

            These tiles used to lead with the template name and show the token
            id, while CardItem leads with the card id. Two different numbers for
            one card depending on which page you were looking at, and the card
            id is the one that matters elsewhere: it is what /scan takes, what
            redeem asks for, and what the QR encodes.

            The token id stays alongside it, because this is the page where a
            card is moved on chain and that is the number the signing dialog and
            the explorer will show. The template name is in the tooltip.
          */}
          <p
            className="text-xs font-medium text-white truncate"
            title={card.templateName ?? ""}
            data-testid={`${testIdPrefix}-label-${card.tokenId}`}
          >
            {card.cardId
              ? `Card ID: #${card.cardId}`
              : card.tokenId !== null
                ? `Card #${card.tokenId}`
                : card.templateId}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-1 mt-1">
            <span className={`tag tag-${label.toLowerCase()} text-[0.55rem]`}>{label}</span>
            <span
              className="text-[0.55rem] text-white/40 whitespace-nowrap"
              title="On-chain token id"
            >
              Token #{card.tokenId}
            </span>
          </div>
        </div>
      </button>

      {children}
    </li>
  );
}


/**
 * The way into /wallet/move, at the top of /wallet.
 *
 * It used to be a small button beside the "Cards in this wallet" heading,
 * which put the action that fills the page below the thing it fills — on an
 * empty wallet that reads as a dead end.
 *
 * The button says what happens rather than where to click. "Click here" tells
 * a reader nothing before they commit to it, and this is the start of a path
 * that ends in a transfer nobody can undo.
 */
export function MoveCardsBanner() {
  return (
    <section
      className="glass p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6"
      style={{ borderColor: "rgba(0,204,255,0.28)" }}
      data-testid="wallet-move-banner"
    >
      <div className="flex-1 min-w-0">
        <p
          className="text-[0.72rem] uppercase tracking-[0.22em] mb-1.5"
          style={{ color: "var(--cosmic-violet)" }}
        >
          From your collection
        </p>
        <h2 className="text-base sm:text-lg mb-1.5" style={{ fontFamily: "var(--font-display)" }}>
          Move cards into this wallet
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          Pick the ones you want to hold yourself. They leave Gachard&apos;s custody and land
          here, and you can send them back whenever you like.
        </p>
      </div>
      <Link
        href="/wallet/move"
        className="btn-primary !py-2.5 !px-6 !text-xs shrink-0 text-center"
        data-testid="wallet-move-cards"
      >
        Choose cards
      </Link>
    </section>
  );
}


/**
 * Shorten an address for display.
 *
 * A full address is 42 characters and this sits in a 21rem sidebar, so it was
 * wrapping onto a second line and breaking mid-run: ugly, and harder to check
 * than the short form. Nothing is lost by shortening. The value is never typed
 * out by hand — Copy puts the whole thing on the clipboard and Explorer opens
 * it — and the full string stays on the element for hovering, selecting and
 * screen readers. Ten leading and eight trailing characters is enough to tell
 * two of your own addresses apart, which is what this display is for.
 */
export function shortAddress(a: string) {
  return a.length <= 20 ? a : `${a.slice(0, 10)}…${a.slice(-8)}`;
}

/** The wallet address, with a copy button. */
export function WalletAddress({ address }: { address: string }) {
  // "idle" | "ok" | "fail". The failure case used to be swallowed by an empty
  // rejection handler, so a browser that denies clipboard access left the user
  // pressing Copy and watching nothing happen. Saying it failed is worth more
  // than pretending it did not, and the address is still on the element and one
  // click away on the explorer.
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");

  return (
    <div className="card-surface px-4 py-3">
      <p
        className="text-[0.6rem] uppercase tracking-[0.14em] mb-1.5"
        style={{ color: "var(--text-tertiary)" }}
      >
        Address
      </p>
      <div className="flex items-center gap-3">
        <p
          className="text-[0.82rem] font-mono flex-1 min-w-0 truncate"
          style={{ color: "var(--text-secondary)" }}
          title={address}
          data-testid="wallet-address"
        >
          {shortAddress(address)}
        </p>
        <button
          onClick={async () => {
            try {
              if (!navigator.clipboard) throw new Error("no clipboard");
              await navigator.clipboard.writeText(address);
              setState("ok");
            } catch {
              setState("fail");
            }
            setTimeout(() => setState("idle"), 2000);
          }}
          className="btn-ghost !py-1.5 !px-3 !text-[0.6rem] shrink-0 whitespace-nowrap"
          style={
            state === "ok"
              ? { color: "var(--electric-blue)", borderColor: "rgba(0,204,255,0.4)" }
              : state === "fail"
                ? { color: "var(--aurora-pink)", borderColor: "rgba(255,107,186,0.4)" }
                : undefined
          }
          aria-label={
            state === "ok"
              ? "Address copied"
              : state === "fail"
                ? "Could not copy, select the address instead"
                : "Copy full address"
          }
          data-testid="wallet-copy"
        >
          {state === "ok" ? "Copied" : state === "fail" ? "Copy failed" : "Copy"}
        </button>
      </div>
      {/* The whole value, for anyone reading this with a screen reader rather
          than looking at it. */}
      <span className="sr-only">{address}</span>
    </div>
  );
}

/**
 * Transfer a card out of Gachard, in two steps.
 *
 * The address field used to sit open on every card tile, beside a "Send away"
 * button. That put the most dangerous input in the app on permanent display,
 * on every card, where a stray paste is one click from being irreversible.
 * Nothing opens now until the user asks for it.
 *
 * Two steps on purpose. The caution and the field come first; then the address
 * is shown back, on its own, to be read rather than typed. Checking what you
 * just typed in the box you typed it into is not really checking — the second
 * screen is what makes "check it again" mean anything.
 *
 * The server validates with ethers.getAddress, which rejects a malformed
 * string but cannot reject a valid wrong one: a typo that still checksums, an
 * exchange deposit address that cannot hold ERC-1155, a contract with no
 * receiver hook. Those are the cases where a card is actually lost, and no
 * amount of validation catches them. Only the person looking at the address
 * can.
 *
 * Portalled to document.body: `.glass` sets backdrop-filter, which makes any
 * glass ancestor a containing block for fixed positioning and would leave this
 * anchored to a card tile instead of the viewport.
 */
export function TransferDialog({
  card,
  busy,
  onCancel,
  onConfirm,
}: {
  card: WalletCard;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (to: string) => void;
}) {
  const [to, setTo] = useState("");
  const [step, setStep] = useState<"address" | "confirm">("address");
  const trimmed = to.trim();
  // Shape only. Whether it is the RIGHT address is the thing no check can
  // answer, which is what the second step is for.
  const looksLikeAddress = /^0x[a-fA-F0-9]{40}$/.test(trimmed);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  if (typeof document === "undefined") return null;

  const name = card.templateName ?? `Card #${card.tokenId}`;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={() => !busy && onCancel()}
      data-testid="transfer-dialog"
    >
      <div
        className="glass w-full max-w-sm p-6"
        style={{ borderColor: "rgba(255,107,186,0.35)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Transfer ${name} out of Gachard`}
      >
        {step === "address" ? (
          <>
            <p
              className="text-[0.72rem] uppercase tracking-[0.22em] mb-3"
              style={{ color: "var(--aurora-pink)" }}
            >
              Transfer out of Gachard
            </p>

            <div
              className="rounded-xl p-3.5 mb-4"
              style={{
                background: "rgba(255,107,186,0.07)",
                border: "1px solid rgba(255,107,186,0.25)",
              }}
              data-testid="transfer-caution"
            >
              <p className="text-[0.78rem] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                <span style={{ color: "var(--text-secondary)" }}>
                  Make sure the address is right, then check it again.
                </span>{" "}
                A card sent to the wrong address is gone. Gachard cannot help you get it back,
                and neither can anyone else.
              </p>
            </div>

            <label
              className="block text-[0.6rem] uppercase tracking-[0.14em] mb-1.5"
              style={{ color: "var(--text-tertiary)" }}
            >
              Destination address
            </label>
            <div className="form-field">
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                autoFocus
                className="!text-[0.75rem] font-mono"
                data-testid="transfer-address-input"
              />
            </div>
            {trimmed.length > 0 && !looksLikeAddress && (
              <p className="text-[0.68rem] mt-2" style={{ color: "var(--aurora-gold)" }} data-testid="transfer-shape-hint">
                That is not a complete address. One should be 0x followed by 40 characters.
              </p>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setStep("confirm")}
                disabled={!looksLikeAddress}
                className="btn-primary !py-2.5 !text-xs flex-1 disabled:opacity-40"
                data-testid="transfer-next-btn"
              >
                Continue
              </button>
              <button onClick={onCancel} className="btn-ghost !py-2.5 !px-5 !text-xs">
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p
              className="text-[0.72rem] uppercase tracking-[0.22em] mb-3"
              style={{ color: "var(--aurora-pink)" }}
            >
              This cannot be undone
            </p>

            <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-tertiary)" }}>
              <span style={{ color: "var(--text-secondary)" }}>{name}</span>{" "}
              {card.cardId ? `(Card ID: #${card.cardId})` : null} leaves Gachard for good.
            </p>

            <p
              className="text-[0.6rem] uppercase tracking-[0.14em] mb-1.5"
              style={{ color: "var(--text-tertiary)" }}
            >
              Read the destination once more
            </p>
            <p
              className="card-surface px-3 py-2.5 text-[0.75rem] font-mono break-all mb-5"
              style={{ color: "var(--text-secondary)" }}
              data-testid="transfer-confirm-address"
            >
              {trimmed}
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => onConfirm(trimmed)}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl text-xs font-medium transition-all disabled:opacity-50"
                style={{
                  background: "rgba(255,107,186,0.14)",
                  border: "1px solid rgba(255,107,186,0.45)",
                  color: "var(--aurora-pink)",
                }}
                data-testid="transfer-confirm-btn"
              >
                {busy ? "Transferring…" : "Transfer permanently"}
              </button>
              <button
                onClick={() => setStep("address")}
                disabled={busy}
                className="btn-ghost !py-2.5 !px-5 !text-xs disabled:opacity-50"
                data-testid="transfer-back-btn"
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
