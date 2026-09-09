import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCollection } from "@/lib/mongodb";
import { getOrCreateUser } from "@/lib/auth";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/session";

/**
 * Demo / sandbox account.
 *
 * Creates a fresh custodial-wallet user in MongoDB (real Monad Testnet wallet,
 * generated server-side) and grants starter credits so anyone can try every
 * gated page + on-chain function WITHOUT Google OAuth. The wallet address and
 * any blockchain data are never shown to the user — they are only visible in
 * the Admin console. Each account gets a sequential handle @DemoN.
 *
 * Establishes the app's standard session on the client (localStorage `user` +
 * `gachard_uid` cookie). Gated by the ENABLE_DEMO_LOGIN env flag.
 */
async function nextDemoNumber(): Promise<number> {
  const counters = await getCollection("counters");
  const result = await counters.findOneAndUpdate(
    { _id: "demo_account" } as Record<string, unknown>,
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return (result?.seq as number) ?? 1;
}

export async function POST() {
  if (process.env.ENABLE_DEMO_LOGIN !== "true") {
    return NextResponse.json({ error: "Demo accounts are disabled" }, { status: 403 });
  }

  try {
    const n = await nextDemoNumber();
    const suffix = randomBytes(4).toString("hex");

    // Unique googleId so getOrCreateUser always provisions a real wallet.
    const user = await getOrCreateUser({
      sub: `demo-${suffix}`,
      email: `demo${n}@gachard.io`,
      name: `Demo ${n}`,
    });
    const userId = user._id.toString();

    // Public-facing handle: @DemoN (wallet stays Admin-only).
    const username = `Demo${n}`;
    const usersCollection = await getCollection("users");
    await usersCollection.updateOne(
      { _id: user._id } as Record<string, unknown>,
      { $set: { username } }
    );

    // Demo accounts start with 0 credits — user tops up manually.

    const response = NextResponse.json({
      user_id: userId,
      username,
      email: user.email,
    });

    const sessionToken = createSessionToken(userId);
    const isProduction = process.env.NODE_ENV === "production";

    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    return response;
  } catch (error) {
    console.error("Demo account error:", error);
    return NextResponse.json({ error: "Could not generate demo account" }, { status: 500 });
  }
}
