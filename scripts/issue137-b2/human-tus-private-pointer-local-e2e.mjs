// Issue #137 G1 — disposable real TUS private byte -> durable receipt -> PRIVATE pointer.
// No hosted project or production SQL. The test-only privileged harness controls
// synthetic ledger, not a deployed Reader, Studio, publisher or credential holder.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {execFileSync,execFile} from "node:child_process";
import {promisify} from "node:util";
import {createClient} from "@supabase/supabase-js";
const asyncExecFile=promisify(execFile);
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const target=new URL(process.env.B2_LOCAL_URL??"");
assert.ok(target.protocol==="http:"&&["localhost","127.0.0.1"].includes(target.hostname)
 &&["54321","54331"].includes(target.port)&&target.pathname==="/"
 &&!target.search&&!target.hash);
const net=process.env.B2_NETWORK??"",db=process.env.B2_DB_CONTAINER??"";
assert.match(net,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(db,/^[a-f0-9]{12,64}$/);
assert.ok(execFileSync("docker",["ps","-q","--filter","network="+net],
 {encoding:"utf8",timeout:10000}).trim().split(/\s+/).includes(db),
 "disposable local PostgreSQL required");
for(const x of ["SUPABASE_SERVICE_ROLE_KEY","NEXT_PUBLIC_SUPABASE_URL",
 "NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_HUMAN_RECORDING_BUCKET"])
 assert.equal(process.env[x],undefined,"hosted env forbidden");
const anon=process.env.B2_ANON_KEY??"",service=process.env.B2_SERVICE_KEY??"";
assert.ok(anon.length>15&&service.length>15&&anon!==service);
const api=target.origin,bucket="f2p-tus-app-authority-local",id=()=>randomUUID();
const admin=createClient(api,service,{auth:{persistSession:false,
 autoRefreshToken:false,detectSessionInUrl:false}});
const data=Buffer.alloc(6*1024*1024+96,0x43);
data.write("RIFF",0);data.write("WAVE",8);
const alternate=Buffer.from(data);alternate[1024]^=1;
const digest=b=>createHash("sha256").update(b).digest("hex");
const sha=digest(data),size=data.length,chunk=6*1024*1024;
const args=q=>["exec",db,"psql","-X","-q","-t","-A",
 "-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres","-c",q];
const sql=q=>execFileSync("docker",args(q),{
 encoding:"utf8",timeout:20000,stdio:["ignore","pipe","pipe"]}).trim();
async function parallel(q){const r=await asyncExecFile("docker",args(q),{
 encoding:"utf8",timeout:20000,maxBuffer:1024*1024});return r.stdout.trim();}
const uuid=v=>{assert.match(v,/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu);return "'"+v+"'::uuid";};
const hash=v=>{assert.match(v,/^[a-f0-9]{64}$/u);return "'"+v+"'";};
let checks=0;
function yes(v,msg){assert.ok(v,msg);checks++;}
const rows=()=>Number(sql("select count(*) from libread_internal.issue137_tus_private_pointers"));
const recordCount=async()=>{
 const r=await admin.from("recordings").select("id",{count:"exact",head:true});
 assert.equal(r.error,null);return r.count;
};
async function createActor(){
 const email="pointer-"+id()+"@example.invalid",password="Local-"+id()+"Aa1!";
 const u=await admin.auth.admin.createUser({email,password,email_confirm:true});
 assert.equal(u.error,null);
 const client=createClient(api,anon,{auth:{persistSession:false,
  autoRefreshToken:false,detectSessionInUrl:false}});
 const login=await client.auth.signInWithPassword({email,password});
 assert.equal(login.error,null);
 const actorId=u.data.user.id,jwt=login.data.session.access_token;
 // Parse only for the local test input; server checks actual auth.sessions.
 const claim=JSON.parse(Buffer.from(jwt.split(".")[1],"base64url").toString("utf8"));
 const session=claim.session_id;
 uuid(session);
 for(const [table,row] of [
  ["users",{id:actorId,display_name:"LOCAL POINTER"}],
  ["user_recording_consents",{user_id:actorId,consent_key:"recording_studio_global",
   consent_version:"2026-04-16"}]
 ]){
  const res=await admin.from(table).insert(row);assert.equal(res.error,null);
 }
 const series=id(),episode=id();
 assert.equal((await admin.from("series").insert({
  id:series,author_id:actorId,publication_status:"public",
  recording_permission_mode:"open",content_rating:"general",content_warnings:[]
 })).error,null);
 assert.equal((await admin.from("episodes").insert({
  id:episode,series_id:series,body:"SYNTHETIC",posting_status:"posted",
  is_published:true
 })).error,null);
 return {actorId,series,episode,session,jwt,client,email,password};
}
async function issue(a,seriesId=a.series,episodeId=a.episode){
 const r=await a.client.rpc("issue137_tus_local_issue",{
  p_series_id:seriesId,p_episode_id:episodeId,
  p_expected_sha256:sha,p_size_bytes:size});
 assert.equal(r.error,null,"real local JWT issuer");
 yes(r.data?.mode==="PRIVATE_JWT_TUS_LOCAL_ONLY","no signed bearer or public URL");
 return {lid:r.data.leaseId,path:r.data.objectPath};
}
const tRoot=api+"/storage/v1/upload/resumable";
async function tus(uri,method,jwt,headers={},body){
 const r=await fetch(uri,{method,headers:{apikey:anon,
  authorization:"Bearer "+jwt,"tus-resumable":"1.0.0",...headers},
  ...(body===undefined?{}:{body}),redirect:"error",
  signal:AbortSignal.timeout(18000)});
 const out={status:r.status,offset:Number(r.headers.get("upload-offset")??"-1"),
  location:r.headers.get("location")};await r.arrayBuffer();return out;
}
async function upload(a,t){
 const metadata=["bucketName "+Buffer.from(bucket).toString("base64"),
  "objectName "+Buffer.from(t.path).toString("base64"),
  "contentType "+Buffer.from("audio/wav").toString("base64")].join(",");
 const started=await tus(tRoot,"POST",a.jwt,{
  "upload-length":String(size),"upload-metadata":metadata});
 yes(started.status===201&&!!started.location,"real PRIVATE TUS initiation");
 const url=new URL(started.location,tRoot);
 yes(url.origin===api&&url.pathname.startsWith("/storage/v1/upload/resumable/"),
  "no remote upload");
 const first=await tus(url.toString(),"PATCH",a.jwt,{
  "upload-offset":"0","content-type":"application/offset+octet-stream"},data.subarray(0,chunk));
 yes(first.status===204&&first.offset===chunk,"first real 6MiB PATCH");
 const done=await tus(url.toString(),"PATCH",a.jwt,{
  "upload-offset":String(chunk),"content-type":"application/offset+octet-stream"},
  data.subarray(chunk));
 yes(done.status===204&&done.offset===size,"final PRIVATE TUS PATCH");
}
async function actual(t){
 const r=await admin.storage.from(bucket).download(t.path);
 return r.error?null:Buffer.from(await r.data.arrayBuffer());
}
function object(t){
 return sql("select id from storage.objects where bucket_id='"+bucket+
  "' and name='"+t.path+"'");
}
function claim(t){
 sql("insert into libread_internal.issue137_tus_app_receipts"+
  "(lease_id,expected_bytes) values ("+uuid(t.lid)+","+size+")");
 return sql("update libread_internal.issue137_tus_app_receipts set "+
  "state='VERIFYING',attempted=true,version=1 where lease_id="+uuid(t.lid)+
  " and state='STAGED' and version=0 returning version");
}
function commit(a,t,evidence,nonce=id(),actorId=a.actorId,session=a.session){
 return "select libread_internal.issue137_tus_private_commit("+
 [uuid(t.lid),uuid(actorId),uuid(session),uuid(nonce),
  hash(evidence.sha),String(evidence.size),uuid(evidence.object)].join(",")+")";
}
function read(a,t,actor=a.actorId,session=a.session){
 return sql("select coalesce(libread_internal.issue137_tus_private_read("+
  [uuid(t.lid),uuid(actor),uuid(session)].join(",")+"),'')");}
async function trustedReadback(t){
 const bytes=await actual(t),oid=object(t);
 if(!bytes||!oid)return null;
 return {sha:digest(bytes),size:bytes.length,object:oid};
}
function commitIfFull(a,t,readback,nonce=id()){
 // This is trusted SERVER validation, not a client-provided SHA claim.
 if(!readback||readback.size!==size||readback.sha!==sha)return "HOLD_SHA";
 return sql(commit(a,t,readback,nonce));
}
async function verifyRead(a,t){
 const eligible=read(a,t);
 if(!eligible)return "HOLD_AUTHORITY";
 const bytes=await actual(t),oid=object(t);
 const row=JSON.parse(sql("select row_to_json(p)::text from "+
  "libread_internal.issue137_tus_private_pointers p where lease_id="+uuid(t.lid)));
 return bytes&&oid===row.provider_object_id&&bytes.length===row.verified_bytes
  &&digest(bytes)===row.verified_sha256?"PRIVATE_BYTES_VERIFIED":"HOLD_BYTE_DRIFT";
}
const priorCount=await recordCount(),a=await createActor();
const b=await createActor();
yes(sql("select has_table_privilege('authenticated',"+
 "'libread_internal.issue137_tus_private_pointers','SELECT')")==="f",
 "ordinary users cannot read pointer ledger");
yes(sql("select has_function_privilege('authenticated',"+
 "'libread_internal.issue137_tus_private_commit(uuid,uuid,uuid,uuid,text,bigint,uuid)',"+
 "'EXECUTE')")==="f","client JWT cannot call server-only commit");

// Actual user-only TUS -> trusted readback -> one server-only CAS pointer.
const t=await issue(a);await upload(a,t);
yes(claim(t)==="1","durable preverification claim required");
const proof=await trustedReadback(t);
yes(proof?.sha===sha&&proof.size===size&&!!proof.object,"server physical SHA and object identity");
yes(sql(commit(b,t,proof))==="f","wrong owner cannot commit another user's lease");
yes(sql(commit(a,t,proof,id(),a.actorId,b.session))==="f",
 "other GoTrue session cannot finalize");
yes(sql(commit(a,t,{...proof,sha:digest(alternate)}))==="f",
 "forged alternate SHA rejected at CAS");
const candidates=await Promise.all([parallel(commit(a,t,proof)),parallel(commit(a,t,proof))]);
yes(candidates.filter(v=>v==="t").length===1&&
 candidates.filter(v=>v==="f").length===1,"concurrent finalizers single CAS winner");
yes(rows()===1,"only one immutable PRIVATE pointer row");
yes(read(a,t)===t.path,"owner original live GoTrue session can find PRIVATE pointer");
yes(read(b,t)==="","foreign owner cannot obtain pointer path");
yes(read(a,t,a.actorId,b.session)==="","foreign session cannot obtain pointer path");
yes(await verifyRead(a,t)==="PRIVATE_BYTES_VERIFIED",
 "Reader-like server readback rechecks full physical bytes, PRIVATE only");
yes(await recordCount()===priorCount,"zero new recordings/publication rows");

// Changing provider bytes after commit demonstrates immutable-pointer LIMIT.
const tamper=await admin.storage.from(bucket).upload(t.path,alternate,{
 upsert:true,contentType:"audio/wav"});
if(tamper.error){
 yes((await trustedReadback(t)).sha===sha,"rejected privileged rewrite preserves bytes");
}else{
 yes((await trustedReadback(t)).sha===digest(alternate),
  "privileged rewrite changed actual PRIVATE bytes");
 yes(await verifyRead(a,t)==="HOLD_BYTE_DRIFT",
  "server readback DENIES stale pointer even if metadata object ID unchanged");
 console.log("RISK: privileged service_role can overwrite PRIVATE snapshot; readback detects, G2 NOT proven");
}
// Revocation after sealing leaves row durable but unusable to the read gate.
assert.equal((await admin.from("user_recording_consents").update({
 consent_version:"2026-04-15"}).eq("user_id",a.actorId)).error,null);
yes(read(a,t)==="","consent withdrawal hides sealed PRIVATE pointer");
assert.equal((await admin.from("user_recording_consents").update({
 consent_version:"2026-04-16"}).eq("user_id",a.actorId)).error,null);
yes(read(a,t)==="","consent regrant cannot revive old sealed lease");

// A second stage can pass physical verification, then be revoked BEFORE CAS.
const stale=await issue(a);await upload(a,stale);
yes(claim(stale)==="1","second stage claimed once");
const staleProof=await trustedReadback(stale);
yes(staleProof?.sha===sha,"second physical SHA verified");
assert.equal((await admin.from("series").update({
 recording_permission_mode:"closed"}).eq("id",a.series)).error,null);
yes(sql(commit(a,stale,staleProof))==="f","rights withdrawal between SHA and CAS blocks pointer");
assert.equal((await admin.from("series").update({
 recording_permission_mode:"open"}).eq("id",a.series)).error,null);
yes(sql(commit(a,stale,staleProof))==="f","regrant ABA cannot reuse revoked lease");
yes(rows()===1,"denied seal did not create pointer");
const noBytes=await admin.storage.from(bucket).remove([stale.path]);
assert.equal(noBytes.error,null);

// A valid new lease after regrant is still allowed. A content body revision
// AFTER it is sealed must revoke its reader pointer.
const fresh=await issue(a);await upload(a,fresh);
yes(claim(fresh)==="1","fresh stage once");
const newProof=await trustedReadback(fresh);
yes(commitIfFull(a,fresh,newProof)==="t","fresh post-regrant PRIVATE pointer seals");
yes(await verifyRead(a,fresh)==="PRIVATE_BYTES_VERIFIED","fresh pointer byte readback");
assert.equal((await admin.from("episodes").update({
 body:"SYNTHETIC EDIT"}).eq("id",a.episode)).error,null);
yes(read(a,fresh)==="","episode body mutation invalidates old alignment/pointer");
const after=await recordCount();
yes(after===priorCount,"no public or recording row added by test-only pointer");
// All successfully staged objects are left in no public bucket.
const publicGet=await fetch(api+"/storage/v1/object/public/"+bucket+"/"+fresh.path,{
 headers:{apikey:anon},redirect:"error",signal:AbortSignal.timeout(12000)});
yes(publicGet.status>=400&&publicGet.status<500,"no PUBLIC stage URL");
for(const x of [t,fresh]){
 const clean=await admin.storage.from(bucket).remove([x.path]);
 assert.equal(clean.error,null,"private synthetic cleanup");
}
yes((await actual(fresh))===null,"no synthetic PRIVATE bytes remain");

// Cross-account Human narration: narrator A is NOT author B.  Publicly
// published open-licensed (site permission, not copyright clearance) series
// allows A to stage/claim A's own PRIVATE recording, without B's credentials.
const author=b,narrator=a;
yes(author.actorId!==narrator.actorId,"narrator and author are distinct GoTrue accounts");
const third=await issue(narrator,author.series,author.episode);
await upload(narrator,third);
yes(claim(third)==="1","non-author TUS receipt claimed once");
const thirdProof=await trustedReadback(third);
yes(thirdProof?.sha===sha&&thirdProof.size===size,
 "non-author full provider SHA matches actor-owned PRIVATE recording");
yes(sql(commit(author,third,thirdProof))==="f",
 "work author cannot finalize another narrator's private audio");
yes(sql(commit(narrator,third,thirdProof,id(),narrator.actorId,author.session))==="f",
 "foreign session cannot claim non-author's pointer");
yes(commitIfFull(narrator,third,thirdProof)==="t",
 "third-party legitimate Human narrator can seal PRIVATE pointer");
yes(read(narrator,third)===third.path,"narrator owns resulting PRIVATE pointer");
yes(read(author,third)==="","author cannot read narrator's PRIVATE pointer");
yes(await verifyRead(narrator,third)==="PRIVATE_BYTES_VERIFIED",
 "third-party full physical bytes remain verifiable");
yes(await recordCount()===priorCount,"third-party private stage never publishes recording");

// Changing the AUTHOR's recording permission must revoke narrator's old
// ticket even if the author later restores OPEN (ABA).
assert.equal((await admin.from("series").update({
 recording_permission_mode:"closed"}).eq("id",author.series)).error,null);
yes(read(narrator,third)==="","author CLOSED revokes third-party private pointer");
const closedIssue=await narrator.client.rpc("issue137_tus_local_issue",{
 p_series_id:author.series,p_episode_id:author.episode,
 p_expected_sha256:sha,p_size_bytes:size});
yes(!!closedIssue.error,"third party cannot mint when author set CLOSED");
assert.equal((await admin.from("series").update({
 recording_permission_mode:"open"}).eq("id",author.series)).error,null);
yes(read(narrator,third)==="","OPEN restore cannot revive old pointer");

assert.equal((await admin.from("episodes").update({
 posting_status:"draft",is_published:false
}).eq("id",author.episode)).error,null);
const draftIssue=await narrator.client.rpc("issue137_tus_local_issue",{
 p_series_id:author.series,p_episode_id:author.episode,
 p_expected_sha256:sha,p_size_bytes:size});
yes(!!draftIssue.error,"non-author cannot stage author's unpublished episode");
assert.equal((await admin.from("episodes").update({
 posting_status:"posted",is_published:true
}).eq("id",author.episode)).error,null);
assert.equal((await admin.from("series").update({
 publication_status:"private"}).eq("id",author.series)).error,null);
const privateIssue=await narrator.client.rpc("issue137_tus_local_issue",{
 p_series_id:author.series,p_episode_id:author.episode,
 p_expected_sha256:sha,p_size_bytes:size});
yes(!!privateIssue.error,"non-author cannot stage private series");
assert.equal((await admin.from("series").update({
 publication_status:"public",content_rating:"general",
 content_warnings:["sexual_r18"]
}).eq("id",author.series)).error,null);
// R18 warnings must protect actors who are NOT the original author.
const warningIssue=await narrator.client.rpc("issue137_tus_local_issue",{
 p_series_id:author.series,p_episode_id:author.episode,
 p_expected_sha256:sha,p_size_bytes:size});
yes(!!warningIssue.error,"sexual_r18 warning blocks non-opt-in narrator");
assert.equal((await admin.from("users").update({
 show_r18_content:true,r18_confirmed_at:null
}).eq("id",narrator.actorId)).error,null);
const noAge=await narrator.client.rpc("issue137_tus_local_issue",{
 p_series_id:author.series,p_episode_id:author.episode,
 p_expected_sha256:sha,p_size_bytes:size});
yes(!!noAge.error,"R18 ON without age confirmation still denied");
assert.equal((await admin.from("users").update({
 r18_confirmed_at:new Date().toISOString()
}).eq("id",narrator.actorId)).error,null);
const r18=await issue(narrator,author.series,author.episode);
await upload(narrator,r18);
yes(claim(r18)==="1","R18 accepted stage has one receipt");
const r18Proof=await trustedReadback(r18);
yes(commitIfFull(narrator,r18,r18Proof)==="t",
 "non-author with opt-in plus age confirmation seals warning-R18 PRIVATE pointer");
yes(read(narrator,r18)===r18.path,"R18-qualified non-author PRIVATE pointer visible");
assert.equal((await admin.from("users").update({
 show_r18_content:false
}).eq("id",narrator.actorId)).error,null);
yes(read(narrator,r18)==="","turning R18 OFF revokes old non-author pointer");
assert.equal((await admin.from("users").update({
 show_r18_content:true
}).eq("id",narrator.actorId)).error,null);
yes(read(narrator,r18)==="","turning R18 back ON cannot revive old pointer");

// Source must also guard rating=R18 without a sexual_r18 warning.
assert.equal((await admin.from("series").update({
 content_rating:"r18",content_warnings:[]
}).eq("id",author.series)).error,null);
assert.equal((await admin.from("users").update({
 r18_confirmed_at:null
}).eq("id",narrator.actorId)).error,null);
const ratingNoAge=await narrator.client.rpc("issue137_tus_local_issue",{
 p_series_id:author.series,p_episode_id:author.episode,
 p_expected_sha256:sha,p_size_bytes:size});
yes(!!ratingNoAge.error,"R18 rating alone requires age confirmation");
// Restore to normal work and no R18 preference, then verify consent
// withdrawal BETWEEN physical readback and DB CAS fails permanently.
assert.equal((await admin.from("series").update({
 content_rating:"general",content_warnings:[]
}).eq("id",author.series)).error,null);
const beforeConsent=await issue(narrator,author.series,author.episode);
await upload(narrator,beforeConsent);
yes(claim(beforeConsent)==="1","non-author before-consent-revoke stage");
const beforeProof=await trustedReadback(beforeConsent);
yes(beforeProof?.sha===sha,"real non-author physical bytes exist before consent revoke");
assert.equal((await admin.from("user_recording_consents").delete()
 .eq("user_id",narrator.actorId).eq("consent_key","recording_studio_global")).error,null);
yes(sql(commit(narrator,beforeConsent,beforeProof))==="f",
 "narrator consent DELETE between SHA and CAS denies claim");
const noConsent=await narrator.client.rpc("issue137_tus_local_issue",{
 p_series_id:author.series,p_episode_id:author.episode,
 p_expected_sha256:sha,p_size_bytes:size});
yes(!!noConsent.error,"consent missing denies fresh third-party TUS issuer");
assert.equal((await admin.from("user_recording_consents").insert({
 user_id:narrator.actorId,consent_key:"recording_studio_global",
 consent_version:"2026-04-16"
})).error,null);
yes(sql(commit(narrator,beforeConsent,beforeProof))==="f",
 "consent DELETE and reaccept cannot revive old non-author lease");
const afterConsent=await issue(narrator,author.series,author.episode);
await upload(narrator,afterConsent);
yes(claim(afterConsent)==="1","new lease after fresh consent");
const afterProof=await trustedReadback(afterConsent);
yes(commitIfFull(narrator,afterConsent,afterProof)==="t",
 "third-party author-open flow resumes with a freshly issued lease");
yes(await verifyRead(narrator,afterConsent)==="PRIVATE_BYTES_VERIFIED",
 "restored legitimate non-author PRIVATE bytes verified");
for(const t of [third,r18,beforeConsent,afterConsent]){
 const clean=await admin.storage.from(bucket).remove([t.path]);
 assert.equal(clean.error,null,"remove synthetic non-author PRIVATE stage");
}
yes((await actual(afterConsent))===null,"non-author local PRIVATE bytes cleaned");
yes(await recordCount()===priorCount,
 "non-author stage/rights/consent/R18 tests never create published recordings");
console.log("PASS: #137 REAL LOCAL third-party narrator != author, OPEN positive, "+
 "CLOSED/private/draft/R18/no-consent/foreign-session negatives and revoke ABA");

console.log("PASS: #137 REAL LOCAL stage -> full SHA readback -> PRIVATE pointer "+
 checks+" checks; concurrent CAS, revocation ABA, ownership/session/R18 authority, "+
 " post-seal tamper detection and no PUBLIC recording");
console.log("HOLD: trusted server-only SQL + readback in disposable fixture, no LIVE reader, "+
 "no transactionally immutable provider bytes, no rights-provenance or service-role/S3 exclusion");
