import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildHumanMultipartUploadSession,
  HUMAN_MULTIPART_MAX_TOTAL_BYTES,
  HUMAN_MULTIPART_MIN_TRIGGER_BYTES,
} from "@/lib/recording/humanMultipartUploadShared";
import { getAudioFileExtension, isSupportedAudioFile } from "@/lib/recording/audioUploadPolicy";

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
    return { status: 400, error: "multipart upload session 作成に必要な情報が足りない。" };
  }

  if (message === "unsupported_type") {
    return { status: 400, error: "このファイル形式はまだ受け付けられない。" };
  }

  if (message === "file_too_large") {
    return { status: 413, error: "ファイルが大きすぎる。今の上限を超えている。" };
  }

  return { status: 500, error: "multipart upload session 作成中に想定外エラーが出た。" };
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

    const sourceExtension = getAudioFileExtension(fileName) || "bin";
    const session = buildHumanMultipartUploadSession({
      seriesId,
      episodeId,
      userId: user.id,
      sourceExtension,
      totalSizeBytes,
    });

    const adminSupabase = createAdminClient();

    const signedParts: SignedPart[] = [];

    for (const part of session.parts) {
      const { data, error } = await adminSupabase.storage
        .from(session.bucketName)
        .createSignedUploadUrl(part.objectPath, {
          upsert: true,
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