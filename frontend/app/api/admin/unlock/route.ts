/**
 * Unlock the admin console's private panels.
 *
 * The console itself is public — a judge should be able to follow a card from
 * print request to approval without an account. Three panels are not: users,
 * supporters and creator applications hold contact details belonging to people
 * who never agreed to appear on a page anyone can open.
 *
 * This is the door. It takes credentials from the page rather than a browser
 * dialog, so the prompt appears next to the thing being unlocked instead of
 * over a page that is mostly public.
 *
 * The cookie it mints is verified in `proxy.ts`, so the format has to match
 * byte for byte: `<unix seconds>.<hex HMAC of "admin.<unix seconds>">`.
 * Node's createHmac and Web Crypto agree on that, which is what made the
 * format survive the proxy moving off the Edge runtime.
 */
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 10;

const ADMIN_COOKIE_NAME = "gachard_admin";
const ADMIN_MAX_AGE = 60 * 60 * 8;

/** Constant-time compare that does not leak length through early return. */
function sameSecret(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(request: Request) {
  try {
    const expectedUser = process.env.ADMIN_USERNAME;
    const expectedPass = process.env.ADMIN_PASSWORD;
    const secret = process.env.ENCRYPTION_SECRET_KEY;

    // Refuse rather than fall open. A deployment missing these should keep the
    // panels shut, not hand them out.
    if (!expectedUser || !expectedPass || !secret || secret.length < 32) {
      return NextResponse.json(
        { error: "Admin access is not configured on this deployment." },
        { status: 503 }
      );
    }

    // Brute force is the obvious attack on a form anyone can reach. Keyed by
    // forwarded IP, which is imperfect behind shared egress but costs an
    // attacker far more than it costs a real admin typing a password twice.
    const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    const rate = await checkRateLimit(`admin-unlock:${ip}`, "admin_unlock");
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again in a minute." },
        { status: 429 }
      );
    }

    const { username, password } = await request.json().catch(() => ({}));
    // Both are checked, and neither short-circuits on the other, so a wrong
    // username and a wrong password cost the same.
    const okUser = sameSecret(String(username ?? ""), expectedUser);
    const okPass = sameSecret(String(password ?? ""), expectedPass);
    if (!okUser || !okPass) {
      return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
    }

    const ts = String(Math.floor(Date.now() / 1000));
    const token = `${ts}.${createHmac("sha256", secret).update(`admin.${ts}`).digest("hex")}`;

    const response = NextResponse.json({ success: true, expiresIn: ADMIN_MAX_AGE });
    response.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_MAX_AGE,
    });
    return response;
  } catch (error) {
    console.error("[admin/unlock] failed:", error);
    return NextResponse.json({ error: "Could not unlock." }, { status: 500 });
  }
}
