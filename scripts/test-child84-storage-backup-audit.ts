import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync("scripts/child84-storage-recovery-audit.sql","utf8");
const plan = readFileSync("docs/child84-backup-and-storage-recovery.md","utf8");
const uncommented = sql.replace(/^--.*$/gm,"").trim();
assert.ok(uncommented.startsWith("BEGIN READ ONLY;"));
assert.ok(uncommented.endsWith("COMMIT;"));
assert.equal(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|CALL|EXECUTE)\b/i.test(uncommented),false,
  "Inventory query must never mutate Production DB data or grants");
for (const x of [
 "storage.buckets","storage.objects","public.recordings",
 "split_part(audio_storage_path,'recording-audio/',2)",
 "no_recordings_direct_reference","matched_to_recordings","distinct_audio_paths"
]) assert.ok(sql.includes(x), x);
for (const x of [
 "2,277/2,277", "2,443", "30,189,639,005",
 "not referenced by", "Do not", "backup", "restore"
]) assert.ok(plan.toLowerCase().includes(x.toLowerCase()), x);
assert.ok(plan.includes("https://supabase.com/docs/guides/platform/backups"));
console.log("PASS: Child84 Storage audit SQL is read-only and backup gates are explicit");
