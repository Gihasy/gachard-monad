import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";

export async function GET() {
  try {
    const col = await getCollection("supporters");
    const count = await col.countDocuments();
    return NextResponse.json(
      { count },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    console.error("[supporters/count]", error);
    return NextResponse.json(
      { count: 0 },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  }
}
