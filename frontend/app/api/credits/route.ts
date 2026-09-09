import { NextResponse } from "next/server";
import { getCreditBalance } from "@/lib/credits";
import { getAuthenticatedUser } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user._id.toString();

    const balance = await getCreditBalance(userId);
    return NextResponse.json({ balance });
  } catch (error) {
    console.error("Get credits error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
