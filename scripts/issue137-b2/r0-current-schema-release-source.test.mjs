// #137 OFFLINE current-schema source contract. No DB client or remote calls.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const dir=fileURLToPath(new URL("./",import.meta.url));
function read(name){return readFileSync(dir+name,"utf8")}
const semantic=read("r0-high-risk-live-semantic-readonly.sql");
const migration=read("r0-b2-unified-local-candidate.sql");
const tests=read("r0-b2-auth-storage-negative-e2e.mjs");
function must(condition,label){assert.ok(condition,label)}
function checkSemantic(sql){
 must(sql.trimStart().startsWith("-- #137 SOURCE/READ-ONLY"),"read-only source label");
 must((sql.match(/BEGIN READ ONLY;/g)||[]).length===1,"must explicitly begin READ ONLY");
 must((sql.match(/ROLLBACK;/g)||[]).length===1,"must explicitly ROLLBACK");
 must(sql.trimEnd().endsWith("ROLLBACK;"),"must end rollback");
 const checks=[...sql.matchAll(/^ \('(RLS|RPC|BILLING|STORAGE|PENDING)','([^']+)'/gm)];
 must(checks.length===27,"expected 27 selected semantic checks");
 must(new Set(checks.map(m=>m[2])).size===27,"check identifiers unique");
 must(sql.includes("RELEASE_HOLD_UNTIL_RIGHTS_RECOVERY_HISTORY_INDEPENDENT_GO"),
  "must never imply authorization");
 return checks.length;
}
function checkCandidate(sql){
 must((sql.match(/^create trigger issue137_b2_/gm)||[]).length===9,
  "exactly nine B2 triggers, no duplicate install");
 must(!/^create trigger issue137_r0_/m.test(sql),"no overlapping R0 trigger");
 must((sql.match(/create or replace function libread_internal.guard_recording_media_reference\(\)/g)||[]).length===1,
  "one recording guard function");
 must((sql.match(/create or replace function libread_internal.is_verified_private_ai_recording\(/g)||[]).length===1,
  "one private AI physical verifier");
 must(sql.includes("storage.objects o join storage.buckets b on b.id=o.bucket_id"),
  "private AI physical Storage existence check");
 must(sql.includes("B2_PRIVATE_AI_AUDIO_MISSING"),"missing private AI pointer denial");
 must(sql.includes("reader_id,reader_user_id,reader_name,voice_model_id"),
  "Human identity mutation trigger columns");
 must(sql.includes("ISSUE137_PUBLIC_MEDIA_CONTAINMENT_REQUIRED"),
  "re-publication and public media hold");
 must(sql.includes("create policy issue137_b2_series_r18_boundary") &&
   sql.includes("as restrictive for select"),"R18 restrictive policy");
 must(sql.includes("set local lock_timeout = '5s'"),"bounded lock");
 must(sql.includes("set local statement_timeout = '120s'"),"bounded statement");
 must(sql.trimEnd().endsWith("commit;"),"explicit transaction");
}
checkSemantic(semantic);
checkCandidate(migration);
for(const phrase of [
 "PRIVATE AI pointer without object bytes rejected",
 "correct source/episode physical PRIVATE AI recording accepted",
 "AI private path with wrong episode ID rejected",
 "AI private pointer changed to missing object rejected",
 "post-insert Human narrator reader_id reassignment denied",
 "post-insert Human narrator reader_user_id reassignment denied",
 "post-insert Human narrator display-name removal denied",
 "post-insert Human voice provenance conversion denied"
])must(tests.includes(phrase),"missing real LOCAL negative assertion "+phrase);
assert.throws(()=>checkSemantic(semantic.replace("BEGIN READ ONLY;","BEGIN;")));
assert.throws(()=>checkCandidate(migration.replace("B2_PRIVATE_AI_AUDIO_MISSING","UNSAFE_ALLOW")));
assert.throws(()=>checkCandidate(migration.replace("reader_id,reader_user_id,reader_name,voice_model_id","")));
console.log("ISSUE137_CURRENT_SCHEMA_RC_SOURCE_PASS 27 scoped live-metadata checks, 9 B2 triggers, 8 private pointer/identity real-LOCAL assertions");
console.log("RELEASE_HOLD: source/metadata PASS is NOT hosted compatibility, migration history repair, rights GO or Production approval");
