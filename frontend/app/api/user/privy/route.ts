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
 * Three rules close that, and each one is doing separate work.
 *
 * The identity is proven, not claimed. The client sends a Privy access token,
 * the server verifies it against the app's public key, and the DID comes out
 * of the verified payload. The wallet address is then read from Privy for
 * that DID. Neither is taken from the body any more.
 *
 * The Privy account must carry the same email as the Gachard account. A
 * verified token only proves the caller controls *some* Privy account, and
 * making a fresh one costs nothing, so without this a stolen session still
 * leads to a wallet the thief owns. Requiring the email makes the two
 * identities the same person rather than merely two accounts held at once.
 *
 * And a binding is permanent. Not "changeable when the wallet is empty":
 * whoever holds the session could empty it first and then rebind. One Gachard
 * account, one Privy account, for good.
 */
import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import { getPrivyIdentity, verifyPrivyToken } from "@/lib/privy-server";

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

    const existing: string | undefined = user.privyUserId;

    // Already bound to this same account: refresh the stored details and stop.
    // Nothing below needs re-checking, and this is the common path on every
    // page load.
    if (existing && existing === privyUserId) {
      const identity = await getPrivyIdentity(privyUserId);
      if (identity?.wallet) {
        const usersCollection = await getCollection("users");
        await usersCollection.updateOne(
          { _id: user._id },
          {
            $set: {
              privyWalletAddress: identity.wallet.address,
              privyWalletId: identity.wallet.id,
            },
          }
        );
      }
      return NextResponse.json({
        success: true,
        walletAddress: identity?.wallet?.address ?? user.privyWalletAddress ?? null,
      });
    }

    // Bound to a different account: refused outright, no conditions.
    if (existing) {
      console.warn(
        `[user/privy] refused rebind for ${user._id.toString()}: bound to ${existing}, asked for ${privyUserId}`
      );
      return NextResponse.json(
        {
          error:
            "This account is already linked to a wallet, and that link cannot be changed.",
          code: "already_bound",
        },
        { status: 409 }
      );
    }

    const identity = await getPrivyIdentity(privyUserId);
    if (!identity?.wallet?.address) {
      return NextResponse.json(
        { error: "No Gachard wallet found on that account yet." },
        { status: 400 }
      );
    }

    const gachardEmail = String(user.email ?? "").toLowerCase().trim();
    if (!gachardEmail) {
      return NextResponse.json(
        { error: "This account has no email, so a wallet cannot be linked to it." },
        { status: 400 }
      );
    }
    if (!identity.emails.includes(gachardEmail)) {
      console.warn(
        `[user/privy] email mismatch for ${user._id.toString()}: wanted ${gachardEmail}, Privy account has ${identity.emails.length} address(es)`
      );
      return NextResponse.json(
        {
          error: `Sign in to your wallet with ${gachardEmail}, the same address you use for Gachard.`,
          code: "email_mismatch",
        },
        { status: 403 }
      );
    }

    const usersCollection = await getCollection("users");
    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          privyUserId,
          privyWalletAddress: identity.wallet.address,
          privyWalletId: identity.wallet.id,
          privyConnectedAt: new Date().toISOString(),
        },
      }
    );

    return NextResponse.json({ success: true, walletAddress: identity.wallet.address });
  } catch (error) {
    console.error("[user/privy] failed:", error);
    return NextResponse.json({ error: "Could not connect that wallet." }, { status: 500 });
  }
}
