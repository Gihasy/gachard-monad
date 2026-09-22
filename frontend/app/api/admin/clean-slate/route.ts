import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";

// Constant-time string comparison
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function POST(req: NextRequest) {
  // Basic only, deliberately — not the `gachard_admin` cookie the rest of the
  // console unlocks with. That cookie lives for eight hours in a browser, and
  // this route deletes every card, transaction and balance in the database.
  // The most destructive action in the app should cost a fresh password, not
  // an open tab.
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return NextResponse.json(
      { error: "Admin credentials required for clean-slate operation" },
      { status: 401 }
    );
  }

  // Split on the FIRST colon only. RFC 7617 reserves the colon as the
  // separator, which means a username may not contain one and a password may
  // contain as many as it likes. `split(":")` truncated the password at the
  // first one, so a correct password with punctuation in it was rejected — and
  // the failure looked exactly like a wrong password, which is the worst shape
  // a bug can take on a login.
  let username = "";
  let password = "";
  try {
    const decoded = atob(authHeader.slice(6));
    const at = decoded.indexOf(":");
    // No colon at all is a malformed header, not a credential.
    if (at < 0) throw new Error("malformed");
    username = decoded.slice(0, at);
    password = decoded.slice(at + 1);
  } catch {
    // atob throws on anything that is not valid base64. Uncaught, that was a
    // 500 for a request that deserves a 401.
    return NextResponse.json({ error: "Invalid admin credentials" }, { status: 401 });
  }

  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPass) {
    // Refuse rather than fall open. A deployment without these should not be
    // wipeable by anyone who asks.
    return NextResponse.json(
      { error: "Admin access is not configured on this deployment." },
      { status: 503 }
    );
  }

  // Both halves are compared before either is judged. The previous form
  // short-circuited on the username, so a wrong one returned without ever
  // looking at the password.
  const okUser = safeEqual(username, expectedUser);
  const okPass = safeEqual(password, expectedPass);
  if (!okUser || !okPass) {
    return NextResponse.json(
      { error: "Invalid admin credentials" },
      { status: 401 }
    );
  }

  return doCleanSlate(req);
}

async function doCleanSlate(req: NextRequest) {
  try {
    const includeUsers = req.nextUrl.searchParams.get("includeUsers") === "true";

    const collections = [
      "cards",
      "transactions",
      "redeem_codes",
      "rate_limits",
      "shipping_addresses",
      "payments",
      "listings",
      "wishlist",
      "supporters",
      "crystal_balances",
      "creator_applications",
    ];

    if (includeUsers) {
      collections.push("users");
    }

    const results: Record<string, number> = {};
    let totalDeleted = 0;

    // Delete all collections in parallel
    const deleteResults = await Promise.all(
      collections.map(async (name) => {
        const col = await getCollection(name);
        const count = await col.countDocuments();
        if (count > 0) {
          const res = await col.deleteMany({});
          return [name, res.deletedCount] as const;
        }
        return [name, 0] as const;
      })
    );

    for (const [name, count] of deleteResults) {
      results[name] = count;
      totalDeleted += count;
    }

    // Preserved counts
    const templatesCol = await getCollection("card_templates");
    const preserved: Record<string, number> = {
      card_templates: await templatesCol.countDocuments(),
    };

    if (!includeUsers) {
      const usersCol = await getCollection("users");
      preserved.users = await usersCol.countDocuments();
    }

    return NextResponse.json(
      { totalDeleted, deleted: results, preserved, includeUsers },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    console.error("[admin/clean-slate]", error);
    return NextResponse.json(
      { error: "Clean slate failed" },
      { status: 500, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}
