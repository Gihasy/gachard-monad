/**
 * Bind a Privy account to a Gachard account (ADR-028, hardened for ADR-031).
 *
 * This route used to take privyUserId and privyWalletAddress from the request
 * body and write them as given. That was survivable while the wallet was only
 * displayed, and became a way to steal cards once they could be exported to
 * it: anyone holding a Gachard session could sign in with their own Privy
 * account, have the binding silently overwritten, and export the cards to
 * themselves. The export route's signature check would pass, because it
 * compares against the stored address, and the stored address was theirs.
 *
 * Two changes close that.
 *
 * The identity is no longer claimed, it is proven. The client sends a Privy
 * access token, the server verifies it against the app's public key, and the
 * DID comes out of the verified payload. The wallet address is then read from
 * Privy for that DID. Neither value is taken from the body any more.
 *
 * And a binding cannot be swapped while cards are out. Rebinding is allowed
 * when the wallet is empty, so someone who loses access to their Privy
 * account is not locked out for good, but never while there is something in
 * the wallet to walk away with.
 */
import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import { getEmbeddedWalletForUser, verifyPrivyToken } from "@/lib/privy-server";

export const maxDuration = 10;

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { authToken } = await request.json();
    if (!authToken) {
      return NextResponse.json({ error: "Missing authToken" }, { status: 400 });
    }

    const privyUserId = await verifyPrivyToken(String(authToken));
    if (!privyUserId) {
      return NextResponse.json({ error: "Could not verify that wallet." }, { status: 401 });
    }

    const wallet = await getEmbeddedWalletForUser(privyUserId);
    if (!wallet?.address) {
      return NextResponse.json(
        { error: "No Gachard wallet found on that account yet." },
        { status: 400 }
      );
    }

    const existing: string | undefined = user.privyUserId;
    const isRebind = Boolean(existing) && existing !== privyUserId;

    if (isRebind) {
      // Only the count matters, and only for this user's cards.
      const cardsCollection = await getCollection("cards");
      const held = await cardsCollection.countDocuments({
        ownerAddress: user.walletAddress,
        status: "Exported",
      });
      if (held > 0) {
        console.warn(
          `[user/privy] refused rebind for ${user._id.toString()}: ${held} card(s) still in the old wallet`
        );
        return NextResponse.json(
          {
            error:
              held === 1
                ? "Return the card in your wallet before connecting a different one."
                : `Return the ${held} cards in your wallet before connecting a different one.`,
            code: "cards_outstanding",
          },
          { status: 409 }
        );
      }
      console.warn(
        `[user/privy] rebinding ${user._id.toString()} from ${existing} to ${privyUserId}`
      );
    }

    const usersCollection = await getCollection("users");
    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          privyUserId,
          privyWalletAddress: wallet.address,
          privyWalletId: wallet.id,
          privyConnectedAt: new Date().toISOString(),
        },
      }
    );

    return NextResponse.json({
      success: true,
      walletAddress: wallet.address,
      rebound: isRebind,
    });
  } catch (error) {
    console.error("[user/privy] failed:", error);
    return NextResponse.json({ error: "Could not connect that wallet." }, { status: 500 });
  }
}
