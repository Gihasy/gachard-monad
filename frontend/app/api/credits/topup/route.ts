import { NextResponse } from "next/server";
import { addCredits } from "@/lib/credits";
import { getCollection } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const { amountCents } = await request.json();

    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user._id.toString();

    if (!amountCents || typeof amountCents !== "number" || amountCents <= 0 || !Number.isFinite(amountCents)) {
      return NextResponse.json({ error: "amountCents must be a positive number" }, { status: 400 });
    }

    if (amountCents > 100000) {
      return NextResponse.json({ error: "Maximum top-up is $1,000" }, { status: 400 });
    }

    const newBalance = await addCredits(userId, amountCents);

    // Record top-up as a confirmed transaction (no on-chain — database-only operation)
    const txCol = await getCollection("transactions");
    const now = new Date().toISOString();
    const txResult = await txCol.insertOne({
      userId,
      type: "topup",
      amount: amountCents,
      txHash: null,
      status: "confirmed",
      fromAddress: "",
      toAddress: "",
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ success: true, newBalance, txId: txResult.insertedId.toString() });
  } catch (error) {
    console.error("Top-up error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
