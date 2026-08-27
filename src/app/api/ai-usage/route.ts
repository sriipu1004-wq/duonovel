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
    return NextResponse.json(
      {
        ok: false,
        error: "ai_usage_unavailable",
        message: error instanceof Error ? error.message : "利用回数を取得できませんでした。",
      },
      { status: 503 }
    );
  }
}
