import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source-only guard for the read-only restore acceptance checklist.
// Real SQL execution is separately authorized and is NEVER run from CI.
const sql = readFileSync("scripts/child84-readonly-restore-acceptance.sql", "utf8");
const stripped = sql.replace(/^\s*--.*$/gm, "").trim();
assert.ok(stripped.startsWith("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;"), "stable snapshot and read-only transaction required");
assert.ok(stripped.endsWith("COMMIT;"), "must terminate read-only transaction");
assert.equal((sql.match(/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/g) ?? []).length, 1);
assert.equal((sql.match(/COMMIT;/g) ?? []).length, 1);

// Remove SQL string constants first; table names and exception text may contain
// ordinary English words that resemble mutating SQL commands.
const noQuotedLiterals = stripped.replace(/'(?:[^']|'')*'/g, "''");
assert.equal(
  /\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|CALL|EXECUTE|VACUUM|REFRESH|LOCK\s+TABLE)\b/i.test(noQuotedLiterals),
  false,
  "restore acceptance SQL must not mutate or export database objects",
);

for (const required of [
  "public.series",
  "public.episodes",
  "public.recordings",
  "public.episode_human_translations",
  "public.private_library_works",
  "public.private_library_reading_progress",
  "public.user_series_bookmarks",
  "public.public_episode_work_summaries",
  "storage.buckets",
  "storage.objects",
  "to_regclass",
  "relrowsecurity IS NOT TRUE",
  "has_table_privilege('anon', 'public.episode_human_translations', 'SELECT')",
  "has_table_privilege('authenticated', 'public.episode_human_translations', 'SELECT')",
  "contype = 'f'",
  "Orphan episode/recording references detected",
  "storage_metadata_bytes",
  "recording_paths_missing_metadata",
  "audio_objects_without_direct_recording_reference",
]) {
  assert.ok(sql.includes(required), `missing restore guard: ${required}`);
}
assert.ok(sql.includes("SELECT count(*) FROM referenced_audio"), "Media completeness is reported in aggregate");
assert.ok(!sql.includes("service_role"), "Do not put application secrets or privileged keys in this script");
console.log("PASS: Child84 restore acceptance SQL is read-only and guards schema, RLS, FK and Storage metadata");
