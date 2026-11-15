// Issue #139 (rights): static scope check for the narration-move SQL.
// Proves mechanically that the Production SQL names only the 8 target series,
// writes only recordings.audio_storage_path through the snapshot join, never
// writes Storage (storage.objects is only read), sets a lock_timeout and
// checks the 330 / 660 counts. Run: node scripts/issue139-us104a-audio-private/scope-check.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { TARGET_SETS } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const code = (dir, name) => readFileSync(join(here, dir, name), "utf8").replace(/--[^\n]*/g, "").toLowerCase();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

for (const [setName, set] of Object.entries(TARGET_SETS)) {
  const TARGETS = new Set(set.series);
  const snap = setName === "us104a" ? "20261115" : `${setName}_20261115`;
  const files = {
    "dryrun.sql": code(set.sqlDir, "dryrun.sql"),
    "db-apply.sql": code(set.sqlDir, "db-apply.sql"),
    "db-rollback.sql": code(set.sqlDir, "db-rollback.sql"),
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
    assert.doesNotMatch(sql, /\bupdate\s+storage\./, `${name}: Storage rows are never written from SQL`);
    const updates = [...sql.matchAll(/(?<!\bfor )\bupdate\s+([a-z0-9_.]+)/g)].map((m) => m[1]);
    for (const table of updates) assert.equal(table, "public.recordings", `${name}: UPDATE of ${table}`);
    for (const m of sql.matchAll(/\bset\s+([a-z_]+)\s*=/g)) {
      if (m[1] === "local") continue;
      assert.equal(m[1], "audio_storage_path", `${name}: writes column ${m[1]}`);
    }
  }

  assert.match(files["dryrun.sql"], /^\s*begin read only;/, "dryrun must be read-only");
  assert.match(files["dryrun.sql"], /\brollback;\s*$/, "dryrun must end with rollback");
  assert.doesNotMatch(files["dryrun.sql"], /\b(update|insert|create|alter|drop|delete)\b/, "dryrun must not write");

  for (const name of ["db-apply.sql", "db-rollback.sql"]) {
    const sql = files[name];
    assert.match(sql, /^\s*begin;/, `${name}: one transaction`);
    assert.match(sql, /\bcommit;\s*$/, `${name}: ends with commit`);
    assert.match(sql, /set local lock_timeout = '5s'/, `${name}: lock_timeout`);
    assert.match(sql, new RegExp(`<> ${set.recordings}\\b`), `${name}: ${set.recordings} row guard`);
    assert.match(sql, new RegExp(`<> ${set.objects}\\b`), `${name}: ${set.objects} object guard`);
    if (setName !== "us104a") {
      assert.doesNotMatch(sql, /<> (330|660)\b/, `${name}: guard counts of the 8-series set`);
    }
    assert.match(sql, new RegExp(`libread_internal\\.issue139_audio_private_${snap} t\\s+where r\\.id = t\\.recording_id`),
      `${name}: UPDATE goes through the snapshot join`);
  }
  assert.match(files["db-apply.sql"], /issue139_audio_already_applied/, "apply refuses a second run");
  assert.match(files["db-apply.sql"], /bucket_id = 'ai-narration-private'/, "apply checks the private copies");
  assert.match(files["db-rollback.sql"], /bucket_id = 'recording-audio'/, "rollback checks the public originals");
  assert.match(files["db-rollback.sql"], new RegExp(`drop table libread_internal\\.issue139_audio_private_${snap};`), "rollback drops snapshot");

}

console.log("issue139 audio-private scope check OK (sets: us104a, kotou)");
