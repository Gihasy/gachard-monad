import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { anonymousLabel } from "@/lib/display-name";

export async function GET() {
  try {
    const usersCollection = await getCollection("users");
    const users = await usersCollection.find({}).toArray();

    const result = users.map((u) => ({
      id: u._id.toString(),
      email: u.email,
      // What the collector is shown as, not the internal username. The username
      // is the email's local part, fixed at sign-up, and never shown publicly.
      displayName: typeof u.displayName === "string" ? u.displayName : null,
      displayNameHidden: u.displayNameHidden === true,
      collectorId: anonymousLabel(u._id.toString()),
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
