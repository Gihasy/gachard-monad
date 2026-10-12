/**
 * The name a collector is shown by on public surfaces.
 *
 * The scan page shows who has held a card, because provenance is the point of
 * it. It used to show `username`, which `lib/auth.ts` builds as
 * `email.split("@")[0]` — so anyone who scanned a card saw the owner's email
 * address minus its domain, and could add "@gmail.com" back. The scan endpoint
 * is public, and cardIds are five hex characters, so the whole list of owners
 * could be collected by script without touching a physical card.
 *
 * Now a collector is shown by a name they chose, or by an anonymous label if
 * they have not chosen one. `username` never reaches a public response.
 *
 * **The fallback is anonymous but stable.** "Collector #3F9A2C" is derived from
 * the user id with an HMAC, so the same person gets the same label across
 * every card — provenance can still say "held twice by the same collector" —
 * without the label being reversible into the id, which ADR-032 says public
 * endpoints must not emit.
 *
 * **Names are ASCII, and some are reserved.** Provenance rows already read
 * "Gachard" for the platform's own wallet and "Gachard Vault" for printed
 * cards, so a collector who could name themselves "Gachard Vault" could make a
 * row look like the platform held a card it never did. Unicode is excluded for
 * the same reason: "Gаchard" with a Cyrillic а passes any blocklist written in
 * Latin letters. This is the impersonation problem ADR-033 is about, arriving
 * by a different door.
 *
 * **Names are unique**, case-insensitively, enforced by an index on
 * `displayNameKey`. Showing names exists to say who held a card; two people
 * sharing one makes that claim worthless, and lets someone take a known
 * collector's name to borrow their reputation.
 */
import { createHmac } from "crypto";

export const DISPLAY_NAME_MIN = 3;
export const DISPLAY_NAME_MAX = 24;

/** Letters, digits, space, dot, underscore, hyphen. ASCII only — see above. */
const ALLOWED = /^[A-Za-z0-9 ._-]+$/;

/**
 * Matched against the name lowercased with everything but letters and digits
 * removed, so "G.a.c.h.a.r.d" and "gachard_official" are caught too.
 */
const RESERVED_ANYWHERE = ["gachard", "admin", "official", "support", "moderator"];
/** Prefixes that would mimic the labels the system itself produces. */
const RESERVED_PREFIX = ["collector", "unknown"];

export type NameCheck = { ok: true; name: string; key: string } | { ok: false; error: string };

/** Collapse spaces, trim, and validate. Returns the stored form and its unique key. */
export function checkDisplayName(input: unknown): NameCheck {
  if (typeof input !== "string") return { ok: false, error: "Name must be text." };
  const name = input.trim().replace(/\s+/g, " ");

  if (name.length < DISPLAY_NAME_MIN || name.length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `Use ${DISPLAY_NAME_MIN} to ${DISPLAY_NAME_MAX} characters.` };
  }
  if (!ALLOWED.test(name)) {
    return {
      ok: false,
      error: "Use letters, numbers, spaces, dots, hyphens or underscores only.",
    };
  }

  const squashed = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (squashed.length === 0) {
    return { ok: false, error: "Include at least one letter or number." };
  }
  if (RESERVED_ANYWHERE.some((w) => squashed.includes(w))) {
    return { ok: false, error: "That name is reserved." };
  }
  if (RESERVED_PREFIX.some((w) => squashed.startsWith(w))) {
    return { ok: false, error: "That name is reserved." };
  }

  // The uniqueness key: case and spacing do not make a different name.
  return { ok: true, name, key: name.toLowerCase().replace(/\s+/g, " ") };
}

/** "Collector #3F9A2C" — stable per user, not reversible to the user id. */
export function anonymousLabel(userId: string): string {
  const secret = process.env.ENCRYPTION_SECRET_KEY || "";
  const tag = createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(`collector:${userId}`)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  return `Collector #${tag}`;
}

/** What a user is called on a public surface. Never their username. */
export function publicLabel(user: { _id: { toString(): string }; displayName?: unknown }): string {
  return typeof user.displayName === "string" && user.displayName.length > 0
    ? user.displayName
    : anonymousLabel(user._id.toString());
}
