import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5;

const VALID_IP_TYPES = [
  "Game",
  "Comic or Manga",
  "Illustration or Art",
  "YouTube or Content Creator",
  "Existing Physical TCG",
  "Brand or Merchandise",
  "Other",
];

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

async function checkIpRateLimit(ip: string): Promise<boolean> {
  const col = await getCollection("rate_limits");
  const windowStart = new Date(
    Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS
  ).toISOString();
  const key = `ip:${ip}`;
  const action = "creator-application";

  const entry = await col.findOne({ userId: key, action, windowStart });
  if (!entry) {
    await col.insertOne({ userId: key, action, windowStart, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  await col.updateOne({ _id: entry._id }, { $inc: { count: 1 } });
  return true;
}

export async function POST(request: Request) {
  try {
    // Rate limit by IP
    const ip = getClientIp(request);
    if (!(await checkIpRateLimit(ip))) {
      return NextResponse.json({ error: "Too many submissions. Try again later." }, { status: 429 });
    }

    const body = await request.json();

    // Honeypot — if filled, return fake success without inserting
    if (body.website_url) {
      return NextResponse.json({ success: true });
    }

    const { name, brandName, ipType, socialMedia, email, interest, communitySize } = body;

    // Required field validation
    if (!name || typeof name !== "string" || name.trim().length < 1) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!brandName || typeof brandName !== "string" || brandName.trim().length < 1) {
      return NextResponse.json({ error: "Brand / IP / Project Name is required" }, { status: 400 });
    }
    if (!ipType || !VALID_IP_TYPES.includes(ipType)) {
      return NextResponse.json({ error: "Invalid IP type" }, { status: 400 });
    }
    if (!socialMedia || typeof socialMedia !== "string" || socialMedia.trim().length < 1) {
      return NextResponse.json({ error: "Social Media / Website is required" }, { status: 400 });
    }
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (!interest || typeof interest !== "string" || interest.trim().length < 10) {
      return NextResponse.json({ error: "Please tell us what excites you (min 10 characters)" }, { status: 400 });
    }

    const collection = await getCollection("creator_applications");
    await collection.insertOne({
      name: name.trim(),
      brandName: brandName.trim(),
      ipType,
      socialMedia: socialMedia.trim(),
      email: email.trim().toLowerCase(),
      interest: interest.trim(),
      communitySize: communitySize || null,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[creator-applications]", error);
    return NextResponse.json({ error: "Submission failed" }, { status: 500 });
  }
}
