/**
 * Mask a personal email for display.
 *
 * `gigih.hartanto.s@gmail.com` becomes `gig*************@gmail.com`: the first
 * three characters of the local part survive, the rest becomes asterisks of the
 * same length, and the domain stays intact.
 *
 * The length is preserved rather than collapsed to a fixed run of stars. A
 * short address and a long one should not look identical, or an admin loses the
 * ability to tell two rows apart at a glance — which is the whole reason the
 * column is there.
 *
 * Demo accounts are left alone. They are synthetic (`demo37@gachard.io`), there
 * is no person behind them to protect, and masking them would make every demo
 * row read as `dem***@gachard.io` — indistinguishable, for no gain.
 *
 * This is presentation only. It does not protect the data: /api/admin/users
 * still returns the real addresses, and the admin API has no authentication in
 * front of it. Masking helps with screen shares, recordings and someone reading
 * over a shoulder. It is not a substitute for closing that route.
 */
const DEMO_DOMAIN = "@gachard.io";
const VISIBLE = 3;

export function maskEmail(email: string | null | undefined): string {
  if (!email) return "";

  const at = email.lastIndexOf("@");
  // Not an address shape. Mask the whole thing rather than guess at it: a
  // malformed value is more likely to be unexpected data than a safe one.
  if (at <= 0) return "*".repeat(email.length);

  const local = email.slice(0, at);
  const domain = email.slice(at);

  if (domain.toLowerCase() === DEMO_DOMAIN) return email;

  // Too short to reveal three and still hide anything.
  if (local.length <= VISIBLE) return "*".repeat(local.length) + domain;

  return local.slice(0, VISIBLE) + "*".repeat(local.length - VISIBLE) + domain;
}
