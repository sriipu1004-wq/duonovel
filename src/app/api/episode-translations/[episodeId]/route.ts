import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildEpisodeTranslationSourceHash,
  resolveEpisodeTranslationAccess,
  TRANSLATION_TARGET_LANGUAGE,
} from "@/lib/translation/episodeTranslationServer";

export const runtime = "nodejs";

const TRANSLATION_STUCK_MS = 4 * 60 * 1000;

type RouteContext = {
  params: Promise<{ episodeId: string }>;
};

type StoredSegment = {
  id: string;
  ja: string;
  en: string;
  paragraphIndex: number;
  sentenceIndex: number;
  startOffset: number;
  endOffset: number;
};

function parseSegments(value: unknown): StoredSegment[] | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const rawSegments = Array.isArray(root.segments) ? root.segments : null;
  if (!rawSegments) return null;

  const parsed: StoredSegment[] = [];

  for (const item of rawSegments) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;

    if (
      typeof row.id !== "string" ||
      typeof row.ja !== "string" ||
      typeof row.en !== "string" ||
      typeof row.paragraphIndex !== "number" ||
      typeof row.sentenceIndex !== "number" ||
      typeof row.startOffset !== "number" ||
      typeof row.endOffset !== "number"
    ) {
      return null;
    }

    parsed.push({
      id: row.id,
      ja: row.ja,
      en: row.en,
      paragraphIndex: row.paragraphIndex,
      sentenceIndex: row.sentenceIndex,
      startOffset: row.startOffset,
      endOffset: row.endOffset,
    });
  }

  return parsed;
}

export async function GET(_request: Request, context: RouteContext) {
  const { episodeId } = await context.params;
  const access = await resolveEpisodeTranslationAccess(episodeId);

  if (!access || !access.canRead || !access.body.trim()) {
    return NextResponse.json(
      { ok: false, error: "episode_not_found" },
      { status: 404 }
    );
  }

  const sourceHash = buildEpisodeTranslationSourceHash(access.body);
  const admin = createAdminClient();

  const currentResult = await admin
    .from("episode_translations")
    .select("id, status, segments, source_hash, translation_model, error_code, started_at, completed_at, updated_at")
    .eq("episode_id", access.episode.id)
    .eq("target_language", TRANSLATION_TARGET_LANGUAGE)
    .eq("source_hash", sourceHash)
    .maybeSingle();

  if (currentResult.error) {
    return NextResponse.json(
      {
        ok: false,
        error: "translation_storage_unavailable",
        message: currentResult.error.message,
      },
      { status: 503 }
    );
  }

  const current = currentResult.data as Record<string, unknown> | null;
  const canGenerate = access.isOfficialUser && access.isAllowlisted;
  const canAutoGenerate = access.isAllowlisted;

  if (current?.status === "ready") {
    const segments = parseSegments(current.segments);

    if (!segments) {
      return NextResponse.json(
        { ok: false, error: "invalid_translation_segments" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      status: "ready",
      canGenerate,
      canAutoGenerate,
      isAllowlisted: access.isAllowlisted,
      sourceHash,
      translationId: current.id,
      translationModel: current.translation_model ?? null,
      segments,
    });
  }

  if (current?.status === "translating") {
    const startedAtMs =
      typeof current.started_at === "string"
        ? Date.parse(current.started_at)
        : Number.NaN;
    const isStuck =
      Number.isFinite(startedAtMs) &&
      Date.now() - startedAtMs > TRANSLATION_STUCK_MS;

    if (isStuck && typeof current.id === "string") {
      const now = new Date().toISOString();
      const errorMessage = "英語対訳の生成が規定時間内に完了しませんでした。";

      await Promise.all([
        admin
          .from("episode_translations")
          .update({
            status: "failed",
            error_code: "translation_timeout",
            completed_at: now,
            updated_at: now,
          })
          .eq("id", current.id)
          .eq("status", "translating"),
        admin
          .from("episode_translation_logs")
          .update({
            status: "failed",
            success: false,
            error_code: "translation_timeout",
            error_message: errorMessage,
            updated_at: now,
          })
          .eq("translation_id", current.id)
          .eq("status", "started"),
      ]);

      return NextResponse.json({
        ok: true,
        status: "failed",
        canGenerate,
        canAutoGenerate: false,
        isAllowlisted: access.isAllowlisted,
        sourceHash,
        translationId: current.id,
        errorCode: "translation_timeout",
        message: errorMessage,
      });
    }

    return NextResponse.json({
      ok: true,
      status: "translating",
      canGenerate,
      canAutoGenerate,
      isAllowlisted: access.isAllowlisted,
      sourceHash,
      translationId: current.id,
      startedAt: current.started_at ?? null,
    });
  }

  if (current?.status === "failed") {
    return NextResponse.json({
      ok: true,
      status: "failed",
      canGenerate,
      canAutoGenerate: false,
      isAllowlisted: access.isAllowlisted,
      sourceHash,
      translationId: current.id,
      errorCode: current.error_code ?? null,
    });
  }

  const olderReadyResult = await admin
    .from("episode_translations")
    .select("id, source_hash, completed_at")
    .eq("episode_id", access.episode.id)
    .eq("target_language", TRANSLATION_TARGET_LANGUAGE)
    .eq("status", "ready")
    .neq("source_hash", sourceHash)
    .order("completed_at", { ascending: false })
    .limit(1);

  if (olderReadyResult.error) {
    return NextResponse.json(
      {
        ok: false,
        error: "translation_storage_unavailable",
        message: olderReadyResult.error.message,
      },
      { status: 503 }
    );
  }

  if ((olderReadyResult.data ?? []).length > 0) {
    return NextResponse.json({
      ok: true,
      status: "stale",
      canGenerate,
      canAutoGenerate,
      isAllowlisted: access.isAllowlisted,
      sourceHash,
      message: "原文が更新されたため、英語対訳を再生成します。",
    });
  }

  return NextResponse.json({
    ok: true,
    status: "missing",
    canGenerate,
    canAutoGenerate,
    isAllowlisted: access.isAllowlisted,
    sourceHash,
  });
}
