import { NextResponse } from "next/server";
import { analyzeAudioUploadServer } from "@/lib/recording/audioUploadServerValidation";
import { publishHumanRecording } from "@/lib/recording/humanRecordingPublish";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function resolveDefaultReaderName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): string {
  const metadata = user.user_metadata ?? {};

  const fromMetadata =
    (typeof metadata.display_name === "string" && metadata.display_name.trim()) ||
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    "";

  if (fromMetadata) {
    return fromMetadata;
  }

  const email = typeof user.email === "string" ? user.email.trim() : "";
  if (email.includes("@")) {
    return email.split("@")[0] || "ユーザー朗読";
  }

  return "ユーザー朗読";
}

function resolveErrorResponse(error: unknown): {
  status: number;
  body: Record<string, unknown>;
} {
  const message = error instanceof Error ? error.message : "unknown_error";

  if (message === "series_not_found") {
    return {
      status: 404,
      body: {
        ok: false,
        error: "対象作品が見つからない。",
      },
    };
  }

  if (message === "episode_not_found") {
    return {
      status: 404,
      body: {
        ok: false,
        error: "対象話が見つからないか、この作品に属していない。",
      },
    };
  }

  if (message === "empty_file") {
    return {
      status: 400,
      body: {
        ok: false,
        error: "音声ファイルが空なので publish を始められない。",
      },
    };
  }

  if (message.startsWith("entry_denied:")) {
    return {
      status: 403,
      body: {
        ok: false,
        error: "この作品に対する朗読 publish 権限がない。",
      },
    };
  }

  if (message.startsWith("entry_check_failed:")) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "朗読権限確認中にエラーが出た。",
      },
    };
  }

  if (message.startsWith("storage_upload_failed:")) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "storage への音声保存に失敗した。",
      },
    };
  }

  if (message === "storage_public_url_unavailable") {
    return {
      status: 500,
      body: {
        ok: false,
        error: "保存後の public URL を解決できなかった。",
      },
    };
  }

  if (message.startsWith("reader_user_upsert_failed:")) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "朗読者ユーザー行の確保に失敗した。users テーブル列差分を確認して。",
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
        error: "既存朗読の上書き更新に失敗した。",
      },
    };
  }

  if (message.startsWith("recording_duplicate_cleanup_failed:")) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "重複朗読 row の cleanup に失敗した。",
      },
    };
  }

  if (message.startsWith("recording_insert_failed:")) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "recordings 登録に失敗した。",
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      error: "人力朗読 publish 中に想定外エラーが出た。",
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
  const audio = formData.get("audio");

  if (!seriesId || !episodeId) {
    return NextResponse.json(
      {
        ok: false,
        error: "seriesId または episodeId が足りない。",
      },
      { status: 400 }
    );
  }

  if (!(audio instanceof File)) {
    return NextResponse.json(
      {
        ok: false,
        error: "audio フィールドにファイルが無い。",
      },
      { status: 400 }
    );
  }

  const validationResult = await analyzeAudioUploadServer(audio);

  if (validationResult.decision !== "passed") {
    return NextResponse.json(
      {
        ok: false,
        error: validationResult.message,
        validationResult,
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

  const requestedReaderName = readText(formData, "readerName");
  const readerName = requestedReaderName || resolveDefaultReaderName(user);

  try {
    const result = await publishHumanRecording({
      userId: user.id,
      seriesId,
      episodeId,
      readerName,
      sourceFile: audio,
    });

    return NextResponse.json(
      {
        ok: true,
        ...result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[human-publish]", error);

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