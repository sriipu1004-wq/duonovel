import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickText } from "@/features/write/writeShared";
import { OpenAITranslationError } from "@/lib/translation/openAITranslation";
import { translatePublicEpisodeWithConsistency } from "@/lib/translation/publicEpisodeTranslation";
import { persistAiSeriesTranslationGlossaryCandidates } from "@/lib/translation/seriesTranslationGlossaryAutoServer";
import { createTranslationPayload } from "@/lib/translation/translationPayload";
import { TRANSLATION_SEGMENT_VERSION } from "@/lib/translation/episodeTranslationServer";
import { reserveEpisodeTranslation } from "@/lib/translation/translationReservationServer";
import {
  aiActionLimitMessage,
  releaseAiAction,
  releaseSubscriberAiCostOnly,
  reserveAiAction,
  reserveSubscriberAiCostOnly,
} from "@/lib/aiUsage/aiUsage.server";
import {
  EPISODE_TRANSLATION_LIMITS,
  estimateEpisodeTranslationActualCostJpy,
} from "@/lib/translation/episodeTranslationGenerateLimits";
import type { PreparedEpisodeTranslationGeneration } from "@/lib/translation/prepareEpisodeTranslationGeneration";

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
      .from("episode_translations")
      .update({
        status: "failed",
        error_code: args.errorCode,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", args.translationId),
    admin
      .from("episode_translation_logs")
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

export async function executeEpisodeTranslationGeneration(
  request: Request,
  prepared: PreparedEpisodeTranslationGeneration,
  options?: { entitlementRuntime?: boolean }
) {
  const {
    access,
    sourceLanguage,
    targetLanguage,
    source,
    sourceChars,
    sourceHash,
    model,
    learningPreference,
    consistency,
    estimatedTokens,
    estimatedCostJpy,
  } = prepared;
  const admin = createAdminClient();
  const requestId = randomUUID();
  const entitlementRuntime = options?.entitlementRuntime === true;
  const actionReservation = entitlementRuntime
    ? await reserveSubscriberAiCostOnly({
        requestId,
        actionType: "translation_generation",
        userId: access.currentUserId,
      })
    : await reserveAiAction({
        request,
        requestId,
        actionType: "translation_generation",
        userId: access.currentUserId,
      });
  const releaseActionReservation = () =>
    entitlementRuntime
      ? releaseSubscriberAiCostOnly(requestId)
      : releaseAiAction(requestId);

  if (!actionReservation.allowed) {
    const usageReservation = {
      used: "used" in actionReservation ? Number(actionReservation.used ?? 0) : 0,
      limit: "limit" in actionReservation ? Number(actionReservation.limit ?? -1) : -1,
      limitReason: actionReservation.limitReason,
      monthlyBudgetUsed: actionReservation.monthlyBudgetUsed,
      monthlyBudgetLimit: actionReservation.monthlyBudgetLimit,
    };
    return NextResponse.json(
      {
        ok: false,
        error: entitlementRuntime ? "subscriber_monthly_budget" : "daily_action_limit",
        message: aiActionLimitMessage(usageReservation, "対訳生成"),
        usage: actionReservation,
      },
      { status: 429 }
    );
  }

  const reservationResult = await reserveEpisodeTranslation({
    admin,
    requestId,
    episodeId: access.episode.id,
    sourceHash,
    sourceLanguage,
    targetLanguage,
    userId: access.currentUserId,
    model,
    sourceChars,
    estimatedInputTokens: estimatedTokens.inputTokens,
    estimatedOutputTokens: estimatedTokens.outputTokens,
    costEstimateJpy: estimatedCostJpy,
    dailyMaxRequests: EPISODE_TRANSLATION_LIMITS.dailyMaxRequests,
    dailyMaxEstimatedCostJpy: EPISODE_TRANSLATION_LIMITS.dailyMaxEstimatedCostJpy,
  });
  if (reservationResult.error) {
    await releaseActionReservation();
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
    await releaseActionReservation();
    return NextResponse.json(
      { ok: false, error: "translation_reservation_invalid" },
      { status: 500 }
    );
  }
  if (!reservation.allowed) {
    await releaseActionReservation();
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
    if (
      resultType === "daily_request_limit" ||
      resultType === "daily_cost_limit"
    ) {
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
    await releaseActionReservation();
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
    await releaseActionReservation();
    return NextResponse.json(
      { ok: false, error: "missing_openai_api_key" },
      { status: 500 }
    );
  }

  const seriesTitle = pickText(access.series.title) || "無題";
  const episodeTitle =
    pickText(access.episode.title, access.episode["episode_title"]) ||
    "第" + String(access.episodeNumber) + "話";
  try {
    const translated = await translatePublicEpisodeWithConsistency({
      apiKey,
      model,
      workTitle: seriesTitle,
      episodeTitle,
      sourceLanguage,
      targetLanguage,
      learningPreference,
      consistency,
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
        ? estimateEpisodeTranslationActualCostJpy(
            actualInputTokens,
            actualOutputTokens,
            model
          )
        : null;
    const translationUpdate = await admin
      .from("episode_translations")
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
      .from("episode_translation_logs")
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

    try {
      await persistAiSeriesTranslationGlossaryCandidates({
        seriesId: access.seriesId,
        episodeId: String(access.episode.id),
        episodeNumber: access.episodeNumber,
        sourceLanguage,
        targetLanguage,
        currentSource: source.normalizedSource,
        candidates: translated.glossaryCandidates,
      });
    } catch (error) {
      console.warn("[series-translation-glossary] automatic candidate persistence failed", error);
    }

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
      uncount: true,
      retryCount:
        error instanceof OpenAITranslationError ? error.retryCount : 0,
    });
    await releaseActionReservation();
    return NextResponse.json(
      { ok: false, error: errorCode, message },
      { status: isTimeout ? 504 : isOpenAIError ? error.status : 500 }
    );
  }
}
