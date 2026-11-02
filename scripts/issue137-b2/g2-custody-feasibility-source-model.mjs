// Issue #137 G2: source-backed credential custody + capability MODEL only.
// No credentials, live provider, accounts, filesystem writes or real WORM test.
// Pricing/provider capability statements belong to reviewed provider docs,
// not to claims of this local model's measured external service behavior.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
for(const k of ["SUPABASE_SERVICE_ROLE_KEY","AWS_SECRET_ACCESS_KEY",
 "S3_SECRET_ACCESS_KEY","B2_SERVICE_KEY","CLOUDFLARE_API_TOKEN"])
 assert.equal(process.env[k],undefined,"must not inherit hosted credentials");
const source=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");
const admin=source("src/lib/supabase/admin.ts");
const proxy=source("src/lib/recording/privateMediaProxy.ts");
const signer=source("src/app/api/recordings/human-upload-session/route.ts");
const uploader=source("src/lib/recording/humanRecordingPublish.ts");
const brokerPolicy=source("scripts/issue137-b2/human-broker-private-rls-fence-local.sql");
const brokerTest=source("scripts/issue137-b2/human-broker-private-rls-fence-e2e.mjs");
const privilegeGraph=source("scripts/issue137-b2/recording-credential-route-dependencies.mjs");
const inventory=source("scripts/issue137-b2/s3-public-writer-inventory.mjs");
let checks=0;
function expect(actual,want,why){assert.equal(actual,want,why);checks++;}
expect(admin.includes("SUPABASE_SERVICE_ROLE_KEY"),true,
 "current admin client still requires service-role credential");
expect(proxy.includes("SUPABASE_SERVICE_ROLE_KEY"),true,
 "current private proxy still uses a privileged key");
expect(signer.includes("createSignedUploadUrl"),true,
 "current app still mints signed upload bearer URLs");
expect(uploader.includes(".upload("),true,
 "existing Human publisher still directly uploads via admin path");
expect(brokerPolicy.includes("for update to authenticated"),true,
 "local broker restrictive UPDATE policy exists");
expect(brokerPolicy.includes("for delete to authenticated"),true,
 "local broker restrictive DELETE policy exists");
expect(brokerTest.includes("broker cannot mutate older version"),true,
 "local E2E contains second revision overwrite denial");
expect(brokerTest.includes("privileged service-role still overwrites"),true,
 "local E2E explicitly attempts service role hostile control");
expect(brokerTest.includes("new edition of PRIVATE audio uses distinct"),true,
 "local E2E checks versioned object key");
expect(inventory.includes('"s3_key_reference"'),true,
 "whole tracked-source S3 credential candidate scan remains present");
const privilegedLabels=[...privilegeGraph.matchAll(
 /\["([^"]+)","(?:app\/api\/recordings\/[^"]+\/route\.ts)","privileged"\]/g
)].map(x=>x[1]);
expect(privilegedLabels.length,13,
 "13 recognized privileged recording route dependencies still need custody audit");
expect(privilegedLabels.includes("human-private-audio"),true,
 "private audio GET is still in the privileged route inventory");
expect(privilegedLabels.includes("human-upload-session"),true,
 "Human multipart signer is privileged");

const accessTypes=["ordinary-owner","restricted-broker","service-role",
 "generated-s3-key","session-jwt-s3"];
const bypassRls=principal=>["service-role","generated-s3-key"].includes(principal);
const canMutateExistingInCurrentSupabase=principal=>
 bypassRls(principal); // model of this synthetic broker-private bucket only
for(const principal of accessTypes) {
 expect(canMutateExistingInCurrentSupabase(principal),
  ["service-role","generated-s3-key"].includes(principal),
  principal+" should respect local restrictive update/delete fence unless bypass");
}
const fixture={
 ownerJwtIsolated:true,brokerJwtIsolated:true,allServiceRoleWritersRemoved:false,
 allGeneratedS3WritersRemoved:false,providerImmutableVersion:false,
 oldSignedBearersBlocked:false,oldPublicUrlRetired:false,
 deployGraphReviewed:false,backupsAndRestoreReviewed:false,
 sourceRightsVerified:false,readerE2eVerified:false,
};
const ready=s=>Object.values(s).every(x=>x===true);
expect(ready(fixture),false,"current project cannot claim complete G2 custody");
expect(ready({...fixture,brokerJwtIsolated:false}),false,
 "unprotected broker JWT can substitute audio at first write");
expect(ready({...fixture,allServiceRoleWritersRemoved:true}),false,
 "S3/admin/restore/legacy routes remain unresolved");
expect(ready({...fixture,allServiceRoleWritersRemoved:true,
 allGeneratedS3WritersRemoved:true}),false,
 "removing bypass credentials alone does not supply immutable revisions");
expect(ready({...fixture,providerImmutableVersion:true}),false,
 "provider lock alone does not revoke old signed or public URLs");
expect(ready({...fixture,oldSignedBearersBlocked:true,
 oldPublicUrlRetired:true}),false,
 "old URL retirement alone does not prevent full-privilege overwrites");
expect(ready(Object.fromEntries(Object.keys(fixture).map(k=>[k,true]))),
 true,"only a hypothetical fully proven release checklist could be ready");

// Alternative provider capabilities are assumptions for decision modeling,
// documented against current first-party docs (not an external E2E).
function scopeScenario(s) {
 return s.objectWriterHasAdminRuleControl?
  "LOCK_CONFIGURATION_REVOCABLE":
  s.bucketLockEnforced? "OBJECT_OVERWRITE_BLOCKED_DURING_LOCK":
  s.createOnlyConditional? "FIRST_WRITE_ONLY_UNLESS_OTHER_WRITER":
  "WRITE_MUTABLE";
}
expect(scopeScenario({bucketLockEnforced:true,
 objectWriterHasAdminRuleControl:false}),"OBJECT_OVERWRITE_BLOCKED_DURING_LOCK",
 "distinct config admin and bucket writer should be segregated");
expect(scopeScenario({bucketLockEnforced:true,
 objectWriterHasAdminRuleControl:true}),"LOCK_CONFIGURATION_REVOCABLE",
 "same privileged actor can change bucket retention rule");
expect(scopeScenario({createOnlyConditional:true}),"FIRST_WRITE_ONLY_UNLESS_OTHER_WRITER",
 "If-None-Match alone does not exclude other privileged writers");
expect(scopeScenario({}),"WRITE_MUTABLE","no lock or conditional first-write");
const canDeleteUserAudio=lock=>lock!=="permanent"&&lock!=="compliance-unexpired";
expect(canDeleteUserAudio("permanent"),false,
 "indefinite retention conflicts with ordinary deletion workflow");
expect(canDeleteUserAudio("compliance-unexpired"),false,
 "active compliance retention prevents early deletion");
expect(canDeleteUserAudio("none"),true,"no lock permits deletion if access allows");
console.log("PASS: #137 G2 credential custody SOURCE+MODEL "+checks+
 " checks, 13 privileged route candidates, broker first-write versus bypass and "+
 " hypothetical storage lock/deletion gates");
console.log("HOLD: this is not verified deployed credential inventory or external "+
 "object lock E2E; complete physical immutability and release are NOT proven");
