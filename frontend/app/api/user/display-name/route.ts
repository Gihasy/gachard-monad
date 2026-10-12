/**
 * Read or set the name a collector is shown by on public surfaces.
 *
 * GET returns the current name and the anonymous label used when none is set,
 * so the profile can show the user exactly what a stranger scanning their card
 * would see. POST sets it, or clears it when sent an empty string.
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

  // Empty means "go back to the anonymous label".
  if (raw === "" || raw === null) {
    await users.updateOne(
      { _id: user._id },
      { $unset: { displayName: "", displayNameKey: "" } }
    );
    return NextResponse.json(
      { displayName: null, fallback: anonymousLabel(userId) },
      { headers: NO_STORE }
    );
  }

  const checked = checkDisplayName(raw);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400, headers: NO_STORE });
  }

  try {
    await users.updateOne(
      { _id: user._id },
      { $set: { displayName: checked.name, displayNameKey: checked.key } }
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
    { displayName: checked.name, fallback: anonymousLabel(userId) },
    { headers: NO_STORE }
  );
}
