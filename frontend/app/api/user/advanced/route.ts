/**
 * The Advanced Access switch (ADR-031).
 *
 * Linking a wallet and using it are separate decisions. A user can have a
 * wallet bound and still not want "Move to My Wallet" on every card, so the
 * switch lives here rather than being implied by the binding.
 *
 * It is stored server-side rather than in the browser because it decides
 * whether an irreversible action is offered. A preference that quietly
 * differs per device is the wrong shape for that.
 */
import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";

export const maxDuration = 10;

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    enabled: user.advancedMode === true,
    linked: Boolean(user.privyWalletAddress),
    walletAddress: user.privyWalletAddress ?? null,
  });
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { enabled } = await request.json();
    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });
    }

    // Turning it on without a wallet would put a button on every card that
    // cannot work. Turning it off is always allowed.
    if (enabled && !user.privyWalletAddress) {
      return NextResponse.json(
        { error: "Set up your wallet before turning this on.", code: "not_linked" },
        { status: 409 }
      );
    }

    const usersCollection = await getCollection("users");
    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { advancedMode: enabled, advancedModeAt: new Date().toISOString() } }
    );

    return NextResponse.json({ success: true, enabled });
  } catch (error) {
    console.error("[user/advanced] failed:", error);
    return NextResponse.json({ error: "Could not save that setting." }, { status: 500 });
  }
}
