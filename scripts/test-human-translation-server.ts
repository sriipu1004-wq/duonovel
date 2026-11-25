import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// Supabase clients and next/headers are replaced in-process; no DB access. Synthetic text only.

const state = {
  queries: [] as unknown[][],
  result: { data: [] as unknown[] | null, error: null as { message: string } | null },
};
const adminStub = {
  createAdminClient: () => ({
    from(table: string) {
      const calls: unknown[] = [table];
      state.queries.push(calls);
      const builder = {
        select: (columns: string) => (calls.push(["select", columns]), builder),
        eq: (column: string, value: unknown) => (calls.push(["eq", column, value]), builder),
        limit: async (count: number) => (calls.push(["limit", count]), state.result),
      };
      return builder;
    },
  }),
};

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase/admin" || request.endsWith("/lib/supabase/admin")) return adminStub;
  if (request === "@/lib/supabase/server" || request.endsWith("/lib/supabase/server")) {
    return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }) };
  }
  if (request === "next/headers") return { headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) };
  return originalLoad.call(this, request, parent, isMain);
};

const segment = (id: string, sourceText: string, index: number) => ({
  id,
  sourceText,
  paragraphIndex: 0,
  sentenceIndex: index,
  startOffset: index * 10,
  endOffset: index * 10 + sourceText.length,
});

async function main() {
  try {
    const server = await import("../src/lib/translation/humanTranslationServer");
    const { buildEpisodeTranslationSourceHash } = await import("../src/lib/translation/episodeTranslationServer");

    assert.equal(server.isHumanTranslationPermissionOpen({ human_translation_permission_mode: "open" }), true);
    assert.equal(server.isHumanTranslationPermissionOpen({ human_translation_permission_mode: "closed" }), false);
    assert.equal(server.isHumanTranslationPermissionOpen({}), false);

    const sourceSegments = [segment("s0", "猫だ。", 0), segment("s1", "犬だ。", 1), segment("s2", "猫だ。", 2), segment("s3", "鳥だ。", 3)];

    // Draft rebuild reuses previous translations only for source sentences that are unique on both sides.
    const previousPayload = {
      sourceLanguage: "ja",
      targetLanguage: "en",
      segments: [
        { ...segment("old0", "犬だ。", 0), translatedText: "A dog." },
        { ...segment("old1", "猫だ。", 1), translatedText: "A cat." },
        { ...segment("old2", "鳥だ。", 2), translatedText: "Bird." },
        { ...segment("old3", "鳥だ。", 3), translatedText: "Bird again." },
        { id: "broken", sourceText: "x" },
      ],
    };
    const draft = server.buildHumanDraftPayload({ sourceLanguage: "ja", targetLanguage: "en", sourceSegments, previousPayload });
    assert.equal(draft.version, 3);
    assert.equal(draft.sourceLanguage, "ja");
    assert.equal(draft.targetLanguage, "en");
    assert.deepEqual(draft.segments.map((item) => [item.id, item.translatedText]), [
      ["s0", ""], // duplicated in the new source
      ["s1", "A dog."],
      ["s2", ""],
      ["s3", ""], // duplicated in the previous payload
    ]);
    assert.deepEqual(
      server.buildHumanDraftPayload({ sourceLanguage: "ja", targetLanguage: "en", sourceSegments, previousPayload: "junk" }).segments.map((item) => item.translatedText),
      ["", "", "", ""]
    );

    const fromTranslations = server.buildHumanDraftPayloadFromTranslations({
      sourceLanguage: "ja",
      targetLanguage: "ko",
      sourceSegments,
      translations: { s0: "고양이", s3: "새", s1: 5 as unknown as string },
    });
    assert.deepEqual(fromTranslations.segments.map((item) => item.translatedText), ["고양이", "", "", "새"]);

    // Publish validation: same segment structure, every sentence translated, current version.
    const full = server.buildHumanDraftPayloadFromTranslations({
      sourceLanguage: "ja",
      targetLanguage: "en",
      sourceSegments,
      translations: { s0: "Cat.", s1: "Dog.", s2: "Cat.", s3: "Bird." },
    });
    const validate = (payload: unknown, segments = sourceSegments) =>
      server.validatePublishableHumanPayload({ payload, sourceLanguage: "ja", targetLanguage: "en", sourceSegments: segments });
    assert.deepEqual(validate(full), full);
    assert.equal(validate({ ...full, version: 2 }), null);
    assert.equal(validate({ ...full, targetLanguage: "ko" }), null);
    assert.equal(validate(full, sourceSegments.slice(0, 3)), null);
    assert.equal(validate({ ...full, segments: full.segments.map((item, i) => (i === 1 ? { ...item, translatedText: "  " } : item)) }), null);
    assert.equal(validate({ ...full, segments: full.segments.map((item, i) => (i === 2 ? { ...item, startOffset: 99 } : item)) }), null);
    assert.equal(validate(null), null);

    // Published check is scoped to the current source hash.
    const body = "猫だ。犬だ。";
    state.result = { data: [{ id: "t1" }], error: null };
    assert.equal(await server.hasCurrentPublishedHumanTranslation({ episodeId: "episode-1", body }), true);
    assert.deepEqual(state.queries.at(-1), [
      "episode_human_translations",
      ["select", "id"],
      ["eq", "episode_id", "episode-1"],
      ["eq", "status", "published"],
      ["eq", "published_source_hash", buildEpisodeTranslationSourceHash(body)],
      ["limit", 1],
    ]);
    state.result = { data: [], error: null };
    assert.equal(await server.hasCurrentPublishedHumanTranslation({ episodeId: "episode-1", body }), false);
    state.result = { data: [{ id: "t1" }], error: { message: "x" } };
    assert.equal(await server.hasCurrentPublishedHumanTranslation({ episodeId: "episode-1", body }), false);
  } finally {
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: human translation server helpers (permission, draft reuse, publish validation, published check)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
