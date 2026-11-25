import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// The Supabase admin client (and the server-side deps of episodeTranslationServer) are replaced
// in-process with a small fake; no DB access. Pure helpers are the real ones.

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null };
const ok = (data: unknown): Result => ({ data, error: null });
const fail: Result = { data: null, error: { message: "x" } };
const db = {
  entries: ok([]) as Result,
  targets: ok([]) as Result,
  profile: ok(null) as Result,
  posted: ok(null) as Result,
  scheduled: ok(null) as Result,
  translation: ok(null) as Result,
  throwOn: null as string | null,
  log: [] as unknown[][],
};

function query(table: string) {
  if (db.throwOn === table) throw new Error("boom");
  const calls: unknown[] = [table];
  db.log.push(calls);
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "lt", "lte", "in", "order", "limit"]) {
    builder[method] = (...args: unknown[]) => (calls.push([method, ...args]), builder);
  }
  const pick = (): Result => {
    if (table === "series_translation_glossary_entries") return db.entries;
    if (table === "series_translation_glossary_targets") return db.targets;
    if (table === "series_translation_profiles") return db.profile;
    if (table === "episode_translations") return db.translation;
    const scheduled = calls.some((c) => Array.isArray(c) && c[1] === "posting_status" && c[2] === "scheduled");
    return scheduled ? db.scheduled : db.posted;
  };
  builder.maybeSingle = async () => pick();
  builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve(pick()).then(resolve, reject);
  return builder;
}

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
const is = (request: string, name: string) => request === `@/lib/${name}` || request.endsWith(`/lib/${name}`);
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "next/headers") return { headers: async () => new Headers() };
  if (is(request, "supabase/admin")) return { createAdminClient: () => ({ from: query }) };
  if (is(request, "supabase/server")) return { createClient: async () => ({}) };
  if (is(request, "contentRatingServer")) return { getCurrentR18ViewerPreference: async () => ({ showR18Content: false }) };
  if (is(request, "rights/regionRestriction.server")) {
    return { countryFromHeaders: () => null, isSeriesRegionBlockedForCountry: async () => false };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function reset() {
  db.entries = ok([]);
  db.targets = ok([]);
  db.profile = ok(null);
  db.posted = ok(null);
  db.scheduled = ok(null);
  db.translation = ok(null);
  db.throwOn = null;
  db.log = [];
}

const PREV_BODY = "前の話の本文。猫が鳴いた。";
const CURRENT = "太郎は村へ行った。";

async function main() {
  try {
    const { resolveSeriesTranslationConsistency: resolve } = await import(
      "../src/lib/translation/seriesTranslationConsistencyServer"
    );
    const consistency = await import("../src/lib/translation/seriesTranslationConsistency");
    const server = await import("../src/lib/translation/episodeTranslationServer");
    type Args = Parameters<typeof resolve>[0];
    const access = (overrides: Row = {}) =>
      ({
        seriesId: "s-1",
        episodeNumber: 3,
        series: { id: "s-1", publication_status: "public" },
        ...overrides,
      }) as unknown as Args["access"];
    const args = (overrides: Partial<Args> = {}): Args => ({
      access: access(),
      sourceLanguage: "ja",
      targetLanguage: "en",
      currentSource: CURRENT,
      ...overrides,
    });

    // Nothing stored: empty context. Queries are fixed.
    reset();
    assert.deepEqual(await resolve(args()), consistency.emptySeriesTranslationConsistency());
    const byTable = (table: string) => db.log.filter((calls) => calls[0] === table);
    assert.deepEqual(byTable("series_translation_glossary_entries")[0], [
      "series_translation_glossary_entries",
      ["select", "id, source_term, term_type, source_note, effective_from_episode_number, origin, status, is_locked, is_global, updated_at"],
      ["eq", "series_id", "s-1"],
      ["eq", "source_language", "ja"],
      ["neq", "status", "disabled"],
      ["lte", "effective_from_episode_number", 3],
      ["order", "is_locked", { ascending: false }],
      ["order", "updated_at", { ascending: false }],
      ["limit", 500],
    ]);
    assert.deepEqual(byTable("series_translation_profiles")[0], [
      "series_translation_profiles",
      ["select", "style_notes, honorific_policy, formatting_notes"],
      ["eq", "series_id", "s-1"],
      ["eq", "target_language", "en"],
    ]);
    const episodeQueries = byTable("episodes");
    assert.equal(episodeQueries.length, 2);
    assert.deepEqual(episodeQueries[0].slice(0, 5), [
      "episodes",
      ["select", "*"],
      ["eq", "series_id", "s-1"],
      ["lt", "episode_number", 3],
      ["eq", "posting_status", "posted"],
    ]);
    assert.deepEqual(episodeQueries[1][4], ["eq", "posting_status", "scheduled"]);
    assert.equal((episodeQueries[1][5] as unknown[])[1], "scheduled_for");

    // Glossary: rows are mapped (unknown enums -> defaults) and passed to the real selector.
    reset();
    db.entries = ok([
      { id: 1, source_term: " 太郎 ", term_type: "weird", source_note: 5, effective_from_episode_number: "0", origin: "x", status: "y", is_locked: "true", is_global: true },
      { id: "e2", source_term: "  ", term_type: "place" },
    ]);
    db.targets = ok([{ glossary_entry_id: 1, target_term: " Taro ", translation_note: "n", effective_from_episode_number: 2, origin: "ai", status: "suggested", is_locked: true }]);
    const withGlossary = await resolve(args());
    const expectedTerms = consistency.selectSeriesTranslationGlossary({
      entries: [{ id: "1", sourceTerm: "太郎", termType: "other", sourceNote: null, effectiveFromEpisodeNumber: 1, origin: "author", status: "confirmed", isLocked: false, isGlobal: true }],
      targets: [{ glossaryEntryId: "1", targetLanguage: "en", targetTerm: "Taro", translationNote: "n", effectiveFromEpisodeNumber: 2, origin: "ai", status: "suggested", isLocked: true }],
      targetLanguage: "en",
      episodeNumber: 3,
      currentSource: CURRENT,
    });
    assert.ok(expectedTerms.length > 0);
    assert.deepEqual(withGlossary.glossaryTerms, expectedTerms);
    assert.deepEqual(byTable("series_translation_glossary_targets")[0].slice(0, 4), [
      "series_translation_glossary_targets",
      ["select", "glossary_entry_id, target_language, target_term, translation_note, effective_from_episode_number, origin, status, is_locked, updated_at"],
      ["in", "glossary_entry_id", ["1", "e2"]],
      ["eq", "target_language", "en"],
    ]);
    // No targets or a read error: no glossary terms.
    db.targets = fail;
    assert.deepEqual((await resolve(args())).glossaryTerms, []);
    db.targets = ok([]);
    assert.deepEqual((await resolve(args())).glossaryTerms, []);
    db.entries = fail;
    db.log = [];
    assert.deepEqual((await resolve(args())).glossaryTerms, []);
    assert.equal(byTable("series_translation_glossary_targets").length, 0);

    // Profile: normalized; non-string fields become null; read error -> null.
    reset();
    db.profile = ok({ style_notes: " 丁寧 ", honorific_policy: 3, formatting_notes: null });
    const withProfile = await resolve(args());
    assert.deepEqual(
      withProfile.profile,
      consistency.normalizeSeriesTranslationProfile({ styleNotes: " 丁寧 ", honorificPolicy: null, formattingNotes: null })
    );
    assert.notEqual(withProfile.profile, null);
    db.profile = fail;
    assert.equal((await resolve(args())).profile, null);

    // Previous episode: posted one is used; matching ready translation gives the target tail.
    reset();
    const prev = { id: "ep-2", episode_number: 2, body: PREV_BODY, posting_status: "posted", is_published: true };
    db.posted = ok(prev);
    db.translation = ok({
      segments: {
        segments: [
          { id: "a", paragraphIndex: 0, sentenceIndex: 0, startOffset: 0, endOffset: 7, sourceText: "前の話の本文。", translatedText: "Previous text." },
          { id: "b", paragraphIndex: 0, sentenceIndex: 1, startOffset: 7, endOffset: 13, sourceText: "猫が鳴いた。", translatedText: "A cat meowed." },
        ],
      },
    });
    const withPrev = await resolve(args());
    const expectedSourceTail = consistency.tailTranslationContext(server.buildEpisodeTranslationSource(PREV_BODY, "ja").normalizedSource);
    assert.deepEqual(withPrev.previousEpisode, {
      episodeNumber: 2,
      sourceTail: expectedSourceTail,
      targetTail: "Previous text.\nA cat meowed.",
    });
    assert.deepEqual(byTable("episode_translations")[0], [
      "episode_translations",
      ["select", "segments"],
      ["eq", "episode_id", "ep-2"],
      ["eq", "source_language", "ja"],
      ["eq", "target_language", "en"],
      ["eq", "source_hash", server.buildEpisodeTranslationSourceHash(PREV_BODY, undefined)],
      ["eq", "status", "ready"],
    ]);
    assert.equal(
      withPrev.referenceChars,
      consistency.countTranslationConsistencyReferenceChars({ glossaryTerms: [], profile: null, previousEpisode: withPrev.previousEpisode })
    );
    assert.ok(withPrev.referenceChars > 0);

    // No (or unparsable) translation: source tail only.
    db.translation = ok(null);
    assert.equal((await resolve(args())).previousEpisode?.targetTail, null);
    db.translation = ok({ segments: { segments: [{ id: "a" }] } });
    assert.equal((await resolve(args())).previousEpisode?.targetTail, null);

    // Scheduled-but-due episode is a candidate only when it is publicly visible; the higher number wins.
    reset();
    db.posted = ok({ id: "ep-1", episode_number: 1, body: "一話。", posting_status: "posted", is_published: true });
    db.scheduled = ok({ id: "ep-2", episode_number: 2, body: "二話。", posting_status: "scheduled", is_published: false });
    assert.equal((await resolve(args())).previousEpisode?.episodeNumber, 1);
    db.scheduled = ok({ id: "ep-2", episode_number: 2, body: "二話。", posting_status: "posted", is_published: true });
    assert.equal((await resolve(args())).previousEpisode?.episodeNumber, 2);

    // No previous-episode lookup for private series or episode 1; blank previous body -> null.
    for (const a of [access({ series: { publication_status: "private" } }), access({ episodeNumber: 1 })]) {
      reset();
      db.posted = ok(prev);
      assert.equal((await resolve(args({ access: a }))).previousEpisode, null);
      assert.equal(byTable("episodes").length, 0);
    }
    reset();
    db.posted = ok({ ...prev, body: "   " });
    assert.equal((await resolve(args())).previousEpisode, null);
    assert.equal(byTable("episode_translations").length, 0);

    // Learning preference for the target language changes the expected hash.
    reset();
    const pref = { language: "en", level: "advanced" };
    db.posted = ok(prev);
    await resolve(args({ access: access({ series: { publication_status: "public", effect_settings: { request: pref } } }) }));
    assert.deepEqual(byTable("episode_translations")[0][5], [
      "eq",
      "source_hash",
      server.buildEpisodeTranslationSourceHash(PREV_BODY, { learningPreference: pref }),
    ]);

    // Any thrown error gives the empty context.
    reset();
    db.throwOn = "series_translation_profiles";
    db.posted = ok(prev);
    assert.deepEqual(await resolve(args()), consistency.emptySeriesTranslationConsistency());

    console.log("seriesTranslationConsistencyServer characterization: PASS");
  } finally {
    moduleWithLoad._load = originalLoad;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
