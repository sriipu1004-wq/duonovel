import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function main() {
  const migration = source(
    "supabase/migrations/20260914130000_ensure_series_translation_permission_mode.sql"
  );
  assert.ok(migration.includes("add column if not exists translation_permission_mode"));
  assert.ok(migration.includes("default 'closed'"));
  assert.ok(migration.includes("alter column translation_permission_mode set default 'closed'"));
  assert.ok(migration.includes("alter column translation_permission_mode set not null"));
  assert.ok(migration.includes("check (translation_permission_mode in ('open', 'closed'))"));

  const route = source("src/app/api/series/[seriesId]/translation-permission/route.ts");
  assert.ok(route.includes("update({ translation_permission_mode: mode })"));
  assert.ok(route.includes('.select("translation_permission_mode")'));

  const eligibility = source("src/lib/translation/episodeTranslationServer.ts");
  assert.ok(eligibility.includes('series.translation_permission_mode === "open"'));

  console.log("PASS: translation permission schema reconciliation is present for the existing author flow");
}

main();
