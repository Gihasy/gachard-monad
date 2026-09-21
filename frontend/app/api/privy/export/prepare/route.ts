/**
 * Export a Digital card from the custodial wallet to the user's Privy wallet
 * (ADR-031, stage 2).
 *
 * The admin wallet signs the transfer, because the custodial wallet is the only
 * party that can move a card it holds. What makes this more than a custodial
 * transfer is the step before it: the user has already signed an EIP-712 intent
 * with their own Privy wallet, which is verified here.
 *
 * No retry anywhere in this route. The Monad RPC reports "could not coalesce
 * error" on transactions that actually landed, so resending on error would
 * transfer the card twice.
 */
import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import { marketplaceTransfer, resetNonceCache } from "@/lib/blockchain";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSponsorshipConfigured, resolveWalletId } from "@/lib/privy-server";
import { recoverExportIntentSigner, type ExportIntent } from "@/lib/export-intent";
import { ethers } from "ethers";

export const maxDuration = 15;

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user._id.toString();

    const rate = await checkRateLimit(userId, "privy_export");
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many export attempts. Try again in a minute." },
        { status: 429 }
      );
    }

    const { cardId, tokenId, signature, nonce, deadline } = await request.json();
    if (!signature || !nonce || !deadline) {
      return NextResponse.json(
        { error: "signature, nonce and deadline are required" },
        { status: 400 }
      );
    }
    if (!cardId && tokenId === undefined) {
      return NextResponse.json({ error: "cardId (or tokenId) is required" }, { status: 400 });
    }

    if (!isSponsorshipConfigured()) {
      return NextResponse.json(
        { error: "Wallet export is not available right now." },
        { status: 503 }
      );
    }

    const privyAddress: string | undefined = user.privyWalletAddress;
    if (!privyAddress) {
      return NextResponse.json(
        { error: "No self-custody wallet set up for this account." },
        { status: 400 }
      );
    }

    const cardsCollection = await getCollection("cards");
    const card = cardId
      ? await cardsCollection.findOne({ cardId })
      : await cardsCollection.findOne({ tokenId });
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    if (card.ownerAddress !== user.walletAddress) {
      return NextResponse.json({ error: "Card does not belong to this user" }, { status: 403 });
    }

    // Only a plain Digital card can leave. Vaulted is also blocked on-chain by
    // the _update() override, but failing here gives the user a real message
    // instead of a revert.
    if (card.status !== "Digital") {
      return NextResponse.json(
        { error: `Only Digital cards can be exported (this one is ${card.status}).` },
        { status: 400 }
      );
    }
    if (card.isListed) {
      return NextResponse.json(
        { error: "Card is listed for sale. Cancel the listing before exporting." },
        { status: 400 }
      );
    }
    if (card.fulfillmentStatus) {
      return NextResponse.json(
        { error: "Card is in the printing flow and cannot be exported." },
        { status: 400 }
      );
    }
    if (card.tokenId === null || card.tokenId === undefined) {
      return NextResponse.json(
        { error: "Card is still being finalized. Try again shortly." },
        { status: 409 }
      );
    }

    if (Number(deadline) * 1000 < Date.now()) {
      return NextResponse.json({ error: "Signature expired. Please try again." }, { status: 400 });
    }

    const intent: ExportIntent = {
      tokenId: Number(card.tokenId),
      to: ethers.getAddress(privyAddress),
      userId,
      nonce: String(nonce),
      deadline: Number(deadline),
    };
    const signer = recoverExportIntentSigner(intent, signature);
    if (!signer || signer.toLowerCase() !== privyAddress.toLowerCase()) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
    }

    // Claim the nonce by inserting it. The unique index makes this the atomic
    // step: a duplicate key means the signature was already spent, so a replay
    // loses the race rather than being waved through by a read-then-write gap.
    const noncesCollection = await getCollection("privy_nonces");
    try {
      await noncesCollection.insertOne({
        nonce: intent.nonce,
        userId,
        cardId: card.cardId ?? card._id.toString(),
        tokenId: intent.tokenId,
        usedAt: new Date().toISOString(),
      });
    } catch {
      return NextResponse.json({ error: "This signature was already used." }, { status: 409 });
    }

    // Resolve once and cache on the user; later stages send from this wallet
    // and the client SDK cannot tell us its id.
    let privyWalletId: string | null = user.privyWalletId ?? null;
    if (!privyWalletId) {
      privyWalletId = await resolveWalletId(privyAddress);
      if (privyWalletId) {
        const usersCollection = await getCollection("users");
        await usersCollection.updateOne({ _id: user._id }, { $set: { privyWalletId } });
      }
    }

    // Record the intended destination BEFORE transferring. If the write that
    // follows the transfer is lost, this is the only thing tying the card to
    // the wallet now holding it, and without it reconciliation has no way to
    // find the card at all. Status stays Digital until the transfer lands.
    await cardsCollection.updateOne(
      { _id: card._id },
      { $set: { exportPending: true, privyWalletAddress: intent.to, updatedAt: new Date().toISOString() } }
    );

    // The nonce above is already spent at this point. That is deliberate: if
    // this transfer fails ambiguously, the card may still have moved, so
    // releasing the signature for reuse could export it twice. The user signs
    // again instead, which costs one modal and cannot double-spend.
    let txHash: string;
    try {
      txHash = await marketplaceTransfer(intent.tokenId, user.walletAddress, intent.to);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "NONCE_EXPIRED" || code === "REPLACEMENT_UNDERPRICED") {
        // Another process sent from the admin wallet and our cached nonce is
        // behind. Invalidate so the next attempt re-reads it, but do not retry
        // here: this transfer may have landed despite the error.
        resetNonceCache();
        console.warn(`[privy/export/prepare] nonce conflict for token ${intent.tokenId}, cache reset`);
        return NextResponse.json(
          {
            error: "The network was busy. Please try exporting again.",
            code: "transient",
          },
          { status: 503 }
        );
      }
      throw err;
    }

    const txCollection = await getCollection("transactions");
    const tx = await txCollection.insertOne({
      userId,
      type: "privy_export",
      tokenId: intent.tokenId,
      tokenIds: [intent.tokenId],
      rarity: card.rarity ?? 0,
      templateIds: [card.templateId],
      txHash,
      status: "pending",
      contractAddress: process.env.CONTRACT_ADDRESS!,
      fromAddress: user.walletAddress,
      toAddress: intent.to,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await cardsCollection.updateOne(
      { _id: card._id },
      {
        $set: {
          status: "Exported",
          privyWalletAddress: intent.to,
          exportedAt: new Date().toISOString(),
          exportTxHash: txHash,
          updatedAt: new Date().toISOString(),
        },
        $unset: { exportPending: "" },
      }
    );

    return NextResponse.json({
      success: true,
      tokenId: intent.tokenId,
      txHash,
      txId: tx.insertedId.toString(),
      to: intent.to,
      claimPending: true,
    });
  } catch (error) {
    console.error("[privy/export/prepare] failed:", error);
    return NextResponse.json({ error: "Export failed. Please try again." }, { status: 500 });
  }
}
