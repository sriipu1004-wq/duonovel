import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function assertNoLegacyEpisodeOrRecordingQuery(path: string): void {
  const value = source(path);
  for (const legacyQuery of [
    '.eq("seriesId"',
    '.in("seriesId"',
    '.eq("episodeId"',
    '.in("episodeId"',
  ]) {
    assert.equal(
      value.includes(legacyQuery),
      false,
      `${path} must not issue a legacy ${legacyQuery} query against the canonical production schema`
    );
  }
}

for (const path of [
  "src/lib/publicWorks.ts",
  "src/lib/publicRead.ts",
  "src/lib/translation/publicWorkTranslations.ts",
  "src/app/works/[seriesId]/page.tsx",
]) {
  assertNoLegacyEpisodeOrRecordingQuery(path);
}

console.log("PASS: public work and Reader queries only use canonical episode/recording columns");
