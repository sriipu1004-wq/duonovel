import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPrivateLibraryTranslationSource,
  buildPrivateLibraryTranslationSourceHash,
  resolvePrivateLibraryTranslationAccess,
} from "@/lib/library/privateLibraryTranslationServer";
import {
  OpenAITranslationError,
  translateSegmentsInBatches,
} from "@/lib/translation/openAITranslation";
import {
  DEFAULT_TRANSLATION_MODEL,
  getDefaultTextTokenPricesUsd,
} from "@/lib/translation/openAITranslationModel";
import { parseSupportedLanguageTag } from "@/lib/translation/languageRegistry";
import {
  createTranslationPayload,
  TRANSLATION_SEGMENT_VERSION,
} from "@/lib/translation/translationPayload";

export const runtime = "nodejs";
export const maxDuration = 300;

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return fallback;
}

function readNonNegativeNumberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const TRANSLATION_LIMITS = {
  enabled: readBooleanEnv("EPISODE_TRANSLATION_ENABLED", true),
  dailyMaxRequests: readPositiveIntEnv("EPISODE_TRANSLATION_DAILY_MAX_REQUESTS", 20),
  dailyMaxEstimatedCostJpy: readNonNegativeNumberEnv(
    "EPISODE_TRANSLATION_DAILY_MAX_ESTIMATED_COST_JPY",
    100
  ),
  maxSourceChars: readPositiveIntEnv("EPISODE_TRANSLATION_MAX_SOURCE_CHARS", 8000),
  estimatedInputJpyPer1kTokens: readNonNegativeNumberEnv(
    "EPISODE_TRANSLATION_ESTIMATED_INPUT_JPY_PER_1K_TOKENS",
    0.2
  ),
  estimatedOutputJpyPer1kTokens: readNonNegativeNumberEnv(
    "EPISODE_TRANSLATION_ESTIMATED_OUTPUT_JPY_PER_1K_TOKENS",
    1
  ),
  actualUsdJpyRate: readNonNegativeNumberEnv(
    "EPISODE_TRANSLATION_ACTUAL_USD_JPY_RATE",
    160
  ),
} as const;

function estimateTokens(sourceChars: number) {
  return {
    inputTokens: Math.max(1, Math.ceil(sourceChars * 1.2) + 800),
    outputTokens: Math.max(1, Math.ceil(sourceChars * 0.9) + 400),
  };
}

function estimateGuardrailCostJpy(
  inputTokens: number,
  outputTokens: number
): number {
  const value =
    (inputTokens / 1000) * TRANSLATION_LIMITS.estimatedInputJpyPer1kTokens +
    (outputTokens / 1000) * TRANSLATION_LIMITS.estimatedOutputJpyPer1kTokens;
  return Math.ceil(value * 1000) / 1000;
}

function estimateActualCostJpy(
  inputTokens: number,
  outputTokens: number,
  model: string
): number {
  const defaultPrices = getDefaultTextTokenPricesUsd(model);
  const inputUsdPer1mTokens = readNonNegativeNumberEnv(
    "EPISODE_TRANSLATION_ACTUAL_INPUT_USD_PER_1M_TOKENS",
    defaultPrices.inputPer1mTokens
  );
  const outputUsdPer1mTokens = readNonNegativeNumberEnv(
    "EPISODE_TRANSLATION_ACTUAL_OUTPUT_USD_PER_1M_TOKENS",
    defaultPrices.outputPer1mTokens
  );
  const valueUsd =
    (inputTokens / 1_000_000) * inputUsdPer1mTokens +
    (outputTokens / 1_000_000) * outputUsdPer1mTokens;
  return (
    Math.ceil(valueUsd * TRANSLATION_LIMITS.actualUsdJpyRate * 1000) / 1000
  );
}

async function markFailed(args: {
  translationId: string;
  logId: string;
  errorCode: string;
  errorMessage: string;
  uncount?: boolean;
  retryCount?: number;
}) {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  await Promise.all([
    admin
      .from("private_library_chapter_translations")
      .update({
        status: "failed",
        error_code: args.errorCode,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", args.translationId),
    admin
      .from("private_library_chapter_translation_logs")
      .update({
        status: "failed",
        success: false,
        ...(args.uncount ? { is_counted: false } : {}),
        error_code: args.errorCode,
        error_message: args.errorMessage,
        retry_count: args.retryCount ?? 0,
        updated_at: now,
      })
      .eq("id", args.logId),
  ]);
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 }
    );
  }

  const chapterId =
    typeof payload.chapterId === "string" ? payload.chapterId.trim() : "";
  const requestedSourceLanguage = parseSupportedLanguageTag(payload.sourceLanguage);
  const targetLanguage = parseSupportedLanguageTag(payload.targetLanguage);

  if (!chapterId || !targetLanguage) {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 }
    );
  }

  if (!TRANSLATION_LIMITS.enabled) {
    return NextResponse.json(
      {
        ok: false,
        error: "translation_temporarily_disabled",
        message: "現在、対訳の生成は一時停止しています。",
      },
      { status: 503 }
    );
  }

  const access = await resolvePrivateLibraryTranslationAccess(chapterId);

  if (!access) {
    return NextResponse.json(
      { ok: false, error: "chapter_not_found" },
      { status: 404 }
    );
  }

  const sourceLanguage = requestedSourceLanguage ?? access.sourceLanguage;
  if (
    sourceLanguage !== access.sourceLanguage ||
    targetLanguage === sourceLanguage
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 }
    );
  }

  const source = buildPrivateLibraryTranslationSource(access.body, sourceLanguage);
  const sourceChars = source.normalizedSource.length;

  if (sourceChars > TRANSLATION_LIMITS.maxSourceChars) {
    return NextResponse.json(
      {
        ok: false,
        error: "translation_source_too_long",
        maxSourceChars: TRANSLATION_LIMITS.maxSourceChars,
      },
      { status: 413 }
    );
  }

  if (source.segments.length === 0) {
    return NextResponse.json(
      { ok: false, error: "translation_source_empty" },
      { status: 400 }
    );
  }

  const sourceHash = buildPrivateLibraryTranslationSourceHash(access.body);
  const model = process.env.EPISODE_TRANSLATION_MODEL ?? DEFAULT_TRANSLATION_MODEL;
  const estimatedTokens = estimateTokens(sourceChars);
  const estimatedCostJpy = estimateGuardrailCostJpy(
    estimatedTokens.inputTokens,
    estimatedTokens.outputTokens
  );
  const admin = createAdminClient();
  const currentTranslationResult = await admin
    .from("private_library_chapter_translations")
    .select("id, status")
    .eq("chapter_id", access.chapter.id)
    .eq("source_language", sourceLanguage)
    .eq("target_language", targetLanguage)
    .eq("source_hash", sourceHash)
    .maybeSingle();

  if (currentTranslationResult.error) {
    return NextResponse.json(
      {
        ok: false,
        error: "translation_storage_unavailable",
        message: currentTranslationResult.error.message,
      },
      { status: 503 }
    );
  }

  const requestId = randomUUID();
  const reservationResult = await admin.rpc(
    "reserve_private_library_chapter_translation",
    {
      p_request_id: requestId,
      p_chapter_id: access.chapter.id,
      p_source_hash: sourceHash,
      p_source_language: sourceLanguage,
      p_target_language: targetLanguage,
      p_user_id: access.userId,
      p_model: model,
      p_source_chars: sourceChars,
      p_estimated_input_tokens: estimatedTokens.inputTokens,
      p_estimated_output_tokens: estimatedTokens.outputTokens,
      p_cost_estimate_jpy: estimatedCostJpy,
      p_daily_max_requests: TRANSLATION_LIMITS.dailyMaxRequests,
      p_daily_max_estimated_cost_jpy: TRANSLATION_LIMITS.dailyMaxEstimatedCostJpy,
    }
  );

  if (reservationResult.error) {
    return NextResponse.json(
      {
        ok: false,
        error: "translation_reservation_failed",
        message: reservationResult.error.message,
      },
      { status: 503 }
    );
  }

  const reservation = Array.isArray(reservationResult.data)
    ? reservationResult.data[0]
    : reservationResult.data;

  if (!reservation || typeof reservation.allowed !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "translation_reservation_invalid" },
      { status: 500 }
    );
  }

  if (!reservation.allowed) {
    const resultType = String(reservation.result_type ?? "");

    if (resultType === "ready") {
      return NextResponse.json({ ok: true, status: "ready" });
    }
    if (resultType === "in_progress") {
      return NextResponse.json(
        { ok: true, status: "translating" },
        { status: 202 }
      );
    }
    if (resultType === "daily_request_limit" || resultType === "daily_cost_limit") {
      return NextResponse.json(
        {
          ok: false,
          error: resultType,
          message: "本日の対訳生成上限に達しました。",
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { ok: false, error: "translation_reservation_rejected" },
      { status: 409 }
    );
  }

  const translationId = String(reservation.translation_id ?? "");
  const logId = String(reservation.log_id ?? "");

  if (!translationId || !logId) {
    return NextResponse.json(
      { ok: false, error: "translation_reservation_invalid" },
      { status: 500 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    await markFailed({
      translationId,
      logId,
      errorCode: "missing_openai_api_key",
      errorMessage: "OPENAI_API_KEY が設定されていません。",
      uncount: true,
    });

    return NextResponse.json(
      { ok: false, error: "missing_openai_api_key" },
      { status: 500 }
    );
  }

  try {
    const translated = await translateSegmentsInBatches({
      apiKey,
      model,
      workTitle: access.work.title || "無題",
      episodeTitle: access.chapter.title || `第${access.chapter.chapter_number}話`,
      sourceLanguage,
      targetLanguage,
      segments: source.segments.map((segment) => ({
        id: segment.id,
        text: segment.translationInput,
      })),
    });
    const storedSegments = source.segments.map((segment, index) => ({
      id: segment.id,
      sourceText: segment.sourceText,
      translatedText: translated.segments[index] ?? "",
      paragraphIndex: segment.paragraphIndex,
      sentenceIndex: segment.sentenceIndex,
      startOffset: segment.startOffset,
      endOffset: segment.endOffset,
    }));

    if (storedSegments.some((segment) => !segment.translatedText.trim())) {
      throw new Error("対訳に空の文があります。");
    }

    const translationPayload = createTranslationPayload({
      sourceLanguage,
      targetLanguage,
      segments: storedSegments,
    });
    const now = new Date().toISOString();
    const actualInputTokens = translated.inputTokens;
    const actualOutputTokens = translated.outputTokens;
    const actualCostJpy =
      actualInputTokens && actualOutputTokens
        ? estimateActualCostJpy(actualInputTokens, actualOutputTokens, model)
        : null;

    const translationUpdate = await admin
      .from("private_library_chapter_translations")
      .update({
        source_language: sourceLanguage,
        target_language: targetLanguage,
        segment_version: TRANSLATION_SEGMENT_VERSION,
        status: "ready",
        segments: translationPayload,
        translation_model: model,
        error_code: null,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", translationId);

    if (translationUpdate.error) {
      throw new Error(
        "翻訳結果の保存に失敗しました: " + translationUpdate.error.message
      );
    }

    await admin
      .from("private_library_chapter_translation_logs")
      .update({
        status: "success",
        success: true,
        actual_input_tokens: actualInputTokens,
        actual_output_tokens: actualOutputTokens,
        actual_cost_jpy: actualCostJpy,
        retry_count: translated.retryCount,
        updated_at: now,
      })
      .eq("id", logId);

    return NextResponse.json({
      ok: true,
      status: "ready",
      translationId,
      sourceHash,
      estimatedCostJpy,
    });
  } catch (error) {
    const isTimeout =
      (error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")) ||
      (error instanceof OpenAITranslationError && error.status === 504);
    const isOpenAIError = error instanceof OpenAITranslationError;
    const message = isTimeout
      ? "対訳の一部が1分以内に完了しませんでした。"
      : error instanceof Error
        ? error.message
        : "対訳の生成に失敗しました。";
    const errorCode = isTimeout
      ? "translation_timeout"
      : isOpenAIError
        ? "translation_openai_failed"
        : "translation_exception";

    await markFailed({
      translationId,
      logId,
      errorCode,
      errorMessage: message,
      retryCount:
        error instanceof OpenAITranslationError ? error.retryCount : 0,
    });

    return NextResponse.json(
      {
        ok: false,
        error: errorCode,
        message,
      },
      { status: isTimeout ? 504 : isOpenAIError ? error.status : 500 }
    );
  }
}
