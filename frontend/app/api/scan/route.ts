import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { friendlyTxStatus, friendlyCardStatus } from "@/lib/status-map";
import { generateInvoiceId } from "@/lib/invoice";
import { getFVM } from "@/lib/fvm";

const STATUS_LABELS = ["Digital", "Vaulted"];
const RARITY_LABELS = ["Common", "Rare", "Epic", "Legendary"];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cardIdParam = searchParams.get("cardId");
    const tokenIdParam = searchParams.get("tokenId");

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

    // Ambil ownership history
    const history = await txCollection
      .find({
        $or: [{ tokenId: card.tokenId }, { tokenIds: card.tokenId }],
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    // Lookup semua address unik untuk resolve username
    const usersCollection = await getCollection("users");
    const allAddresses = new Set<string>();
    if (card.ownerAddress) allAddresses.add(card.ownerAddress.toLowerCase());
    for (const tx of history) {
      if (tx.fromAddress && tx.fromAddress !== "vault") allAddresses.add(tx.fromAddress.toLowerCase());
      if (tx.toAddress && tx.toAddress !== "vault") allAddresses.add(tx.toAddress.toLowerCase());
    }

    const addressToUsername = new Map<string, string>();
    if (allAddresses.size > 0) {
      const addressList = Array.from(allAddresses);
      const relevantUsers = await usersCollection
        .find({ walletAddress: { $in: addressList.map((a) => new RegExp(`^${a}$`, "i")) } })
        .toArray();
      for (const u of relevantUsers) {
        if (u.walletAddress) {
          addressToUsername.set(u.walletAddress.toLowerCase(), `@${u.username}`);
        }
      }
    }

    // Data on-chain dari cache (diupdate saat transaksi dikonfirmasi)
    const statusCode = (card.status === "Vaulted" || card.status === "Real") ? 1 : 0;
    const rarityCode = card.rarity ?? 0;
    const ownerAddress = card.ownerAddress || null;
    const ownerName = ownerAddress
      ? addressToUsername.get(ownerAddress.toLowerCase()) || null
      : null;
    const lastSync = card.lastOnChainSync || null;

    // Verification flag — data di MongoDB sudah terkonfirmasi on-chain
    // (diupdate saat mint/print/redeem dikonfirmasi), jadi cukup cek konsistensi status
    const statusMatch = STATUS_LABELS[statusCode] === card.status || card.status === "Real";
    const verificationFlag = card.status !== undefined && statusMatch ? "verified" : "warning";

    return NextResponse.json({
      cardId: card.cardId || null,
      tokenId: card.tokenId ?? null,
      onChain: {
        status: card.status === "Real" ? "Physical" : friendlyCardStatus(STATUS_LABELS[statusCode] || "Unknown"),
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
      history: history.map((tx) => {
        const cleanFrom = tx.fromAddress?.trim().replace(/^"|"$/g, '').toLowerCase();
        const cleanTo = tx.toAddress?.trim().replace(/^"|"$/g, '').toLowerCase();
        const ADMIN_WALLETS = [
          process.env.ADMIN_WALLET_ADDRESS?.toLowerCase(),
          "0xf7ded49eb412f69520c38c3f7e36523d71428dea",
          "0x869e4d60819c6c09f672a04bda0bbaddd924215e",
        ].filter(Boolean);
        return {
          invoiceId: generateInvoiceId(tx._id.toString()),
          type: tx.type,
          status: friendlyTxStatus(tx.status),
          price: tx.amount || null,
          from: cleanFrom === "vault" ? "Gachard Vault" : ADMIN_WALLETS.includes(cleanFrom) ? "Gachard" : addressToUsername.get(cleanFrom) || tx.fromAddress?.trim().replace(/^"|"$/g, ''),
          to: cleanTo === "vault" ? "Gachard Vault" : ADMIN_WALLETS.includes(cleanTo) ? "Gachard" : addressToUsername.get(cleanTo) || tx.toAddress?.trim().replace(/^"|"$/g, ''),
          timestamp: tx.createdAt,
        };
      }),
    });
  } catch (error) {
    console.error("Scan error:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
