// Issue #137 H1 — real DISPOSABLE local PostgreSQL/PostgREST contract.
// No hosted URL, keys, SQL, media, user rows or Production operations.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const endpoint=new URL(process.env.B2_LOCAL_URL||"");
assert.equal(endpoint.protocol,"http:");
assert.ok(["localhost","127.0.0.1","[::1]"].includes(endpoint.hostname));
assert.ok(["54321","54331"].includes(endpoint.port));
const service=process.env.B2_SERVICE_KEY,anon=process.env.B2_ANON_KEY;
assert.ok(service&&anon&&service!==anon);
const base=endpoint.origin,uuid=()=>randomUUID();
let assertions=0;
async function call(path,{method="GET",key=service,token=key,body}={}){
 const headers={apikey:key,Authorization:"Bearer "+token,Prefer:"return=representation"};
 if(body!==undefined)headers["Content-Type"]="application/json";
 const result=await fetch(base+path,{method,headers,
  body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 let data,raw=await result.text();
 try{data=raw?JSON.parse(raw):null;}catch{data=raw;}
 return {status:result.status,data};
}
function ok(r,label){
 assert.ok(r.status===200||r.status===201,label+" status "+r.status+
  " message "+String(r.data?.message??""));assertions++;return r.data;
}
function deny(r,label,code){
 assert.ok(r.status>=400&&r.status<500,label+" status "+r.status);assertions++;
 if(code){assert.equal(r.data?.message,code,label);assertions++;}
}
function commit(w,rev,action,extra={}){
 return call("/rest/v1/rpc/issue137_h1_human_commit",{method:"POST",body:{
  p_series_id:w.series,p_episode_id:w.episode,p_owner_id:w.owner,
  p_expected_revision:rev,p_action:action,...extra
 }});
}
async function revision(w){
 const r=ok(await call("/rest/v1/rpc/issue137_h1_human_revision",{method:"POST",
  body:{p_series_id:w.series,p_episode_id:w.episode,p_owner_id:w.owner}
 }),"read H1 revision");
 assert.ok(/^[0-9]+$/.test(String(r)));assertions++;
 return String(r);
}
function path(w,id){
 return "human/"+w.series+"/"+w.episode+"/"+w.owner+"/"+id+"/playback-from-mp3.m4a";
}
function entry(w,id,isPublic=true){
 return {p_recording_id:id,p_reader_name:"Synthetic Human",
  p_audio_storage_path:path(w,id),p_is_public:isPublic};
}
async function work(owner){
 const w={owner,series:uuid(),episode:uuid()};
 ok(await call("/rest/v1/series",{method:"POST",body:{
  id:w.series,author_id:owner,publication_status:"public",content_rating:"general"
 }}),"seed local work");
 ok(await call("/rest/v1/episodes",{method:"POST",body:{
  id:w.episode,series_id:w.series,posting_status:"posted",is_published:true,body:"LOCAL"
 }}),"seed local episode");return w;
}
async function getRow(id){
 const data=ok(await call("/rest/v1/recordings?select=*&id=eq."+id),"read H1 local row");
 return data[0]??null;
}
const password="H1-local-"+uuid()+"-Aa1!";
const u=ok(await call("/auth/v1/admin/users",{method:"POST",body:{
 email:"h1-"+uuid()+"@example.invalid",password,email_confirm:true
}}),"create synthetic GoTrue owner");
const other=ok(await call("/auth/v1/admin/users",{method:"POST",body:{
 email:"h1-"+uuid()+"@example.invalid",password,email_confirm:true
}}),"create synthetic GoTrue other owner");
ok(await call("/rest/v1/user_recording_consents",{method:"POST",body:{
 user_id:u.id,consent_key:"recording_studio_global",consent_version:"2026-04-16"
}}),"seed local recorder consent");
const w=await work(u.id),r0=await revision(w);
assert.equal(r0,"0");assertions++;
const id=uuid(),first=entry(w,id);
const inserted=ok(await commit(w,r0,"insert",first),"H1 first insert");
assert.equal(inserted.recording_id,id);assertions++;
assert.equal((await getRow(id))?.is_public,true);assertions++;
let r1=await revision(w);assert.equal(r1,"1");assertions++;
// All direct service-role mutations, including alias drifts, must be rejected.
// Without a guard, these direct PostgREST calls bypass an optional generation RPC.
deny(await call("/rest/v1/recordings",{method:"POST",body:{
 id:uuid(),series_id:w.series,episode_id:w.episode,reader_id:u.id,
 reader_name:"Synthetic Human",voice_model_id:null,is_public:false,
 audio_storage_path:path(w,uuid())
}}),"direct Human INSERT must not bypass scope","H1_ATOMIC_RPC_REQUIRED");
deny(await call("/rest/v1/recordings?id=eq."+id,{method:"PATCH",
 body:{is_public:false}}),"direct Human visibility must not bypass scope","H1_ATOMIC_RPC_REQUIRED");
deny(await call("/rest/v1/recordings?id=eq."+id,{method:"PATCH",
 body:{reader_user_id:other.id}}),"N2-C1 direct alias drift must be blocked","H1_ATOMIC_RPC_REQUIRED");
deny(await call("/rest/v1/recordings?id=eq."+id,{method:"DELETE"}),
 "direct Human delete must not bypass revision","H1_ATOMIC_RPC_REQUIRED");
assert.equal(await revision(w),r1,"denials cannot bump revision");assertions++;
assert.equal((await getRow(id))?.is_public,true);assertions++;
// ABA: true -> false -> true returns to the same visible values but must not
// permit a publish that captured the older immutable revision.
ok(await commit(w,r1,"visibility",{p_recording_id:id,p_is_public:false}),
 "H1 private withdraw");const r2=await revision(w);
ok(await commit(w,r2,"visibility",{p_recording_id:id,p_is_public:true}),
 "H1 explicit public restore");const r3=await revision(w);
assert.equal((await getRow(id))?.is_public,true);assertions++;
deny(await commit(w,r1,"replace",{
 ...first,p_audio_storage_path:path(w,uuid()),
 p_prior_audio_storage_path:path(w,id),p_prior_is_public:true
}),"ABA stale replace","H1_STALE_REVISION");
assert.equal(await revision(w),r3);assertions++;
// N1: a concurrent newly created private take invalidates an earlier empty
// snapshot/expected revision. A current revision still denies implicit public.
const n1=await work(u.id),old=await revision(n1);
const privateId=uuid();
ok(await commit(n1,old,"insert",entry(n1,privateId,false)),
 "N1 intervening private insert");
deny(await commit(n1,old,"insert",entry(n1,uuid(),true)),
 "N1 stale public insert","H1_STALE_REVISION");
deny(await commit(n1,await revision(n1),"insert",entry(n1,uuid(),true)),
 "N1 private republish guard","H1_PRIVATE_REPUBLISH_DENIED");
// N2: canonical Human alias cannot be redirected even by service-role PATCH.
assert.equal((await getRow(id))?.reader_user_id??null,null);assertions++;
// Owner crossing: another principal cannot mutate an existing canonical row.
const wrong={...w,owner:other.id};
deny(await commit(wrong,"0","visibility",{p_recording_id:id,p_is_public:false}),
 "other owner denies mutation","H1_OWNER_OR_ROW_CONFLICT");
// One scope revision permits only one of two simultaneous commits.
const pair=await work(u.id),pairRev=await revision(pair);
const [a,b]=await Promise.all([
 commit(pair,pairRev,"insert",entry(pair,uuid())),
 commit(pair,pairRev,"insert",entry(pair,uuid()))
]);
assert.equal([a,b].filter(x=>x.status===200).length,1);assertions++;
assert.equal([a,b].filter(x=>x.status>=400&&x.status<500).length,1);assertions++;
assert.equal(await revision(pair),"1");assertions++;
// Delete is atomic with the scope tombstone; no separate Storage DELETE.
const beforeDelete=await revision(w);
const gone=ok(await commit(w,beforeDelete,"delete_all"),"H1 atomic delete all");
assert.equal(gone.deleted_count,1);assertions++;
assert.equal(await getRow(id),null);assertions++;
deny(await commit(w,beforeDelete,"insert",entry(w,uuid())),
 "H1 stale after delete","H1_STALE_REVISION");
assert.equal(await revision(w),String(BigInt(beforeDelete)+1n));assertions++;
// No anon/authenticated execute on either service-role-only RPC.
for(const fn of ["issue137_h1_human_revision","issue137_h1_human_commit"]){
 deny(await call("/rest/v1/rpc/"+fn,{method:"POST",key:anon,token:anon,
  body:fn.endsWith("_revision")?
  {p_series_id:w.series,p_episode_id:w.episode,p_owner_id:w.owner}:
  {p_series_id:w.series,p_episode_id:w.episode,p_owner_id:w.owner,
   p_expected_revision:"0",p_action:"delete_all"}}),
  "anon forbidden "+fn);
}
// H2: snapshot before a long upload is not authority to publish after
// a permission, publication, consent or R18 preference change.
async function setSeries(target,body){
 ok(await call("/rest/v1/series?id=eq."+target.series,{method:"PATCH",body}),"local H2 series transition");
}
async function setEpisode(target,body){
 ok(await call("/rest/v1/episodes?id=eq."+target.episode,{method:"PATCH",body}),"local H2 episode transition");
}
const permission=await work(u.id),permissionRev=await revision(permission);
await setSeries(permission,{recording_permission_mode:"closed"});
deny(await commit(permission,permissionRev,"insert",entry(permission,uuid(),true)),
 "closed permission denies public publish","H2_PERMISSION_REVOKED");
deny(await commit(permission,permissionRev,"insert",entry(permission,uuid(),false)),
 "closed permission denies private upload","H2_PERMISSION_REVOKED");
assert.equal(await revision(permission),permissionRev);assertions++;
await setSeries(permission,{recording_permission_mode:"open"});
ok(await commit(permission,permissionRev,"insert",entry(permission,uuid(),false)),
 "permission restored permits private author take");
const publication=await work(other.id);
const publicReader={...publication,owner:u.id},publicationRev=await revision(publicReader);
await setSeries(publication,{publication_status:"private"});
deny(await commit(publicReader,publicationRev,"insert",entry(publicReader,uuid(),false)),
 "other reader loses private work access","H2_PUBLICATION_REVOKED");
deny(await commit(publicReader,publicationRev,"insert",entry(publicReader,uuid(),true)),
 "withdrawn work blocks public publish","H2_PUBLICATION_REVOKED");
await setSeries(publication,{publication_status:"public"});
await setEpisode(publication,{posting_status:"draft",is_published:false});
deny(await commit(publicReader,publicationRev,"insert",entry(publicReader,uuid(),true)),
 "withdrawn episode blocks public publish","H2_PUBLICATION_REVOKED");
await setEpisode(publication,{posting_status:"posted",is_published:true});
const consent=await work(u.id),consentRev=await revision(consent);
ok(await call("/rest/v1/user_recording_consents?user_id=eq."+u.id,
 {method:"PATCH",body:{consent_version:"withdrawn"}}),"local consent withdrawn");
deny(await commit(consent,consentRev,"insert",entry(consent,uuid(),false)),
 "revoked consent denies new private take","H2_CONSENT_REVOKED");
assert.equal(await revision(consent),consentRev);assertions++;
ok(await call("/rest/v1/user_recording_consents?user_id=eq."+u.id,
 {method:"PATCH",body:{consent_version:"2026-04-16"}}),"local consent restored");
const adult=await work(other.id),adultReader={...adult,owner:u.id};
const adultRev=await revision(adultReader);
ok(await call("/rest/v1/users",{method:"POST",body:{
 id:u.id,show_r18_content:true,r18_confirmed_at:"2026-10-01T00:00:00Z"
}}),"seed local R18 opt-in");
await setSeries(adult,{content_rating:"r18"});
ok(await call("/rest/v1/users?id=eq."+u.id,
 {method:"PATCH",body:{show_r18_content:false}}),"local R18 opt-out");
deny(await commit(adultReader,adultRev,"insert",entry(adultReader,uuid(),true)),
 "R18 opt-out during upload blocks commit","H2_R18_REVOKED");
assert.equal(await revision(adultReader),adultRev);assertions++;
// EXPECTED RELEASE HOLD: B2's recording-reference trigger still requires
// "r18-private:" even though canonical Human audio uses a PRIVATE bucket
// with an "human/" path. A valid R18 viewer must not silently be reported
// as end-to-end publishable until this cross-layer conflict is resolved.
ok(await call("/rest/v1/users?id=eq."+u.id,{
 method:"PATCH",body:{show_r18_content:true}
}),"local R18 opt-in restored");
deny(await commit(adultReader,adultRev,"insert",entry(adultReader,uuid(),true)),
 "R18 authorized Human path still blocked by B2 media reference",
 "B2_MEDIA_CONTAINMENT_REQUIRED");
assert.equal(await revision(adultReader),adultRev);assertions++;
console.log("EXPECTED_RELEASE_HOLD: authorized R18 Human path conflicts with B2 reference guard; no public media fallback");
// After permission is closed, the owner can still withdraw/delete existing
// recordings, avoiding an accidental unremovable public recording.
await setSeries(w,{recording_permission_mode:"closed"});
const beforeHide=await revision(w);
// Existing 'w' recordings were deleted above, so use a fresh safe take.
// The permission test's private take can always be deleted under closed mode.
const permissionDeleteRev=await revision(permission);
await setSeries(permission,{recording_permission_mode:"closed"});
ok(await commit(permission,permissionDeleteRev,"delete_all"),
 "owner delete remains allowed after permission closure");
console.log("PASS: "+assertions+" real LOCAL PostgreSQL/PostgREST H1/H2 mutation assertions; no hosted DB/Storage");
