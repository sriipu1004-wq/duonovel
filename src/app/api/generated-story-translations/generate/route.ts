import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildEpisodeTranslationSource,
  buildEpisodeTranslationSourceHash,
  TRANSLATION_SEGMENT_VERSION,
  TRANSLATION_SOURCE_LANGUAGE,
  TRANSLATION_TARGET_LANGUAGE,
} from "@/lib/translation/episodeTranslationServer";
import {
  OpenAITranslationError,
  translateSegmentsInBatches,
} from "@/lib/translation/openAITranslation";
import {
  DEFAULT_TRANSLATION_MODEL,
  getDefaultTextTokenPricesUsd,
} from "@/lib/translation/openAITranslationModel";
import {
  isPublicTranslationLanguagePair,
  parseSupportedLanguageTag,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import {
  createTranslationPayload,
  parseStoredTranslationPayload,
} from "@/lib/translation/translationPayload";
import { reserveGeneratedStoryTranslation } from "@/lib/translation/translationReservationServer";
import {
  releaseAiAction,
  reserveAiAction,
} from "@/lib/aiUsage/aiUsage.server";

export const runtime = "nodejs";
export const maxDuration = 300;
const GENERATED_TRANSLATION_STUCK_MS = 4 * 60 * 1000;

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

function estimateTokens(sourceChars: number): {
  inputTokens: number;
  outputTokens: number;
} {
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

async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    return error ? null : data.user?.id ?? null;
  } catch {
    return null;
  }
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
      .from("generated_story_translations")
      .update({
        status: "failed",
        error_code: args.errorCode,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", args.translationId),
    admin
      .from("generated_story_translation_logs")
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

async function readReadyTranslation(args: {
  storyId: string;
  sourceHash: string;
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
}) {
  const admin = createAdminClient();
  const result = await admin
    .from("generated_story_translations")
    .select("id, status, segments, expires_at, started_at")
    .eq("story_id", args.storyId)
    .eq("source_language", args.sourceLanguage)
    .eq("target_language", args.targetLanguage)
    .eq("source_hash", args.sourceHash)
    .gte("expires_at", new Date().toISOString())
    .maybeSingle();

  if (result.error || !result.data) return null;
  return result.data;
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const storyId = typeof payload.storyId === "string" ? payload.storyId.trim() : "";
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  const sourceLanguage =
    payload.sourceLanguage === undefined
      ? TRANSLATION_SOURCE_LANGUAGE
      : parseSupportedLanguageTag(payload.sourceLanguage);
  const targetLanguage =
    payload.targetLanguage === undefined
      ? TRANSLATION_TARGET_LANGUAGE
      : parseSupportedLanguageTag(payload.targetLanguage);
  const checkOnly = payload.checkOnly === true;

  if (
    !storyId ||
    storyId.length > 100 ||
    !/^[A-Za-z0-9-]+$/u.test(storyId) ||
    !title ||
    !body ||
    !sourceLanguage ||
    !targetLanguage ||
    sourceLanguage === targetLanguage ||
    !isPublicTranslationLanguagePair({ sourceLanguage, targetLanguage })
  ) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
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

  const source = buildEpisodeTranslationSource(body, sourceLanguage);
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

  const sourceHash = buildEpisodeTranslationSourceHash(body);
  const existing = await readReadyTranslation({
    storyId,
    sourceHash,
    sourceLanguage,
    targetLanguage,
  });
  const admin = createAdminClient();

  if (existing?.status === "ready") {
    const translation = parseStoredTranslationPayload(existing.segments, {
      sourceLanguage,
      targetLanguage,
    });
    if (translation) {
      return NextResponse.json({
        ok: true,
        status: "ready",
        sourceHash,
        sourceLanguage,
        targetLanguage,
        segments: translation.segments,
      });
    }
  }

  if (existing?.status === "translating") {
    const startedAtMs = Date.parse(String(existing.started_at ?? ""));
    const isStuck =
      !Number.isFinite(startedAtMs) ||
      Date.now() - startedAtMs > GENERATED_TRANSLATION_STUCK_MS;

    if (!isStuck) {
      return NextResponse.json(
        { ok: true, status: "translating", sourceHash },
        { status: 202 }
      );
    }

    const now = new Date().toISOString();
    const staleUpdate = await admin
      .from("generated_story_translations")
      .update({
        status: "failed",
        error_code: "translation_timeout",
        completed_at: now,
        updated_at: now,
      })
      .eq("id", existing.id)
      .eq("status", "translating");

    if (staleUpdate.error) {
      return NextResponse.json(
        {
          ok: false,
          error: "translation_storage_unavailable",
          message: staleUpdate.error.message,
        },
        { status: 503 }
      );
    }
  }

  if (checkOnly) {
    return NextResponse.json({ ok: true, status: "missing", sourceHash });
  }

  const model = process.env.EPISODE_TRANSLATION_MODEL ?? DEFAULT_TRANSLATION_MODEL;
  const estimatedTokens = estimateTokens(sourceChars);
  const estimatedCostJpy = estimateGuardrailCostJpy(
    estimatedTokens.inputTokens,
    estimatedTokens.outputTokens
  );
  const userId = await currentUserId();
  const requestId = randomUUID();
  const actionReservation = await reserveAiAction({
    request,
    requestId,
    actionType: "translation_generation",
    userId,
  });

  if (!actionReservation.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "daily_action_limit",
        message: `本日の対訳生成回数（${actionReservation.used}/${actionReservation.limit}）を使い切りました。`,
        usage: actionReservation,
      },
      { status: 429 }
    );
  }

  const reservationResult = await reserveGeneratedStoryTranslation({
    admin,
    requestId,
    storyId,
    sourceHash,
    sourceLanguage,
    targetLanguage,
    userId,
    model,
    sourceChars,
    estimatedInputTokens: estimatedTokens.inputTokens,
    estimatedOutputTokens: estimatedTokens.outputTokens,
    costEstimateJpy: estimatedCostJpy,
    dailyMaxRequests: TRANSLATION_LIMITS.dailyMaxRequests,
    dailyMaxEstimatedCostJpy: TRANSLATION_LIMITS.dailyMaxEstimatedCostJpy,
  });

  if (reservationResult.error) {
    await releaseAiAction(requestId);
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
    await releaseAiAction(requestId);
    return NextResponse.json(
      { ok: false, error: "translation_reservation_invalid" },
      { status: 500 }
    );
  }

  if (!reservation.allowed) {
    await releaseAiAction(requestId);
    const resultType = String(reservation.result_type ?? "");

    if (resultType === "ready") {
      const ready = await readReadyTranslation({
        storyId,
        sourceHash,
        sourceLanguage,
        targetLanguage,
      });
      const translation = parseStoredTranslationPayload(ready?.segments, {
        sourceLanguage,
        targetLanguage,
      });
      if (translation) {
        return NextResponse.json({
          ok: true,
          status: "ready",
          sourceHash,
          sourceLanguage,
          targetLanguage,
          segments: translation.segments,
        });
      }
    }

    if (resultType === "in_progress") {
      return NextResponse.json(
        { ok: true, status: "translating", sourceHash },
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
    await releaseAiAction(requestId);
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
    await releaseAiAction(requestId);

    return NextResponse.json({ ok: false, error: "missing_openai_api_key" }, { status: 500 });
  }

  try {
    const translated = await translateSegmentsInBatches({
      apiKey,
      model,
      workTitle: title,
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
      .from("generated_story_translations")
      .update({
        source_language: sourceLanguage,
        target_language: targetLanguage,
        segment_version: TRANSLATION_SEGMENT_VERSION,
        status: "ready",
        segments: translationPayload,
        translation_model: model,
        error_code: null,
        completed_at: now,
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        updated_at: now,
      })
      .eq("id", translationId);

    if (translationUpdate.error) {
      throw new Error("翻訳結果の保存に失敗しました: " + translationUpdate.error.message);
    }

    await admin
      .from("generated_story_translation_logs")
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
      sourceHash,
      sourceLanguage,
      targetLanguage,
      segments: storedSegments,
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
