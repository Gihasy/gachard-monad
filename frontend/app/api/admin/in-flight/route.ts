import { NextResponse } from "next/server";
import { findInFlight } from "@/lib/in-flight";

/**
 * GET /api/admin/in-flight
 * Operations that started and have not finished, and which of them have been
 * waiting too long (ADR-037). Public tier: no user identifiers are returned.
 */
export async function GET() {
  try {
    return NextResponse.json(await findInFlight(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[admin/in-flight]", e);
    return NextResponse.json({ error: "Could not read in-flight operations" }, { status: 500 });
  }
}
