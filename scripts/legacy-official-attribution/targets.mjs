// Legacy official works (owner decision 2026-11-15 「原作者だけ先に表示 (推奨)」):
// the 28 targets derived ONLY from the committed audit files, never typed by
// hand. Used by scope-check.mjs to prove apply.sql / dryrun.sql / rollback.sql
// name exactly these works with exactly these authors, death years and
// candidate source cards.
//
//   classification file: public-domain/audits/legacy-official-rights-classification-2026-09-25.json
//   provenance file:     public-domain/audits/legacy-official-provenance-recovery-2026-09-25.json
//
// Targets = the 37 legacy series minus CURRENT_PD_APPROVED (文鳥, already has
// publicDomain) minus RIGHTS_REVIEW_REQUIRED (the 8 §104A works made private
// by #210). Death years: Aozora Bunko author pages (checked 2026-11-15); the
// script fails if the audit's author_death_year disagrees.
//
// Run: node scripts/legacy-official-attribution/targets.mjs  (prints JSON)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));

export const DEATH_YEARS = Object.freeze({
  夏目漱石: 1916,
  芥川龍之介: 1927,
  宮沢賢治: 1933,
  江戸川乱歩: 1965,
});
export const EXCLUDED_CLASSIFICATIONS = Object.freeze([
  "CURRENT_PD_APPROVED",
  "RIGHTS_REVIEW_REQUIRED",
]);
export const JURISDICTIONS_ASSESSED = Object.freeze(["JP", "US", "KR"]);
export const RECORDED_AT = "2026-11-15";
export const RECORDED_BY = "LIB read operator (owner decision 2026-11-15)";

export function loadTargets() {
  const classification = readJson(
    "public-domain/audits/legacy-official-rights-classification-2026-09-25.json"
  );
  const provenance = readJson(
    "public-domain/audits/legacy-official-provenance-recovery-2026-09-25.json"
  );
  const provenanceById = new Map(provenance.series.map((series) => [series.series_id, series]));

  const targets = [];
  for (const work of classification.works) {
    if (EXCLUDED_CLASSIFICATIONS.includes(work.classification)) continue;
    const series = provenanceById.get(work.series_id);
    assert.ok(series, `provenance for ${work.series_id}`);
    assert.equal(series.author, work.author, `${work.series_id}: one author in both audits`);
    assert.ok(Object.hasOwn(DEATH_YEARS, work.author), `${work.series_id}: known author`);
    assert.equal(work.author_death_year, DEATH_YEARS[work.author], `${work.series_id}: death year`);
    // A collection is a target only when every work unit with a candidate has
    // the same author (no multi-author anthology).
    for (const unit of series.works) {
      const candidateAuthor = unit.best_candidate?.author;
      if (!candidateAuthor) continue;
      const same =
        candidateAuthor === work.author ||
        (work.author === "芥川龍之介" && candidateAuthor === "芥川竜之介");
      assert.ok(same, `${work.series_id}: unit author ${candidateAuthor}`);
    }
    const sourceCandidates = [];
    for (const unit of series.works) {
      const url = unit.best_candidate?.card_url;
      if (url && !sourceCandidates.includes(url)) sourceCandidates.push(url);
    }
    for (const url of sourceCandidates) {
      assert.match(url, /^https:\/\/www\.aozora\.gr\.jp\/cards\/\d{6}\/card\d+\.html$/u);
    }
    targets.push({
      seriesId: work.series_id,
      title: work.title,
      originalAuthor: work.author,
      authorDeathYear: work.author_death_year,
      sourceCandidates,
    });
  }
  return targets;
}

/** The exact jsonb the apply SQL writes for one target. */
export function legacyAttributionFor(target) {
  return {
    originalAuthor: target.originalAuthor,
    authorDeathYear: target.authorDeathYear,
    sourceCandidates: target.sourceCandidates,
    sourceMatchVerified: false,
    jurisdictionsAssessed: [...JURISDICTIONS_ASSESSED],
    recordedAt: RECORDED_AT,
    recordedBy: RECORDED_BY,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const targets = loadTargets();
  if (process.argv[2] === "--fixture-sql") {
    // CI only: seed rows for the 28 targets on the disposable PostgreSQL.
    const quote = (text) => `'${String(text).replace(/'/g, "''")}'`;
    console.log(
      "insert into public.series (id, author_id, title, effect_settings, publication_status, is_public, source_language) values\n" +
        targets
          .map(
            (t) =>
              `  (${quote(t.seriesId)}, '11111111-1111-4111-8111-111111111111', ${quote(t.title)}, null, 'public', true, 'ja')`
          )
          .join(",\n") +
        ";"
    );
  } else {
    console.log(
      JSON.stringify(targets.map((t) => ({ ...t, legacyAttribution: legacyAttributionFor(t) })), null, 1)
    );
  }
}
