import { getCollection } from "./mongodb";
import { getFVM } from "./fvm";

export interface TradeSignals {
  repeatPairCount: number;
  priceDeviationPct: number;
  resaleSpeedHours: number | null;
}

export async function calculateTradeSignals(
  tokenId: number,
  buyerWallet: string,
  sellerWallet: string,
  price: number,
  templateId: string
): Promise<TradeSignals> {
  const txCol = await getCollection("transactions");
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 1. repeatPairCount: how many times these two wallets traded (either direction) in 30 days
  const repeatPairCount = await txCol.countDocuments({
    type: "sold",
    status: "confirmed",
    createdAt: { $gte: thirtyDaysAgo },
    $or: [
      { fromAddress: sellerWallet, toAddress: buyerWallet },
      { fromAddress: buyerWallet, toAddress: sellerWallet },
    ],
  });

  // 2. priceDeviationPct: deviation from FVM
  const fvmResult = await getFVM(templateId);
  let priceDeviationPct = 0;
  if (fvmResult.fvm !== null && fvmResult.fvm > 0) {
    priceDeviationPct = Math.abs(((price - fvmResult.fvm) / fvmResult.fvm) * 100);
  }

  // 3. resaleSpeedHours: hours since seller acquired this card via a "sold" transaction
  let resaleSpeedHours: number | null = null;
  const sellerAcquisition = await txCol.findOne(
    { type: "sold", status: "confirmed", tokenId, toAddress: sellerWallet },
    { sort: { createdAt: -1 } }
  );
  if (sellerAcquisition) {
    const acquiredAt = new Date(sellerAcquisition.createdAt).getTime();
    resaleSpeedHours = (Date.now() - acquiredAt) / (1000 * 60 * 60);
  }

  return { repeatPairCount, priceDeviationPct, resaleSpeedHours };
}
