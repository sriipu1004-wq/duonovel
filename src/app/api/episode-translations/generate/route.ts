import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickText } from "@/features/write/writeShared";
import {
  buildEpisodeTranslationSource,
  buildEpisodeTranslationSourceHash,
  resolveEpisodeTranslationAccess,
  TRANSLATION_SEGMENT_VERSION,
  TRANSLATION_SOURCE_LANGUAGE,
  TRANSLATION_TARGET_LANGUAGE,
} from "@/lib/translation/episodeTranslationServer";

export const runtime = "nodejs";
export const maxDuration = 300;

type OpenAIResponseBody = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

type TranslationOutput = {
  segments: Array<{
    id: string;
    en: string;
  }>;
};

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
  dailyMaxRequests: readPositiveIntEnv("EPISODE_TRANSLATION_DAILY_MAX_REQUESTS", 5),
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

function estimateCostJpy(inputTokens: number, outputTokens: number): number {
  const value =
    (inputTokens / 1000) * TRANSLATION_LIMITS.estimatedInputJpyPer1kTokens +
    (outputTokens / 1000) * TRANSLATION_LIMITS.estimatedOutputJpyPer1kTokens;
  return Math.ceil(value * 1000) / 1000;
}

function extractOutputText(responseBody: OpenAIResponseBody): string {
  if (typeof responseBody.output_text === "string") {
    return responseBody.output_text;
  }

  for (const item of responseBody.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return "";
}

function validateTranslationOutput(
  value: unknown,
  sourceSegments: ReturnType<typeof buildEpisodeTranslationSource>["segments"]
): TranslationOutput {
  if (!value || typeof value !== "object") {
    throw new Error("翻訳結果を読み取れませんでした。");
  }

  const root = value as Record<string, unknown>;
  if (!Array.isArray(root.segments)) {
    throw new Error("翻訳結果のsegmentsがありません。");
  }

  if (root.segments.length !== sourceSegments.length) {
    throw new Error("翻訳結果の文数が原文と一致しません。");
  }

  const seen = new Set<string>();
  const segments: TranslationOutput["segments"] = [];

  root.segments.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error("翻訳結果に不正なsegmentがあります。");
    }

    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const en = typeof row.en === "string" ? row.en.trim() : "";
    const expectedId = sourceSegments[index]?.id;

    if (!id || !en || id !== expectedId || seen.has(id)) {
      throw new Error("翻訳segment IDの対応が崩れています。");
    }

    seen.add(id);
    segments.push({ id, en });
  });

  return { segments };
}

async function markFailed(args: {
  translationId: string;
  logId: string;
  errorCode: string;
  errorMessage: string;
  uncount?: boolean;
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

  const episodeId = typeof payload.episodeId === "string" ? payload.episodeId.trim() : "";
  const targetLanguage =
    typeof payload.targetLanguage === "string"
      ? payload.targetLanguage.trim().toLowerCase()
      : TRANSLATION_TARGET_LANGUAGE;

  if (!episodeId || targetLanguage !== TRANSLATION_TARGET_LANGUAGE) {
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
        message: "現在、英語対訳の生成は一時停止しています。",
      },
      { status: 503 }
    );
  }

  const access = await resolveEpisodeTranslationAccess(episodeId);

  if (!access || !access.canRead || !access.body.trim()) {
    return NextResponse.json(
      { ok: false, error: "episode_not_found" },
      { status: 404 }
    );
  }

  if (!access.isAllowlisted) {
    return NextResponse.json(
      {
        ok: false,
        error: "translation_episode_not_eligible",
        message: "この話では英語対訳を生成できません。",
      },
      { status: 403 }
    );
  }

  const source = buildEpisodeTranslationSource(access.body);
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

  const sourceHash = buildEpisodeTranslationSourceHash(access.body);
  const model = process.env.EPISODE_TRANSLATION_MODEL ?? "gpt-5-mini";
  const estimatedTokens = estimateTokens(sourceChars);
  const estimatedCostJpy = estimateCostJpy(
    estimatedTokens.inputTokens,
    estimatedTokens.outputTokens
  );
  const admin = createAdminClient();

  const currentTranslationResult = await admin
    .from("episode_translations")
    .select("id, status")
    .eq("episode_id", access.episode.id)
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

  if (
    currentTranslationResult.data?.status === "failed" &&
    !access.isOfficialUser
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "translation_retry_forbidden",
        message: "前回失敗した英語対訳の再生成は管理用アカウントから行います。",
      },
      { status: 403 }
    );
  }

  const requestId = randomUUID();

  const reservationResult = await admin.rpc("reserve_episode_translation", {
    p_request_id: requestId,
    p_episode_id: access.episode.id,
    p_source_hash: sourceHash,
    p_target_language: targetLanguage,
    p_user_id: access.currentUserId,
    p_model: model,
    p_source_chars: sourceChars,
    p_estimated_input_tokens: estimatedTokens.inputTokens,
    p_estimated_output_tokens: estimatedTokens.outputTokens,
    p_cost_estimate_jpy: estimatedCostJpy,
    p_daily_max_requests: TRANSLATION_LIMITS.dailyMaxRequests,
    p_daily_max_estimated_cost_jpy: TRANSLATION_LIMITS.dailyMaxEstimatedCostJpy,
  });

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
      return NextResponse.json({ ok: true, status: "translating" }, { status: 202 });
    }

    if (resultType === "daily_request_limit" || resultType === "daily_cost_limit") {
      return NextResponse.json(
        {
          ok: false,
          error: resultType,
          message: "本日の英語対訳生成上限に達しました。",
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

  const seriesTitle = pickText(access.series.title) || "無題";
  const episodeTitle =
    pickText(access.episode.title, access.episode["episode_title"]) ||
    "第" + String(access.episodeNumber) + "話";
  const inputSegments = source.segments.map((segment) => ({
    id: segment.id,
    text: segment.translationInput,
  }));

  try {
    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({
        model,
        reasoning: model.startsWith("gpt-5")
          ? { effort: "minimal" }
          : undefined,
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text:
                  "You are a literary translator. Translate Japanese fiction into natural, modern, neutral English. Preserve meaning, speakers, tense, names, paragraph intent, and omissions. Do not add explanations or remove content. Return only the requested structured JSON.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  "Work title: " + seriesTitle,
                  "Episode title: " + episodeTitle,
                  "Translate every segment. Keep every id exactly unchanged.",
                  "Aozora ruby readings and editorial notes have already been normalized for translation input.",
                  "Segments:",
                  JSON.stringify(inputSegments),
                ].join("\n"),
              },
            ],
          },
        ],
        max_output_tokens: Math.min(
          12000,
          Math.max(1600, Math.ceil(sourceChars * 1.5))
        ),
        text: {
          format: {
            type: "json_schema",
            name: "episode_translation",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                segments: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      id: { type: "string" },
                      en: { type: "string" },
                    },
                    required: ["id", "en"],
                  },
                },
              },
              required: ["segments"],
            },
          },
        },
      }),
    });

    const responseBody = (await openAIResponse.json()) as OpenAIResponseBody;

    if (!openAIResponse.ok) {
      const errorMessage =
        responseBody.error?.message ?? "英語対訳の生成に失敗しました。";
      await markFailed({
        translationId,
        logId,
        errorCode: "openai_" + String(openAIResponse.status),
        errorMessage,
      });

      return NextResponse.json(
        { ok: false, error: "translation_openai_failed", message: errorMessage },
        { status: openAIResponse.status }
      );
    }

    const outputText = extractOutputText(responseBody);
    if (!outputText) {
      throw new Error("英語対訳の生成結果が空でした。");
    }

    const translated = validateTranslationOutput(
      JSON.parse(outputText) as unknown,
      source.segments
    );
    const englishById = new Map(
      translated.segments.map((segment) => [segment.id, segment.en])
    );
    const storedSegments = source.segments.map((segment) => ({
      id: segment.id,
      ja: segment.ja,
      en: englishById.get(segment.id) ?? "",
      paragraphIndex: segment.paragraphIndex,
      sentenceIndex: segment.sentenceIndex,
      startOffset: segment.startOffset,
      endOffset: segment.endOffset,
    }));

    if (storedSegments.some((segment) => !segment.en.trim())) {
      throw new Error("英語対訳に空のsegmentがあります。");
    }

    const now = new Date().toISOString();
    const actualInputTokens = Number(responseBody.usage?.input_tokens ?? 0) || null;
    const actualOutputTokens = Number(responseBody.usage?.output_tokens ?? 0) || null;
    const actualCostJpy =
      actualInputTokens && actualOutputTokens
        ? estimateCostJpy(actualInputTokens, actualOutputTokens)
        : null;

    const translationUpdate = await admin
      .from("episode_translations")
      .update({
        source_language: TRANSLATION_SOURCE_LANGUAGE,
        target_language: TRANSLATION_TARGET_LANGUAGE,
        segment_version: TRANSLATION_SEGMENT_VERSION,
        status: "ready",
        segments: {
          version: TRANSLATION_SEGMENT_VERSION,
          sourceLanguage: TRANSLATION_SOURCE_LANGUAGE,
          targetLanguage: TRANSLATION_TARGET_LANGUAGE,
          segments: storedSegments,
        },
        translation_model: model,
        error_code: null,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", translationId);

    if (translationUpdate.error) {
      throw new Error("翻訳結果の保存に失敗しました: " + translationUpdate.error.message);
    }

    await admin
      .from("episode_translation_logs")
      .update({
        status: "success",
        success: true,
        actual_input_tokens: actualInputTokens,
        actual_output_tokens: actualOutputTokens,
        actual_cost_jpy: actualCostJpy,
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
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    const message = isTimeout
      ? "英語対訳の生成が3分以内に完了しませんでした。"
      : error instanceof Error
        ? error.message
        : "英語対訳の生成に失敗しました。";

    await markFailed({
      translationId,
      logId,
      errorCode: isTimeout ? "translation_timeout" : "translation_exception",
      errorMessage: message,
    });

    return NextResponse.json(
      {
        ok: false,
        error: isTimeout ? "translation_timeout" : "translation_exception",
        message,
      },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
