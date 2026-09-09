import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";

export async function GET() {
  try {
    const usersCollection = await getCollection("users");
    const users = await usersCollection.find({}).toArray();

    const result = users.map((u) => ({
      id: u._id.toString(),
      email: u.email,
      username: u.username,
      walletAddress: u.walletAddress,
      createdAt: u.createdAt,
    }));

    return NextResponse.json(
      { users: result },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    console.error("Admin users error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500, headers: { "Cache-Control": "no-store, private" } });
  }
}
