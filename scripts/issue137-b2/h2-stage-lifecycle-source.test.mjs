// #137 H2 nonprod static guard against accidental regression to bearer-only
// temp handling. Dynamic GoTrue/Storage negatives are separately in CI.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const load=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");
const issued=load("src/app/api/recordings/human-upload-session/route.ts");
const finished=load("src/app/api/recordings/human-upload-finalize/route.ts");
const aborted=load("src/app/api/recordings/human-upload-abort/route.ts");
const studio=load("src/components/recording/RecordingStudioPage.tsx");
const helper=load("src/lib/recording/humanStagingLease.ts");
const sql=load("scripts/issue137-b2/r0-h2-signed-staging-lease-extension.sql");
let pass=0;
function has(src,pattern,message){assert.match(src,pattern,message);pass++}
function lacks(src,pattern,message){assert.doesNotMatch(src,pattern,message);pass++}
has(issued,/supabase\.auth\.getUser\(\)/u,"issue must authenticate");
has(issued,/consent\?\.consent_version !== RECORDING_GLOBAL_CONSENT_VERSION/u,
 "issuance checks consent before server-only RPC");
has(issued,/series\.publication_status !== "public"/u,"source must currently be public");
has(issued,/episode\.posting_status !== "posted"/u,"episode must currently be posted");
has(issued,/openHumanStagingLease\(adminSupabase, lease/u,"lease created before bearer token");
has(issued,/createSignedUploadUrl\(part\.objectPath,[\s\S]*?upsert: false/u,
 "new bearer cannot overwrite prior stage");
lacks(issued,/createSignedUploadUrl\(part\.objectPath,\s*\{\s*upsert: true/u,
 "unsafe upsert never signed");
has(issued,/closeHumanStagingLease\(adminSupabase, lease, "abort"\)/u,
 "partial token issuance failure closes lease");
has(finished,/closeHumanStagingLease\(admin,[\s\S]*?"seal"\)/u,
 "finalize seals server lease");
assert.ok(finished.indexOf("closeHumanStagingLease")<
 finished.indexOf(".download(part.objectPath)"),"seal before staging bytes read");pass++;
lacks(finished,/\.remove\(tempObjectPaths\)/u,
 "must not immediately delete private parts with outstanding old bearer");
has(aborted,/supabase\.auth\.getUser\(\)/u,"abort requires current owner auth");
has(aborted,/closeHumanStagingLease\(createAdminClient\(\)/u,
 "abort only through server-scoped lease RPC");
has(studio,/abortHumanMultipartLease\(unfinishedMultipart\)/u,
 "UI attempts to close an issued lease after a failed multipart save");
has(studio,/uploadSessionId: args\.sessionId/u,
 "UI abort request uses exact server-minted session identifier");
lacks(aborted,/\.storage\.from[\s\S]*?\.remove\(/u,
 "abort never destroys still-in-flight private media");
has(helper,/human_staging_\$\{context\}_unavailable/u,"unavailable RPC fails closed");
lacks(helper,/\.from\("storage\.objects"\)/u,"no unsafe direct fallback");
has(sql,/issue137_h2_stage_storage_guard/u,
 "Storage trigger mandatory to block already-minted token");
has(sql,/l\.expires_at<=clock_timestamp\(\)/u,"server time enforces expiry");
has(sql,/l\.state<>'active'/u,"closed bearer can no longer stage");
has(sql,/h2_source_is_staging_eligible\(sid,eid,aid\)/u,
 "upload-time source, episode and consent verification");
has(sql,/for share/u,"lease/source locking serializes revoked writes");
has(sql,/retire_after timestamptz not null default clock_timestamp\(\)\+interval '3 hours'/u,
 "retirement grace exceeds signed token lifetime");
has(sql,/H2_STAGE_PHYSICAL_OR_REFERENCE_REMAINS/u,
 "retirement receipt must check actual Storage objects and references");
has(sql,/revoke all on function public\.issue137_h2_stage_claim_retirement\(uuid\)/u,
 "janitor RPC not anonymous");
console.log("PASS: #137 H2 staging issuance/finalize/abort, DB lease, and delayed cleanup "+
 pass+" SOURCE assertions (in addition to live local Storage negatives)");
