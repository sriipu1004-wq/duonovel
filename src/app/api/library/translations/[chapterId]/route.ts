import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPrivateLibraryTranslationSourceHash,
  resolvePrivateLibraryTranslationAccess,
} from "@/lib/library/privateLibraryTranslationServer";
import { parseSupportedLanguageTag } from "@/lib/translation/languageRegistry";
import { parseStoredTranslationPayload } from "@/lib/translation/translationPayload";

export const runtime = "nodejs";

const TRANSLATION_STUCK_MS = 4 * 60 * 1000;

type RouteContext = {
  params: Promise<{ chapterId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { chapterId } = await context.params;
  const access = await resolvePrivateLibraryTranslationAccess(chapterId);

  if (!access) {
    return NextResponse.json(
      { ok: false, error: "chapter_not_found" },
      { status: 404 }
    );
  }

  const requestUrl = new URL(request.url);
  const requestedSourceLanguage = parseSupportedLanguageTag(
    requestUrl.searchParams.get("sourceLanguage")
  );
  const targetLanguage = parseSupportedLanguageTag(
    requestUrl.searchParams.get("targetLanguage")
  );
  const sourceLanguage = requestedSourceLanguage ?? access.sourceLanguage;

  if (
    sourceLanguage !== access.sourceLanguage ||
    !targetLanguage ||
    targetLanguage === sourceLanguage
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 }
    );
  }

  const sourceHash = buildPrivateLibraryTranslationSourceHash(access.body);
  const admin = createAdminClient();
  const currentResult = await admin
    .from("private_library_chapter_translations")
    .select(
      "id, status, segments, source_hash, translation_model, error_code, started_at, completed_at, updated_at"
    )
    .eq("chapter_id", access.chapter.id)
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
      canGenerate: true,
      canAutoGenerate: true,
      sourceHash,
      sourceLanguage,
      targetLanguage,
      translationId: current.id,
      translationModel: current.translation_model ?? null,
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
      const errorMessage = "対訳の生成が規定時間内に完了しませんでした。";

      await Promise.all([
        admin
          .from("private_library_chapter_translations")
          .update({
            status: "failed",
            error_code: "translation_timeout",
            completed_at: now,
            updated_at: now,
          })
          .eq("id", current.id)
          .eq("status", "translating"),
        admin
          .from("private_library_chapter_translation_logs")
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
        canGenerate: true,
        canAutoGenerate: false,
        sourceHash,
        translationId: current.id,
        errorCode: "translation_timeout",
        message: errorMessage,
      });
    }

    return NextResponse.json({
      ok: true,
      status: "translating",
      canGenerate: true,
      canAutoGenerate: true,
      sourceHash,
      translationId: current.id,
      startedAt: current.started_at ?? null,
    });
  }

  if (current?.status === "failed") {
    return NextResponse.json({
      ok: true,
      status: "failed",
      canGenerate: true,
      canAutoGenerate: false,
      sourceHash,
      translationId: current.id,
      errorCode: current.error_code ?? null,
    });
  }

  const olderReadyResult = await admin
    .from("private_library_chapter_translations")
    .select("id, source_hash, completed_at")
    .eq("chapter_id", access.chapter.id)
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
      canGenerate: true,
      canAutoGenerate: true,
      sourceHash,
      message: "原文が更新されたため、対訳を再生成します。",
    });
  }

  return NextResponse.json({
    ok: true,
    status: "missing",
    canGenerate: true,
    canAutoGenerate: true,
    sourceHash,
  });
}
