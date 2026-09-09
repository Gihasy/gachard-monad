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
  // Protect clean-slate with admin credentials
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return NextResponse.json(
      { error: "Admin credentials required for clean-slate operation" },
      { status: 401 }
    );
  }

  const encoded = authHeader.slice(6);
  const decoded = atob(encoded);
  const [username, password] = decoded.split(":");

  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPass || !safeEqual(username, expectedUser) || !safeEqual(password, expectedPass)) {
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
