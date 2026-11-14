// Issue #139: static scope check for the publish / rollback SQL.
// Proves mechanically that the Production SQL names only the 4 approved
// series, writes only series/episodes publication columns through the
// snapshot join, and checks the expected 4 / 12 row counts.
// Run: node scripts/issue139-aozora-publish/scope-check.mjs (no dependencies)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), "utf8");
// Strip SQL line comments so prose cannot satisfy or break a check.
const code = (sql) => sql.replace(/--[^\n]*/g, "").toLowerCase();

const TARGETS = new Set([
  "e47476bc-07d3-4c65-86a1-78237e3c6948",
  "6d832ac6-b457-43ff-97ef-50281b337ca3",
  "7babc9f9-f015-4135-ba92-da0f54864158",
  "a173c008-3e53-4126-927b-366e44a69b48",
]);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const SNAPSHOT_SERIES = "libread_internal.issue139_publish_series_20261115";
const SNAPSHOT_EPISODES = "libread_internal.issue139_publish_episodes_20261115";

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
  assert.doesNotMatch(sql, /\binsert\s+into\s+public\./, `${name}: INSERT into public is not allowed`);
  assert.doesNotMatch(sql, /\b(alter|drop|create)\s+(table|view|function|policy|trigger)\s+public\./,
    `${name}: DDL on public is not allowed`);
  assert.doesNotMatch(sql, /\bexecute\s+['"(]/, `${name}: dynamic SQL is not allowed`);

  // Every UPDATE targets an allowed table.
  // Row locks ("for update [of x]") are not writes.
  const updates = [...sql.matchAll(/(?<!\bfor )\bupdate\s+([a-z0-9_.]+)/g)].map((m) => m[1]);
  for (const table of updates) {
    assert.ok(
      ["public.series", "public.episodes", SNAPSHOT_EPISODES].includes(table),
      `${name}: UPDATE of ${table} is not allowed`,
    );
  }
}

assert.match(files["dryrun.sql"], /^\s*begin read only;/, "dryrun must be read-only");
assert.match(files["dryrun.sql"], /\brollback;\s*$/, "dryrun must end with rollback");
assert.doesNotMatch(files["dryrun.sql"], /\b(update|insert|create|alter|drop)\b/, "dryrun must not write");

for (const name of ["apply.sql", "rollback.sql"]) {
  const sql = files[name];
  // One transaction.
  assert.equal((sql.match(/^\s*begin;/gm) ?? []).length, 1, `${name}: exactly one BEGIN`);
  assert.equal((sql.match(/^\s*commit;/gm) ?? []).length, 1, `${name}: exactly one COMMIT`);
  assert.ok(sql.indexOf("begin;") < sql.indexOf("update "), `${name}: writes inside the transaction`);
  assert.ok(sql.lastIndexOf("commit;") > sql.lastIndexOf("update "), `${name}: COMMIT after writes`);

  // Writes to public tables go only through the snapshot join on the row key.
  const seriesUpdates = [...sql.matchAll(/update public\.series s\s+set ([\s\S]*?)\bfrom ([a-z0-9_.]+) t\s+where ([^;]*);/g)];
  const episodeUpdates = [...sql.matchAll(/update public\.episodes e\s+set ([\s\S]*?)\bfrom ([a-z0-9_.]+) t\s+where ([^;]*);/g)];
  assert.equal(seriesUpdates.length, 1, `${name}: one series UPDATE via snapshot`);
  assert.equal(episodeUpdates.length, 1, `${name}: one episodes UPDATE via snapshot`);
  assert.equal((sql.match(/update public\./g) ?? []).length, 2, `${name}: no other public UPDATE`);
  const [, seriesSet, seriesFrom, seriesWhere] = seriesUpdates[0];
  const [, episodeSet, episodeFrom, episodeWhere] = episodeUpdates[0];
  assert.equal(seriesFrom, SNAPSHOT_SERIES);
  assert.equal(episodeFrom, SNAPSHOT_EPISODES);
  assert.match(seriesWhere, /^\s*s\.id = t\.series_id\b/, `${name}: series UPDATE keyed by snapshot`);
  assert.match(episodeWhere, /^\s*e\.id = t\.episode_id\b/, `${name}: episodes UPDATE keyed by snapshot`);

  const setColumns = (set) => [...set.matchAll(/([a-z_]+)\s*=/g)].map((m) => m[1]).sort();
  assert.deepEqual(setColumns(seriesSet), ["is_public", "publication_status"], `${name}: series columns`);
  const episodeCols = setColumns(episodeSet);
  for (const col of episodeCols) {
    assert.ok(
      ["is_published", "last_edited_at", "posted_at", "posting_status", "scheduled_for"].includes(col),
      `${name}: episodes column ${col} is not allowed`,
    );
  }

  // Row-count checks for 4 series / 12 episodes.
  assert.match(sql, /if v_series <> 4 then/, `${name}: series row-count check`);
  assert.match(sql, /if v_episodes <> 12 then/, `${name}: episodes row-count check`);
  assert.match(sql, /raise exception/, `${name}: guards raise`);
}

const apply = files["apply.sql"];
// Snapshot is built from the fixed 4 ids, episodes only via that snapshot.
assert.match(apply, new RegExp(`insert into ${SNAPSHOT_SERIES.replace(".", "\\.")}[\\s\\S]*?join public\\.series s on s\\.id = t\\.series_id;`));
assert.match(apply, new RegExp(`insert into ${SNAPSHOT_EPISODES.replace(".", "\\.")}[\\s\\S]*?join ${SNAPSHOT_SERIES.replace(".", "\\.")} t on t\\.series_id = e\\.series_id;`));
// Pre-write guards on count and current private Draft state.
for (const marker of [
  "issue139_publish_series_count_mismatch",
  "issue139_publish_episode_count_mismatch",
  "issue139_publish_series_state_drift",
  "issue139_publish_episode_state_drift",
]) {
  assert.ok(apply.includes(marker), `apply.sql: guard ${marker}`);
  assert.ok(apply.indexOf(marker) < apply.indexOf("update public."), `apply.sql: ${marker} precedes writes`);
}
// Rights metadata and warnings are only read, never written.
assert.doesNotMatch(apply, /set[^;]*\b(effect_settings|content_warnings|content_rating)\s*=/);

const rollback = files["rollback.sql"];
assert.match(rollback, /posted_at = t\.posted_at_before/, "rollback restores stored posted_at");
assert.match(rollback, /last_edited_at = t\.last_edited_at_before/, "rollback restores stored last_edited_at");
assert.match(rollback, /is_public = t\.is_public_before/, "rollback restores stored is_public");
assert.ok(rollback.indexOf("issue139_rollback_episode_state_drift") < rollback.indexOf("update public."),
  "rollback drift guard precedes writes");

console.log("issue139 publish SQL scope check: OK");
