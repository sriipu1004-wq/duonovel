import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// Supabase admin, AI usage reservations, the translation reservation RPC, the OpenAI translator and
// the glossary writer are replaced in-process. OPENAI_API_KEY is a fake value; no network or DB access.

type Row = Record<string, unknown>;
const state = {
  action: { allowed: true } as Row,
  actionCalls: [] as unknown[][],
  releases: [] as string[],
  reservation: { data: [{ allowed: true, translation_id: "t-1", log_id: "l-1" }], error: null } as Row,
  reservationArgs: [] as Row[],
  translate: null as null | ((args: Row) => Promise<Row>),
  translateArgs: [] as Row[],
  glossaryArgs: [] as Row[],
  glossaryThrows: false,
  updates: [] as Array<{ table: string; values: Row; eq: unknown[] }>,
  translationUpdateError: null as { message: string } | null,
};

const admin = {
  from(table: string) {
    return {
      update(values: Row) {
        return {
          eq: async (...eq: unknown[]) => {
            state.updates.push({ table, values, eq });
            return { error: table === "episode_translations" && values.status === "ready" ? state.translationUpdateError : null };
          },
        };
      },
    };
  },
};

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
const is = (request: string, name: string) => request === `@/lib/${name}` || request.endsWith(`/lib/${name}`);
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (is(request, "supabase/admin")) return { createAdminClient: () => admin };
  if (is(request, "aiUsage/aiUsage.server")) {
    return {
      aiActionLimitMessage: (usage: Row, label: string) => `limit:${label}:${usage.limitReason ?? ""}`,
      reserveAiAction: async (args: Row) => (state.actionCalls.push(["daily", args]), state.action),
      reserveSubscriberAiCostOnly: async (args: Row) => (state.actionCalls.push(["subscriber", args]), state.action),
      releaseAiAction: async (id: string) => void state.releases.push(`daily:${id}`),
      releaseSubscriberAiCostOnly: async (id: string) => void state.releases.push(`subscriber:${id}`),
    };
  }
  if (is(request, "translation/translationReservationServer")) {
    return { reserveEpisodeTranslation: async (args: Row) => (state.reservationArgs.push(args), state.reservation) };
  }
  if (is(request, "translation/publicEpisodeTranslation")) {
    return {
      translatePublicEpisodeWithConsistency: async (args: Row) => {
        state.translateArgs.push(args);
        return state.translate!(args);
      },
    };
  }
  if (is(request, "translation/seriesTranslationGlossaryAutoServer")) {
    return {
      persistAiSeriesTranslationGlossaryCandidates: async (args: Row) => {
        state.glossaryArgs.push(args);
        if (state.glossaryThrows) throw new Error("glossary down");
      },
    };
  }
  if (is(request, "translation/episodeTranslationServer")) return { TRANSLATION_SEGMENT_VERSION: 3 };
  return originalLoad.call(this, request, parent, isMain);
};

const segments = [
  { id: "p0s0", sourceText: "猫だ。", translationInput: "猫だ。", paragraphIndex: 0, sentenceIndex: 0, startOffset: 0, endOffset: 3 },
  { id: "p0s1", sourceText: "犬だ。", translationInput: "犬だ。", paragraphIndex: 0, sentenceIndex: 1, startOffset: 3, endOffset: 6 },
];
const prepared = {
  access: {
    currentUserId: "user-1",
    seriesId: "s-1",
    episodeNumber: 4,
    series: { title: "  " },
    episode: { id: "ep-4", episode_title: "四" },
  },
  sourceLanguage: "ja",
  targetLanguage: "en",
  source: { normalizedSource: "猫だ。犬だ。", segments },
  sourceChars: 6,
  sourceHash: "hash-1",
  model: "gpt-4.1-mini",
  learningPreference: null,
  consistency: { glossaryTerms: [], profile: null, previousEpisode: null, referenceChars: 0 },
  estimatedTokens: { inputTokens: 100, outputTokens: 120 },
  estimatedCostJpy: 1.5,
};
const okTranslate = async () => ({
  segments: ["It is a cat.", "It is a dog."],
  inputTokens: 10,
  outputTokens: 20,
  retryCount: 1,
  batchCount: 1,
  glossaryCandidates: [{ sourceTerm: "猫", targetTerm: "cat", termType: "other" }],
});

function reset() {
  state.action = { allowed: true };
  state.actionCalls = [];
  state.releases = [];
  state.reservation = { data: [{ allowed: true, translation_id: "t-1", log_id: "l-1" }], error: null };
  state.reservationArgs = [];
  state.translate = okTranslate;
  state.translateArgs = [];
  state.glossaryArgs = [];
  state.glossaryThrows = false;
  state.updates = [];
  state.translationUpdateError = null;
}

async function main() {
  const savedKey = process.env.OPENAI_API_KEY;
  const savedInfo = console.info;
  const savedWarn = console.warn;
  const warnings: unknown[] = [];
  console.info = () => {};
  console.warn = (...args: unknown[]) => void warnings.push(args);
  try {
    const { executeEpisodeTranslationGeneration: execute } = await import(
      "../src/lib/translation/executeEpisodeTranslationGeneration"
    );
    const { OpenAITranslationError } = await import("../src/lib/translation/openAITranslation");
    const limits = await import("../src/lib/translation/episodeTranslationGenerateLimits");
    type Prepared = Parameters<typeof execute>[1];
    const request = new Request("http://localhost/api/translate", { method: "POST" });
    const run = (options?: { entitlementRuntime?: boolean }) => execute(request, prepared as unknown as Prepared, options);
    process.env.OPENAI_API_KEY = "fake-key";

    // Success: stored payload, log update, glossary candidates, action reservation kept.
    reset();
    const response = await run();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, status: "ready", translationId: "t-1", sourceHash: "hash-1", estimatedCostJpy: 1.5 });
    assert.equal(state.actionCalls[0][0], "daily");
    const requestId = (state.actionCalls[0][1] as Row).requestId as string;
    assert.match(requestId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(state.actionCalls[0][1], { request, requestId, actionType: "translation_generation", userId: "user-1" });
    assert.deepEqual(state.reservationArgs[0], {
      admin,
      requestId,
      episodeId: "ep-4",
      sourceHash: "hash-1",
      sourceLanguage: "ja",
      targetLanguage: "en",
      userId: "user-1",
      model: "gpt-4.1-mini",
      sourceChars: 6,
      estimatedInputTokens: 100,
      estimatedOutputTokens: 120,
      costEstimateJpy: 1.5,
      dailyMaxRequests: limits.EPISODE_TRANSLATION_LIMITS.dailyMaxRequests,
      dailyMaxEstimatedCostJpy: limits.EPISODE_TRANSLATION_LIMITS.dailyMaxEstimatedCostJpy,
    });
    assert.deepEqual(state.translateArgs[0], {
      apiKey: "fake-key",
      model: "gpt-4.1-mini",
      workTitle: "無題",
      episodeTitle: "四",
      sourceLanguage: "ja",
      targetLanguage: "en",
      learningPreference: null,
      consistency: prepared.consistency,
      segments: [{ id: "p0s0", text: "猫だ。" }, { id: "p0s1", text: "犬だ。" }],
    });
    assert.deepEqual(state.releases, []);
    const [translationUpdate, logUpdate] = state.updates;
    assert.equal(translationUpdate.table, "episode_translations");
    assert.deepEqual(translationUpdate.eq, ["id", "t-1"]);
    const { completed_at, updated_at, ...translationValues } = translationUpdate.values;
    assert.equal(completed_at, updated_at);
    assert.deepEqual(translationValues, {
      source_language: "ja",
      target_language: "en",
      segment_version: 3,
      status: "ready",
      segments: {
        version: 3,
        sourceLanguage: "ja",
        targetLanguage: "en",
        segments: [
          { id: "p0s0", sourceText: "猫だ。", translatedText: "It is a cat.", paragraphIndex: 0, sentenceIndex: 0, startOffset: 0, endOffset: 3 },
          { id: "p0s1", sourceText: "犬だ。", translatedText: "It is a dog.", paragraphIndex: 0, sentenceIndex: 1, startOffset: 3, endOffset: 6 },
        ],
      },
      translation_model: "gpt-4.1-mini",
      error_code: null,
    });
    assert.equal(logUpdate.table, "episode_translation_logs");
    assert.deepEqual(logUpdate.eq, ["id", "l-1"]);
    const { updated_at: _logUpdated, ...logValues } = logUpdate.values;
    assert.deepEqual(logValues, {
      status: "success",
      success: true,
      actual_input_tokens: 10,
      actual_output_tokens: 20,
      actual_cost_jpy: limits.estimateEpisodeTranslationActualCostJpy(10, 20, "gpt-4.1-mini"),
      retry_count: 1,
    });
    assert.deepEqual(state.glossaryArgs[0], {
      seriesId: "s-1",
      episodeId: "ep-4",
      episodeNumber: 4,
      sourceLanguage: "ja",
      targetLanguage: "en",
      currentSource: "猫だ。犬だ。",
      candidates: [{ sourceTerm: "猫", targetTerm: "cat", termType: "other" }],
    });

    // Missing token counts -> no actual cost. Glossary failure is only a warning.
    reset();
    state.glossaryThrows = true;
    state.translate = async () => ({ ...(await okTranslate()), inputTokens: 0 });
    assert.equal((await run()).status, 200);
    assert.equal(state.updates[1].values.actual_cost_jpy, null);
    assert.equal(warnings.length, 1);

    // Subscriber runtime uses the cost-only reservation and its release.
    reset();
    state.reservation = { data: null, error: { message: "rpc down" } };
    const rpcDown = await run({ entitlementRuntime: true });
    assert.equal(rpcDown.status, 503);
    assert.deepEqual(await rpcDown.json(), { ok: false, error: "translation_reservation_failed", message: "rpc down" });
    assert.equal(state.actionCalls[0][0], "subscriber");
    assert.deepEqual(state.actionCalls[0][1], { requestId: (state.actionCalls[0][1] as Row).requestId, actionType: "translation_generation", userId: "user-1" });
    assert.deepEqual(state.releases, [`subscriber:${(state.actionCalls[0][1] as Row).requestId}`]);

    // Action limit: 429, nothing reserved.
    for (const [entitlementRuntime, error] of [[false, "daily_action_limit"], [true, "subscriber_monthly_budget"]] as const) {
      reset();
      state.action = { allowed: false, used: 3, limit: 3, limitReason: "daily", monthlyBudgetUsed: 1, monthlyBudgetLimit: 2 };
      const limited = await run({ entitlementRuntime });
      assert.equal(limited.status, 429);
      assert.deepEqual(await limited.json(), { ok: false, error, message: "limit:対訳生成:daily", usage: state.action });
      assert.deepEqual(state.reservationArgs, []);
      assert.deepEqual(state.releases, []);
    }

    // Reservation outcomes (each releases the action reservation).
    const outcomes: Array<[Row, number, Row]> = [
      [{ data: { allowed: true, translation_id: "", log_id: "l" }, error: null }, 500, { ok: false, error: "translation_reservation_invalid" }],
      [{ data: [], error: null }, 500, { ok: false, error: "translation_reservation_invalid" }],
      [{ data: [{ allowed: "yes" }], error: null }, 500, { ok: false, error: "translation_reservation_invalid" }],
      [{ data: [{ allowed: false, result_type: "ready" }], error: null }, 200, { ok: true, status: "ready" }],
      [{ data: [{ allowed: false, result_type: "in_progress" }], error: null }, 202, { ok: true, status: "translating" }],
      [{ data: [{ allowed: false, result_type: "daily_request_limit" }], error: null }, 429, { ok: false, error: "daily_request_limit", message: "本日の対訳生成上限に達しました。" }],
      [{ data: { allowed: false, result_type: "daily_cost_limit" }, error: null }, 429, { ok: false, error: "daily_cost_limit", message: "本日の対訳生成上限に達しました。" }],
      [{ data: [{ allowed: false, result_type: "other" }], error: null }, 409, { ok: false, error: "translation_reservation_rejected" }],
    ];
    for (const [reservation, status, body] of outcomes) {
      reset();
      state.reservation = reservation;
      const result = await run();
      assert.equal(result.status, status, JSON.stringify(reservation));
      assert.deepEqual(await result.json(), body);
      assert.equal(state.releases.length, 1);
      assert.deepEqual(state.translateArgs, []);
    }

    // Missing API key: both rows marked failed and uncounted.
    reset();
    delete process.env.OPENAI_API_KEY;
    const noKey = await run();
    assert.equal(noKey.status, 500);
    assert.deepEqual(await noKey.json(), { ok: false, error: "missing_openai_api_key" });
    assert.equal(state.releases.length, 1);
    const strip = (values: Row) => {
      const { completed_at: _c, updated_at: _u, ...rest } = values;
      return rest;
    };
    assert.deepEqual(
      state.updates.map((u) => [u.table, strip(u.values), u.eq]),
      [
        ["episode_translations", { status: "failed", error_code: "missing_openai_api_key" }, ["id", "t-1"]],
        ["episode_translation_logs", { status: "failed", success: false, is_counted: false, error_code: "missing_openai_api_key", error_message: "OPENAI_API_KEY が設定されていません。", retry_count: 0 }, ["id", "l-1"]],
      ]
    );
    process.env.OPENAI_API_KEY = "fake-key";

    // Translator failures.
    const failures: Array<[() => Promise<Row>, number, string, string, number]> = [
      [async () => { const e = new OpenAITranslationError("bad gateway", 502); e.retryCount = 2; throw e; }, 502, "translation_openai_failed", "bad gateway", 2],
      [async () => { throw new OpenAITranslationError("slow", 504); }, 504, "translation_timeout", "対訳の一部が1分以内に完了しませんでした。", 0],
      [async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; }, 504, "translation_timeout", "対訳の一部が1分以内に完了しませんでした。", 0],
      [async () => { throw new Error("boom"); }, 500, "translation_exception", "boom", 0],
      [async () => { throw "string"; }, 500, "translation_exception", "対訳の生成に失敗しました。", 0],
      [async () => ({ ...(await okTranslate()), segments: ["ok", "  "] }), 500, "translation_exception", "対訳に空の文があります。", 0],
      [async () => ({ ...(await okTranslate()), segments: ["only one"] }), 500, "translation_exception", "対訳に空の文があります。", 0],
    ];
    for (const [translate, status, error, message, retryCount] of failures) {
      reset();
      state.translate = translate;
      const failed = await run();
      assert.equal(failed.status, status, error);
      assert.deepEqual(await failed.json(), { ok: false, error, message });
      const log = state.updates.find((u) => u.table === "episode_translation_logs")!;
      assert.equal(log.values.retry_count, retryCount);
      assert.equal(log.values.is_counted, false);
      assert.equal(state.releases.length, 1);
      assert.deepEqual(state.glossaryArgs, []);
    }

    // Storing the result fails: marked failed after the success writes.
    reset();
    state.translationUpdateError = { message: "write failed" };
    const storeFailed = await run();
    assert.equal(storeFailed.status, 500);
    assert.deepEqual(await storeFailed.json(), { ok: false, error: "translation_exception", message: "翻訳結果の保存に失敗しました: write failed" });
    assert.deepEqual(state.updates.map((u) => [u.table, u.values.status]), [
      ["episode_translations", "ready"],
      ["episode_translation_logs", "success"],
      ["episode_translations", "failed"],
      ["episode_translation_logs", "failed"],
    ]);
    assert.deepEqual(state.glossaryArgs, []);

    console.log("executeEpisodeTranslationGeneration characterization: PASS");
  } finally {
    moduleWithLoad._load = originalLoad;
    console.info = savedInfo;
    console.warn = savedWarn;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
