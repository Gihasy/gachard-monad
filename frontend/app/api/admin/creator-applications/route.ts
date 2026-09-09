import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";

export async function GET() {
  try {
    const collection = await getCollection("creator_applications");
    const apps = await collection
      .find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    const result = apps.map((a) => ({
      id: a._id.toString(),
      name: a.name,
      brandName: a.brandName,
      ipType: a.ipType,
      socialMedia: a.socialMedia,
      email: a.email,
      interest: a.interest,
      communitySize: a.communitySize ?? null,
      status: a.status,
      createdAt: a.createdAt,
    }));

    return NextResponse.json(
      { applications: result },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    console.error("Admin creator-applications error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500, headers: { "Cache-Control": "no-store, private" } });
  }
}
