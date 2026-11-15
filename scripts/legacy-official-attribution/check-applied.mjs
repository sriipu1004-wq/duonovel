// CI: compares the legacyAttribution written by apply.sql (JSON on stdin:
// [{"id": ..., "la": {...}}]) with the records derived from the audit files
// (targets.mjs). Fails on any extra, missing or different record, and checks
// the app reader accepts each one without treating it as Public Domain.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTargets, legacyAttributionFor } from "./targets.mjs";

const rows = JSON.parse(readFileSync(0, "utf8"));
const targets = loadTargets();
assert.equal(rows.length, targets.length, "row count");
const byId = new Map(rows.map((row) => [row.id, row.la]));
for (const target of targets) {
  assert.ok(byId.has(target.seriesId), `missing ${target.seriesId}`);
  assert.deepEqual(byId.get(target.seriesId), legacyAttributionFor(target), target.seriesId);
}

const { readLegacyAttribution } = await import("../../src/lib/legacyAttribution.ts");
const { readPublicDomainMetadata } = await import("../../src/lib/publicDomainMetadata.ts");
for (const target of targets) {
  const settings = { legacyAttribution: byId.get(target.seriesId) };
  const read = readLegacyAttribution(settings);
  assert.ok(read, `reader accepts ${target.seriesId}`);
  assert.equal(read.originalAuthor, target.originalAuthor);
  assert.equal(read.authorDeathYear, target.authorDeathYear);
  assert.equal(read.sourceMatchVerified, false);
  assert.equal(readPublicDomainMetadata(settings), null, "never rights-checked");
}
console.log(`legacy attribution records match the audit files: ${rows.length}`);
