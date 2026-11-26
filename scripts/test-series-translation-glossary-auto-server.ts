import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// The Supabase admin client is replaced in-process with a small in-memory fake; no DB access.

type Row = Record<string, unknown>;
type Err = { message: string } | null;
const db = {
  series: null as Row | null,
  seriesError: null as Err,
  entries: [] as Row[],
  entriesError: null as Err,
  refreshError: null as Err,
  targets: [] as Row[],
  targetsError: null as Err,
  log: [] as unknown[][],
  entrySelects: 0,
};

function reset() {
  db.series = { id: "s-1", source_language: "ja" };
  db.seriesError = null;
  db.entries = [];
  db.entriesError = null;
  db.refreshError = null;
  db.targets = [];
  db.targetsError = null;
  db.log = [];
  db.entrySelects = 0;
}

function query(table: string) {
  const calls: unknown[] = [table];
  db.log.push(calls);
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "limit"]) {
    builder[method] = (...args: unknown[]) => (calls.push([method, ...args]), builder);
  }
  builder.maybeSingle = async () => ({ data: db.series, error: db.seriesError });
  builder.upsert = async (rows: Row[], options: unknown) => {
    calls.push(["upsert", rows, options]);
    if (table === "series_translation_glossary_entries") {
      for (const row of rows) db.entries.push({ ...row, id: `e-${row.source_term}` });
    } else {
      db.targets.push(...rows);
    }
    return { error: null };
  };
  builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
    let result: unknown;
    if (table === "series_translation_glossary_entries") {
      db.entrySelects += 1;
      const error = db.entrySelects === 1 ? db.entriesError : db.refreshError;
      result = { data: error ? null : db.entries.map((entry) => ({ ...entry })), error };
    } else {
      result = { data: db.targetsError ? null : db.targets, error: db.targetsError };
    }
    return Promise.resolve(result).then(resolve, reject);
  };
  return builder;
}

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase/admin" || request.endsWith("/lib/supabase/admin")) {
    return { createAdminClient: () => ({ from: query }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const tables = () => db.log.map((calls) => calls[0]);
const upserts = (table: string) =>
  db.log.filter((calls) => calls[0] === table).flatMap((calls) => calls.filter((c) => Array.isArray(c) && c[0] === "upsert"));

async function main() {
  try {
    const { persistAiSeriesTranslationGlossaryCandidates: persist } = await import(
      "../src/lib/translation/seriesTranslationGlossaryAutoServer"
    );
    type Args = Parameters<typeof persist>[0];
    type Candidate = Args["candidates"][number];
    const cand = (sourceTerm: string, targetTerm: string, termType = "person") =>
      ({ sourceTerm, targetTerm, termType }) as unknown as Candidate;
    const base = (overrides: Partial<Args> = {}): Args => ({
      seriesId: "s-1",
      episodeId: "ep-3",
      episodeNumber: 3,
      sourceLanguage: "ja",
      targetLanguage: "en",
      currentSource: "太郎と花子はＡＢＣ村へ行った。",
      candidates: [cand("太郎", "Taro")],
      ...overrides,
    });

    // No DB access for same-language, no candidates, or no candidate found in the source.
    reset();
    await persist(base({ targetLanguage: "ja" }));
    await persist(base({ candidates: [] }));
    await persist(base({ candidates: [cand("次郎", "Jiro"), cand(" ", "x"), cand("太郎", "  ")] }));
    assert.deepEqual(db.log, []);

    // New terms: entry + target are inserted as AI suggestions. NFKC (ＡＢＣ -> ABC), trimming, de-duplication.
    reset();
    await persist(
      base({ candidates: [cand(" 太郎 ", " Taro "), cand("太郎", "Tarou"), cand("ABC村", "ABC Village", "place"), cand("次郎", "Jiro")] })
    );
    assert.deepEqual(tables(), [
      "series",
      "series_translation_glossary_entries",
      "series_translation_glossary_entries",
      "series_translation_glossary_entries",
      "series_translation_glossary_targets",
      "series_translation_glossary_targets",
    ]);
    assert.deepEqual(db.log[0], ["series", ["select", "id, source_language"], ["eq", "id", "s-1"]]);
    assert.deepEqual(db.log[1], [
      "series_translation_glossary_entries",
      ["select", "id, source_term, origin, status, is_locked, effective_from_episode_number"],
      ["eq", "series_id", "s-1"],
      ["eq", "source_language", "ja"],
      ["limit", 500],
    ]);
    const entryUpsert = upserts("series_translation_glossary_entries")[0] as [string, Row[], unknown];
    assert.deepEqual(entryUpsert[2], { onConflict: "series_id,source_language,source_term", ignoreDuplicates: true });
    assert.deepEqual(
      entryUpsert[1].map(({ updated_at, ...rest }) => (assert.equal(typeof updated_at, "string"), rest)),
      [
        { series_id: "s-1", source_language: "ja", source_term: "太郎", term_type: "person", source_note: null, first_seen_episode_id: "ep-3", effective_from_episode_number: 3, origin: "ai", status: "suggested", is_locked: false, is_global: false, created_by_user_id: null },
        { series_id: "s-1", source_language: "ja", source_term: "ABC村", term_type: "place", source_note: null, first_seen_episode_id: "ep-3", effective_from_episode_number: 3, origin: "ai", status: "suggested", is_locked: false, is_global: false, created_by_user_id: null },
      ]
    );
    assert.deepEqual(db.log[4], [
      "series_translation_glossary_targets",
      ["select", "id, glossary_entry_id, target_language, origin, status, is_locked"],
      ["in", "glossary_entry_id", ["e-太郎", "e-ABC村"]],
      ["eq", "target_language", "en"],
    ]);
    const targetUpsert = upserts("series_translation_glossary_targets")[0] as [string, Row[], unknown];
    assert.deepEqual(targetUpsert[2], { onConflict: "glossary_entry_id,target_language", ignoreDuplicates: true });
    assert.deepEqual(
      targetUpsert[1].map(({ updated_at, ...rest }) => (assert.equal(typeof updated_at, "string"), rest)),
      [
        { glossary_entry_id: "e-太郎", target_language: "en", target_term: "Taro", translation_note: null, origin: "ai", status: "suggested", is_locked: false, first_seen_episode_id: "ep-3", effective_from_episode_number: 3 },
        { glossary_entry_id: "e-ABC村", target_language: "en", target_term: "ABC Village", translation_note: null, origin: "ai", status: "suggested", is_locked: false, first_seen_episode_id: "ep-3", effective_from_episode_number: 3 },
      ]
    );

    // Only the first 12 candidates are considered.
    reset();
    const many = Array.from({ length: 13 }, (_, i) => cand(`語${i}`, `w${i}`));
    await persist(base({ currentSource: many.map((c) => c.sourceTerm).join(" "), candidates: many }));
    assert.equal((upserts("series_translation_glossary_entries")[0] as [string, Row[]])[1].length, 12);

    // Series missing, errored or in another source language: stop after the series read.
    for (const setup of [
      () => (db.series = null),
      () => (db.seriesError = { message: "x" }),
      () => (db.series = { id: "s-1", source_language: "en" }),
    ]) {
      reset();
      setup();
      await persist(base());
      assert.deepEqual(tables(), ["series"]);
    }

    // Entry read error: stop. Refresh error after the insert: stop before targets.
    reset();
    db.entriesError = { message: "x" };
    await persist(base());
    assert.deepEqual(tables(), ["series", "series_translation_glossary_entries"]);
    reset();
    db.refreshError = { message: "x" };
    await persist(base());
    assert.equal(tables().includes("series_translation_glossary_targets"), false);

    // Existing entries: no entry insert; disabled or not-yet-effective entries get no target;
    // an existing target for the language is not overwritten.
    reset();
    db.entries = [
      { id: "e1", source_term: "太郎", origin: "author", status: "approved", is_locked: true, effective_from_episode_number: 2 },
      { id: "e2", source_term: "花子", origin: "ai", status: "disabled", is_locked: false, effective_from_episode_number: 1 },
      { id: "e3", source_term: "ＡＢＣ村", origin: "ai", status: "suggested", is_locked: false, effective_from_episode_number: 5 },
    ];
    db.targets = [];
    await persist(base({ candidates: [cand("太郎", "Taro"), cand("花子", "Hanako"), cand("ABC村", "ABC")] }));
    assert.deepEqual(upserts("series_translation_glossary_entries"), []);
    assert.deepEqual(db.log.at(-2)![2], ["in", "glossary_entry_id", ["e1"]]);
    assert.deepEqual(
      (upserts("series_translation_glossary_targets")[0] as [string, Row[]])[1].map((row) => row.glossary_entry_id),
      ["e1"]
    );
    reset();
    db.entries = [{ id: "e1", source_term: "太郎", origin: "ai", status: "suggested", is_locked: false, effective_from_episode_number: "0" }];
    db.targets = [{ glossary_entry_id: "e1", target_language: "en" }];
    await persist(base());
    assert.deepEqual(upserts("series_translation_glossary_targets"), []);
    // A bad effective episode number counts as episode 1.
    reset();
    db.entries = [{ id: "e1", source_term: "太郎", origin: "ai", status: "suggested", is_locked: false, effective_from_episode_number: "abc" }];
    await persist(base({ episodeNumber: 1 }));
    assert.equal(upserts("series_translation_glossary_targets").length, 1);
    // Target read error: no target insert.
    reset();
    db.entries = [{ id: "e1", source_term: "太郎", origin: "ai", status: "suggested", is_locked: false, effective_from_episode_number: 1 }];
    db.targetsError = { message: "x" };
    await persist(base());
    assert.deepEqual(upserts("series_translation_glossary_targets"), []);

    // Glossary full (500 entries): no new entries are inserted.
    reset();
    db.entries = Array.from({ length: 500 }, (_, i) => ({ id: `x${i}`, source_term: `既${i}`, origin: "ai", status: "suggested", is_locked: false, effective_from_episode_number: 1 }));
    await persist(base());
    assert.deepEqual(upserts("series_translation_glossary_entries"), []);
    assert.equal(tables().includes("series_translation_glossary_targets"), false);

    console.log("seriesTranslationGlossaryAutoServer characterization: PASS");
  } finally {
    moduleWithLoad._load = originalLoad;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
