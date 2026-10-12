/**
 * Read or set the name a collector is shown by on public surfaces.
 *
 * GET returns the name, whether it is hidden, and the anonymous label, so the
 * profile can show the user exactly what a stranger scanning their card sees.
 *
 * POST takes one of:
 *   { displayName: "Card Hunter" }  claim a name. Once only: renaming needs a
 *                                   grant (`mayChangeName`), used up by it.
 *   { hidden: true | false }        hide or show the name. It stays reserved
 *                                   while hidden — that is the point. Always
 *                                   allowed; it changes visibility, not the name.
 *   { displayName: "" }             release the name, so someone else may take
 *                                   it. Also needs a grant, or releasing and
 *                                   claiming again would be a rename.
 *
 * Rules live in `lib/display-name.ts`. Uniqueness is enforced by the database
 * index rather than a lookup first, because a lookup followed by a write is a
 * race two people can both win.
 */
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { getCollection } from "@/lib/mongodb";
import { checkRateLimit } from "@/lib/rate-limit";
import { anonymousLabel, checkDisplayName, mayChangeName } from "@/lib/display-name";

const NO_STORE = { "Cache-Control": "no-store, private" };

const ONCE = "A public name can only be chosen once.";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(
    {
      displayName: typeof user.displayName === "string" ? user.displayName : null,
      hidden: user.displayNameHidden === true,
      fallback: anonymousLabel(user._id.toString()),
      canChange: typeof user.displayName !== "string" || mayChangeName(user),
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
      { displayName: user.displayName, hidden: body.hidden, fallback: anonymousLabel(userId), canChange: mayChangeName(user) },
      { headers: NO_STORE }
    );
  }

  const hasName = typeof user.displayName === "string";

  // Empty means "give the name up". A release followed by a new claim is a
  // rename, so it needs the same grant, and spends it.
  if (raw === "" || raw === null) {
    if (!hasName) {
      return NextResponse.json(
        { displayName: null, hidden: false, fallback: anonymousLabel(userId), canChange: true },
        { headers: NO_STORE }
      );
    }
    const released = await users.updateOne(
      { _id: user._id, nameChangeGranted: true },
      { $unset: { displayName: "", displayNameKey: "", displayNameHidden: "", nameChangeGranted: "" } }
    );
    if (released.matchedCount === 0) {
      return NextResponse.json({ error: ONCE }, { status: 403, headers: NO_STORE });
    }
    return NextResponse.json(
      { displayName: null, hidden: false, fallback: anonymousLabel(userId), canChange: true },
      { headers: NO_STORE }
    );
  }

  const checked = checkDisplayName(raw);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400, headers: NO_STORE });
  }

  try {
    // A new name starts public: choosing one is a decision to be seen by it.
    //
    // The condition is the rule. A first claim only matches a user with no
    // name; a rename only matches one holding a grant, and removes it in the
    // same write. Checking first and writing second would let two requests
    // sent together both pass the check.
    const write = hasName
      ? await users.updateOne(
          { _id: user._id, nameChangeGranted: true },
          {
            $set: { displayName: checked.name, displayNameKey: checked.key, displayNameHidden: false },
            $unset: { nameChangeGranted: "" },
          }
        )
      : await users.updateOne(
          { _id: user._id, displayName: { $exists: false } },
          { $set: { displayName: checked.name, displayNameKey: checked.key, displayNameHidden: false } }
        );
    if (write.matchedCount === 0) {
      return NextResponse.json({ error: ONCE }, { status: 403, headers: NO_STORE });
    }
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
    { displayName: checked.name, hidden: false, fallback: anonymousLabel(userId), canChange: false },
    { headers: NO_STORE }
  );
}
