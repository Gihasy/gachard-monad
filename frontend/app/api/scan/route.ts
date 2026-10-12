import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { friendlyTxStatus, friendlyCardStatus } from "@/lib/status-map";
import { generateInvoiceId } from "@/lib/invoice";
import { getFVM } from "@/lib/fvm";
import { publicLabel } from "@/lib/display-name";

const STATUS_LABELS = ["Digital", "Vaulted"];

/**
 * How much history a scan returns.
 *
 * The page opens with the most recent few, because a card that has changed
 * hands many times would otherwise push everything below the fold. The rest
 * is one click away: `?history=all` returns the whole record.
 *
 * This used to be a flat `.limit(10)` with no way past it, inherited from
 * the first commit with no reason recorded, while the page told the user
 * "you'll see full transaction history". A card with an eleventh transaction
 * silently lost its first one, which is the part of provenance that matters
 * most — where the card came from.
 *
 * The ceiling on the full view is a guard on a public endpoint rather than a
 * product limit. Every transaction on a card is a real action somebody paid
 * gas for, so no genuine card approaches it; if one ever does, `historyTotal`
 * still reports the true count and the page says the list is truncated rather
 * than pretending it is complete.
 */
const RECENT_HISTORY = 5;
const FULL_HISTORY_CEILING = 500;
const RARITY_LABELS = ["Common", "Rare", "Epic", "Legendary"];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cardIdParam = searchParams.get("cardId");
    const tokenIdParam = searchParams.get("tokenId");
    const wantsFullHistory = searchParams.get("history") === "all";

    if (!cardIdParam && !tokenIdParam) {
      return NextResponse.json({ error: "cardId or tokenId required" }, { status: 400 });
    }

    // Baca dari cache MongoDB (diupdate saat confirmTransaction)
    const cardsCollection = await getCollection("cards");
    let card = null;

    if (cardIdParam) {
      card = await cardsCollection.findOne({ cardId: cardIdParam.toLowerCase() });
    } else if (tokenIdParam) {
      const tokenId = parseInt(tokenIdParam);
      if (!isNaN(tokenId)) {
        card = await cardsCollection.findOne({ tokenId });
      }
    }

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // Ambil data template
    let template = null;
    if (card.templateId) {
      const templatesCollection = await getCollection("card_templates");
      template = await templatesCollection.findOne({ templateId: card.templateId });
    }

    // Ambil purchase price HANYA dari transaksi "sold" (marketplace trade)
    const txCollection = await getCollection("transactions");
    let purchasePrice: number | null = null;

    const lastSoldTx = await txCollection.findOne(
      { type: "sold", tokenId: card.tokenId, status: "confirmed" },
      { sort: { createdAt: -1 } }
    );

    if (lastSoldTx?.amount) {
      purchasePrice = lastSoldTx.amount;
    }

    // Ambil FVM untuk template ini
    const fvmResult = card.templateId ? await getFVM(card.templateId) : { fvm: null, source: "none" as const };

    // Transaction history: the recent few by default, everything on request.
    const historyFilter = {
      $or: [{ tokenId: card.tokenId }, { tokenIds: card.tokenId }],
    };
    const historyTotal = await txCollection.countDocuments(historyFilter);
    const history = await txCollection
      .find(historyFilter)
      .sort({ createdAt: -1 })
      .limit(wantsFullHistory ? FULL_HISTORY_CEILING : RECENT_HISTORY)
      .toArray();

    // Lookup semua address unik untuk resolve username
    const usersCollection = await getCollection("users");
    const allAddresses = new Set<string>();
    if (card.ownerAddress) allAddresses.add(card.ownerAddress.toLowerCase());
    for (const tx of history) {
      if (tx.fromAddress && tx.fromAddress !== "vault") allAddresses.add(tx.fromAddress.toLowerCase());
      if (tx.toAddress && tx.toAddress !== "vault") allAddresses.add(tx.toAddress.toLowerCase());
    }

    // Address → the name a stranger may see. Never `username`: that is the
    // email's local part (lib/auth.ts), and this endpoint is public. See
    // lib/display-name.ts.
    //
    // Both of a user's addresses map to the same label. A card moved into
    // someone's own Privy wallet is still theirs, and provenance that showed a
    // stranger's address at that point would read as a change of hands.
    const addressToLabel = new Map<string, string>();
    if (allAddresses.size > 0) {
      const patterns = Array.from(allAddresses).map((a) => new RegExp(`^${a}$`, "i"));
      const relevantUsers = await usersCollection
        .find({ $or: [{ walletAddress: { $in: patterns } }, { privyWalletAddress: { $in: patterns } }] })
        .project({ _id: 1, displayName: 1, walletAddress: 1, privyWalletAddress: 1 })
        .toArray();
      for (const u of relevantUsers) {
        const label = publicLabel(u as { _id: { toString(): string }; displayName?: unknown });
        if (typeof u.walletAddress === "string") addressToLabel.set(u.walletAddress.toLowerCase(), label);
        if (typeof u.privyWalletAddress === "string") addressToLabel.set(u.privyWalletAddress.toLowerCase(), label);
      }
    }

    // Data on-chain dari cache (diupdate saat transaksi dikonfirmasi)
    const statusCode = (card.status === "Vaulted" || card.status === "Real") ? 1 : 0;
    const rarityCode = card.rarity ?? 0;
    const ownerAddress = card.ownerAddress || null;
    const ownerName = ownerAddress
      ? addressToLabel.get(ownerAddress.toLowerCase()) || null
      : null;
    const lastSync = card.lastOnChainSync || null;

    // Verification flag — data di MongoDB sudah terkonfirmasi on-chain
    // (diupdate saat mint/print/redeem dikonfirmasi), jadi cukup cek konsistensi status
    // "Exported" is a legitimate state, not a discrepancy. On-chain the card is
    // still Digital, it is simply held by the owner's own wallet, so without
    // this it would scan as a warning and look like a forgery (ADR-031).
    const statusMatch =
      STATUS_LABELS[statusCode] === card.status ||
      card.status === "Real" ||
      card.status === "Exported";
    const verificationFlag = card.status !== undefined && statusMatch ? "verified" : "warning";

    return NextResponse.json({
      cardId: card.cardId || null,
      tokenId: card.tokenId ?? null,
      onChain: {
        status:
          card.status === "Real"
            ? "Physical"
            : card.status === "Exported"
              ? friendlyCardStatus("Exported")
              : friendlyCardStatus(STATUS_LABELS[statusCode] || "Unknown"),
        statusCode,
        rarity: RARITY_LABELS[rarityCode] || "Unknown",
        rarityCode,
        lastOwner: ownerName,
        lastSync,
      },
      metadata: {
        templateId: card.templateId || null,
        templateName: template?.name || card.templateId || null,
        artworkUrl: template?.artworkUrl || null,
      },
      purchasePrice,
      fvm: fvmResult.fvm,
      fvmSource: fvmResult.source,
      verification: {
        verified: verificationFlag === "verified",
        statusMatch,
        flag: verificationFlag,
      },
      // The true count, so the page knows whether there is more to show and
      // can say so honestly if the full view ever hits the ceiling.
      historyTotal,
      history: history.map((tx) => {
        const cleanFrom = tx.fromAddress?.trim().replace(/^"|"$/g, '').toLowerCase();
        const cleanTo = tx.toAddress?.trim().replace(/^"|"$/g, '').toLowerCase();
        const ADMIN_WALLETS = [
          process.env.ADMIN_WALLET_ADDRESS?.toLowerCase(),
          "0xf7ded49eb412f69520c38c3f7e36523d71428dea",
          "0x869e4d60819c6c09f672a04bda0bbaddd924215e",
        ].filter(Boolean);
        // Who a party is, in words a stranger may see. A raw address is never
        // returned: this is a consumer surface (ADR-002), and an address that
        // matches no Gachard user is either somewhere outside the platform or
        // an account since removed — either way "unknown holder" is the true
        // answer and the hex string is not.
        const party = (clean: string | undefined): string | null => {
          if (!clean) return null;
          if (clean === "vault") return "Gachard Vault";
          if (clean === "shipping") return "Shipping";
          if (ADMIN_WALLETS.includes(clean)) return "Gachard";
          const known = addressToLabel.get(clean);
          if (known) return known;
          return /^0x[0-9a-f]{40}$/.test(clean) ? "Unknown holder" : null;
        };
        return {
          invoiceId: generateInvoiceId(tx._id.toString()),
          type: tx.type,
          status: friendlyTxStatus(tx.status),
          price: tx.amount || null,
          from: party(cleanFrom),
          to: party(cleanTo),
          timestamp: tx.createdAt,
        };
      }),
    });
  } catch (error) {
    console.error("Scan error:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
