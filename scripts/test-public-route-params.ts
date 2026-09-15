import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isUuid } from "../src/lib/uuid";

assert.equal(isUuid("833b0303-d034-4ebb-ae6f-e023dd765a64"), true);
assert.equal(isUuid("not-a-real-work-id"), false);
assert.equal(isUuid("833b0303-d034-4ebb-ae6f-e023dd765a64/extra"), false);

function source(path: string): string {
  return readFileSync(path, "utf8");
}

for (const [path, guard] of [
  [
    "src/app/works/[seriesId]/page.tsx",
    "if (!isUuid(seriesId)) notFound();",
  ],
  [
    "src/app/locale-work/[seriesId]/page.tsx",
    "if (!isUuid(seriesId)) notFound();",
  ],
  [
    "src/app/read/[seriesId]/[episodeNumber]/page.tsx",
    "if (!isUuid(seriesId) || !parsedEpisodeNumber) notFound();",
  ],
  [
    "src/app/works/[seriesId]/translations/[targetLanguage]/page.tsx",
    "if (!isUuid(seriesId)) {",
  ],
] as const) {
  assert.equal(source(path).includes(guard), true, `${path} must validate public route ids before querying Supabase`);
}

console.log("PASS: malformed public work and Reader ids resolve through not-found without a database type error");
