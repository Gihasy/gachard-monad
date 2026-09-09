import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "gachard_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const PROTECTED = ["/collection", "/profile", "/topup"];

// Public API routes that don't require authentication
const PUBLIC_API = [
  "/api/auth/",       // login endpoints
  "/api/scan",        // QR scan — public by design
  "/api/cards/",      // QR generation (/api/cards/[tokenId]/qr)
  "/api/marketplace/wishlist-stats", // anonymous wishlist interaction
  "/api/health",      // health check — public
];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API.some((p) => pathname.startsWith(p));
}

// Constant-time string comparison (safe for Edge Runtime)
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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Admin routes: No auth required (accessible to all logged-in users)
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    return NextResponse.next();
  }

  // API routes: session-based auth (except public APIs and auth endpoints)
  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname)) {
      return NextResponse.next();
    }

    const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    const legacyUid = req.cookies.get("gachard_uid")?.value;

    // Accept if EITHER session cookie OR legacy uid cookie exists
    // Route handlers do full verification via getAuthenticatedUser()
    if (!sessionCookie && !legacyUid) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // If has session cookie, verify it at edge for fast rejection
    if (sessionCookie) {
      const valid = await verifySessionTokenEdge(sessionCookie);
      if (!valid && !legacyUid) {
        return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
      }
    }

    return NextResponse.next();
  }

  // Protected user pages: cookie-based auth (existing behavior)
  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (!isProtected) return NextResponse.next();

  const uid = req.cookies.get("gachard_uid")?.value;
  if (uid) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/collection/:path*",
    "/profile/:path*",
    "/topup/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/:path*",
  ],
};
