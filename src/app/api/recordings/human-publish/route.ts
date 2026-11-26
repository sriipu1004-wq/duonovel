import { NextResponse } from "next/server";
import { registrationRequiredResponse } from "@/lib/auth/registrationGate.server";
import {
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import { analyzeAudioUploadServer } from "@/lib/recording/audioUploadServerValidation";
import {
  decideRecordingEntryAccess,
  normalizeRecordingPermissionMode,
} from "@/lib/recording/recordingEntry";
import { publishHumanRecording } from "@/lib/recording/humanRecordingPublish";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionBlockedApiResponse } from "@/lib/rights/regionRestriction.server";
import { loadRecordingTargetForViewer } from "@/lib/recording/recordingTargetAccess.server";
import { readSelfChosenDisplayName } from "@/lib/auth/selfChosenDisplayName";
import {
  RECORDING_GLOBAL_CONSENT_KEY,
  RECORDING_GLOBAL_CONSENT_VERSION,
} from "@/lib/recording/recordingConsent";

export const runtime = "nodejs";

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(
  formData: FormData,
  key: string,
  fallback = true
): boolean {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["false", "0", "private", "非公開"].includes(normalized)) {
    return false;
  }

  if (["true", "1", "public", "公開"].includes(normalized)) {
    return true;
  }

  return fallback;
}

function readPositiveInt(formData: FormData, key: string): number | null {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value.trim());

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function resolveCurrentReaderName(
  user: {
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  },
  publicUserRow?: Record<string, unknown> | null
): string {
  const fromPublicUser = pickText(
    publicUserRow?.display_name,
    publicUserRow?.username,
    publicUserRow?.pen_name,
    publicUserRow?.name
  );

  if (fromPublicUser) {
    return fromPublicUser;
  }

  const metadata = user.user_metadata ?? {};

  // Only a self-chosen name; provider real names (name/full_name) are never
  // published as the reader name (Issue #142 PR1).
  const fromMetadata = readSelfChosenDisplayName(metadata);

  if (fromMetadata) {
    return fromMetadata;
  }

  return "";
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

  if (message === "episode_body_empty") {
    return {
      status: 400,
      body: {
        ok: false,
        error: "本文が空なので、本文リンク付き朗読 publish を始められない。",
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

  if (message === "ffmpeg_unavailable") {
    return {
      status: 500,
      body: {
        ok: false,
        error: "再生用正規化に必要な ffmpeg を解決できなかった。",
      },
    };
  }

  if (message.startsWith("playback_transcode_failed:")) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "再生用 playback 音源への正規化に失敗した。",
      },
    };
  }

  if (message === "openai_api_key_missing") {
    return {
      status: 500,
      body: {
        ok: false,
        error: "音声文字起こしに必要な OPENAI_API_KEY を解決できなかった。",
      },
    };
  }

  if (message === "transcription_input_too_large") {
    return {
      status: 413,
      body: {
        ok: false,
        error: "文字起こし対象の playback 音源が大きすぎる。今のMVPでは 25MB 未満に収めて。",
      },
    };
  }

  if (message === "human_transcription_empty") {
    return {
      status: 422,
      body: {
        ok: false,
        error: "文字起こし結果が空だったので、本文リンク付き publish を通せない。",
      },
    };
  }

  if (message.startsWith("transcription_request_failed:")) {
    return {
      status: 502,
      body: {
        ok: false,
        error: "音声文字起こし API 呼び出しに失敗した。",
      },
    };
  }

  if (message.startsWith("human_alignment_insufficient:")) {
    return {
      status: 422,
      body: {
        ok: false,
        error:
          "朗読内容を本文へ十分な精度でリンクできなかった。読み飛ばし、言い換え、雑音、別文面の可能性が高いので今回は publish しない。",
      },
    };
  }

  if (message.startsWith("human_timing_upload_failed:")) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "本文追尾用 timing 情報の保存に失敗した。",
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

  if (
    message === "human_private_bucket_not_verified" ||
    message === "human_private_bucket_name_unapproved"
  ) {
    return {
      status: 503,
      body: {
        ok: false,
        error: "Human PRIVATE保存先を確認できない。",
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
  // Reject unauthenticated callers before parsing multipart input. Parsing a
  // large multipart body is materially more expensive than verifying the
  // session and should never be available as an anonymous resource sink.
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

  // Issue #142 PR2: Google accounts must finish STEP 2 before narration.
  const registrationBlocked = await registrationRequiredResponse(user, "text");
  if (registrationBlocked) return registrationBlocked;

  if (isOfficialAccountEmail(user.email)) {
    return NextResponse.json(
      {
        ok: false,
        error: "LIB read Official からのHuman narration公開は停止している。",
      },
      { status: 403 }
    );
  }

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
  const episodeNumber = readPositiveInt(formData, "episodeNumber");
  const isPublic = readBoolean(formData, "isPublic", true);
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

  // #216 (KD-4): the recording APIs are outside the proxy's region guard,
  // so the visitor's country is checked here (D030, fail closed), before the
  // audio is analyzed.
  let regionBlocked: Response | null;
  try {
    regionBlocked = await regionBlockedApiResponse(request, seriesId);
  } catch {
    return NextResponse.json(
      { ok: false, error: "作品の公開地域を確認できなかった。" },
      { status: 503 }
    );
  }
  if (regionBlocked) return regionBlocked;

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

  // Authorize the exact target before handing the payload to service-role
  // processing. #216 (KD-4): a per-country restricted work hides its episodes
  // from every non-author session (RESTRICTIVE RLS), so the target is read
  // through the service role with the same select RLS applied in the query
  // and in code: owners may access their own drafts, while other users only
  // see public, posted works/episodes; recording_permission_mode must still
  // be open.
  const target = await loadRecordingTargetForViewer(createAdminClient(), {
    seriesId,
    episodeId,
    viewerId: user.id,
  });

  if (!target.ok) {
    return NextResponse.json(
      {
        ok: false,
        error:
          target.reason === "episode_not_accessible"
            ? "対象話が見つからないか、この作品に属していない。"
            : "対象作品が見つからない。",
      },
      { status: 404 }
    );
  }

  const accessibleSeries = target.series;
  const accessibleEpisode = target.episode;
  const entryDecision = decideRecordingEntryAccess({
    permissionMode: normalizeRecordingPermissionMode(
      accessibleSeries.recording_permission_mode
    ),
    isLoggedIn: true,
  });
  if (!entryDecision.canEnter) {
    return NextResponse.json(
      { ok: false, error: "この作品に対する朗読 publish 権限がない。" },
      { status: 403 }
    );
  }

  if (
    isPublic &&
    (getSeriesPublicationStatus(accessibleSeries as SeriesRow) !== "public" ||
      !isEpisodePubliclyVisible(accessibleEpisode as EpisodeRow))
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "非公開・未投稿・公開前の作品または話ではHuman narrationを公開できない。",
      },
      { status: 409 }
    );
  }

  const { data: consentRow, error: consentError } = await supabase
    .from("user_recording_consents")
    .select("consent_version")
    .eq("user_id", user.id)
    .eq("consent_key", RECORDING_GLOBAL_CONSENT_KEY)
    .maybeSingle();

  if (consentError) {
    return NextResponse.json(
      {
        ok: false,
        error: "朗読同意状態の確認に失敗した。",
      },
      { status: 500 }
    );
  }

  if (consentRow?.consent_version !== RECORDING_GLOBAL_CONSENT_VERSION) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "このアカウントでは朗読投稿前の初回同意がまだ完了していない。朗読制作導線から入り直して。",
      },
      { status: 400 }
    );
  }

  const { data: publicUserRow } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const readerName = resolveCurrentReaderName(
    user,
    (publicUserRow as Record<string, unknown> | null) ?? null
  );

  if (!readerName) {
    return NextResponse.json(
      {
        ok: false,
        error: "公開朗読者名を確認できない。アカウントの表示名を設定してから再試行して。",
      },
      { status: 400 }
    );
  }

  try {
    const result = await publishHumanRecording({
      userId: user.id,
      seriesId,
      episodeId,
      episodeNumber,
      readerName,
      isPublic,
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
