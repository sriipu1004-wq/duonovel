import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildEpisodeTranslationSourceHash,
  resolveEpisodeTranslationAccess,
  TRANSLATION_SOURCE_LANGUAGE,
  TRANSLATION_TARGET_LANGUAGE,
} from "@/lib/translation/episodeTranslationServer";
import {
  isPublicTranslationLanguagePair,
  parseSupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import { parseStoredTranslationPayload } from "@/lib/translation/translationPayload";

export const runtime = "nodejs";

const TRANSLATION_STUCK_MS = 4 * 60 * 1000;

type RouteContext = {
  params: Promise<{ episodeId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { episodeId } = await context.params;
  const requestUrl = new URL(request.url);
  const rawSourceLanguage = requestUrl.searchParams.get("sourceLanguage");
  const rawTargetLanguage = requestUrl.searchParams.get("targetLanguage");
  const sourceLanguage = rawSourceLanguage
    ? parseSupportedLanguageTag(rawSourceLanguage)
    : TRANSLATION_SOURCE_LANGUAGE;
  const targetLanguage = rawTargetLanguage
    ? parseSupportedLanguageTag(rawTargetLanguage)
    : TRANSLATION_TARGET_LANGUAGE;

  if (
    !sourceLanguage ||
    !targetLanguage ||
    sourceLanguage === targetLanguage ||
    !isPublicTranslationLanguagePair({ sourceLanguage, targetLanguage })
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 }
    );
  }

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
    .eq("source_language", sourceLanguage)
    .eq("target_language", targetLanguage)
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
    const translation = parseStoredTranslationPayload(current.segments, {
      sourceLanguage,
      targetLanguage,
    });

    if (!translation) {
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
      sourceLanguage,
      targetLanguage,
      segments: translation.segments,
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
    .eq("source_language", sourceLanguage)
    .eq("target_language", targetLanguage)
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
