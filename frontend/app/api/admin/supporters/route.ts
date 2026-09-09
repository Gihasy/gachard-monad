import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";

export async function GET() {
  try {
    const col = await getCollection("supporters");
    const supporters = await col
      .find({}, { projection: { email: 1, message: 1, createdAt: 1 } })
      .sort({ createdAt: -1 })
      .toArray();

    const formatted = supporters.map((s) => ({
      id: s._id.toString(),
      email: s.email,
      message: s.message || "",
      createdAt: s.createdAt,
    }));

    return NextResponse.json(
      { supporters: formatted },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    console.error("[admin/supporters]", error);
    return NextResponse.json(
      { error: "Failed to fetch supporters" },
      { status: 500, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}
