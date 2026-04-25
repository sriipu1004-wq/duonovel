import { NextResponse } from "next/server";
import { isOfficialNarrationAccountEmail } from "@/lib/auth/officialNarrationAccount";
import { generateAivisRecordingForEpisode } from "@/lib/recording/aivisGeneration";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseSpeakerId(rawValue: string, fallbackRawValue?: string): number | null {
  const candidates = [rawValue, fallbackRawValue ?? ""];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const parsed = Number(candidate);

    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

function resolveErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown_error";

  if (message === "episode_not_found") {
    return {
      status: 404,
      body: {
        ok: false,
        error: "対象話が見つからないか、この作品に属していない。",
      },
    };
  }

  if (message === "episode_body_empty") {
    return {
      status: 400,
      body: {
        ok: false,
        error: "本文が空なので、Aivis生成を始められない。",
      },
    };
  }

  if (message.startsWith("entry_denied:")) {
    return {
      status: 403,
      body: {
        ok: false,
        error: "この作品に対する朗読生成権限がない。",
      },
    };
  }

  if (message === "series_not_found") {
    return {
      status: 404,
      body: {
        ok: false,
        error: "対象作品が見つからない。",
      },
    };
  }

  if (
    message === "aivis_text_empty" ||
    message === "aivis_speaker_invalid"
  ) {
    return {
      status: 400,
      body: {
        ok: false,
        error: "Aivis生成に必要な本文または speaker 設定が不正。",
      },
    };
  }

  if (
    message.startsWith("aivis_chunk_failed:") ||
    message.startsWith("aivis_audio_query_failed:") ||
    message.startsWith("aivis_synthesis_failed:") ||
    message === "aivis_audio_empty"
  ) {
    return {
      status: 502,
      body: {
        ok: false,
        error:
          "Aivis Engineでの音声生成に失敗した。Aivis起動状態とspeakerIdを確認して。",
      },
    };
  }

  if (
    message.startsWith("nemo_wav_parse_failed:") ||
    message === "nemo_wav_format_mismatch" ||
    message.startsWith("nemo_wav_concat_failed:")
  ) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "Aivis音声の結合に失敗した。",
      },
    };
  }

  if (message.startsWith("aivis_timing_upload_failed:")) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "本文同期用 timing JSON の保存に失敗した。",
      },
    };
  }

  if (message === "storage_public_url_unavailable") {
    return {
      status: 500,
      body: {
        ok: false,
        error: "public URL を解決できなかった。",
      },
    };
  }

  if (message.startsWith("recording_lookup_failed:")) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "既存朗読の検索に失敗した。",
      },
    };
  }

  if (message.startsWith("recording_update_failed:")) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "既存Aivis朗読の上書き更新に失敗した。",
      },
    };
  }

  if (message.startsWith("recording_insert_failed:")) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "recordings登録に失敗した。",
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      error: "Aivis生成中に想定外エラーが出た。",
    },
  };
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "multipart/form-data を読めなかった。",
      },
      { status: 400 }
    );
  }

  const seriesId = readText(formData, "seriesId");
  const episodeId = readText(formData, "episodeId");
  const narratorName =
    readText(formData, "narratorName") || "Aivis 標準朗読";
  const rawSpeakerId = readText(formData, "speakerId");
  const speakerId = parseSpeakerId(
    rawSpeakerId,
    process.env.AIVIS_DEFAULT_SPEAKER
  );

  if (!seriesId || !episodeId) {
    return NextResponse.json(
      {
        ok: false,
        error: "seriesId または episodeId が足りない。",
      },
      { status: 400 }
    );
  }

  if (speakerId === null) {
    return NextResponse.json(
      {
        ok: false,
        error: "speakerId が不正。",
      },
      { status: 400 }
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

  try {
    const result = await generateAivisRecordingForEpisode({
      supabase,
      userId: user.id,
      seriesId,
      episodeId,
      narratorName,
      speakerId,
    });

    return NextResponse.json(
      {
        ok: true,
        ...result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[aivis-generate]", error);

    const resolved = resolveErrorResponse(error);

    return NextResponse.json(
      {
        ...resolved.body,
        detail:
          process.env.NODE_ENV === "development"
            ? error instanceof Error
              ? error.message
              : String(error)
            : undefined,
      },
      { status: resolved.status }
    );
  }
}