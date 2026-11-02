// Issue #137 G1 — disposable real TUS private byte -> durable receipt -> PRIVATE pointer.
// No hosted project or production SQL. The test-only privileged harness controls
// synthetic ledger, not a deployed Reader, Studio, publisher or credential holder.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {execFileSync,execFile,spawn} from "node:child_process";
import {promisify} from "node:util";
import {createClient} from "@supabase/supabase-js";
import {createServerClient} from "@supabase/ssr";
import {setTimeout as sleep} from "node:timers/promises";
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
 const jar=new Map();
 const client=createServerClient(api,anon,{cookies:{
  getAll:()=>[...jar].map(([name,value])=>({name,value})),
  setAll:entries=>{for(const entry of entries){
   if(entry.value)jar.set(entry.name,entry.value);else jar.delete(entry.name);
  }},
 }});
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
 return {actorId,series,episode,session,jwt,client,email,password,
  cookie:()=>[...jar].map(([name,value])=>name+"="+value).join("; ")};
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
let nextProcess,nextLog="";
try {
const initialPointerRows=rows();
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
yes(rows()===initialPointerRows+1,"exactly one NEW immutable PRIVATE pointer row");
yes(read(a,t)===t.path,"owner original live GoTrue session can find PRIVATE pointer");

 // Nonproduction G1 actual HTTP proof on the EXISTING Human GET; the
 // disposable receipt remains PRIVATE and does not create recordings rows.
 const port=39710+Math.floor(Math.random()*70);
 const base="http://127.0.0.1:"+port;
 const root=new URL("../../",import.meta.url).pathname;
 const cli=new URL("../../node_modules/next/dist/bin/next",import.meta.url).pathname;
 const appEnv={...process.env,NODE_ENV:"development",NEXT_TELEMETRY_DISABLED:"1",
  DO_NOT_CONTACT_PRODUCTION:"true",B2_EPHEMERAL_CONFIRM:"local-only",
  B2_G1_HTTP_GET_MODE:"enabled",NEXT_PUBLIC_SITE_URL:base,
  NEXT_PUBLIC_SUPABASE_URL:api,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,
  SUPABASE_SERVICE_ROLE_KEY:service};
 assert.equal(appEnv.VERCEL_ENV,undefined,"no Vercel deployment env in disposable test");
 nextProcess=spawn(process.execPath,[cli,"dev","--hostname","127.0.0.1",
  "--port",String(port)],{cwd:root,env:appEnv,detached:true,
  stdio:["ignore","pipe","pipe"]});
 for(const stream of [nextProcess.stdout,nextProcess.stderr]){
  stream.on("data",v=>{nextLog=(nextLog+String(v)).slice(-2500);});
 }
 async function getAudio(lease,cookie="",range="",suffix=""){
  const r=await fetch(base+"/api/recordings/human-audio/"+lease+suffix,{
   headers:{...(cookie?{cookie}:{}),...(range?{range}:{})},
   redirect:"manual",signal:AbortSignal.timeout(18000),cache:"no-store"});
  return {status:r.status,headers:r.headers,bytes:Buffer.from(await r.arrayBuffer())};
 }
 let ready=false;
 for(let n=0;n<130;n++){
  if(nextProcess.exitCode!==null)throw Error("LOCAL_G1_NEXT_EXITED");
  try{
   const ping=await getAudio(t.lid);
   if(ping.status===404){ready=true;break;}
  }catch{}
  await sleep(400);
 }
 yes(ready,"real existing Next GET localhost ready with anonymous denied");
 const ownerHttp=await getAudio(t.lid,a.cookie());
 yes(ownerHttp.status===200&&ownerHttp.bytes.equals(data),
  "real G1 sealed receipt serves exactly SHA-verified PRIVATE owner bytes");
 yes(!ownerHttp.headers.has("location")&&
  ownerHttp.headers.get("cache-control")?.includes("no-store"),
  "G1 HTTP returns no signed URL, no redirect and no cross-user cache");

 // G2 actual Storage GET does not receive a service_role or generated S3 key:
 // it uses the REAL owner JWT + local anon apikey through a restricted RLS
 // SELECT policy. A standalone Storage GET does NOT attest SHA/size, so users
 // must use the checked Human GET to validate staged bytes.
 async function scopedStorage(method,actorToken,object=t.path,body,extra={}){
  const response=await fetch(api+"/storage/v1/object/"+
   (method==="GET"?"authenticated/":"")+bucket+"/"+object,{
   method,headers:{apikey:anon,Authorization:"Bearer "+actorToken,
    ...(body?{"content-type":"audio/wav"}:{}),...extra},
   ...(body?{body}:{}),redirect:"error",cache:"no-store",
   signal:AbortSignal.timeout(16000)});
  return {status:response.status,bytes:Buffer.from(await response.arrayBuffer())};
 }
 const directOwner=await scopedStorage("GET",a.jwt);
 yes(directOwner.status===200&&directOwner.bytes.equals(data),
  "real LOCAL RLS-scoped OWNER JWT GET of sealed G1 bytes, no service key");
 const directOther=await scopedStorage("GET",b.jwt);
 yes(directOther.status>=400&&directOther.bytes.length!==data.length,
  "real LOCAL RLS refuses foreign narrator Storage GET");
 const directAnon=await scopedStorage("GET",anon);
 yes(directAnon.status>=400,"real LOCAL RLS refuses anonymous G1 object GET");
 const ownerOverwrite=await scopedStorage("POST",a.jwt,t.path,alternate,
  {"x-upsert":"true"});
 yes(ownerOverwrite.status>=400,
  "real LOCAL owner JWT cannot overwrite sealed G1 object");
 const ownerDelete=await a.client.storage.from(bucket).remove([t.path]);
 // Storage remove may return 2xx/no error for zero affected rows under RLS.
 // HTTP/API status is NOT proof of deletion or of policy authorization.
 const actualAfterOwnerDelete=await actual(t);
 yes(actualAfterOwnerDelete?.equals(data),
  "real LOCAL owner JWT remove MUST leave sealed bytes physically untouched");
 console.log("OBSERVED: LOCAL owner remove API returned "+(ownerDelete.error?"error":"no error")+
  "; trusted physical byte readback "+(actualAfterOwnerDelete?.equals(data)?"preserved":"CHANGED"));
 yes((await actual(t))?.equals(data),
  "RLS denied owner mutation keeps physical PRIVATE bytes unchanged");

 const anonymousHttp=await getAudio(t.lid);
 yes(anonymousHttp.status===404&&anonymousHttp.bytes.length===0,
  "anonymous cannot retrieve G1 PRIVATE pointer bytes");
 const foreignHttp=await getAudio(t.lid,b.cookie());
 yes(foreignHttp.status===404&&foreignHttp.bytes.length===0,
  "foreign GoTrue actor cannot read G1 PRIVATE pointer");
 const rangeHttp=await getAudio(t.lid,a.cookie(),"bytes=0-5");
 yes(rangeHttp.status===404&&rangeHttp.bytes.length===0,
  "G1 unverified Range never leaks partial bytes");
 const sidecar=await getAudio(t.lid,a.cookie(),"",".timing.json");
 yes(sidecar.status===404&&sidecar.bytes.length===0,
  "G1 staging receipt cannot serve a timing sidecar");
 const jwtDirect=await a.client.rpc("issue137_g1_local_http_preflight",{
  p_lease:t.lid,p_actor:a.actorId,p_session:a.session});
 yes(!!jwtDirect.error,"authenticated user cannot invoke service-only G1 preflight");
 const foreignSessionJar=new Map();
 const sameActorDifferentSession=createServerClient(api,anon,{cookies:{
  getAll:()=>[...foreignSessionJar].map(([name,value])=>({name,value})),
  setAll:entries=>{for(const e of entries){
   if(e.value)foreignSessionJar.set(e.name,e.value);else foreignSessionJar.delete(e.name);
  }}
 }});
 assert.equal((await sameActorDifferentSession.auth.signInWithPassword({
  email:a.email,password:a.password
 })).error,null,"fresh real GoTrue session for same narrator");
 const freshCookie=[...foreignSessionJar].map(([name,value])=>name+"="+value).join("; ");
 const crossSession=await getAudio(t.lid,freshCookie);
 yes(crossSession.status===200&&crossSession.bytes.equals(data),
  "sealed PRIVATE audio allows SAME owner after a fresh valid GoTrue login");
 const foreignIssued=await getAudio(t.lid,b.cookie());
 yes(foreignIssued.status===404&&foreignIssued.bytes.length===0,
  "fresh owner access never grants another user the same sealed pointer");
 // The upload lease's 10-minute TTL cannot silently destroy an already
 // sealed PRIVATE narration. Only a new upload/commit remains time-bound.
 sql("update libread_internal.issue137_tus_app_leases set "+
  "expires_at=clock_timestamp()-interval '1 second' where lease_id="+uuid(t.lid));
 const afterUploadExpiry=await getAudio(t.lid,a.cookie());
 yes(afterUploadExpiry.status===200&&afterUploadExpiry.bytes.equals(data),
  "sealed PRIVATE Reader survives original upload TTL expiry");
 const reloginAfterExpiry=await getAudio(t.lid,freshCookie);
 yes(reloginAfterExpiry.status===200&&reloginAfterExpiry.bytes.equals(data),
  "current same-owner session survives expired upload TTL with SHA checked");
 const directFresh=await scopedStorage("GET",
  (await sameActorDifferentSession.auth.getSession()).data.session.access_token);
 yes(directFresh.status===200&&directFresh.bytes.equals(data),
  "separate valid owner JWT obtains sealed PRIVATE bytes through RLS after TTL");
 console.log("PASS: G1_LOCAL_HTTP existing Human GET, durable same-owner re-login after TTL, "+
  "service-only pointer, 6MiB SHA/owner/non-owner/no-URL/no-Range negatives");

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
 const driftHttp=await getAudio(t.lid,a.cookie());
 yes(driftHttp.status===404&&driftHttp.bytes.length===0,
  "G1 actual HTTP denies physically overwritten same-object PRIVATE bytes");
 console.log("RISK: privileged service_role can overwrite PRIVATE snapshot; readback detects, G2 NOT proven");
}
// Revocation after sealing leaves row durable but unusable to the read gate.
assert.equal((await admin.from("user_recording_consents").update({
 consent_version:"2026-04-15"}).eq("user_id",a.actorId)).error,null);
yes(read(a,t)==="","consent withdrawal hides sealed PRIVATE pointer");
const revokedDirect=await scopedStorage("GET",a.jwt);
yes(revokedDirect.status>=400,
 "real LOCAL RLS Storage GET denies owner JWT after consent withdrawal");
const revokedHttp=await getAudio(t.lid,a.cookie());
yes(revokedHttp.status===404&&revokedHttp.bytes.length===0,
 "real G1 HTTP denies revoked consent even with existing physical bytes");
assert.equal((await admin.from("user_recording_consents").update({
 consent_version:"2026-04-16"}).eq("user_id",a.actorId)).error,null);
yes(read(a,t)==="","consent regrant cannot revive old sealed lease");
const abaHttp=await getAudio(t.lid,a.cookie());
yes(abaHttp.status===404&&abaHttp.bytes.length===0,
 "G1 HTTP does not revive old lease after consent restoration");

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
yes(rows()===initialPointerRows+1,"denied seal added no extra pointer");
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
const thirdHttp=await getAudio(third.lid,narrator.cookie());
yes(thirdHttp.status===200&&thirdHttp.bytes.equals(data),
 "third-party narrator != work author real HTTP PRIVATE G1 positive");
const authorHttp=await getAudio(third.lid,author.cookie());
yes(authorHttp.status===404&&authorHttp.bytes.length===0,
 "original work author cannot read separate narrator G1 PRIVATE bytes");
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
const r18Http=await getAudio(r18.lid,narrator.cookie());
yes(r18Http.status===200&&r18Http.bytes.equals(data),
 "actual G1 HTTP allows age-confirmed R18-eligible nonauthor narrator");
assert.equal((await admin.from("users").update({
 show_r18_content:false
}).eq("id",narrator.actorId)).error,null);
yes(read(narrator,r18)==="","turning R18 OFF revokes old non-author pointer");
const r18OffHttp=await getAudio(r18.lid,narrator.cookie());
yes(r18OffHttp.status===404&&r18OffHttp.bytes.length===0,
 "actual G1 HTTP rejects R18 OFF even if byte object remains");
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

// G2 negative: a privileged signer can mint a PRIVATE Storage bearer that
// remains independently usable after the narrator's consent is revoked.
// All actors and bytes belong to this disposable local GoTrue/Storage only;
// the URL token must NEVER be printed, sent off host or reused for deployment.
const signed=await admin.storage.from(bucket).createSignedUrl(afterConsent.path,60);
assert.equal(signed.error,null,"disposable privileged signed URL created");
const signedUrl=new URL(signed.data.signedUrl,api);
yes(signedUrl.origin===api&&
 signedUrl.pathname.startsWith("/storage/v1/object/sign/"+bucket+"/"),
 "signed URL scoped to private disposable provider, not public/prod");
const bearerFetch=async()=>{
 const response=await fetch(signedUrl,{method:"GET",redirect:"error",
  signal:AbortSignal.timeout(15000)});
 return {status:response.status,bytes:Buffer.from(await response.arrayBuffer())};
};
const beforeRevoke=await bearerFetch();
yes(beforeRevoke.status===200&&digest(beforeRevoke.bytes)===sha,
 "privileged signed Storage URL is a standalone bearer on PRIVATE bytes");
assert.equal((await admin.from("user_recording_consents").update({
 consent_version:"2026-04-15"
}).eq("user_id",narrator.actorId)).error,null);
yes(read(narrator,afterConsent)==="",
 "live PRIVATE DB pointer denied immediately after consent revoke");
const revokeThirdHttp=await getAudio(afterConsent.lid,narrator.cookie());
yes(revokeThirdHttp.status===404&&revokeThirdHttp.bytes.length===0,
 "real G1 HTTP declines revoked signed-in narrator despite old bearer");
const afterRevoke=await bearerFetch();
yes(afterRevoke.status===200&&digest(afterRevoke.bytes)===sha,
 "G2 NEGATIVE: old signed bearer still retrieves bytes after DB revoke");
console.log("RISK: #137 G2 LOCAL signed Storage bearer outlives consent revoke; "+
 "DB guard no longer authorizes but old URL still works (NO CDN involved)");

// LOCAL ONLY: deleting the exact object path retires the current bearer
// origin response, but service_role can re-create it and make the very same
// unexpired token useful again. This cannot establish CDN/browser eviction.
const retired=await admin.storage.from(bucket).remove([afterConsent.path]);
assert.equal(retired.error,null,"LOCAL privileged retirement of synthetic old object");
const retiredBearer=await bearerFetch();
yes(retiredBearer.status>=400,
 "deleting LOCAL object makes old signed bearer fail at origin");
const newContent=Buffer.from(data);newContent[4096]^=1;
const revived=await admin.storage.from(bucket).upload(afterConsent.path,newContent,{
 contentType:"audio/wav",upsert:false
});
assert.equal(revived.error,null,
 "LOCAL privileged re-create of retired SAME key remains possible");
const revivedBearer=await bearerFetch();
yes(revivedBearer.status===200&&
 digest(revivedBearer.bytes)===digest(newContent),
 "G2 NEGATIVE: unexpired signed bearer revives on SAME-PATH privileged recreation");
const oldPointerHttp=await getAudio(afterConsent.lid,narrator.cookie());
yes(oldPointerHttp.status===404&&oldPointerHttp.bytes.length===0,
 "checked G1 route rejects old pointer even if signed Storage origin key revives");
yes(third.path!==afterConsent.path && beforeConsent.path!==afterConsent.path,
 "new lease uses distinct nonce path, never reuses retired signed URL key");
console.log("RISK: G2 REAL LOCAL delete stops old bearer at origin but SAME-PATH "+
 "service-role re-create revives access; requires no-path-reuse, old CDN "+
 "retirement and independent privileged writer exclusion");


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
console.log("HOLD: G1 actual HTTP is LOCAL development-only, <=16MiB full buffer; "+
 "NOT deployed Reader, no physically immutable provider bytes, legal rights, "+
 "concurrent stream revoke, old signed bearer/CDN, >=1GiB streaming or global S3 exclusion");
} finally {
if(nextProcess?.pid){
 try{process.kill(-nextProcess.pid,"SIGTERM");}catch{}
 await sleep(350);
 try{process.kill(-nextProcess.pid,"SIGKILL");}catch{}
}
}
