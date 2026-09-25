import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function assertCanonicalEpisodeQueries(path: string): void {
  const value = source(path);

  for (const legacyQuery of [
    '.eq("seriesId"',
    '.in("seriesId"',
    '.eq("episodeId"',
    '.in("episodeId"',
    '.select("seriesId")',
    '.select("episodeId")',
  ]) {
    assert.equal(
      value.includes(legacyQuery),
      false,
      `${path} must not query the removed legacy ${legacyQuery} column`
    );
  }

  assert.doesNotMatch(
    value,
    /\.select\([^)]*(?:seriesId|episodeId|readerUserId)/,
    `${path} must not select removed legacy episode or recording columns`
  );
}

for (const path of [
  "src/app/write/page.tsx",
  "src/app/write/series/[seriesId]/page.tsx",
  "src/app/write/series/[seriesId]/episodes/[episodeId]/page.tsx",
  "src/app/write/series/[seriesId]/episodes/new/page.tsx",
  "src/features/bookmark/BookmarkedSeriesList.tsx",
  "src/features/authorProfile/authorProfileShared.tsx",
  "src/app/record/page.tsx",
  "src/app/record/create/[seriesId]/page.tsx",
  "src/app/api/recordings/human-delete/route.ts",
  "src/lib/recording/humanRecordingPublish.ts",
  "src/lib/recording/nemoGenerationQueue.ts",
  "src/lib/recording/nemoAutoGeneration.ts",
  "src/lib/recording/aivisAutoGeneration.ts",
]) {
  assertCanonicalEpisodeQueries(path);
}

console.log(
  "PASS: workspace, bookmark, author, and recording queries use the canonical production columns"
);
