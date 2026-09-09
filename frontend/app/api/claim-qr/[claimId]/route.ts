import { NextResponse } from "next/server";
import QRCode from "qrcode";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://gachard.vercel.app";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ claimId: string }> }
) {
  try {
    const { claimId } = await params;
    if (!claimId || claimId.length < 4) {
      return NextResponse.json({ error: "Invalid claimId" }, { status: 400 });
    }

    // QR contains URL to scan page with claimId
    const data = `${BASE_URL}/scan?claimId=${claimId}`;
    const buffer = await QRCode.toBuffer(data, {
      width: 256,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Claim QR error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
