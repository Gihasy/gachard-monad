import { NextResponse } from "next/server";
import { seedCardTemplates, updateArtworkUrls } from "@/lib/card-templates";

/**
 * POST /api/seed-templates
 * Seed card_templates if empty, then update artworkUrl for all templates.
 * Protected by admin credentials.
 */
export async function POST(request: Request) {
  // Basic auth check
  const auth = request.headers.get("authorization");
  const expected = `Basic ${Buffer.from(
    `${process.env.ADMIN_USERNAME || ""}:${process.env.ADMIN_PASSWORD || ""}`
  ).toString("base64")}`;

  if (!auth || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await seedCardTemplates();
    const updated = await updateArtworkUrls();

    return NextResponse.json({
      status: "ok",
      artworkUrlsUpdated: updated,
    });
  } catch (error) {
    console.error("Seed templates error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
