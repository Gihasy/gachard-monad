/**
 * End the session on the server.
 *
 * This route exists because the session cookie is httpOnly, which is the point
 * of it: script on the page cannot read it, and cannot clear it either. Until
 * now "log out" only cleared localStorage and the old `gachard_uid` cookie, so
 * the signed session survived and the browser stayed authenticated to every
 * API. Logging out has to be a server round trip.
 */
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export const maxDuration = 10;

export async function POST() {
  const response = NextResponse.json({ success: true });

  // Expire both: the signed session, and the legacy uid cookie that older
  // browsers may still carry.
  for (const name of [SESSION_COOKIE_NAME, "gachard_uid"]) {
    response.cookies.set(name, "", {
      httpOnly: name === SESSION_COOKIE_NAME,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}
