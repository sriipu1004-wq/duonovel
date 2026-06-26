import { NextResponse } from "next/server";
import { isOfficialNarrationAccountEmail } from "@/lib/auth/officialNarrationAccount";
import {
  LEGACY_AUTO_NARRATION_SUSPENDED,
  LEGACY_AUTO_NARRATION_SUSPENDED_REASON,
} from "@/lib/recording/legacyAutoNarration";
import { runNemoAutoGenerationStep } from "@/lib/recording/nemoAutoGeneration";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RequestBody = {
  seriesId?: string;
  episodeIds?: string[];
};

export async function POST(request: Request) {
  if (LEGACY_AUTO_NARRATION_SUSPENDED) {
    return NextResponse.json(
      {
        ok: true,
        status: "skipped",
        reason: "legacy_auto_narration_suspended",
        message: LEGACY_AUTO_NARRATION_SUSPENDED_REASON,
      },
      { status: 200 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      {
        ok: false,
        error: "ログイン状態を確認できなかった。",
      },
      { status: 401 }
    );
  }

  if (!isOfficialNarrationAccountEmail(user.email)) {
    return NextResponse.json(
      {
        ok: false,
        error: "この操作は公式朗読アカウントのみ実行できる。",
      },
      { status: 403 }
    );
  }

  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "json を読めなかった。",
      },
      { status: 400 }
    );
  }

  const seriesId = typeof body.seriesId === "string" ? body.seriesId.trim() : "";
  const episodeIds = Array.isArray(body.episodeIds)
    ? body.episodeIds
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0)
    : [];

  if (!seriesId || episodeIds.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "seriesId または episodeIds が足りない。",
      },
      { status: 400 }
    );
  }

  try {
    const result = await runNemoAutoGenerationStep({
      seriesId,
      episodeIds,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[nemo-autogen]", error);

    return NextResponse.json(
      {
        ok: false,
        status: "skipped",
        error: "Nemo 自動生成 step に失敗した。",
        detail:
          process.env.NODE_ENV === "development"
            ? error instanceof Error
              ? error.message
              : String(error)
            : undefined,
      },
      { status: 500 }
    );
  }
}
