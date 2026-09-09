import { NextResponse } from "next/server";
import { generateMarketInsight } from "@/lib/market-insight";

export async function GET() {
  try {
    const insight = await generateMarketInsight();
    return NextResponse.json({ insight });
  } catch (error) {
    console.error("[marketplace/insight]", error);
    return NextResponse.json({ insight: null, error: "Failed to generate insight" }, { status: 500 });
  }
}
