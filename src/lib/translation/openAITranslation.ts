import {
  getSupportedLanguage,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

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

export type OpenAITranslationSourceSegment = {
  id: string;
  text: string;
};

export type OpenAITranslationResult = {
  segments: string[];
  inputTokens: number | null;
  outputTokens: number | null;
  batchCount: number;
  retryCount: number;
};

type TranslationBatch = {
  segments: OpenAITranslationSourceSegment[];
  sourceChars: number;
};

const MAX_BATCH_SOURCE_CHARS = 900;
const MAX_BATCH_SEGMENTS = 20;
const MAX_PARALLEL_BATCHES = 3;
const BATCH_TIMEOUT_MS = 60_000;

export class OpenAITranslationError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  retryCount: number;

  constructor(message: string, status = 502, retryable = false) {
    super(message);
    this.name = "OpenAITranslationError";
    this.status = status;
    this.retryable = retryable;
    this.retryCount = 0;
  }
}

function translationLabel(): string {
  return "対訳";
}

function hasLexicalContent(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value);
}

function hasResidualSourceScript(
  value: string,
  sourceLanguage: SupportedLanguageTag,
  targetLanguage: SupportedLanguageTag
): boolean {
  return (
    sourceLanguage === "ja" &&
    targetLanguage !== "ja" &&
    /[ぁ-ゖゝゞァ-ヺヽヾー]/u.test(value)
  );
}

function shouldPreserveVerbatim(
  segment: OpenAITranslationSourceSegment,
  sourceLanguage: SupportedLanguageTag
): boolean {
  const value = segment.text.trim();
  if (!value || !/\p{L}/u.test(value)) return true;

  return (
    sourceLanguage === "ja" &&
    /[A-Za-z]/u.test(value) &&
    !/[一-龯々〆ヵヶぁ-ゖァ-ヺー]/u.test(value)
  );
}

function collectRecurringTerms(
  segments: OpenAITranslationSourceSegment[]
): string[] {
  const counts = new Map<string, number>();

  for (const segment of segments) {
    const terms = new Set(
      segment.text.match(/[ァ-ヺー]{2,}|[A-Z][A-Z0-9'-]{3,}/gu) ?? []
    );

    for (const term of terms) {
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort(([leftTerm, leftCount], [rightTerm, rightCount]) =>
      rightCount - leftCount || leftTerm.localeCompare(rightTerm)
    )
    .slice(0, 24)
    .map(([term]) => term);
}

function splitTranslationBatches(
  segments: OpenAITranslationSourceSegment[]
): TranslationBatch[] {
  const batches: TranslationBatch[] = [];
  let currentSegments: OpenAITranslationSourceSegment[] = [];
  let currentChars = 0;

  const flush = () => {
    if (currentSegments.length === 0) return;
    batches.push({ segments: currentSegments, sourceChars: currentChars });
    currentSegments = [];
    currentChars = 0;
  };

  for (const segment of segments) {
    const segmentChars = segment.text.length;
    const exceedsBatch =
      currentSegments.length > 0 &&
      (currentSegments.length >= MAX_BATCH_SEGMENTS ||
        currentChars + segmentChars > MAX_BATCH_SOURCE_CHARS);

    if (exceedsBatch) flush();

    currentSegments.push(segment);
    currentChars += segmentChars;
  }

  flush();
  return batches;
}

function calculateBatchMaxOutputTokens(
  model: string,
  sourceChars: number,
  segmentCount: number
): number {
  const modelCeiling = model.startsWith("gpt-4.1") ? 16000 : 24000;
  return Math.min(
    modelCeiling,
    Math.max(10000, Math.ceil(sourceChars * 6 + segmentCount * 40))
  );
}

function assertOpenAIResponseComplete(responseBody: OpenAIResponseBody): void {
  const label = translationLabel();

  if (responseBody.status === "incomplete") {
    if (responseBody.incomplete_details?.reason === "max_output_tokens") {
      throw new OpenAITranslationError(
        label + "の一部が出力上限で途中までになりました。自動的に再試行します。",
        502,
        true
      );
    }

    if (responseBody.incomplete_details?.reason === "content_filter") {
      throw new OpenAITranslationError(
        label + "の生成がコンテンツ判定により途中で停止しました。",
        422,
        false
      );
    }

    throw new OpenAITranslationError(
      label + "の生成が完了しませんでした。",
      502,
      true
    );
  }

  if (responseBody.status && responseBody.status !== "completed") {
    throw new OpenAITranslationError(
      label + "の生成が完了しませんでした。",
      502,
      true
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
    throw new OpenAITranslationError(
      translationLabel() + "サーバーの応答を読み取れませんでした。",
      response.ok ? 502 : response.status,
      true
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
  outputText: string,
  expectedSegments: OpenAITranslationSourceSegment[],
  sourceLanguage: SupportedLanguageTag,
  targetLanguage: SupportedLanguageTag
): string[] {
  const label = translationLabel();
  let value: unknown;

  try {
    value = JSON.parse(outputText) as unknown;
  } catch {
    throw new OpenAITranslationError(
      label + "の生成結果が途中で切れました。",
      502,
      true
    );
  }

  if (!value || typeof value !== "object") {
    throw new OpenAITranslationError(
      label + "の生成結果を読み取れませんでした。",
      502,
      true
    );
  }

  const root = value as Record<string, unknown>;
  if (
    !root.translations ||
    typeof root.translations !== "object" ||
    Array.isArray(root.translations)
  ) {
    throw new OpenAITranslationError(
      label + "の生成結果にtranslationsがありません。",
      502,
      true
    );
  }

  const translations = root.translations as Record<string, unknown>;
  const expectedIds = expectedSegments.map((segment) => segment.id);
  const actualIds = Object.keys(translations);

  if (
    actualIds.length !== expectedIds.length ||
    expectedIds.some((id) => !Object.prototype.hasOwnProperty.call(translations, id))
  ) {
    throw new OpenAITranslationError(
      label + "の文数が原文と一致しません。",
      502,
      true
    );
  }

  const translated = expectedSegments.map((segment) => {
    const item = translations[segment.id];
    return typeof item === "string" ? item.trim() : "";
  });

  if (translated.some((item) => !item)) {
    throw new OpenAITranslationError(
      label + "に空の文が含まれました。",
      502,
      true
    );
  }

  if (
    translated.some(
      (item, index) =>
        hasLexicalContent(expectedSegments[index]?.text ?? "") &&
        !hasLexicalContent(item)
    )
  ) {
    throw new OpenAITranslationError(
      label + "に内容のない文が含まれました。",
      502,
      true
    );
  }

  if (
    translated.some((item) =>
      hasResidualSourceScript(item, sourceLanguage, targetLanguage)
    )
  ) {
    throw new OpenAITranslationError(
      label + "に原文の文字が残っています。",
      502,
      true
    );
  }

  return translated;
}

async function translateBatch(args: {
  apiKey: string;
  model: string;
  workTitle: string;
  episodeTitle?: string;
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
  batch: TranslationBatch;
  batchIndex: number;
  batchCount: number;
  recurringTerms: string[];
  retryAttempt?: number;
}): Promise<TranslationOutput & { inputTokens: number; outputTokens: number }> {
  let response: Response;
  const sourceLanguage = getSupportedLanguage(args.sourceLanguage);
  const targetLanguage = getSupportedLanguage(args.targetLanguage);
  const label = translationLabel();

  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + args.apiKey,
      },
      signal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
      body: JSON.stringify({
        model: args.model,
        temperature: args.model.startsWith("gpt-4") ? 0 : undefined,
        reasoning: args.model.startsWith("gpt-5")
          ? { effort: "minimal" }
          : undefined,
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text:
                  `You are a literary translator. Translate fiction from ${sourceLanguage.label} (${sourceLanguage.tag}) into natural, modern, neutral ${targetLanguage.label} (${targetLanguage.tag}). Preserve meaning, grammatical roles, speakers, tense, names, paragraph intent, punctuation intent, and omissions. The work may be split into independent batches, so use one standard target-language spelling for each recurring proper name or identifier and never alternate spellings. Use phonetic transliteration for personal names where the target language conventionally transliterates them. If a segment is already written entirely in a third language rather than ${sourceLanguage.label}, preserve that segment verbatim to retain the story's language contrast. Do not add explanations or remove content. Never return an empty or whitespace-only translation. Return only the requested structured JSON.`,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  "Work title: " + args.workTitle,
                  args.episodeTitle
                    ? "Episode title: " + args.episodeTitle
                    : null,
                  `Translation batch: ${args.batchIndex + 1}/${args.batchCount}`,
                  "Translate every segment in exactly the same order.",
                  `Return exactly one non-empty ${targetLanguage.label} string under each supplied segment id.`,
                  args.recurringTerms.length > 0
                    ? "Recurring source terms from the full work: " +
                      JSON.stringify(args.recurringTerms)
                    : null,
                  args.recurringTerms.length > 0
                    ? "Use one identical target rendering for every occurrence of each recurring term."
                    : null,
                  args.sourceLanguage === "ja" && args.targetLanguage !== "ja"
                    ? "Do not leave Japanese hiragana or katakana in any translation. Translate or transliterate every Japanese word completely."
                    : null,
                  args.targetLanguage === "fr"
                    ? "For a Japanese first-person narrator whose gender is not stated, avoid gender-marked agreement where natural; when unavoidable, use masculine agreement consistently in every batch. Keep explicitly female characters feminine and explicitly male characters masculine. Never switch a character's grammatical gender, subject, or pronoun."
                    : null,
                  (args.retryAttempt ?? 0) > 0
                    ? "The previous attempt failed validation. Translate every id independently; never use an ellipsis or other placeholder for a segment that contains words, and remove every remaining source-language fragment."
                    : null,
                  "If a segment contains only punctuation or a symbol, preserve an appropriate non-empty representation.",
                  "Source-language readings and editorial annotations have already been normalized for translation input.",
                  "Segments:",
                  JSON.stringify(args.batch.segments),
                ]
                  .filter((line): line is string => typeof line === "string")
                  .join("\n"),
              },
            ],
          },
        ],
        max_output_tokens: calculateBatchMaxOutputTokens(
          args.model,
          args.batch.sourceChars,
          args.batch.segments.length
        ),
        text: {
          format: {
            type: "json_schema",
            name: "translation_batch",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                translations: {
                  type: "object",
                  additionalProperties: false,
                  properties: Object.fromEntries(
                    args.batch.segments.map((segment) => [
                      segment.id,
                      { type: "string", pattern: "\\S" },
                    ])
                  ),
                  required: args.batch.segments.map((segment) => segment.id),
                },
              },
              required: ["translations"],
            },
          },
        },
      }),
    });
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    throw new OpenAITranslationError(
      isTimeout
        ? label + "の一部が1分以内に完了しませんでした。"
        : label + "サーバーに接続できませんでした。",
      isTimeout ? 504 : 502,
      true
    );
  }

  const responseBody = await readOpenAIResponseBody(response);

  if (!response.ok) {
    throw new OpenAITranslationError(
      responseBody.error?.message ?? label + "の生成に失敗しました。",
      response.status,
      response.status === 408 ||
        response.status === 409 ||
        response.status === 429 ||
        response.status >= 500
    );
  }

  assertOpenAIResponseComplete(responseBody);

  const outputText = extractOutputText(responseBody);
  if (!outputText) {
    throw new OpenAITranslationError(
      label + "の生成結果が空でした。",
      502,
      true
    );
  }

  return {
    segments: validateTranslationOutput(
      outputText,
      args.batch.segments,
      args.sourceLanguage,
      args.targetLanguage
    ),
    inputTokens: Number(responseBody.usage?.input_tokens ?? 0) || 0,
    outputTokens: Number(responseBody.usage?.output_tokens ?? 0) || 0,
  };
}

async function translateBatchWithRetry(
  args: Parameters<typeof translateBatch>[0],
  onRetry?: () => void
): Promise<
  Awaited<ReturnType<typeof translateBatch>> & { retryCount: number }
> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await translateBatch({
        ...args,
        retryAttempt: attempt,
      });
      return { ...result, retryCount: attempt };
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof OpenAITranslationError ? error.retryable : false;

      if (!retryable || attempt === 1) {
        if (error instanceof OpenAITranslationError) {
          error.retryCount = attempt;
        }
        throw error;
      }
      onRetry?.();
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  throw lastError;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await mapper(item, index);
    }
  };

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function translateSegmentsInBatches(args: {
  apiKey: string;
  model: string;
  workTitle: string;
  episodeTitle?: string;
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
  segments: OpenAITranslationSourceSegment[];
}): Promise<OpenAITranslationResult> {
  const label = translationLabel();

  if (args.segments.length === 0) {
    throw new Error(label + "の原文がありません。");
  }

  const translatableSegments = args.segments.filter(
    (segment) => !shouldPreserveVerbatim(segment, args.sourceLanguage)
  );
  const batches = splitTranslationBatches(translatableSegments);
  const recurringTerms = collectRecurringTerms(args.segments);
  let attemptedRetries = 0;
  let batchResults: Awaited<ReturnType<typeof translateBatchWithRetry>>[];

  try {
    batchResults = await mapWithConcurrency(
      batches,
      MAX_PARALLEL_BATCHES,
      (batch, batchIndex) =>
        translateBatchWithRetry(
          {
            apiKey: args.apiKey,
            model: args.model,
            workTitle: args.workTitle,
            episodeTitle: args.episodeTitle,
            sourceLanguage: args.sourceLanguage,
            targetLanguage: args.targetLanguage,
            batch,
            batchIndex,
            batchCount: batches.length,
            recurringTerms,
          },
          () => {
            attemptedRetries += 1;
          }
        )
    );
  } catch (error) {
    if (error instanceof OpenAITranslationError) {
      error.retryCount = attemptedRetries;
    }
    throw error;
  }

  const translatedById = new Map<string, string>();
  batches.forEach((batch, batchIndex) => {
    const batchResult = batchResults[batchIndex];
    batch.segments.forEach((segment, segmentIndex) => {
      const translated = batchResult?.segments[segmentIndex];
      if (translated) translatedById.set(segment.id, translated);
    });
  });

  const segments = args.segments.map((segment) =>
    shouldPreserveVerbatim(segment, args.sourceLanguage)
      ? segment.text.trim()
      : translatedById.get(segment.id) ?? ""
  );
  if (
    segments.length !== args.segments.length ||
    segments.some((item) => !item.trim())
  ) {
    throw new OpenAITranslationError(
      label + "の結合結果が原文と一致しません。",
      502,
      true
    );
  }

  const inputTokens = batchResults.reduce(
    (total, result) => total + result.inputTokens,
    0
  );
  const outputTokens = batchResults.reduce(
    (total, result) => total + result.outputTokens,
    0
  );
  const retryCount = batchResults.reduce(
    (total, result) => total + result.retryCount,
    0
  );

  return {
    segments,
    inputTokens: inputTokens || null,
    outputTokens: outputTokens || null,
    batchCount: batches.length,
    retryCount,
  };
}
