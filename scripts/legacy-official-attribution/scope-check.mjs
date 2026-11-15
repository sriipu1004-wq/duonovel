// Legacy official attribution: static scope check for dryrun / apply /
// rollback SQL. Proves mechanically that the Production SQL names only the
// 28 targets derived from the audit files (targets.mjs) with exactly the
// derived titles and legacyAttribution records, writes only
// series.effect_settings through the snapshot join, never adds publicDomain,
// sets a lock_timeout and checks the expected row counts.
// Run: node scripts/legacy-official-attribution/scope-check.mjs (no dependencies)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { loadTargets, legacyAttributionFor } from "./targets.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), "utf8");
// Strip SQL line comments so prose cannot satisfy or break a check.
const code = (sql) => sql.replace(/--[^\n]*/g, "");

const targets = loadTargets();
assert.equal(targets.length, 28, "28 targets from the audit files");
const counts = {};
for (const t of targets) counts[t.originalAuthor] = (counts[t.originalAuthor] ?? 0) + 1;
assert.deepEqual(counts, { 芥川龍之介: 7, 夏目漱石: 15, 宮沢賢治: 5, 江戸川乱歩: 1 });
const TARGET_IDS = new Set(targets.map((t) => t.seriesId));
// Never: 文鳥 (Public Domain) and the 8 works made private by #210.
for (const excluded of [
  "e943259d-600a-437e-9147-16fd722357a7",
  "8514e9da-7864-4dad-a397-de06abee8fdc",
  "d5cc7bf2-c76e-49e8-a078-150636fc0344",
  "4d328931-ca04-4843-bcb5-9ac080cfbbf1",
  "ac25272b-fc09-4f20-a94a-816791e750d0",
  "82309887-add7-4406-aa18-d8a435c3b967",
  "f7ba9cd3-0ede-48df-92d7-2ea297f33475",
  "833b0303-d034-4ebb-ae6f-e023dd765a64",
  "4f48c202-3ba1-47cb-b887-90880534c96e",
]) {
  assert.ok(!TARGET_IDS.has(excluded), `excluded ${excluded}`);
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const SNAPSHOT = "libread_internal.legacy_attribution_series_20261115";
const files = {
  "dryrun.sql": code(read("dryrun.sql")),
  "apply.sql": code(read("apply.sql")),
  "rollback.sql": code(read("rollback.sql")),
};
const lower = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.toLowerCase()]));

for (const [name, sql] of Object.entries(lower)) {
  const ids = sql.match(UUID) ?? [];
  for (const id of ids) assert.ok(TARGET_IDS.has(id), `${name}: non-target id ${id}`);
  for (const id of TARGET_IDS) assert.equal(ids.filter((x) => x === id).length, 1, `${name}: target ${id} once`);

  assert.doesNotMatch(sql, /\bdelete\s+from\b/, `${name}: DELETE is not allowed`);
  assert.doesNotMatch(sql, /\btruncate\b/, `${name}: TRUNCATE is not allowed`);
  assert.doesNotMatch(sql, /\binsert\s+into\s+(public|auth|storage)\./, `${name}: INSERT outside libread_internal`);
  assert.doesNotMatch(sql, /\b(alter|drop|create)\s+(table|view|function|policy|trigger)\s+(public|auth|storage)\./,
    `${name}: DDL outside libread_internal`);
  assert.doesNotMatch(sql, /\bexecute\s+['"(]/, `${name}: dynamic SQL is not allowed`);
  assert.doesNotMatch(sql, /'publicdomain'\s*,/, `${name}: never builds a publicDomain key`);
  const updates = [...sql.matchAll(/(?<!\bfor )\bupdate\s+([a-z0-9_.]+)/g)].map((m) => m[1]);
  for (const table of updates) assert.equal(table, "public.series", `${name}: UPDATE of ${table}`);
}

// dryrun: read-only, and names every target with its derived Production title.
assert.match(lower["dryrun.sql"], /^\s*begin read only;/, "dryrun must be read-only");
assert.match(lower["dryrun.sql"], /\brollback;\s*$/, "dryrun must end with rollback");
assert.doesNotMatch(lower["dryrun.sql"], /\b(update|insert|create|alter|drop|delete)\b/, "dryrun must not write");
for (const t of targets) {
  assert.ok(files["dryrun.sql"].includes(`('${t.seriesId}'::uuid, '${t.title}')`), `dryrun row ${t.seriesId}`);
}

// apply: exactly the derived records.
const applyRows = [...files["apply.sql"].matchAll(
  /\('([0-9a-f-]{36})'::uuid, '([^']*)',\s*'(\{[^']*\})'::jsonb\)/g
)];
assert.equal(applyRows.length, 28, "apply.sql: 28 value rows");
for (const [, id, title, json] of applyRows) {
  const target = targets.find((t) => t.seriesId === id);
  assert.ok(target, `apply.sql: target ${id}`);
  assert.equal(title, target.title, `apply.sql: title ${id}`);
  assert.deepEqual(JSON.parse(json), legacyAttributionFor(target), `apply.sql: record ${id}`);
  assert.equal(JSON.parse(json).sourceMatchVerified, false);
}

for (const name of ["apply.sql", "rollback.sql"]) {
  const sql = lower[name];
  assert.equal((sql.match(/^\s*begin;/gm) ?? []).length, 1, `${name}: exactly one BEGIN`);
  assert.equal((sql.match(/^\s*commit;/gm) ?? []).length, 1, `${name}: exactly one COMMIT`);
  const lockTimeout = sql.search(/^\s*set local lock_timeout = '\d+s';/m);
  assert.ok(lockTimeout > sql.indexOf("begin;"), `${name}: lock_timeout inside the transaction`);
  assert.ok(lockTimeout < sql.indexOf("for update"), `${name}: lock_timeout before row locks`);
  assert.ok(sql.lastIndexOf("commit;") > sql.lastIndexOf("update public."), `${name}: COMMIT after writes`);

  const seriesUpdates = [...sql.matchAll(/update public\.series s\s+set ([\s\S]*?)\bfrom ([a-z0-9_.]+) t\s+where ([^;]*);/g)];
  assert.equal(seriesUpdates.length, 1, `${name}: one series UPDATE via snapshot`);
  assert.equal((sql.match(/update public\./g) ?? []).length, 1, `${name}: no other public UPDATE`);
  const [, set, from, where] = seriesUpdates[0];
  assert.equal(from, SNAPSHOT);
  assert.match(where, /^\s*s\.id = t\.series_id\b/, `${name}: keyed by snapshot`);
  const cols = [...set.matchAll(/([a-z_]+)\s*=/g)].map((m) => m[1]);
  assert.deepEqual(cols, ["effect_settings"], `${name}: only effect_settings`);
  assert.match(sql, /if v_series <> 28 then/, `${name}: row-count check`);
}

const apply = lower["apply.sql"];
assert.match(apply, /set effect_settings = t\.effect_settings_after/);
assert.match(apply, /and s\.effect_settings is null;/, "apply writes only NULL settings");
assert.match(apply, /jsonb_build_object\('legacyattribution', t\.legacy\)/);
for (const marker of [
  "legacy_attribution_already_applied",
  "legacy_attribution_target_count_mismatch",
  "legacy_attribution_series_missing",
  "legacy_attribution_title_drift",
  "legacy_attribution_settings_not_null",
  "legacy_attribution_author_drift",
  "legacy_attribution_record_shape",
]) {
  assert.ok(apply.includes(marker), `apply.sql: guard ${marker}`);
  assert.ok(apply.indexOf(marker) < apply.indexOf("update public."), `apply.sql: ${marker} precedes writes`);
}

const rollback = lower["rollback.sql"];
assert.match(rollback, /set effect_settings = t\.effect_settings_before/, "rollback restores stored value");
assert.match(rollback, /and s\.effect_settings = t\.effect_settings_after;/, "rollback only rows still as applied");
for (const marker of [
  "legacy_attribution_rollback_snapshot_scope_mismatch",
  "legacy_attribution_rollback_state_drift",
]) {
  assert.ok(rollback.indexOf(marker) >= 0 && rollback.indexOf(marker) < rollback.indexOf("update public."),
    `rollback.sql: ${marker} precedes writes`);
}

console.log("legacy official attribution SQL scope check: OK (28 targets)");
