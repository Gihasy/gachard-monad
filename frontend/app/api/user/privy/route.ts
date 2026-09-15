import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { privyUserId, privyWalletAddress } = await request.json();

  if (!privyUserId || !privyWalletAddress) {
    return NextResponse.json({ error: "Missing privyUserId or privyWalletAddress" }, { status: 400 });
  }

  const usersCollection = await getCollection("users");
  await usersCollection.updateOne(
    { _id: user._id },
    {
      $set: {
        privyUserId,
        privyWalletAddress,
        privyConnectedAt: new Date().toISOString(),
      },
    }
  );

  return NextResponse.json({ success: true });
}
