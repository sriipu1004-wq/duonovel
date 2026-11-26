import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// KD-2: the five tables whose RLS is enabled in production (checked
// 2026-11-26) must also have RLS enabled by the migrations, and that
// migration must not add or change policies or grants.

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const FILE = "20261126120000_kd2_enable_rls_social_tables.sql";
const TABLES = [
  "author_follows",
  "author_profile_likes",
  "reader_card_likes",
  "bgm_library_favorites",
  "nemo_generation_queue",
];

const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
assert.ok(files.includes(FILE), `${FILE} exists`);

const stripComments = (sql: string) =>
  sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");

const migration = stripComments(readFileSync(path.join(migrationsDir, FILE), "utf8"));
for (const table of TABLES) {
  assert.match(
    migration,
    new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security\\s*;`, "i"),
    `${table}: RLS enabled`
  );
}
// One transaction with a lock timeout first (each statement takes a brief
// ACCESS EXCLUSIVE lock), then only the five statements: no policy, grant,
// revoke, drop or disable.
const statements = migration.split(";").map((part) => part.trim().toLowerCase()).filter(Boolean);
assert.equal(statements[0], "begin", "explicit transaction");
assert.equal(statements[1], "set local lock_timeout = '3s'", "lock timeout before any alter");
assert.equal(statements[statements.length - 1], "commit", "commit at the end");
assert.equal(statements.length, TABLES.length + 3, "exactly one statement per table");
assert.doesNotMatch(migration, /\b(create|drop|alter)\s+policy\b/i, "no policy change");
assert.doesNotMatch(migration, /\b(grant|revoke)\b/i, "no grant change");
assert.doesNotMatch(migration, /\bdisable\s+row\s+level\s+security\b/i, "never disables RLS");

// Every table is created by an earlier migration, and no later migration
// turns RLS off again.
const index = files.indexOf(FILE);
for (const table of TABLES) {
  const creator = files
    .slice(0, index)
    .find((name) =>
      new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?public\\.${table}\\b`, "i").test(
        stripComments(readFileSync(path.join(migrationsDir, name), "utf8"))
      )
    );
  assert.ok(creator, `${table}: created before ${FILE}`);
}
for (const name of files) {
  const sql = stripComments(readFileSync(path.join(migrationsDir, name), "utf8"));
  for (const table of TABLES) {
    assert.doesNotMatch(
      sql,
      new RegExp(`alter\\s+table\\s+public\\.${table}\\s+disable\\s+row\\s+level\\s+security`, "i"),
      `${name}: does not disable RLS on ${table}`
    );
  }
}

console.log("PASS: KD-2 RLS enable migration for five tables (no policy/grant change)");
