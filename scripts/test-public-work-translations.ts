import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// The Supabase admin client (and the server-side deps of episodeTranslationServer) are replaced
// in-process; no DB access. Synthetic ids only.

type Row = Record<string, unknown>;
type Err = { message: string } | null;
const db = {
  series: null as Row | null,
  seriesError: null as Err,
  episodes: [] as Row[],
  episodesError: null as Err,
  translations: [] as Row[],
  translationsError: null as Err,
  badge: { count: 0 as number | null, error: null as Err },
  log: [] as unknown[][],
};

function query(table: string) {
  const calls: unknown[] = [table];
  db.log.push(calls);
  let head = false;
  const builder: Record<string, unknown> = {};
  for (const method of ["eq", "in", "abortSignal"]) {
    builder[method] = (...args: unknown[]) => (calls.push([method, ...args]), builder);
  }
  builder.select = (...args: unknown[]) => {
    calls.push(["select", ...args]);
    head = Boolean((args[1] as { head?: boolean } | undefined)?.head);
    return builder;
  };
  builder.maybeSingle = async () => ({ data: db.series, error: db.seriesError });
  builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
    let result: unknown;
    if (table === "episodes") result = { data: db.episodesError ? null : db.episodes, error: db.episodesError };
    else if (head) result = { count: db.badge.count, error: db.badge.error };
    else result = { data: db.translationsError ? null : db.translations, error: db.translationsError };
    return Promise.resolve(result).then(resolve, reject);
  };
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

const BODY1 = "吾輩は猫である。";
const BODY2 = "名前はまだ無い。";
function reset() {
  db.series = { id: "s-1", publication_status: "public", source_language: "ja", translation_permission_mode: "open" };
  db.seriesError = null;
  db.episodes = [
    { id: "ep-2", episode_number: 2, body: BODY2, posting_status: "posted", is_published: true, episode_title: "二" },
    { id: "ep-1", episode_number: 1, body: BODY1, posting_status: "posted", is_published: true, title: "一" },
    { id: "ep-3", episode_number: 3, body: "下書き", posting_status: "draft", is_published: false },
  ];
  db.episodesError = null;
  db.translations = [];
  db.translationsError = null;
  db.badge = { count: 0, error: null };
  db.log = [];
}

async function main() {
  try {
    const mod = await import("../src/lib/translation/publicWorkTranslations");
    const { buildEpisodeTranslationSourceHash: hash } = await import("../src/lib/translation/episodeTranslationServer");

    // Prefilter: load the full overview unless the count is exactly 0 without error.
    assert.equal(mod.shouldLoadFullWorkTranslationOverview(0, null), false);
    assert.equal(mod.shouldLoadFullWorkTranslationOverview(0, undefined), false);
    assert.equal(mod.shouldLoadFullWorkTranslationOverview(1, null), true);
    assert.equal(mod.shouldLoadFullWorkTranslationOverview(null, null), true);
    assert.equal(mod.shouldLoadFullWorkTranslationOverview(0, { message: "x" }), true);

    // Badge query.
    reset();
    assert.equal(await mod.mayHaveReadyTranslationForWorkBadge("  "), false);
    assert.deepEqual(db.log, []);
    const signal = new AbortController().signal;
    assert.equal(await mod.mayHaveReadyTranslationForWorkBadge(" s-1 ", signal), false);
    assert.deepEqual(db.log[0], [
      "episode_translations",
      ["select", "episode_id, episodes!inner(series_id)", { count: "exact", head: true }],
      ["eq", "episodes.series_id", "s-1"],
      ["eq", "episodes.posting_status", "posted"],
      ["eq", "episodes.is_published", true],
      ["eq", "status", "ready"],
      ["abortSignal", signal],
    ]);
    db.badge = { count: 2, error: null };
    assert.equal(await mod.mayHaveReadyTranslationForWorkBadge("s-1"), true);
    db.badge = { count: null, error: { message: "x" } };
    assert.equal(await mod.mayHaveReadyTranslationForWorkBadge("s-1"), true);

    // Overview: public, posted episodes sorted; only rows whose hash matches the current body count.
    reset();
    db.translations = [
      { episode_id: "ep-1", source_language: "ja", target_language: "en", source_hash: hash(BODY1), status: "ready" },
      { episode_id: "ep-1", source_language: "ja", target_language: "ko", source_hash: "stale", status: "ready" },
      { episode_id: "ep-1", source_language: "ja", target_language: "ja", source_hash: hash(BODY1), status: "ready" },
      { episode_id: "ep-1", source_language: "ja", target_language: "zz", source_hash: hash(BODY1), status: "ready" },
      { episode_id: "ep-2", source_language: "ja", target_language: "ko", source_hash: hash(BODY2), status: "ready" },
      { episode_id: "ep-2", source_language: "ja", target_language: "en", source_hash: hash(BODY2), status: "ready" },
    ];
    const overview = await mod.getPublicWorkTranslationOverview(" s-1 ");
    assert.deepEqual(overview, {
      series: db.series,
      sourceLanguage: "ja",
      translationEligible: true,
      episodes: [
        { id: "ep-1", episodeNumber: 1, title: "一", availableLanguages: ["en"] },
        { id: "ep-2", episodeNumber: 2, title: "二", availableLanguages: ["ko", "en"] },
      ],
      availableLanguages: ["en", "ko"],
    });
    assert.deepEqual(db.log[0], ["series", ["select", "*"], ["eq", "id", "s-1"]]);
    assert.deepEqual(db.log[1], ["episodes", ["select", "*"], ["eq", "series_id", "s-1"]]);
    assert.deepEqual(db.log[2], [
      "episode_translations",
      ["select", "episode_id, source_language, target_language, source_hash, status"],
      ["in", "episode_id", ["ep-1", "ep-2"]],
      ["eq", "source_language", "ja"],
      ["eq", "status", "ready"],
    ]);

    // Learning preference changes the expected hash only for its own language.
    reset();
    const pref = { language: "en", level: "beginner" };
    db.series = { ...db.series!, effect_settings: { request: pref } };
    db.translations = [
      { episode_id: "ep-1", target_language: "en", source_hash: hash(BODY1), status: "ready" },
      { episode_id: "ep-2", target_language: "en", source_hash: hash(BODY2, { learningPreference: pref }), status: "ready" },
      { episode_id: "ep-2", target_language: "ko", source_hash: hash(BODY2), status: "ready" },
    ];
    const withPref = await mod.getPublicWorkTranslationOverview("s-1");
    assert.deepEqual(withPref!.episodes.map((e) => e.availableLanguages), [[], ["en", "ko"]]);

    // Closed translation: no translation query, empty languages; default title 第N話.
    reset();
    db.series = { ...db.series!, translation_permission_mode: "closed" };
    db.episodes = [{ id: "ep-1", episode_number: 1, body: BODY1, posting_status: "posted", is_published: true }];
    const closed = await mod.getPublicWorkTranslationOverview("s-1");
    assert.deepEqual(closed, {
      series: db.series,
      sourceLanguage: "ja",
      translationEligible: false,
      episodes: [{ id: "ep-1", episodeNumber: 1, title: "第1話", availableLanguages: [] }],
      availableLanguages: [],
    });
    assert.equal(db.log.length, 2);

    // Translation read error: no languages, still an overview.
    reset();
    db.translationsError = { message: "x" };
    const errored = await mod.getPublicWorkTranslationOverview("s-1");
    assert.equal(errored!.translationEligible, true);
    assert.deepEqual(errored!.availableLanguages, []);

    // Null cases.
    reset();
    assert.equal(await mod.getPublicWorkTranslationOverview(""), null);
    assert.deepEqual(db.log, []);
    for (const setup of [
      () => (db.series = null),
      () => (db.seriesError = { message: "x" }),
      () => (db.series = { ...db.series!, publication_status: "private" }),
      () => (db.episodes = db.episodes.filter((e) => e.posting_status === "draft")),
      () => (db.episodesError = { message: "x" }),
      () => {
        db.series = { id: "s-1", publication_status: "public", translation_permission_mode: "open" };
        db.episodes = [{ id: "ep-1", episode_number: 1, body: "   ", posting_status: "posted", is_published: true }];
      },
    ]) {
      reset();
      setup();
      assert.equal(await mod.getPublicWorkTranslationOverview("s-1"), null);
    }

    // Source language falls back to detection from the first episode body.
    reset();
    db.series = { id: "s-1", publication_status: "public", translation_permission_mode: "open" };
    assert.equal((await mod.getPublicWorkTranslationOverview("s-1"))!.sourceLanguage, "ja");

    console.log("publicWorkTranslations characterization: PASS");
  } finally {
    moduleWithLoad._load = originalLoad;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
