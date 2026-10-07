import { NextResponse } from "next/server";
import { getProvider } from "@/lib/blockchain";
import { checkSupplyIntegrity } from "@/lib/supply-integrity";
import { ethers } from "ethers";

const ADMIN_WALLET = (process.env.ADMIN_WALLET_ADDRESS || "").trim();
const PACK_ENTROPY_ADDRESS = (process.env.ENTROPY_CONTRACT_ADDRESS || "").trim();

const PACK_ENTROPY_ABI = ["function getBalance() external view returns (uint256)"];

export async function GET() {
  try {
    const provider = getProvider();

    const adminBalance = await provider.getBalance(ADMIN_WALLET);

    let entropyBalance = 0n;
    if (PACK_ENTROPY_ADDRESS && ethers.isAddress(PACK_ENTROPY_ADDRESS)) {
      const contract = new ethers.Contract(PACK_ENTROPY_ADDRESS, PACK_ENTROPY_ABI, provider);
      entropyBalance = await contract.getBalance();
    }

    // Operational health lives together. The balances answer "can we still
    // transact"; this answers "is anything minting that we did not" — the
    // first thing a compromised admin key would do (ADR-036). Best effort:
    // the balances are the reason this endpoint exists, and a chain read that
    // fails should not take them down with it.
    let supply = null;
    try {
      supply = await checkSupplyIntegrity();
    } catch (e) {
      console.error("[admin/balances] supply check failed:", e);
    }

    return NextResponse.json({
      adminWallet: {
        address: ADMIN_WALLET,
        balanceMON: ethers.formatEther(adminBalance),
      },
      packEntropy: {
        address: PACK_ENTROPY_ADDRESS || "Not configured",
        balanceMON: ethers.formatEther(entropyBalance),
      },
      supply,
    });
  } catch (error) {
    console.error("[admin/balances] Error:", error);
    return NextResponse.json({ error: "Failed to fetch balances" }, { status: 500 });
  }
}
