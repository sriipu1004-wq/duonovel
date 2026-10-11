import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Offline contract only: never connect to Production from GitHub Actions.
// Operators run the reviewed SQL separately with an authorized READ ONLY role.
const sql = readFileSync("scripts/child84-readonly-role-boundary-audit.sql", "utf8");
const statements = sql.replace(/^\s*--.*$/gm, "").trim();

assert.ok(statements.startsWith("BEGIN READ ONLY;"), "Audit must start READ ONLY");
assert.ok(statements.endsWith("COMMIT;"), "Audit must commit the read-only transaction");
assert.equal(
  /\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|CALL|EXECUTE|VACUUM|REFRESH|LOCK\s+TABLE)\b/i.test(
    statements.replace(/'(?:[^']|'')*'/g, "''")
  ),
  false,
  "No schema, data, privilege or bulk-export operation is allowed"
);
for (const required of [
  "SET LOCAL ROLE anon;",
  "SET LOCAL ROLE authenticated;",
  "WHERE publication_status = 'public'",
  "e.posting_status = 'posted'",
  "e.is_published = true",
  "WHERE publication_status <> 'public'",
  "WHERE posting_status <> 'posted' OR is_published IS NOT TRUE",
  "FROM public.private_library_works",
  "FROM public.recordings",
  "FROM public.user_series_bookmarks",
  "child84.expected_public_recordings",
  "Anon recording/bookmark admission mismatch",
  "Signed-in stranger recording/bookmark visibility mismatch",
  "human_translation_direct_select_allowed",
  "has_table_privilege('public.episode_human_translations', 'SELECT')",
  "has_table_privilege('public.private_library_reading_progress', 'SELECT')",
  "FROM auth.users",
  "request.jwt.claim.sub",
  "child84.expected_public_series",
  "child84.expected_public_episodes",
  "IF auth.uid() IS DISTINCT FROM",
  "RAISE EXCEPTION",
]) assert.ok(sql.includes(required), `Missing admission guard: ${required}`);

const id = "00000000-0000-0000-0000-000000000000";
assert.ok(sql.includes(id), "Synthetic user claim must remain explicit");
assert.equal((sql.match(/BEGIN READ ONLY;/g) ?? []).length, 1);
assert.equal((sql.match(/COMMIT;/g) ?? []).length, 1);
assert.ok(!sql.includes("service_role"), "Never set or impersonate a service role");
assert.ok(!sql.includes("set_config('request.jwt.claim.role'"), "Do not forge application roles");
console.log("PASS: Child84 read-only RLS role-boundary source contract (no DB access)");
