import { NextResponse } from "next/server";
import { getAiUsageSnapshot } from "@/lib/aiUsage/aiUsage.server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    return NextResponse.json({
      ok: true,
      ...(await getAiUsageSnapshot(request)),
    });
  } catch (error) {
    console.error("[ai-usage-snapshot]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "ai_usage_unavailable",
        message: "利用回数を取得できませんでした。",
      },
      { status: 503 }
    );
  }
}
