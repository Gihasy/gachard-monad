/**
 * The single auth gate, in front of every route the matcher at the foot names.
 *
 * This was `middleware.ts` until Next 16 deprecated that convention and
 * renamed it to `proxy`. The rename is not cosmetic: a proxy always runs on
 * the Node.js runtime, and setting the `runtime` config option in this file
 * throws. Nothing here needed rewriting for that — `atob` and Web Crypto are
 * both available in Node — but anything added later can no longer assume Edge.
 */
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "gachard_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const ADMIN_COOKIE_NAME = "gachard_admin";
const ADMIN_MAX_AGE = 60 * 60 * 8; // one working session

/**
 * Admin endpoints holding other people's personal details.
 *
 * Everything else under /api/admin is about cards, transactions and the print
 * queue — the flow the console exists to make legible, and nothing a stranger
 * learns anything private from.
 */
const ADMIN_PRIVATE = [
  "/api/admin/users",
  "/api/admin/supporters",
  "/api/admin/creator-applications",
];

const PROTECTED = ["/collection", "/profile", "/topup", "/wallet"];

// Public API routes that don't require authentication
const PUBLIC_API = [
  "/api/auth/",       // login endpoints
  "/api/scan",        // QR scan — public by design
  "/api/cards/",      // QR generation (/api/cards/[tokenId]/qr)
  "/api/marketplace/listings",      // marketplace listings — public for browsing
  "/api/marketplace/wishlist-stats", // anonymous wishlist interaction
  "/api/marketplace/insight",       // market insight — public
  "/api/health",      // health check — public
];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API.some((p) => pathname.startsWith(p));
}

// Constant-time string comparison. Hand-rolled rather than `timingSafeEqual`
// because this file was on the Edge runtime, where node:crypto was not
// available. It runs on Node now, but the implementation is correct and
// dependency-free, so there is nothing to gain by swapping it.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Constant-time hex comparison for Edge Runtime (no Node.js Buffer)
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Edge-compatible HMAC-SHA256 using Web Crypto API
async function hmacSha256(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  // Convert ArrayBuffer to hex string
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Edge-compatible session token verification
async function verifySessionTokenEdge(token: string): Promise<boolean> {
  if (!token || typeof token !== "string") return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [userId, timestampStr, signature] = parts;
  const payload = `${userId}.${timestampStr}`;

  // Get signing key from env
  const secret = process.env.ENCRYPTION_SECRET_KEY;
  if (!secret || secret.length < 32) return false;

  // Verify HMAC signature using Web Crypto API
  const expectedSig = await hmacSha256(payload, secret);
  if (!safeEqualHex(signature, expectedSig)) return false;

  // Check expiration (30 days)
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - timestamp;
  if (ageSeconds > SESSION_MAX_AGE || ageSeconds < 0) return false;

  // Basic userId format check (24 hex chars for MongoDB ObjectId)
  if (!/^[0-9a-fA-F]{24}$/.test(userId)) return false;

  return true;
}

/**
 * Admin access: HTTP Basic, then a signed cookie.
 *
 * The console and its seventeen API routes used to be waved straight through.
 * Six of those only read, but ten change state: /fulfillment moves a card
 * through the print queue on nothing but a tokenId, and /confirm-all sends a
 * transaction from the admin wallet. Neither asked who was calling.
 *
 * Basic auth alone would not have been enough. A browser caches those
 * credentials per path subtree, and /admin and /api/admin are siblings rather
 * than nested — so the page would authenticate and then its own fetches would
 * be refused. Passing Basic gets a short-lived signed cookie instead, which is
 * sent with every same-origin request regardless of path, and the proxy
 * accepts either.
 *
 * Eight hours, not thirty days: this is a workbench, not a login.
 */
async function adminCookieValid(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [tsStr, sig] = token.split(".");
  if (!tsStr || !sig) return false;

  const secret = process.env.ENCRYPTION_SECRET_KEY;
  if (!secret || secret.length < 32) return false;
  if (!safeEqualHex(sig, await hmacSha256(`admin.${tsStr}`, secret))) return false;

  const age = Math.floor(Date.now() / 1000) - parseInt(tsStr, 10);
  return Number.isFinite(age) && age >= 0 && age <= ADMIN_MAX_AGE;
}

async function mintAdminCookie(): Promise<string | null> {
  const secret = process.env.ENCRYPTION_SECRET_KEY;
  if (!secret || secret.length < 32) return null;
  const ts = String(Math.floor(Date.now() / 1000));
  return `${ts}.${await hmacSha256(`admin.${ts}`, secret)}`;
}

function basicAuthOk(header: string | null): boolean {
  const user = process.env.ADMIN_USERNAME;
  const pass = process.env.ADMIN_PASSWORD;
  // Refuse rather than fall open. A deployment missing these should be
  // unreachable, not unguarded.
  if (!user || !pass) return false;
  if (!header?.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }

  const at = decoded.indexOf(":");
  if (at < 0) return false;
  // Both halves are compared, and neither short-circuits on the other.
  const okUser = safeEqual(decoded.slice(0, at), user);
  const okPass = safeEqual(decoded.slice(at + 1), pass);
  return okUser && okPass;
}

/**
 * Refuse without a `WWW-Authenticate` header.
 *
 * Sending one would make the browser throw up its own credential dialog over a
 * page that is otherwise public, which is both ugly and confusing when only a
 * few panels are locked. The console asks for the password itself, in context,
 * next to the thing being unlocked.
 */
function adminLocked() {
  return NextResponse.json(
    { error: "Admin credentials required.", code: "admin_locked" },
    { status: 401 }
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The admin console stays public, deliberately. A judge should be able to
  // follow a card from print request to approval without an account, and that
  // walkthrough is most of what the page is for.
  //
  // Two things are not public. Personal details — users, supporters, creator
  // applications — belong to people who never agreed to appear on a page
  // anyone can open. And every state-changing route, because /fulfillment
  // advances a card through the print queue on nothing but a tokenId, and
  // /confirm-all sends a transaction from the admin wallet. Reading the flow
  // is the point; driving it from outside is not.
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    // The door itself, or it could never be opened.
    if (pathname === "/api/admin/unlock") return NextResponse.next();

    const holdsPersonalData = ADMIN_PRIVATE.some((p) => pathname.startsWith(p));
    const changesState = req.method !== "GET" && pathname.startsWith("/api/admin");
    if (!holdsPersonalData && !changesState) return NextResponse.next();

    if (await adminCookieValid(req.cookies.get(ADMIN_COOKIE_NAME)?.value)) {
      return NextResponse.next();
    }

    // Basic is still accepted so `curl -u` works from a terminal, but it is
    // never advertised, so no browser dialog appears.
    if (basicAuthOk(req.headers.get("authorization"))) {
      const response = NextResponse.next();
      const token = await mintAdminCookie();
      if (token) {
        response.cookies.set(ADMIN_COOKIE_NAME, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: ADMIN_MAX_AGE,
        });
      }
      return response;
    }

    return adminLocked();
  }

  // API routes: session-based auth (except public APIs and auth endpoints)
  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname)) {
      return NextResponse.next();
    }

    const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!(await verifySessionTokenEdge(sessionCookie))) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    return NextResponse.next();
  }

  // Protected user pages: cookie-based auth (existing behavior)
  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (!isProtected) return NextResponse.next();

  // Pages are checked exactly like APIs. This used to wave through anyone
  // carrying a `gachard_uid` cookie, which is unsigned and writable from the
  // console, so the gate was decorative.
  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (sessionCookie && (await verifySessionTokenEdge(sessionCookie))) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/collection/:path*",
    "/wallet/:path*",
    "/profile/:path*",
    "/topup/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/:path*",
  ],
};
