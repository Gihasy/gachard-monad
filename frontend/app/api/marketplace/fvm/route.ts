import { NextRequest, NextResponse } from "next/server";
import { getFVM } from "@/lib/fvm";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const templateId = searchParams.get("templateId");
    if (!templateId) {
      return NextResponse.json({ error: "templateId required" }, { status: 400 });
    }

    const result = await getFVM(templateId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[marketplace/fvm GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
