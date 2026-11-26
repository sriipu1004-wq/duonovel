import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// Supabase clients, next/headers, the access resolver, the registration gate and the
// series consistency reader are replaced in-process; no DB, OpenAI or network access.

type Access = Record<string, unknown> & { body: string; series: Record<string, unknown>; episode: { id: string } };
const state = {
  access: null as Access | null,
  accessCalls: [] as string[],
  cache: { data: null as unknown, error: null as { message: string } | null },
  cacheCalls: [] as unknown[][],
  consistencyCalls: [] as unknown[],
};

const admin = {
  from(table: string) {
    const calls: unknown[] = [table];
    state.cacheCalls.push(calls);
    const builder = {
      select: (columns: string) => (calls.push(["select", columns]), builder),
      eq: (column: string, value: unknown) => (calls.push(["eq", column, value]), builder),
      maybeSingle: async () => state.cache,
    };
    return builder;
  },
};

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
const is = (request: string, name: string) => request === `@/lib/${name}` || request.endsWith(`/lib/${name}`);
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "next/headers") return { headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) };
  if (is(request, "supabase/admin")) return { createAdminClient: () => admin };
  if (is(request, "supabase/server")) return { createClient: async () => ({}) };
  if (is(request, "contentRatingServer")) return { getCurrentR18ViewerPreference: async () => ({ showR18Content: false }) };
  if (is(request, "rights/regionRestriction.server")) {
    return { countryFromHeaders: () => null, isSeriesRegionBlockedForCountry: async () => false };
  }
  if (is(request, "auth/registrationGate.server")) {
    return { registrationRequiredJson: async (kind: string) => new Response(`registration:${kind}`, { status: 403 }) };
  }
  if (is(request, "translation/seriesTranslationConsistencyServer")) {
    return {
      resolveSeriesTranslationConsistency: async (args: unknown) => {
        state.consistencyCalls.push(args);
        return { referenceChars: 100, marker: "consistency" };
      },
    };
  }
  if (is(request, "translation/episodeTranslationServer")) {
    // Real pure helpers; only the access resolver is replaced.
    const real = originalLoad.call(this, request, parent, isMain) as Record<string, unknown>;
    return {
      ...real,
      resolveEpisodeTranslationAccess: async (id: string) => (state.accessCalls.push(id), state.access),
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const BODY = "吾輩は猫である。名前はまだ無い。";
function baseAccess(): Access {
  return {
    canRead: true,
    body: BODY,
    registrationBlocked: false,
    sourceLanguage: "ja",
    isAllowlisted: true,
    series: { id: "s-1", translation_permission_mode: "open", effect_settings: null },
    episode: { id: "ep-1" },
  };
}
const post = (body: unknown) =>
  new Request("http://localhost/api/translate", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function expectResponse(
  result: { response?: Response; prepared?: unknown },
  status: number,
  json?: Record<string, unknown>
) {
  assert.ok(result.response, "expected a response");
  assert.equal(result.prepared, undefined);
  assert.equal(result.response.status, status);
  if (json) assert.deepEqual(await result.response.json(), json);
}

async function main() {
  const savedEnabled = process.env.EPISODE_TRANSLATION_ENABLED;
  const savedModel = process.env.EPISODE_TRANSLATION_MODEL;
  const savedMax = process.env.EPISODE_TRANSLATION_MAX_SOURCE_CHARS;
  delete process.env.EPISODE_TRANSLATION_ENABLED;
  delete process.env.EPISODE_TRANSLATION_MAX_SOURCE_CHARS;
  const savedInfo = console.info;
  console.info = () => {};
  try {
    const { prepareEpisodeTranslationGeneration: prepare } = await import(
      "../src/lib/translation/prepareEpisodeTranslationGeneration"
    );
    const server = await import("../src/lib/translation/episodeTranslationServer");
    const { DEFAULT_TRANSLATION_MODEL } = await import("../src/lib/translation/openAITranslationModel");
    const invalid = { ok: false, error: "invalid_request" };

    // Request validation (before any access lookup).
    await expectResponse(await prepare(post("{bad json")), 400, invalid);
    await expectResponse(await prepare(post({})), 400, invalid);
    await expectResponse(await prepare(post({ episodeId: "  " })), 400, invalid);
    await expectResponse(await prepare(post({ episodeId: "ep-1", targetLanguage: "ja" })), 400, invalid);
    await expectResponse(await prepare(post({ episodeId: "ep-1", sourceLanguage: "xx" })), 400, invalid);
    assert.deepEqual(state.accessCalls, []);

    // Access checks.
    state.access = null;
    await expectResponse(await prepare(post({ episodeId: " ep-1 " })), 404, { ok: false, error: "episode_not_found" });
    assert.deepEqual(state.accessCalls, ["ep-1"]);
    state.access = { ...baseAccess(), canRead: false };
    await expectResponse(await prepare(post({ episodeId: "ep-1" })), 404);
    state.access = { ...baseAccess(), body: "  \n " };
    await expectResponse(await prepare(post({ episodeId: "ep-1" })), 404);
    state.access = { ...baseAccess(), registrationBlocked: true };
    const blocked = await prepare(post({ episodeId: "ep-1" }));
    await expectResponse(blocked, 403);
    state.access = { ...baseAccess(), sourceLanguage: "en" };
    await expectResponse(await prepare(post({ episodeId: "ep-1" })), 400, { ok: false, error: "invalid_source_language" });
    state.access = { ...baseAccess(), sourceLanguage: null };
    await expectResponse(await prepare(post({ episodeId: "ep-1" })), 400, { ok: false, error: "invalid_source_language" });
    state.access = { ...baseAccess(), series: { id: "s-1", translation_permission_mode: "closed" } };
    await expectResponse(await prepare(post({ episodeId: "ep-1" })), 403, {
      ok: false,
      error: "translation_permission_closed",
      message: "この作品では翻訳が許可されていません。",
    });
    state.access = { ...baseAccess(), isAllowlisted: false };
    await expectResponse(await prepare(post({ episodeId: "ep-1" })), 403, {
      ok: false,
      error: "translation_episode_not_eligible",
      message: "この話では対訳を生成できません。",
    });
    assert.deepEqual(state.cacheCalls, []);

    // Source too long (non Public Domain limit 8000 by default).
    state.access = { ...baseAccess(), body: "あ".repeat(8001) };
    await expectResponse(await prepare(post({ episodeId: "ep-1" })), 413, {
      ok: false,
      error: "translation_source_too_long",
      maxSourceChars: 8000,
    });

    // Cache lookup: ready / translating / storage error.
    state.access = baseAccess();
    const expectedHash = server.buildEpisodeTranslationSourceHash(BODY, undefined);
    state.cache = { data: { id: "t-1", status: "ready" }, error: null };
    await expectResponse(await prepare(post({ episodeId: "ep-1" })), 200, { ok: true, status: "ready" });
    assert.deepEqual(state.cacheCalls.at(-1), [
      "episode_translations",
      ["select", "id, status"],
      ["eq", "episode_id", "ep-1"],
      ["eq", "source_language", "ja"],
      ["eq", "target_language", "en"],
      ["eq", "source_hash", expectedHash],
    ]);
    state.cache = { data: { id: "t-1", status: "translating" }, error: null };
    await expectResponse(await prepare(post({ episodeId: "ep-1" })), 202, { ok: true, status: "translating" });
    state.cache = { data: null, error: { message: "db down" } };
    await expectResponse(await prepare(post({ episodeId: "ep-1" })), 503, {
      ok: false,
      error: "translation_storage_unavailable",
      message: "db down",
    });
    assert.deepEqual(state.consistencyCalls, []);

    // Prepared: failed (or missing) cache rows continue to generation.
    delete process.env.EPISODE_TRANSLATION_MODEL;
    state.cache = { data: { id: "t-1", status: "failed" }, error: null };
    const result = await prepare(post({ episodeId: "ep-1" }));
    assert.equal(result.response, undefined);
    const prepared = result.prepared!;
    const expectedSource = server.buildEpisodeTranslationSource(BODY, "ja");
    assert.equal(prepared.access, state.access);
    assert.equal(prepared.sourceLanguage, "ja");
    assert.equal(prepared.targetLanguage, "en");
    assert.deepEqual(prepared.source, expectedSource);
    assert.equal(prepared.sourceChars, expectedSource.normalizedSource.length);
    assert.equal(prepared.sourceHash, expectedHash);
    assert.equal(prepared.model, DEFAULT_TRANSLATION_MODEL);
    assert.equal(prepared.learningPreference, null);
    assert.deepEqual(prepared.consistency, { referenceChars: 100, marker: "consistency" });
    assert.ok(prepared.estimatedTokens.inputTokens > 0);
    assert.ok(prepared.estimatedTokens.outputTokens > 0);
    assert.equal(typeof prepared.estimatedCostJpy, "number");
    assert.deepEqual(state.consistencyCalls.at(-1), {
      access: state.access,
      sourceLanguage: "ja",
      targetLanguage: "en",
      currentSource: expectedSource.normalizedSource,
    });

    // Model from env; learning preference kept only when its language is the target.
    process.env.EPISODE_TRANSLATION_MODEL = "fake-model";
    state.cache = { data: null, error: null };
    state.access = {
      ...baseAccess(),
      series: {
        id: "s-1",
        translation_permission_mode: "open",
        effectSettings: { request: { language: "en", level: "beginner" } },
      },
    };
    const withPref = (await prepare(post({ episodeId: "ep-1" }))).prepared!;
    assert.equal(withPref.model, "fake-model");
    assert.deepEqual(withPref.learningPreference, { language: "en", level: "beginner" });
    assert.equal(
      withPref.sourceHash,
      server.buildEpisodeTranslationSourceHash(BODY, { learningPreference: { language: "en", level: "beginner" } })
    );
    assert.notEqual(withPref.sourceHash, expectedHash);
    const otherTarget = (await prepare(post({ episodeId: "ep-1", targetLanguage: "ko" }))).prepared!;
    assert.equal(otherTarget.targetLanguage, "ko");
    assert.equal(otherTarget.learningPreference, null);
    assert.equal(otherTarget.sourceHash, expectedHash);

    console.log("prepareEpisodeTranslationGeneration characterization: PASS");
  } finally {
    moduleWithLoad._load = originalLoad;
    console.info = savedInfo;
    for (const [name, value] of [
      ["EPISODE_TRANSLATION_ENABLED", savedEnabled],
      ["EPISODE_TRANSLATION_MODEL", savedModel],
      ["EPISODE_TRANSLATION_MAX_SOURCE_CHARS", savedMax],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
