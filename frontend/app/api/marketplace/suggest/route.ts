import { NextRequest, NextResponse } from "next/server";
import { suggestListingPrice } from "@/lib/market-insight";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const templateId = searchParams.get("templateId");
    if (!templateId) {
      return NextResponse.json({ error: "templateId required" }, { status: 400 });
    }

    const suggestion = await suggestListingPrice(templateId);
    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error("[marketplace/suggest]", error);
    return NextResponse.json({ suggestion: null, error: "Failed to generate suggestion" }, { status: 500 });
  }
}
