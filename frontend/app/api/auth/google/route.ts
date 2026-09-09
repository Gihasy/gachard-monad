import { NextResponse } from "next/server";
import { verifyGoogleToken, getOrCreateUser } from "@/lib/auth";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const googleUser = await verifyGoogleToken(token);

    // Get or create user with real custodial wallet
    const user = await getOrCreateUser(googleUser);

    const response = NextResponse.json({
      user_id: user._id.toString(),
      username: user.username,
    });

    const sessionToken = createSessionToken(user._id.toString());
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
    console.error("Login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 400 });
  }
}
