import { NextResponse } from "next/server";
import { getProvider } from "@/lib/blockchain";
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

    return NextResponse.json({
      adminWallet: {
        address: ADMIN_WALLET,
        balanceMON: ethers.formatEther(adminBalance),
      },
      packEntropy: {
        address: PACK_ENTROPY_ADDRESS || "Not configured",
        balanceMON: ethers.formatEther(entropyBalance),
      },
    });
  } catch (error) {
    console.error("[admin/balances] Error:", error);
    return NextResponse.json({ error: "Failed to fetch balances" }, { status: 500 });
  }
}
