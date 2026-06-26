import { NextResponse } from "next/server";
import { isOfficialNarrationAccountEmail } from "@/lib/auth/officialNarrationAccount";
import {
  LEGACY_AUTO_NARRATION_SUSPENDED,
  LEGACY_AUTO_NARRATION_SUSPENDED_REASON,
} from "@/lib/recording/legacyAutoNarration";
import { runNextPendingAivisAutogenJob } from "@/lib/recording/aivisAutoGeneration";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RequestBody = {
  maxSteps?: number;
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

  const maxSteps =
    typeof body.maxSteps === "number" && Number.isFinite(body.maxSteps)
      ? Math.min(5, Math.max(1, Math.trunc(body.maxSteps)))
      : 1;

  const steps: Array<{
    status?: string;
    generatedEpisodeId?: string;
    generatedSeriesId?: string;
    generatedVoiceModelId?: string;
    narratorName?: string;
    reason?: string;
  }> = [];

  try {
    for (let index = 0; index < maxSteps; index += 1) {
      const step = await runNextPendingAivisAutogenJob({
        officialUserId: user.id,
      });

      steps.push({
        status: step.status,
        generatedEpisodeId: step.generatedEpisodeId,
        generatedSeriesId: step.generatedSeriesId,
        generatedVoiceModelId: step.generatedVoiceModelId,
        narratorName: step.narratorName,
        reason: step.reason,
      });

      if (step.status !== "generated") {
        break;
      }
    }

    const generatedCount = steps.filter(
      (step) => step.status === "generated"
    ).length;
    const lastStep = steps[steps.length - 1] ?? null;

    return NextResponse.json(
      {
        ok: true,
        status: lastStep?.status ?? "none_missing",
        generatedCount,
        steps,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[aivis-autogen-run-pending]", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Aivis pending queue の処理に失敗した。",
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
