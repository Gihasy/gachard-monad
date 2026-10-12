/**
 * Read or set the name a collector is shown by on public surfaces.
 *
 * GET returns the name, whether it is hidden, and the anonymous label, so the
 * profile can show the user exactly what a stranger scanning their card sees.
 *
 * POST takes one of:
 *   { displayName: "Card Hunter" }  claim or rename. A new name starts public.
 *   { hidden: true | false }        hide or show the name. It stays reserved
 *                                   while hidden — that is the point.
 *   { displayName: "" }             release the name entirely, so someone
 *                                   else may take it. Not offered in the UI;
 *                                   kept so a name can be given up on request.
 *
 * Rules live in `lib/display-name.ts`. Uniqueness is enforced by the database
 * index rather than a lookup first, because a lookup followed by a write is a
 * race two people can both win.
 */
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { getCollection } from "@/lib/mongodb";
import { checkRateLimit } from "@/lib/rate-limit";
import { anonymousLabel, checkDisplayName } from "@/lib/display-name";

const NO_STORE = { "Cache-Control": "no-store, private" };

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(
    {
      displayName: typeof user.displayName === "string" ? user.displayName : null,
      hidden: user.displayNameHidden === true,
      fallback: anonymousLabel(user._id.toString()),
    },
    { headers: NO_STORE }
  );
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user._id.toString();

  // Names are unique, so trying them is a way to test which are taken.
  // Rate limiting keeps that from becoming an enumeration of every name.
  const rate = await checkRateLimit(userId, "display_name");
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many changes. Try again in a minute." },
      { status: 429, headers: NO_STORE }
    );
  }

  const body = await request.json().catch(() => null);
  const raw = body?.displayName;
  const users = await getCollection("users");

  // Visibility only. The name and its key are untouched, so the unique index
  // goes on refusing it to everyone else while it is hidden.
  if (typeof body?.hidden === "boolean" && raw === undefined) {
    if (typeof user.displayName !== "string") {
      return NextResponse.json(
        { error: "Choose a name before changing its visibility." },
        { status: 400, headers: NO_STORE }
      );
    }
    await users.updateOne({ _id: user._id }, { $set: { displayNameHidden: body.hidden } });
    return NextResponse.json(
      { displayName: user.displayName, hidden: body.hidden, fallback: anonymousLabel(userId) },
      { headers: NO_STORE }
    );
  }

  // Empty means "go back to the anonymous label".
  if (raw === "" || raw === null) {
    await users.updateOne(
      { _id: user._id },
      { $unset: { displayName: "", displayNameKey: "", displayNameHidden: "" } }
    );
    return NextResponse.json(
      { displayName: null, hidden: false, fallback: anonymousLabel(userId) },
      { headers: NO_STORE }
    );
  }

  const checked = checkDisplayName(raw);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400, headers: NO_STORE });
  }

  try {
    // A new name starts public: choosing one is a decision to be seen by it.
    await users.updateOne(
      { _id: user._id },
      { $set: { displayName: checked.name, displayNameKey: checked.key, displayNameHidden: false } }
    );
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) {
      return NextResponse.json(
        { error: "That name is already taken." },
        { status: 409, headers: NO_STORE }
      );
    }
    throw e;
  }

  return NextResponse.json(
    { displayName: checked.name, hidden: false, fallback: anonymousLabel(userId) },
    { headers: NO_STORE }
  );
}
