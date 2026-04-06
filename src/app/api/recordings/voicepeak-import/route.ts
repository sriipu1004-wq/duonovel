import { NextResponse } from "next/server";
import { analyzeAudioUploadServer } from "@/lib/recording/audioUploadServerValidation";
import {
  buildVoicepeakRecordingObjectPath,
  fetchVoicepeakEpisodeSummary,
  getRecordingAudioBucketName,
  insertRecordingCompat,
  loadVoicepeakImportAccess,
  removeUploadedRecordingAudio,
} from "@/lib/recording/voicepeakImport";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
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
  const narratorName = readText(formData, "narratorName") || "VOICEPEAK";
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

  const userSupabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await userSupabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      {
        ok: false,
        error: "ログイン状態を確認できなかった。",
      },
      { status: 401 }
    );
  }

  try {
    await loadVoicepeakImportAccess(userSupabase, seriesId, user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "entry_denied";

    return NextResponse.json(
      {
        ok: false,
        error:
          message === "series_not_found"
            ? "対象作品が見つからない。"
            : "この作品に対する朗読取り込み権限がない。",
      },
      { status: message === "series_not_found" ? 404 : 403 }
    );
  }

  const episode = await fetchVoicepeakEpisodeSummary(
    userSupabase,
    seriesId,
    episodeId
  );

  if (!episode) {
    return NextResponse.json(
      {
        ok: false,
        error: "対象話が見つからないか、この作品に属していない。",
      },
      { status: 404 }
    );
  }

  const validation = await analyzeAudioUploadServer(audio);

  if (validation.decision !== "passed") {
    return NextResponse.json(
      {
        ok: false,
        error: validation.message,
        result: validation,
      },
      { status: 400 }
    );
  }

  const adminSupabase = createAdminClient();
  const bucketName = getRecordingAudioBucketName();
  const objectPath = buildVoicepeakRecordingObjectPath({
    seriesId,
    episodeId,
    narratorName,
    originalFileName: audio.name,
  });

  const { error: uploadError } = await adminSupabase.storage
    .from(bucketName)
    .upload(objectPath, audio, {
      contentType: audio.type || undefined,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          `storage upload に失敗: ${uploadError.message}` +
          "。bucket 未作成か、public bucket 前提が未整備の可能性が高い。",
      },
      { status: 500 }
    );
  }

  const {
    data: { publicUrl },
  } = adminSupabase.storage.from(bucketName).getPublicUrl(objectPath);

  if (!publicUrl) {
    await removeUploadedRecordingAudio(adminSupabase, bucketName, objectPath);

    return NextResponse.json(
      {
        ok: false,
        error: "public URL を解決できなかった。",
      },
      { status: 500 }
    );
  }

  try {
    const recordingId = await insertRecordingCompat(adminSupabase, {
      seriesId,
      episodeId,
      narratorName,
      audioStoragePath: publicUrl,
    });

    return NextResponse.json(
      {
        ok: true,
        recordingId,
        audioStoragePath: publicUrl,
        narratorName,
        episodeNumber: episode.episodeNumber,
        episodeTitle: episode.title,
      },
      { status: 200 }
    );
  } catch (error) {
    await removeUploadedRecordingAudio(adminSupabase, bucketName, objectPath);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? `recordings 登録に失敗: ${error.message}`
            : "recordings 登録に失敗した。",
      },
      { status: 500 }
    );
  }
}