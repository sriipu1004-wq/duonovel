import { NextResponse } from "next/server";
import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import {
  decideRecordingEntryAccess,
  normalizeRecordingPermissionMode,
} from "@/lib/recording/recordingEntry";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertApprovedPrivateHumanRecordingBucket } from "@/lib/recording/humanRecordingStorage";
import {
  closeHumanStagingLease,
  openHumanStagingLease,
  retireMaturedHumanStagingLeases,
} from "@/lib/recording/humanStagingLease";
import {
  RECORDING_GLOBAL_CONSENT_KEY,
  RECORDING_GLOBAL_CONSENT_VERSION,
} from "@/lib/recording/recordingConsent";
import { createClient } from "@/lib/supabase/server";
import {
  buildHumanMultipartUploadSession,
  HUMAN_MULTIPART_MAX_TOTAL_BYTES,
  HUMAN_MULTIPART_MIN_TRIGGER_BYTES,
} from "@/lib/recording/humanMultipartUploadShared";
import {
  getAudioFileExtension,
  isSupportedAudioFile,
} from "@/lib/recording/audioUploadPolicy";

export const runtime = "nodejs";

type SignedPart = {
  index: number;
  objectPath: string;
  byteOffsetStart: number;
  byteOffsetEndExclusive: number;
  expectedSizeBytes: number;
  token: string;
};

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.trunc(parsed);
}

function resolveErrorResponse(message: string) {
  if (message === "unauthorized") {
    return { status: 401, error: "ログイン状態を確認できなかった。" };
  }

  if (message === "invalid_payload") {
    return {
      status: 400,
      error: "multipart upload session 作成に必要な情報が足りない。",
    };
  }

  if (message === "unsupported_type") {
    return { status: 400, error: "このファイル形式はまだ受け付けられない。" };
  }

  if (message === "file_too_large") {
    return { status: 413, error: "ファイルが大きすぎる。今の上限を超えている。" };
  }

  if (message === "recording_entry_denied") {
    return { status: 403, error: "この作品に対する朗読投稿権限がない。" };
  }

  if (message === "episode_not_accessible") {
    return { status: 404, error: "対象話が見つからない。" };
  }

  if (
    message === "human_private_bucket_not_verified" ||
    message === "human_private_bucket_name_unapproved"
  ) {
    return { status: 503, error: "Human PRIVATE保存先を確認できない。" };
  }

  if (message === "recording_consent_required") {
    return { status: 403, error: "朗読投稿前の初回同意がまだ完了していない。" };
  }

  if (message === "human_staging_open_unavailable") {
    // Missing H2 migration, ineligible source/consent/R18 or reused session.
    return {
      status: 409,
      error: "分割アップロードを開始できない。作品の公開状態・録音許可・同意を確認して。",
    };
  }

  return {
    status: 500,
    error: "multipart upload session 作成中に想定外エラーが出た。",
  };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;

    const seriesId = readText(payload.seriesId);
    const episodeId = readText(payload.episodeId);
    const fileName = readText(payload.fileName);
    const mimeType = readText(payload.mimeType);
    const totalSizeBytes = readPositiveInt(payload.totalSizeBytes);

    if (!seriesId || !episodeId || !fileName || !totalSizeBytes) {
      throw new Error("invalid_payload");
    }

    const pseudoFile = {
      name: fileName,
      size: totalSizeBytes,
      type: mimeType,
    };

    if (!isSupportedAudioFile(pseudoFile)) {
      throw new Error("unsupported_type");
    }

    if (totalSizeBytes > HUMAN_MULTIPART_MAX_TOTAL_BYTES) {
      throw new Error("file_too_large");
    }

    if (totalSizeBytes < HUMAN_MULTIPART_MIN_TRIGGER_BYTES) {
      return NextResponse.json({
        ok: true,
        uploadMode: "single",
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error("unauthorized");
    }

    if (isOfficialAccountEmail(user.email)) {
      return NextResponse.json(
        {
          ok: false,
          error: "LIB read Official からのHuman narration公開は停止している。",
        },
        { status: 403 }
      );
    }

    // Resolve authorization through the session-bound client rather than the
    // service role. The canonical RLS rules already express the intended
    // visibility boundary: owners can access their drafts, while other users
    // only see publicly posted works/episodes.
    const { data: series, error: seriesError } = await supabase
      .from("series")
      .select("id, recording_permission_mode")
      .eq("id", seriesId)
      .maybeSingle();

    if (seriesError || !series) {
      throw new Error("recording_entry_denied");
    }

    const decision = decideRecordingEntryAccess({
      permissionMode: normalizeRecordingPermissionMode(
        series.recording_permission_mode
      ),
      isLoggedIn: true,
    });
    if (!decision.canEnter) {
      throw new Error("recording_entry_denied");
    }

    const { data: episode, error: episodeError } = await supabase
      .from("episodes")
      .select("id, series_id")
      .eq("id", episodeId)
      .maybeSingle();

    if (
      episodeError ||
      !episode ||
      String(episode.series_id) !== seriesId
    ) {
      throw new Error("episode_not_accessible");
    }

    const { data: consent, error: consentError } = await supabase
      .from("user_recording_consents")
      .select("consent_version")
      .eq("user_id", user.id)
      .eq("consent_key", RECORDING_GLOBAL_CONSENT_KEY)
      .maybeSingle();
    if (consentError || consent?.consent_version !== RECORDING_GLOBAL_CONSENT_VERSION) {
      throw new Error("recording_consent_required");
    }

    // #181: provider-side PRIVATE visibility is verified BEFORE the H2 lease
    // is opened and before any signed multipart upload token is minted.
    const adminSupabase = createAdminClient();
    const privateBucketName = await assertApprovedPrivateHumanRecordingBucket(adminSupabase);

    // H2 cleanup (best-effort, this actor only): retire leases whose 3 h
    // window has passed. A failure here never blocks the new upload.
    try {
      await retireMaturedHumanStagingLeases(adminSupabase, {
        actorId: user.id,
        bucketName: privateBucketName,
      });
    } catch (cleanupError) {
      console.warn("[human-upload-session] staging retirement skipped", cleanupError);
    }

    const sourceExtension = getAudioFileExtension(fileName) || "bin";
    const session = buildHumanMultipartUploadSession({
      seriesId,
      episodeId,
      userId: user.id,
      sourceExtension,
      totalSizeBytes,
    });

    const signedParts: SignedPart[] = [];
    // H2: commit the server-only lease BEFORE minting any bearer token.
    // An absent migration or an ineligible source fails closed here.
    const lease = {
      sessionId: session.uploadSessionId,
      seriesId,
      episodeId,
      actorId: user.id,
      sourceExtension: session.sourceExtension,
      totalSizeBytes: session.totalSizeBytes,
    };
    await openHumanStagingLease(adminSupabase, lease, session.parts.length);

    try {
      for (const part of session.parts) {
        const { data, error } = await adminSupabase.storage
          .from(session.bucketName)
          .createSignedUploadUrl(part.objectPath, {
            // A bearer must never overwrite a part that already landed.
            upsert: false,
          });

        if (error || !data?.token) {
          throw new Error(
            `signed_upload_url_create_failed:${error?.message ?? "token_missing"}`
          );
        }

        signedParts.push({
          index: part.index,
          objectPath: part.objectPath,
          byteOffsetStart: part.byteOffsetStart,
          byteOffsetEndExclusive: part.byteOffsetEndExclusive,
          expectedSizeBytes: part.expectedSizeBytes,
          token: data.token,
        });
      }

      return NextResponse.json({
        ok: true,
        uploadMode: "multipart",
        uploadSessionId: session.uploadSessionId,
        bucketName: session.bucketName,
        sourceExtension: session.sourceExtension,
        totalSizeBytes: session.totalSizeBytes,
        partSizeBytes: session.partSizeBytes,
        tempPrefix: session.tempPrefix,
        parts: signedParts,
      });
    } catch (issueError) {
      // Some tokens may already exist. Aborting the lease makes the storage
      // guard reject every later write with them.
      try {
        await closeHumanStagingLease(adminSupabase, lease, "abort");
      } catch (abortError) {
        console.error("[human-upload-session] lease abort failed", abortError);
      }
      throw issueError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const resolved = resolveErrorResponse(message);

    return NextResponse.json(
      {
        ok: false,
        error: resolved.error,
        detail:
          process.env.NODE_ENV === "development"
            ? message
            : undefined,
      },
      { status: resolved.status }
    );
  }
}
