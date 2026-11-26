/**
 * Issue #221 / KD-3 (PR-B) static contract for the series operator
 * effect_settings guard migration. The DB behaviour itself is checked by
 * supabase/verification/20261126121000_test_guard_series_operator_effect_settings.sql
 * on a local stack; this test only pins the migration's shape.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const sql = readFileSync(
  "supabase/migrations/20261126121000_issue221_guard_series_operator_effect_settings.sql",
  "utf8"
).toLowerCase();
const verification = readFileSync(
  "supabase/verification/20261126121000_test_guard_series_operator_effect_settings.sql",
  "utf8"
).toLowerCase();

// Guards both operator keys, on insert and on effect_settings updates.
assert.ok(sql.includes("array['publicdomain', 'legacyattribution']"));
assert.ok(sql.includes("before insert or update of effect_settings on public.series"));
// Rejects add / change / delete: compares presence and value per key.
assert.ok(sql.includes("(v_old ? v_key) is distinct from (v_new ? v_key)"));
assert.ok(sql.includes("(v_old -> v_key) is distinct from (v_new -> v_key)"));
assert.ok(sql.includes("errcode = '42501'"));
// Author sessions only: invoking role and JWT role; service_role passes.
assert.ok(sql.includes("current_user not in ('anon', 'authenticated')"));
assert.ok(sql.includes("not in ('anon', 'authenticated')"));
assert.ok(sql.includes("current_setting('request.jwt.claims', true)"));
// Not a privilege escalation surface (comments mention the term; code must not).
const sqlCode = sql.replace(/--[^\n]*/g, "");
assert.equal(sqlCode.includes("security definer"), false);
assert.ok(sql.includes("set search_path = ''"));
assert.ok(
  sql.includes(
    "revoke execute on function public.guard_series_operator_effect_settings() from public, anon, authenticated"
  )
);
// Review S2: no separate helper function that clients could call as an RPC;
// the trigger function is the only function this migration creates.
assert.equal((sqlCode.match(/create\s+(or\s+replace\s+)?function/g) ?? []).length, 1);
assert.equal(sqlCode.includes("series_effect_settings_object"), false);
assert.ok(sqlCode.includes("jsonb_typeof(v_raw) = 'string'"), "legacy string rows still normalised");
// Review S1: version must not collide with other migrations.
assert.ok(
  !readdirSync("supabase/migrations").some(
    (name) => name.startsWith("20261126121000_") && !name.includes("issue221_guard_series_operator_effect_settings")
  ),
  "migration version 20261126121000 is unique"
);
assert.equal(
  new Set(readdirSync("supabase/migrations").map((name) => name.split("_")[0])).size,
  readdirSync("supabase/migrations").length,
  "no two migrations share a version"
);

// No data change and not marked as applied.
assert.equal(/\bupdate\s+public\.series\b/.test(sqlCode), false);
assert.equal(/\bdelete\s+from\b/.test(sqlCode), false);
assert.ok(sql.includes("do not apply to the hosted project"));

// Verification is transactional and checks the guard's message, not just 42501.
assert.ok(verification.trimEnd().endsWith("rollback;"));
assert.ok(verification.includes("sqlerrm like '%operator-managed%'"));
assert.ok(verification.includes("set local role authenticated"));
assert.ok(verification.includes("set local role service_role"));
assert.ok(verification.includes("if v_rows <> 1 then"));

console.log("PASS: KD-3 series operator effect_settings guard migration contract");
