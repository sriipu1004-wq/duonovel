// Issue #137 H2: the signed-in actor aborts their own ACTIVE multipart
// staging lease. After the abort the storage guard rejects every later write
// with the already-issued signed tokens, so the exact part paths are removed
// best-effort; anything left is retired later (lease retire_after).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildHumanStagingPartPaths,
  closeHumanStagingLease,
} from "@/lib/recording/humanStagingLease";
import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import {
  buildHumanMultipartUploadSession,
  HUMAN_MULTIPART_MAX_TOTAL_BYTES,
  HUMAN_MULTIPART_MIN_TRIGGER_BYTES,
} from "@/lib/recording/humanMultipartUploadShared";
import { getAudioFileExtension, isSupportedAudioFile } from "@/lib/recording/audioUploadPolicy";
import { assertApprovedPrivateHumanRecordingBucket } from "@/lib/recording/humanRecordingStorage";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false, error: "ログインが必要。" }, { status: 401 });
  }
  if (isOfficialAccountEmail(user.email)) {
    return NextResponse.json(
      { ok: false, error: "Human録音の一時アップロード操作は許可されていない。" },
      { status: 403 }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "不正なJSON。" }, { status: 400 });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ ok: false, error: "セッション情報が不正。" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;
  const seriesId = readText(body.seriesId);
  const episodeId = readText(body.episodeId);
  const uploadSessionId = readText(body.uploadSessionId);
  const fileName = readText(body.fileName);
  const mimeType = readText(body.mimeType);
  const totalSizeBytes = Number(body.totalSizeBytes);
  if (
    ![seriesId, episodeId, uploadSessionId].every(isUuid) ||
    !fileName ||
    !Number.isSafeInteger(totalSizeBytes) ||
    totalSizeBytes < HUMAN_MULTIPART_MIN_TRIGGER_BYTES ||
    totalSizeBytes > HUMAN_MULTIPART_MAX_TOTAL_BYTES ||
    !isSupportedAudioFile({ name: fileName, size: totalSizeBytes, type: mimeType })
  ) {
    return NextResponse.json({ ok: false, error: "一時セッション情報が不正。" }, { status: 400 });
  }

  const session = buildHumanMultipartUploadSession({
    seriesId,
    episodeId,
    userId: user.id,
    uploadSessionId,
    sourceExtension: getAudioFileExtension(fileName) || "bin",
    totalSizeBytes,
  });
  const admin = createAdminClient();
  try {
    await closeHumanStagingLease(admin, {
      sessionId: session.uploadSessionId,
      seriesId,
      episodeId,
      actorId: user.id,
      sourceExtension: session.sourceExtension,
      totalSizeBytes,
    }, "abort");
  } catch {
    // Same answer for unknown, foreign, expired-and-closed or sealed sessions.
    return NextResponse.json(
      { ok: false, error: "セッションを停止できなかった。期限切れ・処理済み・所有権を確認して。" },
      { status: 409 }
    );
  }

  // Lease is ABORTED: later writes with old tokens are rejected by the guard.
  let cleanupStatus: "removed" | "deferred_to_retirement" = "deferred_to_retirement";
  try {
    const bucketName = await assertApprovedPrivateHumanRecordingBucket(admin);
    const paths = buildHumanStagingPartPaths({
      seriesId,
      episodeId,
      actorId: user.id,
      sessionId: session.uploadSessionId,
      sourceExtension: session.sourceExtension,
      partCount: session.parts.length,
    });
    const removed = await admin.storage.from(bucketName).remove(paths);
    if (!removed.error) cleanupStatus = "removed";
  } catch (cleanupError) {
    console.warn("[human-upload-abort] part cleanup deferred", cleanupError);
  }

  return NextResponse.json({ ok: true, stagingStatus: "aborted", cleanupStatus }, { status: 200 });
}
