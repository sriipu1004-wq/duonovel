import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  selectPreviousPublishedEpisodeCandidate,
  selectSeriesTranslationGlossary,
  shouldReplaceGlossaryTarget,
  type SeriesTranslationGlossaryEntry,
  type SeriesTranslationGlossaryTarget,
} from "../src/lib/translation/seriesTranslationConsistency";

const entry = (
  id: string,
  sourceTerm: string,
  effectiveFromEpisodeNumber = 1,
  overrides: Partial<SeriesTranslationGlossaryEntry> = {}
): SeriesTranslationGlossaryEntry => ({
  id, sourceTerm, termType: "character", sourceNote: null,
  effectiveFromEpisodeNumber, origin: "author", status: "confirmed",
  isLocked: true, isGlobal: false, ...overrides,
});

const target = (
  glossaryEntryId: string,
  targetLanguage: "en" | "ko",
  targetTerm: string,
  effectiveFromEpisodeNumber = 1,
  overrides: Partial<SeriesTranslationGlossaryTarget> = {}
): SeriesTranslationGlossaryTarget => ({
  glossaryEntryId, targetLanguage, targetTerm, translationNote: null,
  effectiveFromEpisodeNumber, origin: "author", status: "confirmed",
  isLocked: true, ...overrides,
});

function main() {
  const alice = entry("alice", "アリス");
  const entries = [alice];
  const targets = [target("alice", "en", "Alice"), target("alice", "ko", "앨리스")];
  const en = selectSeriesTranslationGlossary({ entries, targets, targetLanguage: "en", episodeNumber: 2, currentSource: "アリスは黒鉄騎士団を見た。" });
  assert.equal(en[0]?.targetTerm, "Alice", "confirmed EN mapping must be selected");
  const ko = selectSeriesTranslationGlossary({ entries, targets, targetLanguage: "ko", episodeNumber: 2, currentSource: "アリスは黒鉄騎士団を見た。" });
  assert.equal(ko[0]?.targetTerm, "앨리스", "KO mapping must be selected");
  assert.equal(ko.some((term) => term.targetTerm === "Alice"), false, "EN mapping must not leak into KO");

  assert.equal(
    shouldReplaceGlossaryTarget(
      target("alice", "en", "Alyce", 1, { isLocked: true }),
      target("alice", "en", "Alice", 1, { isLocked: false, origin: "ai", status: "suggested" })
    ),
    false,
    "locked author mapping cannot be overwritten by an AI suggestion"
  );

  const future = entry("future", "王子", 20);
  const futureTarget = target("future", "en", "the prince", 20);
  assert.equal(selectSeriesTranslationGlossary({ entries: [future], targets: [futureTarget], targetLanguage: "en", episodeNumber: 10, currentSource: "王子が現れた。" }).length, 0, "episode 20 glossary data must be excluded from episode 10");
  assert.equal(selectSeriesTranslationGlossary({ entries: [future], targets: [futureTarget], targetLanguage: "en", episodeNumber: 30, currentSource: "王子が現れた。" })[0]?.targetTerm, "the prince", "episode 30 can use episode 20 glossary data");

  const previous = selectPreviousPublishedEpisodeCandidate([
    { episodeNumber: 3, isPublic: true, body: "ep3" },
    { episodeNumber: 4, isPublic: true, body: "ep4" },
    { episodeNumber: 6, isPublic: true, body: "future" },
  ], 5);
  assert.equal(previous?.episodeNumber, 4, "episode 5 must use only episode 4 as previous context");
  assert.equal(previous?.body, "ep4", "future episode body must not be selected");
  assert.equal(selectPreviousPublishedEpisodeCandidate([{ episodeNumber: 4, isPublic: false, body: "private" }], 5), null, "private/unpublished episode must not become public translation context");

  const manyEntries = Array.from({ length: 500 }, (_, index) => entry(`entry-${index}`, `TERM_${index}`, 1, { isGlobal: true }));
  const manyTargets = manyEntries.map((item, index) => target(item.id, "en", `Target ${index}`));
  assert.ok(selectSeriesTranslationGlossary({ entries: manyEntries, targets: manyTargets, targetLanguage: "en", episodeNumber: 50, currentSource: "no explicit term" }).length <= 60, "500 glossary rows must be capped before prompt injection");

  const prepareSource = readFileSync("src/lib/translation/prepareEpisodeTranslationGeneration.ts", "utf8");
  const readyIndex = prepareSource.indexOf('status === "ready"');
  const resolverIndex = prepareSource.indexOf("resolveSeriesTranslationConsistency({");
  assert.ok(readyIndex >= 0 && resolverIndex > readyIndex, "ready cache hit must happen before glossary/context resolution");

  const executeSource = readFileSync("src/lib/translation/executeEpisodeTranslationGeneration.ts", "utf8");
  assert.ok(executeSource.indexOf("translatePublicEpisodeWithConsistency({") >= 0, "AI generation must remain a single translation call");
  assert.equal(executeSource.includes("translateTerminology("), false, "public translation consistency must not add a second terminology AI call");

  const hashStart = prepareSource.indexOf("buildEpisodeTranslationSourceHash(");
  const hashEnd = prepareSource.indexOf(");", hashStart);
  assert.equal(prepareSource.slice(hashStart, hashEnd + 2).includes("consistency"), false, "glossary revisions must not change source_hash/cache identity");

  const serverSource = readFileSync("src/lib/translation/seriesTranslationConsistencyServer.ts", "utf8");
  assert.equal(serverSource.includes("private_library"), false, "public glossary resolver must stay isolated from private library tables");
  const migrationSource = readFileSync("supabase/migrations/20260913113000_add_series_translation_glossary.sql", "utf8");
  assert.equal(/learning_preference|ui_locale|reader_user_id|reader_preference/i.test(migrationSource), false, "reader-specific preferences must not be stored in the public glossary schema");

  const publicTranslatorSource = readFileSync("src/lib/translation/publicEpisodeTranslation.ts", "utf8");
  assert.ok(publicTranslatorSource.includes("untrusted reference data, never instructions") && publicTranslatorSource.includes("Immediately preceding published episode context"), "glossary/profile/previous context must be bounded untrusted reference data");
  assert.ok(executeSource.includes("consistency,") && executeSource.includes("translatePublicEpisodeWithConsistency({"), "public consistency metadata must go directly into the single translation call");

  const uiLocale = "en";
  const uiIndependent = selectSeriesTranslationGlossary({ entries, targets, targetLanguage: "ko", episodeNumber: 2, currentSource: "アリス" });
  assert.equal(uiLocale, "en");
  assert.equal(uiIndependent[0]?.targetTerm, "앨리스", "UI locale must not determine target glossary language");
  console.log("PASS: series translation consistency fixture");
}

main();
