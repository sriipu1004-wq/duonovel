// Issue #139 (rights): static scope check for the unpublish / rollback SQL.
// Proves mechanically that the Production SQL names only the 8 target series,
// writes only series.publication_status / series.is_public through the
// snapshot join, never writes chapters, recordings or translations, sets a
// lock_timeout and checks the expected 8 / 63 row counts.
// Run: node scripts/issue139-us104a-unpublish/scope-check.mjs (no dependencies)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), "utf8");
// Strip SQL line comments so prose cannot satisfy or break a check.
const code = (sql) => sql.replace(/--[^\n]*/g, "").toLowerCase();

const TARGETS = new Set([
  "8514e9da-7864-4dad-a397-de06abee8fdc",
  "d5cc7bf2-c76e-49e8-a078-150636fc0344",
  "4d328931-ca04-4843-bcb5-9ac080cfbbf1",
  "ac25272b-fc09-4f20-a94a-816791e750d0",
  "82309887-add7-4406-aa18-d8a435c3b967",
  "f7ba9cd3-0ede-48df-92d7-2ea297f33475",
  "833b0303-d034-4ebb-ae6f-e023dd765a64",
  "4f48c202-3ba1-47cb-b887-90880534c96e",
]);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const SNAPSHOT_SERIES = "libread_internal.issue139_unpublish_series_20261115";
const esc = (s) => s.replace(/[.]/g, "\\.");

const files = {
  "dryrun.sql": code(read("dryrun.sql")),
  "apply.sql": code(read("apply.sql")),
  "rollback.sql": code(read("rollback.sql")),
};

for (const [name, sql] of Object.entries(files)) {
  const ids = sql.match(UUID) ?? [];
  for (const id of ids) assert.ok(TARGETS.has(id), `${name}: non-target id ${id}`);
  for (const id of TARGETS) assert.ok(ids.includes(id), `${name}: target ${id} missing`);

  assert.doesNotMatch(sql, /\bdelete\s+from\b/, `${name}: DELETE is not allowed`);
  assert.doesNotMatch(sql, /\btruncate\b/, `${name}: TRUNCATE is not allowed`);
  assert.doesNotMatch(sql, /\binsert\s+into\s+(public|auth|storage)\./, `${name}: INSERT outside libread_internal`);
  assert.doesNotMatch(sql, /\b(alter|drop|create)\s+(table|view|function|policy|trigger)\s+(public|auth|storage)\./,
    `${name}: DDL outside libread_internal`);
  assert.doesNotMatch(sql, /\bexecute\s+['"(]/, `${name}: dynamic SQL is not allowed`);

  // Every UPDATE is the one series UPDATE (row locks "for update" are not writes).
  const updates = [...sql.matchAll(/(?<!\bfor )\bupdate\s+([a-z0-9_.]+)/g)].map((m) => m[1]);
  for (const table of updates) {
    assert.equal(table, "public.series", `${name}: UPDATE of ${table} is not allowed`);
  }
}

assert.match(files["dryrun.sql"], /^\s*begin read only;/, "dryrun must be read-only");
assert.match(files["dryrun.sql"], /\brollback;\s*$/, "dryrun must end with rollback");
assert.doesNotMatch(files["dryrun.sql"], /\b(update|insert|create|alter|drop|delete)\b/, "dryrun must not write");

for (const name of ["apply.sql", "rollback.sql"]) {
  const sql = files[name];
  // One transaction, with lock_timeout set before any lock or write.
  assert.equal((sql.match(/^\s*begin;/gm) ?? []).length, 1, `${name}: exactly one BEGIN`);
  assert.equal((sql.match(/^\s*commit;/gm) ?? []).length, 1, `${name}: exactly one COMMIT`);
  const lockTimeout = sql.search(/^\s*set local lock_timeout = '\d+s';/m);
  assert.ok(lockTimeout > sql.indexOf("begin;"), `${name}: lock_timeout inside the transaction`);
  assert.ok(lockTimeout < sql.indexOf("for update"), `${name}: lock_timeout before row locks`);
  assert.ok(sql.lastIndexOf("commit;") > sql.lastIndexOf("update public."), `${name}: COMMIT after writes`);

  // Exactly one public write: the series UPDATE through the snapshot join.
  const seriesUpdates = [...sql.matchAll(/update public\.series s\s+set ([\s\S]*?)\bfrom ([a-z0-9_.]+) t\s+where ([^;]*);/g)];
  assert.equal(seriesUpdates.length, 1, `${name}: one series UPDATE via snapshot`);
  assert.equal((sql.match(/update public\./g) ?? []).length, 1, `${name}: no other public UPDATE`);
  const [, set, from, where] = seriesUpdates[0];
  assert.equal(from, SNAPSHOT_SERIES);
  assert.match(where, /^\s*s\.id = t\.series_id\b/, `${name}: series UPDATE keyed by snapshot`);
  const cols = [...set.matchAll(/([a-z_]+)\s*=/g)].map((m) => m[1]).sort();
  assert.deepEqual(cols, ["is_public", "publication_status"], `${name}: series columns`);

  assert.match(sql, /if v_series <> 8 then/, `${name}: series row-count check`);
  assert.match(sql, /<> 63/, `${name}: chapter count check`);
}

const apply = files["apply.sql"];
assert.match(apply, /set publication_status = 'private', is_public = false/);
assert.match(apply, new RegExp(`insert into ${esc(SNAPSHOT_SERIES)}[\\s\\S]*?join public\\.series s on s\\.id = t\\.series_id;`));
for (const marker of [
  "issue139_unpublish_already_applied",
  "issue139_unpublish_series_count_mismatch",
  "issue139_unpublish_episode_count_mismatch",
  "issue139_unpublish_series_state_drift",
  "issue139_unpublish_episode_state_drift",
  "issue139_unpublish_episode_numbering_drift",
  "issue139_unpublish_author_drift",
]) {
  assert.ok(apply.includes(marker), `apply.sql: guard ${marker}`);
  assert.ok(apply.indexOf(marker) < apply.indexOf("update public."), `apply.sql: ${marker} precedes writes`);
}

const rollback = files["rollback.sql"];
assert.match(rollback, /publication_status = t\.publication_status_before/, "rollback restores stored status");
assert.match(rollback, /is_public = t\.is_public_before/, "rollback restores stored is_public");
for (const marker of [
  "issue139_unpublish_rollback_snapshot_scope_mismatch",
  "issue139_unpublish_rollback_series_state_drift",
  "issue139_unpublish_rollback_episode_state_drift",
  "issue139_unpublish_rollback_episode_set_changed",
]) {
  assert.ok(rollback.indexOf(marker) >= 0 && rollback.indexOf(marker) < rollback.indexOf("update public."),
    `rollback.sql: ${marker} precedes writes`);
}

console.log("issue139 us104a unpublish SQL scope check: OK");
