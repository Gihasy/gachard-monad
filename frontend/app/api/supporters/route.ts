import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";

const MAX_MESSAGE_LENGTH = 500;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

async function checkIpRateLimit(ip: string): Promise<boolean> {
  const col = await getCollection("rate_limits");
  const windowStart = new Date(
    Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS
  ).toISOString();
  const key = `ip:${ip}`;
  const action = "supporter-submit";

  const entry = await col.findOne({ userId: key, action, windowStart });

  if (!entry) {
    await col.insertOne({ userId: key, action, windowStart, count: 1 });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  await col.updateOne({ _id: entry._id }, { $inc: { count: 1 } });
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, message, website } = body;

    // Honeypot: if filled, return fake success
    if (website) {
      const col = await getCollection("supporters");
      const count = await col.countDocuments();
      return NextResponse.json(
        { success: true, count },
        { headers: { "Cache-Control": "no-store, private" } }
      );
    }

    // Server-side email validation
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    // Server-side message validation
    const trimmedMessage =
      typeof message === "string" ? message.trim() : "";
    if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message must be ${MAX_MESSAGE_LENGTH} characters or less.` },
        { status: 400, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    // Rate limit per IP
    const ip = getClientIp(req);
    const allowed = await checkIpRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    // Insert (unique index catches duplicates)
    const col = await getCollection("supporters");
    try {
      await col.insertOne({
        email: normalizedEmail,
        message: trimmedMessage,
        createdAt: new Date().toISOString(),
      });
      const count = await col.countDocuments();
      return NextResponse.json(
        { success: true, count },
        { headers: { "Cache-Control": "no-store, private" } }
      );
    } catch (err: unknown) {
      // MongoDB duplicate key error
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: number }).code === 11000
      ) {
        const count = await col.countDocuments();
        return NextResponse.json(
          { duplicate: true, count },
          { headers: { "Cache-Control": "no-store, private" } }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("[supporters]", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again in a moment." },
      { status: 500, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}
