import { NextResponse } from "next/server";
import {
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import { analyzeAudioUploadServer } from "@/lib/recording/audioUploadServerValidation";
import { getAudioFileExtension, isSupportedAudioFile } from "@/lib/recording/audioUploadPolicy";
import {
  buildHumanMultipartUploadSession,
  HUMAN_MULTIPART_MAX_TOTAL_BYTES,
  HUMAN_MULTIPART_MIN_TRIGGER_BYTES,
} from "@/lib/recording/humanMultipartUploadShared";
import { publishHumanRecording } from "@/lib/recording/humanRecordingPublish";
import { getHumanRecordingAudioBucketName } from "@/lib/recording/humanRecordingStorage";
import {
  decideRecordingEntryAccess,
  normalizeRecordingPermissionMode,
} from "@/lib/recording/recordingEntry";
import {
  RECORDING_GLOBAL_CONSENT_KEY,
  RECORDING_GLOBAL_CONSENT_VERSION,
} from "@/lib/recording/recordingConsent";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RawRow = Record<string, unknown>;

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function readBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "private", "非公開"].includes(normalized)) return false;
    if (["true", "1", "public", "公開"].includes(normalized)) return true;
  }
  return fallback;
}

function resolveReaderName(
  user: { user_metadata?: Record<string, unknown> | null },
  publicUserRow?: RawRow | null
): string {
  const publicName = readText(publicUserRow?.display_name);
  if (publicName) return publicName;

  const metadata = user.user_metadata ?? {};
  return (
    readText(metadata.display_name) ||
    readText(metadata.name) ||
    readText(metadata.full_name)
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { ok: false, error: "ログイン状態を確認できなかった。" },
      { status: 401 }
    );
  }

  if (isOfficialAccountEmail(user.email)) {
    return NextResponse.json(
      { ok: false, error: "LIB read Official からのHuman narration公開は停止している。" },
      { status: 403 }
    );
  }

  let payload: RawRow;
  try {
    payload = (await request.json()) as RawRow;
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSONを読めなかった。" },
      { status: 400 }
    );
  }

  const seriesId = readText(payload.seriesId);
  const episodeId = readText(payload.episodeId);
  const episodeNumber = readPositiveInt(payload.episodeNumber);
  const fileName = readText(payload.fileName);
  const mimeType = readText(payload.mimeType);
  const totalSizeBytes = readPositiveInt(payload.totalSizeBytes);
  const uploadSessionId = readText(payload.uploadSessionId);
  const isPublic = readBoolean(payload.isPublic, true);

  if (
    !seriesId ||
    !episodeId ||
    !fileName ||
    !totalSizeBytes ||
    !uploadSessionId ||
    totalSizeBytes < HUMAN_MULTIPART_MIN_TRIGGER_BYTES ||
    totalSizeBytes > HUMAN_MULTIPART_MAX_TOTAL_BYTES
  ) {
    return NextResponse.json(
      { ok: false, error: "multipart finalize 情報が不正。" },
      { status: 400 }
    );
  }

  const pseudoFile = { name: fileName, size: totalSizeBytes, type: mimeType };
  if (!isSupportedAudioFile(pseudoFile)) {
    return NextResponse.json(
      { ok: false, error: "このファイル形式は受け付けられない。" },
      { status: 400 }
    );
  }

  const [{ data: series, error: seriesError }, { data: episode, error: episodeError }] =
    await Promise.all([
      supabase.from("series").select("*").eq("id", seriesId).maybeSingle(),
      supabase.from("episodes").select("*").eq("id", episodeId).maybeSingle(),
    ]);

  if (seriesError || !series) {
    return NextResponse.json(
      { ok: false, error: "対象作品が見つからない。" },
      { status: 404 }
    );
  }

  const entryDecision = decideRecordingEntryAccess({
    permissionMode: normalizeRecordingPermissionMode(series.recording_permission_mode),
    isLoggedIn: true,
  });
  if (!entryDecision.canEnter) {
    return NextResponse.json(
      { ok: false, error: "この作品に対する朗読投稿権限がない。" },
      { status: 403 }
    );
  }

  if (
    episodeError ||
    !episode ||
    String(episode.series_id) !== seriesId
  ) {
    return NextResponse.json(
      { ok: false, error: "対象話が見つからないか、この作品に属していない。" },
      { status: 404 }
    );
  }

  if (
    isPublic &&
    (getSeriesPublicationStatus(series as SeriesRow) !== "public" ||
      !isEpisodePubliclyVisible(episode as EpisodeRow))
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
      { ok: false, error: "朗読同意状態の確認に失敗した。" },
      { status: 500 }
    );
  }
  if (consentRow?.consent_version !== RECORDING_GLOBAL_CONSENT_VERSION) {
    return NextResponse.json(
      { ok: false, error: "朗読投稿前の初回同意がまだ完了していない。" },
      { status: 400 }
    );
  }

  const { data: publicUserRow } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const readerName = resolveReaderName(
    user,
    (publicUserRow as RawRow | null) ?? null
  );
  if (!readerName) {
    return NextResponse.json(
      { ok: false, error: "公開朗読者名を確認できない。表示名を設定してから再試行して。" },
      { status: 400 }
    );
  }

  const sourceExtension = getAudioFileExtension(fileName) || "bin";
  const session = buildHumanMultipartUploadSession({
    seriesId,
    episodeId,
    userId: user.id,
    sourceExtension,
    totalSizeBytes,
    uploadSessionId,
  });
  const admin = createAdminClient();
  const bucketName = getHumanRecordingAudioBucketName();
  const tempObjectPaths = session.parts.map((part) => part.objectPath);

  try {
    const fileParts: Blob[] = [];
    for (const part of session.parts) {
      const { data, error } = await admin.storage
        .from(bucketName)
        .download(part.objectPath);

      if (error || !data || data.size !== part.expectedSizeBytes) {
        return NextResponse.json(
          {
            ok: false,
            error: `multipart part ${part.index + 1} を完全に取得できなかった。`,
          },
          { status: 409 }
        );
      }
      fileParts.push(data);
    }

    const sourceFile = new File(fileParts, fileName, {
      type: mimeType || "application/octet-stream",
    });

    if (sourceFile.size !== totalSizeBytes) {
      return NextResponse.json(
        { ok: false, error: "multipart 音源の再構成サイズが一致しない。" },
        { status: 409 }
      );
    }

    const validation = await analyzeAudioUploadServer(sourceFile);
    if (validation.decision !== "passed") {
      return NextResponse.json(
        { ok: false, error: validation.message, validationResult: validation },
        { status: 400 }
      );
    }

    const result = await publishHumanRecording({
      userId: user.id,
      seriesId,
      episodeId,
      episodeNumber,
      readerName,
      isPublic,
      sourceFile,
    });

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    console.error("[human-upload-finalize]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "multipart Human narration finalize 中に想定外エラーが出た。",
      },
      { status: 500 }
    );
  } finally {
    if (tempObjectPaths.length > 0) {
      const { error } = await admin.storage.from(bucketName).remove(tempObjectPaths);
      if (error) {
        console.warn("[human-upload-finalize cleanup warning]", error.message);
      }
    }
  }
}
