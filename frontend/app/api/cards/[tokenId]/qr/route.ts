import { NextResponse } from "next/server";
import { generateQRCodeBuffer } from "@/lib/qr";
import { getCollection } from "@/lib/mongodb";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  try {
    const { tokenId: tokenIdStr } = await params;
    const tokenId = parseInt(tokenIdStr);
    if (isNaN(tokenId)) {
      return NextResponse.json({ error: "Invalid tokenId" }, { status: 400 });
    }

    // Look up cardId from tokenId
    const cardsCollection = await getCollection("cards");
    const card = await cardsCollection.findOne({ tokenId });
    const cardId = card?.cardId || tokenIdStr;

    const origin = new URL(request.url).origin;
    const buffer = await generateQRCodeBuffer(cardId, origin);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("QR generation error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
