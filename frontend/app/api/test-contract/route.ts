import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    contractAddress: process.env.CONTRACT_ADDRESS,
    publicContractAddress: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
    adminWallet: process.env.ADMIN_WALLET_ADDRESS,
    rpcUrl: process.env.RPC_URL,
  });
}
