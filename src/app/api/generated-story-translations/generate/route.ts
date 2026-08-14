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

export const runtime = "nodejs";
export const maxDuration = 300;

type OpenAIResponseBody = {
  status?: string;
  incomplete_details?: {
    reason?: string;
  } | null;
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
  segments: string[];
};

type StoredTranslationPayload = {
  version?: number;
  sourceLanguage?: string;
  targetLanguage?: string;
  segments?: unknown[];
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

function calculateMaxOutputTokens(
  sourceChars: number,
  segmentCount: number
): number {
  return Math.min(
    24000,
    Math.max(4000, Math.ceil(sourceChars * 2.5 + segmentCount * 12))
  );
}

function assertOpenAIResponseComplete(responseBody: OpenAIResponseBody): void {
  if (responseBody.status === "incomplete") {
    if (responseBody.incomplete_details?.reason === "max_output_tokens") {
      throw new Error(
        "英語対訳の生成結果が出力上限で途中までになりました。もう一度お試しください。"
      );
    }

    if (responseBody.incomplete_details?.reason === "content_filter") {
      throw new Error(
        "英語対訳の生成がコンテンツ判定により途中で停止しました。"
      );
    }

    throw new Error("英語対訳の生成が完了しませんでした。");
  }

  if (responseBody.status && responseBody.status !== "completed") {
    throw new Error("英語対訳の生成が完了しませんでした。");
  }
}

function parseTranslationJson(outputText: string): unknown {
  try {
    return JSON.parse(outputText) as unknown;
  } catch {
    throw new Error(
      "英語対訳の生成結果が途中で切れました。もう一度お試しください。"
    );
  }
}

async function readOpenAIResponseBody(
  response: Response
): Promise<OpenAIResponseBody> {
  const responseText = await response.text();

  try {
    return JSON.parse(responseText) as OpenAIResponseBody;
  } catch {
    throw new Error(
      "英語対訳の応答が途中で切れました。もう一度お試しください。"
    );
  }
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

  const segments: TranslationOutput["segments"] = [];

  root.segments.forEach((item) => {
    const en = typeof item === "string" ? item.trim() : "";

    if (!en) {
      throw new Error("英語対訳に空のsegmentがあります。");
    }

    segments.push(en);
  });

  return { segments };
}

function readStoredSegments(value: unknown): unknown[] | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as StoredTranslationPayload;
  return Array.isArray(payload.segments) ? payload.segments : null;
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
        updated_at: now,
      })
      .eq("id", args.logId),
  ]);
}

async function readReadyTranslation(args: {
  storyId: string;
  sourceHash: string;
}) {
  const admin = createAdminClient();
  const result = await admin
    .from("generated_story_translations")
    .select("id, status, segments, expires_at")
    .eq("story_id", args.storyId)
    .eq("target_language", TRANSLATION_TARGET_LANGUAGE)
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

  if (
    !storyId ||
    storyId.length > 100 ||
    !/^[A-Za-z0-9-]+$/u.test(storyId) ||
    !title ||
    !body
  ) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
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

  const source = buildEpisodeTranslationSource(body);
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
  const existing = await readReadyTranslation({ storyId, sourceHash });

  if (existing?.status === "ready") {
    const segments = readStoredSegments(existing.segments);
    if (segments) {
      return NextResponse.json({
        ok: true,
        status: "ready",
        sourceHash,
        segments,
      });
    }
  }

  if (existing?.status === "translating") {
    return NextResponse.json(
      { ok: true, status: "translating", sourceHash },
      { status: 202 }
    );
  }

  const model = process.env.EPISODE_TRANSLATION_MODEL ?? "gpt-5-mini";
  const estimatedTokens = estimateTokens(sourceChars);
  const estimatedCostJpy = estimateCostJpy(
    estimatedTokens.inputTokens,
    estimatedTokens.outputTokens
  );
  const userId = await currentUserId();
  const admin = createAdminClient();
  const requestId = randomUUID();

  const reservationResult = await admin.rpc("reserve_generated_story_translation", {
    p_request_id: requestId,
    p_story_id: storyId,
    p_source_hash: sourceHash,
    p_target_language: TRANSLATION_TARGET_LANGUAGE,
    p_user_id: userId,
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
      const ready = await readReadyTranslation({ storyId, sourceHash });
      const segments = readStoredSegments(ready?.segments);
      if (segments) {
        return NextResponse.json({
          ok: true,
          status: "ready",
          sourceHash,
          segments,
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

    return NextResponse.json({ ok: false, error: "missing_openai_api_key" }, { status: 500 });
  }

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
        reasoning: model.startsWith("gpt-5") ? { effort: "minimal" } : undefined,
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
                  "Work title: " + title,
                  "Translate every segment in exactly the same order.",
                  "Return only one English string for each input segment; do not return ids.",
                  "Aozora ruby readings and editorial notes have already been normalized for translation input.",
                  "Segments:",
                  JSON.stringify(inputSegments),
                ].join("\n"),
              },
            ],
          },
        ],
        max_output_tokens: calculateMaxOutputTokens(
          sourceChars,
          source.segments.length
        ),
        text: {
          format: {
            type: "json_schema",
            name: "generated_story_translation",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                segments: {
                  type: "array",
                  minItems: source.segments.length,
                  maxItems: source.segments.length,
                  items: { type: "string" },
                },
              },
              required: ["segments"],
            },
          },
        },
      }),
    });

    const responseBody = await readOpenAIResponseBody(openAIResponse);

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

    assertOpenAIResponseComplete(responseBody);

    const outputText = extractOutputText(responseBody);
    if (!outputText) {
      throw new Error("英語対訳の生成結果が空でした。");
    }

    const translated = validateTranslationOutput(
      parseTranslationJson(outputText),
      source.segments
    );
    const storedSegments = source.segments.map((segment, index) => ({
      id: segment.id,
      ja: segment.ja,
      en: translated.segments[index] ?? "",
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
      .from("generated_story_translations")
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
        updated_at: now,
      })
      .eq("id", logId);

    return NextResponse.json({
      ok: true,
      status: "ready",
      sourceHash,
      segments: storedSegments,
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
