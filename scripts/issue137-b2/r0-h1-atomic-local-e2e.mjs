// Issue #137 B2/R0 + H1 REAL local-only GoTrue/PostgREST/Storage test.
// Uses synthetic users/bytes and a disposable unlinked local Supabase stack.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.R0_EPHEMERAL_CONFIRM,"local-only");
const url=new URL(process.env.R0_LOCAL_URL||"");
assert.equal(url.protocol,"http:");
assert.ok(["127.0.0.1","localhost","[::1]"].includes(url.hostname));
assert.ok(["54321","54331"].includes(url.port));
assert.equal(url.pathname,"/");assert.equal(url.search,"");assert.equal(url.hash,"");
for(const key of ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_DB_PASSWORD","SUPABASE_ACCESS_TOKEN"]){
 assert.equal(process.env[key],undefined,"no hosted secret may be inherited");
}
const serviceKey=process.env.R0_SERVICE_KEY||"",anonKey=process.env.R0_ANON_KEY||"";
assert.ok(serviceKey.length>15&&anonKey.length>15&&serviceKey!==anonKey);
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const service=createClient(url.origin,serviceKey,opts),anonymous=createClient(url.origin,anonKey,opts);
const id=()=>randomUUID(),count={pass:0,deny:0};
function pass(value,label){assert.ok(value,label);count.pass++;}
function deny(value,label){assert.ok(value,label);count.deny++;}
async function person(label) {
 const email="r0-h1-"+label+"-"+id()+"@example.invalid";
 const {data,error}=await service.auth.admin.createUser({
  email,password:"R0-H1-"+id()+"aA9!",email_confirm:true
 });
 assert.equal(error,null,label);
 // Hosted series.author_id / recordings.reader_id FKs reference public.users
 // rather than auth.users. Seed the genuine LOCAL public profile first.
 const {error:profileError}=await service.from("users").insert({
  id:data.user.id,display_name:"Synthetic "+label
 });
 assert.equal(profileError,null,"seed synthetic FK-backed public.users profile");
 return data.user.id;
}
async function insert(table,row,label) {
 const {error}=await service.from(table).insert(row);
 assert.equal(error,null,label);
}
async function update(table,rowId,fields,label) {
 const {error}=await service.from(table).update(fields).eq("id",rowId);
 assert.equal(error,null,label);
}
const first=await person("owner"),second=await person("reader");
async function makeSeries(author=first,rating="general"){
 const series=id(),episode=id();
 await insert("series",{
  id:series,author_id:author,publication_status:"public",
  content_rating:rating,recording_permission_mode:"open"
 },"seed synthetic series");
 await insert("episodes",{
  id:episode,series_id:series,episode_number:1,
  posting_status:"posted",is_published:true
 },"seed synthetic episode");
 return {series,episode,author};
}
async function consent(owner){
 const {error}=await service.from("user_recording_consents").upsert({
  user_id:owner,consent_key:"recording_studio_global",consent_version:"2026-04-16"
 });
 assert.equal(error,null,"seed current consent");
}
async function revokeConsent(owner){
 const {error}=await service.from("user_recording_consents")
  .update({consent_version:"withdrawn"})
  .eq("user_id",owner).eq("consent_key","recording_studio_global");
 assert.equal(error,null,"withdraw current consent");
}
function scope(work,owner){return {
 p_series_id:work.series,p_episode_id:work.episode,p_owner_id:owner
};}
async function revision(work,owner){
 const {data,error}=await service.rpc("issue137_h1_human_revision",scope(work,owner));
 assert.equal(error,null,"read revision");
 assert.match(String(data),/^\d+$/u);
 return String(data);
}
async function commit(work,owner,expected,action,extra={}){
 return service.rpc("issue137_h1_human_commit",{
  ...scope(work,owner),p_expected_revision:expected,p_action:action,
  ...extra
 });
}
function path(work,owner,recordingId){
 return "human/"+work.series+"/"+work.episode+"/"+owner+"/"+
 recordingId+"/playback-from-nemo.m4a";
}
const bytes=Buffer.from([0,0,0,12,109,100,97,116,0,0,0,0]);
async function upload(work,owner,recId){
 const name=path(work,owner,recId);
 const {error}=await service.storage.from("human-recording-audio")
  .upload(name,bytes,{contentType:"audio/mp4",upsert:false,cacheControl:"0"});
 assert.equal(error,null,"seed exact synthetic PRIVATE audio");
 return name;
}
function entry(recId,p,isPublic=true){
 return {p_recording_id:recId,p_reader_name:"Synthetic Human",p_audio_storage_path:p,
  p_is_public:isPublic};
}
await consent(first);await consent(second);
const work=await makeSeries();
const privateBucket=await service.storage.getBucket("human-recording-audio");
pass(!privateBucket.error&&privateBucket.data?.public===false,
  "PRIVATE Human bucket remains physically private");
const recordingId=id(),objectPath=await upload(work,first,recordingId);
const r0=await revision(work,first);
pass(r0==="0","new Human scope starts at revision zero");
const direct=await service.from("recordings").insert({
 id:recordingId,series_id:work.series,episode_id:work.episode,
 reader_id:first,reader_name:"Synthetic Human",is_public:true,
 audio_storage_path:objectPath
});
deny(Boolean(direct.error),"direct service-role Human INSERT must be denied by H1 guard");
const firstCommit=await commit(work,first,r0,"insert",entry(recordingId,objectPath));
pass(!firstCommit.error&&firstCommit.data?.recording_id===recordingId,
 "H1 RPC inserts exact owned Human pointer after B2 physical-object proof");
const r1=await revision(work,first);
pass(r1==="1","H1 scoped revision advances once");
const cross=await commit(work,second,"0","visibility",{
 p_recording_id:recordingId,p_is_public:false
});
deny(Boolean(cross.error),"a different owner cannot mutate recorded Human pointer");
const directDelete=await service.from("recordings").delete().eq("id",recordingId);
deny(Boolean(directDelete.error),"direct privileged Human DELETE is blocked");
const [hideA,hideB]=await Promise.all([
 commit(work,first,r1,"visibility",{p_recording_id:recordingId,p_is_public:false}),
 commit(work,first,r1,"visibility",{p_recording_id:recordingId,p_is_public:true}),
]);
pass([hideA,hideB].filter(x=>!x.error).length===1,
 "concurrent same-revision Human writes allow only one commit");
deny([hideA,hideB].filter(x=>Boolean(x.error)).length===1,
 "one stale concurrent writer is rejected");
const r2=await revision(work,first);
pass(r2==="2","H1 revision advances exactly once after concurrent race");
const stale=await commit(work,first,r1,"visibility",{
 p_recording_id:recordingId,p_is_public:false
});
deny(Boolean(stale.error),"ABA/stale Human revision cannot commit");
const revokedWork=await makeSeries();
await update("series",revokedWork.series,{recording_permission_mode:"closed"},
 "close author recording permission");
const revId=id(),revPath=await upload(revokedWork,first,revId);
const rev=await revision(revokedWork,first);
const deniedPermission=await commit(revokedWork,first,rev,"insert",entry(revId,revPath));
deny(Boolean(deniedPermission.error),"publisher cannot commit after permission revoked");
await update("series",revokedWork.series,{recording_permission_mode:"open"},
 "restore synthetic permission");
await revokeConsent(first);
const deniedConsent=await commit(revokedWork,first,rev,"insert",entry(revId,revPath));
deny(Boolean(deniedConsent.error),"Human writer cannot commit after consent withdrawn");
await consent(first);
const humanPublished=await commit(revokedWork,first,rev,"insert",entry(revId,revPath,false));
pass(!humanPublished.error,"authorized synthetic private Human write can proceed after restored consent");
const anonymousRevision=await anonymous.rpc("issue137_h1_human_revision",
 {p_series_id:work.series,p_episode_id:work.episode,p_owner_id:first});
deny(Boolean(anonymousRevision.error),"anon cannot call H1 service_role-only RPC");
const deleteResult=await commit(work,first,r2,"delete_all");
pass(!deleteResult.error&&deleteResult.data?.deleted_count===1,
 "scope-locked Human delete succeeds without Storage physical deletion");
const after=await revision(work,first);
pass(after==="3","delete increments revision tombstone, prevents stale republish");
const res=await service.storage.from("human-recording-audio").download(objectPath);
pass(!res.error&&res.data?.size===bytes.length,
 "deleting Human pointer never automatically removes unknown-rights physical bytes");
const obsolete=await commit(work,first,r1,"insert",entry(id(),objectPath));
deny(Boolean(obsolete.error),"stale pre-delete revision cannot resurrect recording");
console.log("PASS: #137 ONE-TRANSACTION B2/R0+H1 real disposable GoTrue/PostgREST/PRIVATE Storage "+
 count.pass+" positive / "+count.deny+" denied; OWNER/CONSENT/CAS guards; no hosted access");
console.log("HOLD: local synthetic bytes/RPC do not establish hosted S3, source rights, CDN, migrations or recovery");
