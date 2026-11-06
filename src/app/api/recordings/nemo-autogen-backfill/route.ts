import { NextResponse } from "next/server";
import { isOfficialNarrationAccountEmail } from "@/lib/auth/officialNarrationAccount";
import {
  LEGACY_AUTO_NARRATION_SUSPENDED,
  LEGACY_AUTO_NARRATION_SUSPENDED_REASON,
} from "@/lib/recording/legacyAutoNarration";
import { seedNemoAutogenBackfillQueue } from "@/lib/recording/nemoAutoGeneration";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RequestBody = {
  limitEpisodes?: number;
};

export async function POST(request: Request) {
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

  let body: RequestBody = {};

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    body = {};
  }

  const limitEpisodes =
    typeof body.limitEpisodes === "number" && Number.isFinite(body.limitEpisodes)
      ? Math.max(1, Math.trunc(body.limitEpisodes))
      : undefined;

  try {
    const result = await seedNemoAutogenBackfillQueue({
      limitEpisodes,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[nemo-autogen-backfill]", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Nemo backlog の queue seed に失敗した。",
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