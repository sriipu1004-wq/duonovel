import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source-only regression. No DB connection is ever opened by this script.
const sql = readFileSync("scripts/child84-readonly-restore-schema-fingerprint.sql", "utf8");
const cleaned = sql.replace(/^\s*--.*$/gm, "").trim();
assert.ok(cleaned.startsWith("BEGIN READ ONLY;"));
assert.ok(cleaned.endsWith("COMMIT;"));
assert.equal((sql.match(/BEGIN READ ONLY;/g) ?? []).length, 1);
assert.equal((sql.match(/COMMIT;/g) ?? []).length, 1);
// Strip string constants: descriptive names and SQL source definitions are
// data, not executable statements in this accepted read-only SELECT.
const withoutQuotes = cleaned.replace(/'(?:[^']|'')*'/g, "''");
assert.equal(
  /\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|CALL|EXECUTE|VACUUM|REFRESH|LOCK\s+TABLE)\b/i.test(withoutQuotes),
  false,
  "Schema fingerprint SQL must not write or export database data",
);
for (const category of [
  "relations", "columns", "constraints", "policies", "functions",
  "indexes", "triggers", "anon_authenticated_table_privileges", "extensions",
]) assert.ok(sql.includes("'" + category + "'"), `missing catalog coverage: ${category}`);
for (const guard of [
  "pg_class", "pg_attribute", "pg_constraint", "pg_policy", "pg_proc",
  "pg_index", "pg_trigger", "pg_extension",
  "c.relrowsecurity", "c.relforcerowsecurity", "pg_get_expr",
  "pg_get_functiondef", "pg_get_indexdef", "pg_get_triggerdef",
  "pg_get_userbyid(role_oid)", "FROM unnest(p.polroles) AS roles(role_oid)",
  "has_table_privilege('anon'", "has_table_privilege('authenticated'",
  "sha256(convert_to(", "string_agg(descriptor,E'\\n' ORDER BY descriptor)",
  "GROUP BY category ORDER BY category",
]) assert.ok(sql.includes(guard), `missing catalog invariant: ${guard}`);
assert.ok(!sql.includes("p.polroles::text"), "Role OIDs differ between source and restored clusters");
assert.ok(!sql.includes("SELECT descriptor"), "Do not export raw SQL/function definitions");
assert.ok(!sql.includes("service_role"), "Do not collect privileged tokens");
console.log("PASS: read-only Child84 schema and permissions SHA-256 fingerprint contract");
