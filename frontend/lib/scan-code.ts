/**
 * Read what a QR code actually contains.
 *
 * Both QR codes this app generates hold a **URL**, not a bare id:
 *
 *   card   `<origin>/scan?cardId=092ba`      (lib/qr.ts)
 *   claim  `<origin>/scan?claimId=1fa28e07`  (app/api/claim-qr/[claimId])
 *
 * That is deliberate and worth keeping: pointing a phone's camera at one opens
 * Gachard straight at the right page, with no app to install first.
 *
 * It does mean every in-app scanner gets handed the whole URL. QRScanner passes
 * `decodedText` through untouched, so a caller that treats the result as an id
 * is comparing "https://gachard-monad.vercel.app/scan?claimId=1fa28e07" with
 * "1fa28e07" and will never match. Claim Shipping failed that way on every
 * card, every time, and the message it produced — "QR code does not match this
 * card" — pointed at the card rather than at the parsing.
 *
 * Hence one parser, used by every scanner, rather than a URL check copied to
 * each call site and correct in some of them.
 */

/** A claimId is `randomBytes(4).toString("hex")` — exactly 8 hex characters. */
const CLAIM_ID = /^[a-f0-9]{8}$/i;
/** A cardId is 5 hex characters. */
const CARD_ID = /^[a-f0-9]{5}$/i;

export type ScannedCode = {
  claimId: string | null;
  cardId: string | null;
};

export function parseScannedCode(text: string): ScannedCode {
  const raw = (text ?? "").trim();
  if (!raw) return { claimId: null, cardId: null };

  // The normal case: a URL from one of our own QR codes.
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const claimId = url.searchParams.get("claimId");
      if (claimId) return { claimId: claimId.trim(), cardId: null };
      const cardId = url.searchParams.get("cardId");
      if (cardId) return { claimId: null, cardId: cardId.trim() };
    } catch {
      // Not parseable as a URL after all. Fall through and treat it as text.
    }
    // A URL of ours carrying neither parameter is not a code we can use.
    return { claimId: null, cardId: null };
  }

  // A bare id, from a QR generated elsewhere or typed by hand. Decided by exact
  // length, not by "8 or fewer hex characters" — a 5-character cardId satisfies
  // that too, so the looser test read every card QR as a claim.
  if (CLAIM_ID.test(raw)) return { claimId: raw, cardId: null };
  if (CARD_ID.test(raw)) return { claimId: null, cardId: raw };

  // Unrecognised shape. Hand it on as a cardId so the lookup can fail with a
  // message about the card, which is what the old code did and is still the
  // more useful of the two errors.
  return { claimId: null, cardId: raw };
}
