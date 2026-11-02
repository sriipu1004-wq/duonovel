// Issue #137 G1: REAL disposable Next SSR cookie -> LOCAL-only JWT/TUS issuer.
// Never import hosted secrets, install SQL on a linked project, publish or merge.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {execFileSync,spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {readdirSync} from "node:fs";
import {setTimeout as sleep} from "node:timers/promises";
import {createClient} from "@supabase/supabase-js";
import {createServerClient} from "@supabase/ssr";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const api=new URL(process.env.B2_LOCAL_URL??"");
assert.ok(api.protocol==="http:"&&["127.0.0.1","localhost"].includes(api.hostname)&&
 ["54321","54331"].includes(api.port)&&api.pathname==="/"&&!api.search&&!api.hash);
const network=process.env.B2_NETWORK??"",db=process.env.B2_DB_CONTAINER??"";
assert.match(network,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(db,/^[a-f0-9]{12,64}$/);
const ids=execFileSync("docker",["ps","-q","--filter","network="+network],
 {encoding:"utf8",timeout:10000}).trim().split(/\s+/);
assert.ok(ids.includes(db),"disposable database must belong to B2 bridge");
for(const key of ["SUPABASE_SERVICE_ROLE_KEY","NEXT_PUBLIC_SUPABASE_URL",
 "NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_HUMAN_RECORDING_BUCKET"])
 assert.equal(process.env[key],undefined,"inherited hosted key forbidden");
const anon=process.env.B2_ANON_KEY??"",service=process.env.B2_SERVICE_KEY??"";
assert.ok(anon.length>15&&service.length>15&&anon!==service);
const root=fileURLToPath(new URL("../../",import.meta.url));
const cli=fileURLToPath(new URL("../../node_modules/next/dist/bin/next",import.meta.url));
assert.deepEqual(readdirSync(root).filter(x=>/^\.env(?:\.|$)/u.test(x)&&
 !/\.(?:example|sample|template)$/u.test(x)),[],"no untracked Next env");
const id=()=>randomUUID(),sha=b=>createHash("sha256").update(b).digest("hex");
const bytes=Buffer.alloc(6*1024*1024+96,0x31);
bytes.write("RIFF",0);bytes.write("WAVE",8);
const part=6*1024*1024,hash=sha(bytes),bucket="f2p-tus-app-authority-local";
const port=39675+Math.floor(Math.random()*12),base="http://127.0.0.1:"+port;
const opts={auth:{persistSession:false,autoRefreshToken:false,
 detectSessionInUrl:false}};
const admin=createClient(api.origin,service,opts);
const nextEnv={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,
 NODE_ENV:"development",CI:"true",NEXT_TELEMETRY_DISABLED:"1",
 DO_NOT_CONTACT_PRODUCTION:"true",B2_EPHEMERAL_CONFIRM:"local-only",
 NEXT_PUBLIC_SUPABASE_URL:api.origin,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,
 NEXT_PUBLIC_SITE_URL:base,B2_LOCAL_HUMAN_MULTIPART_MODE:"enabled",
 B2_LOCAL_HUMAN_TUS_ISSUER_MODE:"enabled"};
assert.equal(nextEnv.SUPABASE_SERVICE_ROLE_KEY,undefined);
assert.equal(nextEnv.B2_SERVICE_KEY,undefined);
const sql=stmt=>execFileSync("docker",["exec",db,"psql","-X","-q","-t","-A",
 "-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres","-c",stmt],
 {encoding:"utf8",timeout:15000,stdio:["ignore","pipe","pipe"]}).trim();
let checks=0,child,log="";
function yes(cond,label){assert.ok(cond,label);checks++;}
function jar(){
 const store=new Map();
 const session=createServerClient(api.origin,anon,{cookies:{
  getAll:()=>[...store].map(([name,value])=>({name,value})),
  setAll:entries=>{for(const e of entries)if(e.value)store.set(e.name,e.value);
   else store.delete(e.name);},
 }});
 return {session,header:()=>[...store].map(([k,v])=>k+"="+v).join("; ")};
}
async function actor(email="local-"+id()+"@example.invalid",consent=true){
 const password="OnlyLocal-"+id()+"Aa1!";
 const x=await admin.auth.admin.createUser({email,password,email_confirm:true});
 let uid;
 if(x.error?.code==="email_exists"&&email==="libread08@gmail.com"){
  // Previous tests in this SAME disposable DB already seed the Official
  // identity. Reuse that local fixture, never touch a hosted user or project.
  const listed=await admin.auth.admin.listUsers({page:1,perPage:1000});
  assert.equal(listed.error,null,"list disposable GoTrue users");
  const existing=listed.data.users.find(u=>u.email?.toLowerCase()===email);
  assert.ok(existing,"previous disposable Official fixture exists");
  uid=existing.id;
  const changed=await admin.auth.admin.updateUserById(uid,{
   password,email_confirm:true,
  });
  assert.equal(changed.error,null,"refresh synthetic Official password");
 }else{
  assert.equal(x.error,null,"create new synthetic GoTrue user");
  uid=x.data.user.id;
 }
 assert.equal((await admin.from("users").upsert({
  id:uid,display_name:"LOCAL",
 })).error,null);
 if(consent)assert.equal((await admin.from("user_recording_consents").upsert({
  user_id:uid,consent_key:"recording_studio_global",consent_version:"2026-04-16"
 })).error,null);
 const cookie=jar();
 const login=await cookie.session.auth.signInWithPassword({email,password});
 assert.equal(login.error,null,"real SSR actor login");
 yes(cookie.header().length>0,"real SSR cookies");
 return {id:uid,login:login.data.session,cookie};
}
const payload=(seriesId,episodeId)=>({
 seriesId,episodeId,fileName:"local.wav",mimeType:"audio/wav",
 totalSizeBytes:bytes.length,expectedSha256:hash
});
async function post(body,cookie=null,headers={}){
 const r=await fetch(base+"/api/recordings/human-upload-session",{
  method:"POST",headers:{"content-type":"application/json",
   ...(cookie?{cookie:cookie.header()}:{}),...headers},
  body:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(15000)});
 return {status:r.status,body:await r.json()};
}
async function denied(label,expected,data,cookie){
 const count=sql("select count(*) from libread_internal.issue137_tus_app_leases where issued_session_id is not null");
 const result=await post(data,cookie);
 yes(result.status===expected,label+" HTTP "+result.status+" expected "+expected);
 yes(result.body.ok===false,label+" fail closed");
 yes(sql("select count(*) from libread_internal.issue137_tus_app_leases where issued_session_id is not null")===count,
 label+" created no issuer lease");
}
async function req(url,method,jwt,headers={},body){
 const response=await fetch(url,{method,headers:{apikey:anon,
  "tus-resumable":"1.0.0",...(jwt?{authorization:"Bearer "+jwt}:{}),...headers},
  ...(body===undefined?{}:{body}),redirect:"error",signal:AbortSignal.timeout(18000)});
 const result={status:response.status,offset:Number(response.headers.get("upload-offset")??"-1"),
  location:response.headers.get("location")};
 await response.arrayBuffer();return result;
}
async function physical(path){
 const r=await admin.storage.from(bucket).download(path);
 return r.error?null:Buffer.from(await r.data.arrayBuffer());
}
function meta(path){
 return ["bucketName "+Buffer.from(bucket).toString("base64"),
 "objectName "+Buffer.from(path).toString("base64"),
 "contentType "+Buffer.from("audio/wav").toString("base64")].join(",");
}
async function start(ticket,jwt){
 const r=await req(api.origin+"/storage/v1/upload/resumable","POST",jwt,{
  "upload-length":String(bytes.length),"upload-metadata":meta(ticket.objectPath)});
 const url=r.location?new URL(r.location,api.origin+"/storage/v1/upload/resumable"):null;
 if(url){
  yes(url.origin===api.origin&&url.pathname.startsWith("/storage/v1/upload/resumable/"),
   "local TUS URL never remote");
 }
 return {status:r.status,url:url?.toString()};
}
async function patch(url,jwt,offset,chunk){
 return req(url,"PATCH",jwt,{"upload-offset":String(offset),
  "content-type":"application/offset+octet-stream"},chunk);
}
async function issue(data,cookie){
 const r=await post(data,cookie);
 yes(r.status===201&&r.body.ok===true,"real Next SSR issuer 201");
 yes(r.body.uploadMode==="private-jwt-tus-local-only","PRIVATE user-JWT transport only");
 yes(Object.keys(r.body).sort().join(",")==="expiresAt,leaseId,objectPath,ok,uploadMode",
  "no signed bearer, JWT, S3 secret or PUBLIC link");
 yes(r.body.objectPath.startsWith("owner/")&&r.body.objectPath.endsWith("/"+r.body.leaseId+".wav"),
  "opaque server-owned ticket path");
 return r.body;
}
try{
 // The earlier legacy local Next test revokes consent SELECT at its end.
 // Restore that grant on the disposable DB only; retain self-only RLS.
 sql("grant select on public.user_recording_consents to authenticated");
 const baseline=await admin.from("recordings").select("id",{count:"exact",head:true});
 assert.equal(baseline.error,null,"local baseline recording count");
 const initialCount=baseline;
 const owner=await actor(),reader=await actor(undefined,false);
 const outsider=await actor(),official=await actor("libread08@gmail.com");
 const series=id(),episode=id(),foreignSeries=id();
 for(const [table,row] of [
  ["series",{id:series,author_id:owner.id,publication_status:"public",
   recording_permission_mode:"open",content_rating:"general",content_warnings:[]}],
  ["episodes",{id:episode,series_id:series,body:"SYNTHETIC",
   posting_status:"posted",is_published:true}],
  ["series",{id:foreignSeries,author_id:outsider.id,
   publication_status:"private",recording_permission_mode:"open"}],
 ]){
  assert.equal((await admin.from(table).insert(row)).error,null);
 }
 const env=nextEnv;
 child=spawn(process.execPath,[cli,"dev","--hostname","127.0.0.1","--port",String(port)],{
  cwd:root,env,detached:true,stdio:["ignore","pipe","pipe"]});
 for(const s of [child.stdout,child.stderr])s.on("data",v=>{log=(log+String(v)).slice(-2500);});
 let ready=false;
 for(let i=0;i<150;i++){
  if(child.exitCode!==null)throw Error("NEXT_CHILD_EXITED");
  try{
   const r=await post(payload(series,episode));
   if(r.status===401){ready=true;break;}
  }catch{}
  await sleep(350);
 }
 yes(ready,"real loopback Next route ready, anonymous denied");
 await denied("anonymous",401,payload(series,episode),null);
 await denied("missing consent",403,payload(series,episode),reader.cookie);
 assert.equal((await admin.from("user_recording_consents").insert({
  user_id:reader.id,consent_key:"recording_studio_global",
  consent_version:"2026-04-15"})).error,null);
 await denied("stale consent",403,payload(series,episode),reader.cookie);
 assert.equal((await admin.from("user_recording_consents").update({
  consent_version:"2026-04-16"}).eq("user_id",reader.id)).error,null);
 await denied("official account",403,payload(series,episode),official.cookie);
 // Direct Data API RPC bypasses the Next handler: it must independently
 // reject Official even with a valid GoTrue cookie and current consent.
 const beforeOfficial=sql("select count(*) from libread_internal.issue137_tus_app_leases"+
  " where issued_session_id is not null");
 const directOfficial=await official.cookie.session.rpc("issue137_tus_local_issue",{
  p_series_id:series,p_episode_id:episode,
  p_expected_sha256:hash,p_size_bytes:bytes.length,
 });
 yes(directOfficial.error!==null&&directOfficial.data===null,
  "Official direct PostgREST RPC must fail, not only Next UI");
 yes(sql("select count(*) from libread_internal.issue137_tus_app_leases"+
  " where issued_session_id is not null")===beforeOfficial,
  "Official direct RPC created no private lease");

 await denied("wrong episode",404,payload(series,id()),reader.cookie);
 await denied("nonowner private work",403,payload(foreignSeries,episode),reader.cookie);
 await denied("invalid digest",400,{...payload(series,episode),expectedSha256:"x".repeat(64)},reader.cookie);
 const origin=await post(payload(series,episode),reader.cookie,{origin:"https://example.invalid"});
 yes(origin.status===403,"cross-site origin rejected");
 assert.equal((await admin.from("series").update({
  recording_permission_mode:"closed"}).eq("id",series)).error,null);
 await denied("closed recording permission",403,payload(series,episode),reader.cookie);
 assert.equal((await admin.from("series").update({
  recording_permission_mode:"open",content_rating:"r18",
  content_warnings:["sexual_r18"]}).eq("id",series)).error,null);
 await denied("R18 disabled",403,payload(series,episode),reader.cookie);
 assert.equal((await admin.from("users").update({
  show_r18_content:true}).eq("id",reader.id)).error,null);
 await denied("R18 not confirmed",403,payload(series,episode),reader.cookie);
 assert.equal((await admin.from("users").update({
  r18_confirmed_at:new Date().toISOString()}).eq("id",reader.id)).error,null);
 const rated=await issue(payload(series,episode),reader.cookie);
 // An issuer ticket must NEVER be accepted as a finalized recording. Check
 // both ordinary finalize shape and legacy probe marker for bypass.
 async function finalize(body){
  const r=await fetch(base+"/api/recordings/human-upload-finalize",{
   method:"POST",headers:{"content-type":"application/json",
    cookie:reader.cookie.header()},body:JSON.stringify(body),redirect:"error",
   signal:AbortSignal.timeout(15000)});
  return {status:r.status,body:await r.json()};
 }
 const normalFinal=await finalize({
  seriesId:series,episodeId:episode,episodeNumber:1,isPublic:true,
  fileName:"local.wav",mimeType:"audio/wav",totalSizeBytes:bytes.length,
  uploadSessionId:rated.leaseId,
 });
 yes(normalFinal.status===409&&normalFinal.body.error==="ISSUE137_LOCAL_TUS_FINALIZE_HOLD",
  "TUS local issuer mode denies normal Human finalize before privileged worker");
 const legacyFinal=await finalize({issue137LocalProbe:"finish",sessionId:rated.leaseId});
 yes(legacyFinal.status===409&&legacyFinal.body.error==="ISSUE137_LOCAL_TUS_FINALIZE_HOLD",
  "TUS issuer mode blocks legacy finalize marker bypass");
 const probe=await post({...payload(series,episode),issue137LocalProbe:"open"},reader.cookie);
 yes(probe.status===400,"TUS issuer blocks old local signer marker bypass");
 // Physical access remains PRIVATE, and a foreign JWT cannot use the issued path.
 const foreign=await start(rated,outsider.login.access_token);
 if(foreign.url){
  const a=await patch(foreign.url,outsider.login.access_token,0,bytes.subarray(0,part));
  yes(a.status!==204,"foreign JWT denied first TUS PATCH");
 }else yes(foreign.status!==201,"foreign JWT denied TUS initiation");
 yes((await physical(rated.objectPath))===null,"foreign JWT cannot complete object");
 const opened=await start(rated,reader.login.access_token);
 yes(opened.status===201&&!!opened.url,"real Next-issued ticket starts local PRIVATE TUS");
 const first=await patch(opened.url,reader.login.access_token,0,bytes.subarray(0,part));
 yes(first.status===204&&first.offset===part,"first 6MiB TUS chunk staged");
 assert.equal((await admin.from("user_recording_consents").update({
  consent_version:"2026-04-15"}).eq("user_id",reader.id)).error,null);
 const after=await patch(opened.url,reader.login.access_token,part,bytes.subarray(part));
 yes(after.status===403,"real consent withdrawal blocks final provider PATCH");
 yes((await physical(rated.objectPath))===null,"withdrawal leaves no complete PRIVATE bytes");
 assert.equal((await admin.from("user_recording_consents").update({
  consent_version:"2026-04-16"}).eq("user_id",reader.id)).error,null);
 const replay=await patch(opened.url,reader.login.access_token,part,bytes.subarray(part));
 yes(replay.status===403,"consent regrant does not resurrect old ticket");
 const fresh=await issue(payload(series,episode),reader.cookie);
 const accepted=await start(fresh,reader.login.access_token);
 yes(accepted.status===201&&!!accepted.url,"reissued new JWT lease");
 yes((await patch(accepted.url,reader.login.access_token,0,bytes.subarray(0,part))).status===204,
  "fresh first TUS PATCH");
 const fin=await patch(accepted.url,reader.login.access_token,part,bytes.subarray(part));
 yes(fin.status===204&&fin.offset===bytes.length,"fresh PRIVATE commit");
 const saved=await physical(fresh.objectPath);
 yes(saved?.length===bytes.length&&sha(saved)===hash,"PRIVATE full physical SHA readback");
 const publicGet=await fetch(api.origin+"/storage/v1/object/public/"+bucket+"/"+fresh.objectPath,{
  headers:{apikey:anon},redirect:"error",signal:AbortSignal.timeout(10000)});
 yes(publicGet.status>=400&&publicGet.status<500,"no PUBLIC object URL");
 const count=await admin.from("recordings").select("id",{count:"exact",head:true});
 yes(count.error===null&&count.count===initialCount.count,
  "no new recording publication relative to existing local fixture");
 assert.equal((await admin.storage.from(bucket).remove([fresh.objectPath])).error,null);
 yes((await physical(fresh.objectPath))===null,"test object removed");
 // G1 revocation ABA negatives: a live lease must stay revoked even AFTER
 // authority is restored. Same actor/session and real 6MiB partial TUS.
 const leaseState=t=>sql("select state from libread_internal.issue137_tus_app_leases"+
  " where lease_id='"+t.leaseId+"'");
 async function epochRevoked(label,withdraw,regrant){
  const ticket=await issue(payload(series,episode),reader.cookie);
  const opened=await start(ticket,reader.login.access_token);
  yes(opened.status===201&&!!opened.url,label+" starts PRIVATE TUS");
  const first=await patch(opened.url,reader.login.access_token,0,bytes.subarray(0,part));
  yes(first.status===204&&first.offset===part,label+" first partial PATCH");
  await withdraw();
  yes(leaseState(ticket)==="revoked",label+" terminal DB revocation");
  await regrant();
  yes(leaseState(ticket)==="revoked",label+" old lease stays revoked after regrant");
  const result=await patch(opened.url,reader.login.access_token,part,bytes.subarray(part));
  yes(result.status===403,label+" final Storage PATCH denied after regrant");
  yes((await physical(ticket.objectPath))===null,label+" no complete PRIVATE object");
 }
 const mutate=(table,data,column,value)=>admin.from(table).update(data).eq(column,value);
 const consentKey="recording_studio_global";
 await epochRevoked("consent DELETE -> reinsert",
  async()=>{
   const r=await admin.from("user_recording_consents").delete()
    .eq("user_id",reader.id).eq("consent_key",consentKey);
   assert.equal(r.error,null);
  },
  async()=>{
   const r=await admin.from("user_recording_consents").insert({
    user_id:reader.id,consent_key:consentKey,consent_version:"2026-04-16"});
   assert.equal(r.error,null);
  });
 await epochRevoked("R18 show OFF -> ON",
  async()=>{assert.equal((await mutate("users",{show_r18_content:false},"id",reader.id)).error,null);},
  async()=>{assert.equal((await mutate("users",{show_r18_content:true},"id",reader.id)).error,null);});
 await epochRevoked("R18 age-confirmation withdraw -> restore",
  async()=>{assert.equal((await mutate("users",{r18_confirmed_at:null},"id",reader.id)).error,null);},
  async()=>{assert.equal((await mutate("users",{r18_confirmed_at:new Date().toISOString()},"id",reader.id)).error,null);});
 await epochRevoked("recording permission close -> reopen",
  async()=>{assert.equal((await mutate("series",{recording_permission_mode:"closed"},"id",series)).error,null);},
  async()=>{assert.equal((await mutate("series",{recording_permission_mode:"open"},"id",series)).error,null);});
 await epochRevoked("R18 rating withdraw -> restore",
  async()=>{assert.equal((await mutate("series",{content_rating:"general"},"id",series)).error,null);},
  async()=>{assert.equal((await mutate("series",{content_rating:"r18"},"id",series)).error,null);});
 await epochRevoked("episode unpublish -> repost",
  async()=>{assert.equal((await mutate("episodes",{is_published:false},"id",episode)).error,null);},
  async()=>{assert.equal((await mutate("episodes",{is_published:true},"id",episode)).error,null);});
 await epochRevoked("episode body edit -> restore",
  async()=>{assert.equal((await mutate("episodes",{body:"LOCAL EDIT"},"id",episode)).error,null);},
  async()=>{assert.equal((await mutate("episodes",{body:"SYNTHETIC"},"id",episode)).error,null);});
 // A new authorized lease after the above withdrawals is allowed; old ones
 // stay revoked and cannot share immutable object paths.
 const newLease=await issue(payload(series,episode),reader.cookie);
 yes(leaseState(newLease)==="active","new lease permitted after rights revalidation");
 yes(newLease.objectPath!==fresh.objectPath,"fresh lease path never reuses old path");
 console.log("PASS: #137 REAL LOCAL Next SSR -> self-issued PRIVATE JWT/TUS "+checks+
  " assertions, ownership/consent/R18/official/origin negatives, physical SHA, no PUBLIC record");
 console.log("HOLD: test-only SQL is not real rights attestation, no provider-exclusive privileged writer, no deployed Studio/finalizer, no legacy bearer revocation");
}finally{
 if(child?.pid){
  try{process.kill(-child.pid,"SIGTERM");}catch{}
  await sleep(350);
  try{process.kill(-child.pid,"SIGKILL");}catch{}
 }
}
