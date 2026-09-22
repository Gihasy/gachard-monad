/**
 * Is an unlocked admin asking, or a stranger?
 *
 * The admin console is public on purpose: someone evaluating Gachard should be
 * able to follow a card from print request to approval without an account. But
 * the same responses carried the people in that flow — an email address, a
 * recipient's name, a phone number and a home address, all returned by
 * `/api/admin/print-requests` to anyone who opened the URL.
 *
 * So these routes answer two audiences from one address. `proxy.ts` already
 * verifies the admin cookie; it now says so in a header, and this reads it.
 * The header is deleted from every incoming request before the proxy sets it,
 * so it cannot be forged from outside.
 *
 * The rule this implements is ADR-032's: a public endpoint returns a document
 * only through an explicit field list or an explicit removal. Here the list is
 * explicit and the personal half of it is conditional.
 */
const ADMIN_HEADER = "x-gachard-admin";

export function isUnlockedAdmin(request: Request): boolean {
  return request.headers.get(ADMIN_HEADER) === "1";
}

/**
 * Include these fields only for an unlocked admin.
 *
 * Spread at the point of use — `...adminOnly(unlocked, { email })` — so the
 * key is absent entirely rather than present and null. Absent is the honest
 * shape: the field was not withheld pending something, it was not sent.
 */
export function adminOnly<T extends Record<string, unknown>>(
  unlocked: boolean,
  fields: T
): Partial<T> {
  return unlocked ? fields : {};
}
