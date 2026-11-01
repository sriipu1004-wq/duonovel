// Issue #137: real localhost Next SSR -> bounded 8MiB stream -> local worker
// -> durable PostgreSQL receipt and PRIVATE Storage. 1GiB protocol metadata
// only, NEVER a 1GiB memory allocation, PUBLIC write, Production or paid host.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {request as httpRequest} from "node:http";
import {execFileSync,spawn} from "node:child_process";
import {readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {setTimeout as sleep} from "node:timers/promises";
import {createClient} from "@supabase/supabase-js";
import {createServerClient} from "@supabase/ssr";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const ep=new URL(process.env.B2_LOCAL_URL??"");
assert.ok(ep.protocol==="http:"&&["localhost","127.0.0.1"].includes(ep.hostname)&&
 ["54321","54331"].includes(ep.port)&&ep.pathname==="/"&&!ep.search&&!ep.hash);
const net=process.env.B2_NETWORK??"",db=process.env.B2_DB_CONTAINER??"";
assert.match(net,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(db,/^[a-f0-9]{12,64}$/);
assert.ok(execFileSync("docker",["ps","-q","--filter","network="+net],
 {encoding:"utf8",timeout:10000}).trim().split(/\s+/).includes(db));
for(const k of ["SUPABASE_SERVICE_ROLE_KEY","NEXT_PUBLIC_SUPABASE_URL",
 "NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_HUMAN_RECORDING_BUCKET"])
 assert.equal(process.env[k],undefined,"parent must not have app credentials "+k);
const anon=process.env.B2_ANON_KEY??"",service=process.env.B2_SERVICE_KEY??"";
assert.ok(anon.length>15&&service.length>15&&anon!==service);
const root=fileURLToPath(new URL("../../",import.meta.url));
const nextCli=fileURLToPath(new URL("../../node_modules/next/dist/bin/next",import.meta.url));
const workerScript=fileURLToPath(new URL("./human-multipart-worker-process-local.mjs",import.meta.url));
assert.deepEqual(readdirSync(root).filter(x=>/^\.env(?:\.|$)/.test(x)&&
 !/\.(?:example|sample|template)$/.test(x)),[],"untracked Next env forbidden");
const id=()=>randomUUID(),sha=b=>createHash("sha256").update(b).digest("hex");
const partSize=8*1024*1024,total=partSize+256,bucket="f2p-local-multipart-private";
const portNext=39675+Math.floor(Math.random()*12),portWorker=39880+Math.floor(Math.random()*10);
const nextBase="http://127.0.0.1:"+portNext,workerBase="http://127.0.0.1:"+portWorker;
const secret=id()+id(),children=[];
const common={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,
 DO_NOT_CONTACT_PRODUCTION:"true",B2_EPHEMERAL_CONFIRM:"local-only",
 NODE_ENV:"development"};
const workerEnv={...common,B2_LOCAL_URL:ep.origin+"/",B2_ANON_KEY:anon,
 B2_SERVICE_KEY:service,B2_LOCAL_WORKER_INNER_TOKEN:secret,
 B2_HTTP_BOUNDARY_PORT:String(portWorker)};
const nextEnv={...common,NEXT_TELEMETRY_DISABLED:"1",CI:"true",
 NEXT_PUBLIC_SUPABASE_URL:ep.origin,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,
 NEXT_PUBLIC_SITE_URL:nextBase,B2_LOCAL_WORKER_INNER_TOKEN:secret,
 B2_LOCAL_HUMAN_MULTIPART_URL:workerBase+"/",
 B2_LOCAL_HUMAN_MULTIPART_MODE:"enabled",
 B2_LOCAL_HUMAN_NORMAL_ROUTE_MODE:"enabled"};
assert.equal(nextEnv.B2_SERVICE_KEY,undefined);
assert.equal(nextEnv.SUPABASE_SERVICE_ROLE_KEY,undefined);
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(ep.origin,service,opts);
const api="/api/recordings/human-local-multipart";
const bytes=Buffer.alloc(partSize,0x34),tail=Buffer.alloc(256,0x4f),
 wrong=Buffer.alloc(partSize,0x17); // 8MiB, not the entire 1GiB.
for(const item of [bytes,wrong]){item.write("RIFF",0);item.write("WAVE",8);}
let checks=0,logs="";
function yes(value,label){assert.ok(value,label);checks++;}
function start(script,args,env){
 const p=spawn(process.execPath,[script,...args],{cwd:root,env,detached:true,
  stdio:["ignore","pipe","pipe"]});
 for(const s of [p.stdout,p.stderr])s.on("data",x=>{logs=(logs+String(x)).slice(-8000);});
 children.push(p);return p;
}
async function stop(ch){
 if(!ch?.pid)return;
 try{process.kill(-ch.pid,"SIGTERM");}catch{}
 await sleep(400);
 try{process.kill(-ch.pid,"SIGKILL");}catch{}
}
async function readyWorker(p){
 for(let i=0;i<75;i++){
  if(p.exitCode!==null)throw Error("WORKER_EXITED");
  try{
   const x=await fetch(workerBase+"/health",{signal:AbortSignal.timeout(1200)});
   if(x.status===200)return;
  }catch{}await sleep(200);
 }
 throw Error("WORKER_NOT_READY");
}
async function readyNext(p){
 for(let i=0;i<150;i++){
  if(p.exitCode!==null)throw Error("NEXT_EXITED");
  try{
   const x=await post({action:"open",seriesId:id(),episodeId:id(),totalBytes:total});
   if(x.status===401)return;
  }catch{}await sleep(400);
 }
 throw Error("NEXT_NOT_READY");
}
function jar(){
 const values=new Map();
 const auth=createServerClient(ep.origin,anon,{cookies:{
  getAll:()=>[...values].map(([name,value])=>({name,value})),
  setAll:parts=>{for(const x of parts){if(x.value)values.set(x.name,x.value);else values.delete(x.name);}}
 }});
 return {auth,cookie:()=>[...values].map(([k,v])=>k+"="+v).join("; ")};
}
async function actor(label){
 const email="multipart-next-"+label+"-"+id()+"@example.invalid",pass="Local-"+id()+"Aa!1";
 const created=await admin.auth.admin.createUser({email,password:pass,email_confirm:true});
 assert.equal(created.error,null,"synthetic local user");
 const session=jar(),signed=await session.auth.auth.signInWithPassword({
  email,password:pass});
 assert.equal(signed.error,null,"real local cookie sign-in");
 yes(session.cookie().length>20,"real SSR cookie");
 return {uid:created.data.user.id,session,jwt:signed.data.session.access_token,email,pass};
}
async function parse(r){
 const txt=await r.text();let body={};try{body=JSON.parse(txt);}catch{}
 return {status:r.status,body,raw:txt};
}
function processProbe(child){
 if(!child?.pid)return {alive:false,rssKiB:null,exitCode:null,signal:null};
 let alive=false,rssKiB=null;
 try{process.kill(child.pid,0);alive=true;}catch{}
 if(alive)try{
  const raw=execFileSync("ps",["-o","rss=","-p",String(child.pid)],
   {encoding:"utf8",timeout:1500}).trim();
  if(/^[0-9]+$/u.test(raw))rssKiB=Number(raw);
 }catch{}
 return {alive,rssKiB,exitCode:child.exitCode,signal:child.signalCode};
}
async function post(body,cookie=""){
 try{
  return await parse(await fetch(nextBase+api,{method:"POST",
   headers:{"content-type":"application/json",...(cookie?{cookie}:{})},
   body:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:"error"}));
 }catch(e){
  // Failure-only diagnostics. Do NOT print cookies, JWT, env, object paths,
  // Next stack traces, process arguments or raw child stdout/stderr.
  let workerHealth="unavailable";
  try{
   const x=await fetch(workerBase+"/health",{signal:AbortSignal.timeout(1200)});
   workerHealth=x.status===200?"healthy":"non200";
  }catch{}
  const diagnosis={action:["open","part","put","status","finish","abort"].includes(
    body?.action)?body.action:"other",
   errorCode:String(e?.cause?.code??e?.code??"unknown").slice(0,24),
   next:processProbe(next),worker:processProbe(worker),workerHealth,
   runnerRssKiB:Math.round(process.memoryUsage().rss/1024),
   childLogFlags:{oom:/heap out of memory|allocation failed|out of memory/iu.test(logs),
    fatal:/FATAL ERROR/iu.test(logs),killed:/SIGKILL|Killed process/iu.test(logs)}};
  console.error("HOLD: F2-P LOCAL Next POST transport diagnostics "+
   JSON.stringify(diagnosis));
  throw e;
 }
}
async function postLegacy(which,body,cookie="",extraHeaders={}){
 assert.ok(["human-upload-session","human-upload-finalize"].includes(which));
 return parse(await fetch(nextBase+"/api/recordings/"+which,{method:"POST",
  headers:{"content-type":"application/json",...(cookie?{cookie}:{}),...extraHeaders},
  body:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:"error"}));
}
// Node fetch normalizes a caller-provided Host to the URL authority. Use the
// raw Node HTTP client here so the negative test actually transmits the spoof.
async function postLegacySpoofHost(which,body,cookie,host){
 assert.ok(["human-upload-session","human-upload-finalize"].includes(which));
 const raw=JSON.stringify(body);
 return new Promise((resolve,reject)=>{
  const req=httpRequest(nextBase+"/api/recordings/"+which,{
   method:"POST",timeout:30000,
   headers:{host,"content-type":"application/json",
    "content-length":Buffer.byteLength(raw),cookie}
  },res=>{
   const chunks=[];
   res.on("data",chunk=>chunks.push(chunk));
   res.on("error",reject);
   res.on("end",()=>{
    const txt=Buffer.concat(chunks).toString("utf8");
    let parsed={};try{parsed=JSON.parse(txt);}catch{}
    resolve({status:res.statusCode??0,body:parsed,raw:txt});
   });
  });
  req.on("timeout",()=>req.destroy(Error("SPOOF_HOST_TIMEOUT")));
  req.on("error",reject);
  req.end(raw);
 });
}
async function put(ticket,data,cookie="",headers={}){
 return parse(await fetch(nextBase+api,{method:"PUT",
  headers:{"x-part-id":ticket,"content-type":"application/octet-stream",
   ...(cookie?{cookie}:{}),...headers},
  body:data,signal:AbortSignal.timeout(40000),redirect:"error"}));
}
async function physical(session,number){
 const object="owner/"+owner.uid+"/"+session+"/part-"+String(number+1).padStart(4,"0")+".bin";
 const got=await admin.storage.from(bucket).download(object);
 return got.error?null:Buffer.from(await got.data.arrayBuffer());
}
let owner,other,worker,next;
try{
 owner=await actor("owner");other=await actor("other");
 const seriesId=id(),episodeId=id();
 assert.equal((await admin.from("series").insert({
  id:seriesId,author_id:owner.uid,publication_status:"public",
  recording_permission_mode:"open",content_rating:"general",content_warnings:[]
 })).error,null,"synthetic series");
 assert.equal((await admin.from("episodes").insert({
  id:episodeId,series_id:seriesId,body:"LOCAL ONLY",is_published:true,
  posting_status:"posted"})).error,null,"synthetic episode");
 for(const a of [owner,other])
  assert.equal((await admin.from("user_recording_consents").insert({
   user_id:a.uid,consent_key:"recording_studio_global",consent_version:"2026-04-16"
  })).error,null,"synthetic current consent");
 assert.equal((await admin.storage.createBucket(bucket,{public:false,
  fileSizeLimit:16*1024*1024})).error,null,"PRIVATE multipart bucket");
 worker=start(workerScript,[],workerEnv);await readyWorker(worker);
 nextEnv.B2_LOCAL_BROWSER_SERIES_ID=seriesId;
 nextEnv.B2_LOCAL_BROWSER_EPISODE_ID=episodeId;
 next=start(nextCli,["dev","--hostname","127.0.0.1",
  "--port",String(portNext)],nextEnv);await readyNext(next);
 const create={action:"open",seriesId,episodeId,totalBytes:total};
 // Legacy Human signer already denies the Official account. New local route
 // must preserve that separate product restriction, not just RLS/consent.
 const officialEmail="libread08@gmail.com",officialPassword="Local-"+id()+"Aa!1";
 const officialAccount=await admin.auth.admin.createUser({
  email:officialEmail,password:officialPassword,email_confirm:true});
 assert.equal(officialAccount.error,null,"local-only synthetic Official account");
 const officialSession=jar();
 const officialLogin=await officialSession.auth.auth.signInWithPassword({
  email:officialEmail,password:officialPassword});
 assert.equal(officialLogin.error,null,"synthetic Official login");
 assert.equal((await admin.from("user_recording_consents").insert({
  user_id:officialAccount.data.user.id,
  consent_key:"recording_studio_global",consent_version:"2026-04-16"
 })).error,null,"synthetic Official has current consent");
 yes((await post(create,officialSession.cookie())).status===401,
  "Official account cannot open Human multipart staging despite valid consent");
 yes((await post(create)).status===401,"anonymous Next POST forbidden");
 // Exercise ACTUAL preexisting Human API route handlers through an opt-in
 // development-only branch, never create signed-upload bearer or recordings.
 const bridgeRequest={issue137LocalProbe:"open",seriesId,episodeId,
  fileName:"synthetic-local.wav",mimeType:"audio/wav",totalSizeBytes:total};
 const newAnon=await postLegacy("human-upload-session",bridgeRequest);
 yes(newAnon.status===401,
  "legacy session dev bridge requires real authenticated SSR cookie; status="+
  newAnon.status+" reason="+String(newAnon.body?.reason??newAnon.body?.error??"NONE").slice(0,85));
 // Only an HttpOnly SSR cookie backed by GoTrue can authorize the legacy
 // bridge. A valid JWT sent as an arbitrary Authorization header is not an
 // alternative credential for this development-only route.
 const bearerOnly=await postLegacy("human-upload-session",bridgeRequest,"",
  {authorization:"Bearer "+owner.jwt});
 yes(bearerOnly.status===401&&!bearerOnly.body.sessionId&&
  !bearerOnly.body.token,
  "legacy dev bridge ignores bearer-only auth and creates no upload ticket");
 // Local opt-in must not become reachable through a spoofed Host even with
 // a valid owner's SSR session. The runtime and worker are still localhost-only.
 const forgedHost=await postLegacySpoofHost("human-upload-session",
  bridgeRequest,owner.session.cookie(),"localhost:"+portNext);
 yes(forgedHost.status===404&&
  forgedHost.body.error==="ISSUE137_LOCAL_LEGACY_PROBE_HOLD"&&
  !forgedHost.body.sessionId,
  "legacy dev bridge rejects REAL spoofed Host; status="+forgedHost.status+
  " reason="+String(forgedHost.body.reason??forgedHost.body.error??"NONE").slice(0,80));
 // Extra caller-selected path fields must not be forwarded to the worker.
 const pathInjection=await postLegacy("human-upload-session",
  {...bridgeRequest,objectPath:"public/forged.wav"},owner.session.cookie());
 yes(pathInjection.status===400&&!pathInjection.body.sessionId,
  "legacy dev bridge refuses caller-controlled Storage object path");
 const wrongLocal=await postLegacy("human-upload-session",
  {...bridgeRequest,issue137LocalProbe:"not-enabled"},owner.session.cookie());
 yes(wrongLocal.status===400,"unknown local bridge mode fail closed");
 const tooLargeBridge=await postLegacy("human-upload-session",
  {...bridgeRequest,totalSizeBytes:1024*1024*1024+1},owner.session.cookie());
 yes(tooLargeBridge.status===400,"legacy dev bridge rejects >1GiB");
 const openedLegacy=await postLegacy("human-upload-session",
  bridgeRequest,owner.session.cookie());
 yes(openedLegacy.status===201&&
  openedLegacy.body.reason==="MULTIPART_OPEN"&&
  openedLegacy.body.partCount===2&&
  !("parts" in openedLegacy.body)&&!("token" in openedLegacy.body),
  "actual Human session route dev branch issued scoped local ticket, never signed URL");
 const legacyId=openedLegacy.body.sessionId;
 const firstLegacy=await post({action:"part",sessionId:legacyId,
  index:0,expectedSha256:sha(bytes)},owner.session.cookie());
 yes(firstLegacy.status===201,"legacy session dev ticket authorizes isolated PRIVATE part");
 yes((await put(firstLegacy.body.partId,bytes,owner.session.cookie())).status===201,
  "real legacy session dev stage stored first PRIVATE 8MiB");
 const earlyLegacy=await postLegacy("human-upload-finalize",
  {issue137LocalProbe:"finish",sessionId:legacyId},owner.session.cookie());
 yes(earlyLegacy.status===409,
  "actual Human finalize dev branch refuses partial staged audio");
 const otherFinal=await postLegacy("human-upload-finalize",
  {issue137LocalProbe:"finish",sessionId:legacyId},other.session.cookie());
 yes(otherFinal.status===403,
  "legacy finalize dev branch refuses other consenting user's ticket");
 // Conflicting credentials must never let another owner finalize a ticket.
 // The server's SSR cookie identity has precedence over caller-supplied bearer.
 const mixedIdentity=await postLegacy("human-upload-finalize",
  {issue137LocalProbe:"finish",sessionId:legacyId},
  other.session.cookie(),{authorization:"Bearer "+owner.jwt});
 yes(mixedIdentity.status===403&&!mixedIdentity.body.recordingId,
  "other-owner SSR cookie cannot borrow owner's bearer to finalize");
 const lastLegacy=await post({action:"part",sessionId:legacyId,index:1,
  expectedSha256:sha(tail)},owner.session.cookie());
 yes(lastLegacy.status===201&&
  (await put(lastLegacy.body.partId,tail,owner.session.cookie())).status===201,
  "legacy session dev path preserves exact final 256B PRIVATE remainder");
 // All PRIVATE parts have been sealed. The actual legacy finalize
 // handler's opt-in LOCAL bridge must recheck live authority at FINISH.
 const consentRevokeLegacy=await admin.from("user_recording_consents")
  .update({consent_version:"2026-04-15"}).eq("user_id",owner.uid)
  .eq("consent_key","recording_studio_global");
 assert.equal(consentRevokeLegacy.error,null,"local-only consent withdrawal");
 const deniedConsentLegacy=await postLegacy("human-upload-finalize",
  {issue137LocalProbe:"finish",sessionId:legacyId},owner.session.cookie());
 yes(deniedConsentLegacy.status===403&&!deniedConsentLegacy.body.recordingId,
  "legacy finalize refuses sealed parts after consent withdrawal");
 const legacyHeldRow=await admin.from("issue137_http_local_multipart_sessions")
  .select("state").eq("id",legacyId).single();
 yes(!legacyHeldRow.error&&legacyHeldRow.data.state==="HOLD",
  "SQL withdrawal quarantines existing legacy multipart session");
 const consentRestoreLegacy=await admin.from("user_recording_consents")
  .update({consent_version:"2026-04-16"}).eq("user_id",owner.uid)
  .eq("consent_key","recording_studio_global");
 assert.equal(consentRestoreLegacy.error,null,"local-only consent restore");
 yes((await postLegacy("human-upload-finalize",
  {issue137LocalProbe:"finish",sessionId:legacyId},owner.session.cookie())).status===409,
  "same-version regrant cannot resurrect withdrawn legacy session");
 const markR18Legacy=await admin.from("series").update({content_rating:"r18"})
  .eq("id",seriesId);
 assert.equal(markR18Legacy.error,null,"local-only R18 transition");
 const deniedR18Legacy=await postLegacy("human-upload-finalize",
  {issue137LocalProbe:"finish",sessionId:legacyId},owner.session.cookie());
 yes(deniedR18Legacy.status===403&&!deniedR18Legacy.body.recordingId,
  "legacy finalize refuses sealed parts after R18 reclassification");
 const restoreR18Legacy=await admin.from("series").update({content_rating:"general"})
  .eq("id",seriesId);
 assert.equal(restoreR18Legacy.error,null,"local-only general rating restore");
 const makePrivateLegacy=await admin.from("series")
  .update({publication_status:"private"}).eq("id",seriesId);
 assert.equal(makePrivateLegacy.error,null,"local-only unpublish series");
 const deniedPrivateLegacy=await postLegacy("human-upload-finalize",
  {issue137LocalProbe:"finish",sessionId:legacyId},owner.session.cookie());
 yes(deniedPrivateLegacy.status===403&&!deniedPrivateLegacy.body.recordingId,
  "legacy finalize refuses sealed parts after source series unpublishes");
 const restorePublicLegacy=await admin.from("series")
  .update({publication_status:"public"}).eq("id",seriesId);
 assert.equal(restorePublicLegacy.error,null,"local-only public status restore");
 // Negative transitions after both actual PRIVATE parts were sealed.
 // Neither a previously granted session nor stable bytes permit a stale
 // Human finalize when author permission, R18 warning or episode visibility
 // is withdrawn. Each write is solely to disposable Docker fixtures.
 const closeNarrationLegacy=await admin.from("series")
  .update({recording_permission_mode:"closed"}).eq("id",seriesId);
 assert.equal(closeNarrationLegacy.error,null,"local-only recording permission stop");
 const deniedClosedLegacy=await postLegacy("human-upload-finalize",
  {issue137LocalProbe:"finish",sessionId:legacyId},owner.session.cookie());
 yes(deniedClosedLegacy.status===403&&!deniedClosedLegacy.body.recordingId,
  "legacy finalize denies sealed parts after author closes narration permission");
 const reopenNarrationLegacy=await admin.from("series")
  .update({recording_permission_mode:"open"}).eq("id",seriesId);
 assert.equal(reopenNarrationLegacy.error,null,"local-only recording permission restore");
 const addR18WarningLegacy=await admin.from("series")
  .update({content_warnings:["sexual_r18"]}).eq("id",seriesId);
 assert.equal(addR18WarningLegacy.error,null,"local-only sexual_r18 warning");
 const deniedWarningLegacy=await postLegacy("human-upload-finalize",
  {issue137LocalProbe:"finish",sessionId:legacyId},owner.session.cookie());
 yes(deniedWarningLegacy.status===403&&!deniedWarningLegacy.body.recordingId,
  "legacy finalize rejects R18 warning even with general content_rating");
 const clearR18WarningLegacy=await admin.from("series")
  .update({content_warnings:[]}).eq("id",seriesId);
 assert.equal(clearR18WarningLegacy.error,null,"local-only warning restore");
 const hideEpisodeLegacy=await admin.from("episodes")
  .update({is_published:false}).eq("id",episodeId);
 assert.equal(hideEpisodeLegacy.error,null,"local-only episode unpublish");
 const deniedEpisodeLegacy=await postLegacy("human-upload-finalize",
  {issue137LocalProbe:"finish",sessionId:legacyId},owner.session.cookie());
 yes(deniedEpisodeLegacy.status===403&&!deniedEpisodeLegacy.body.recordingId,
  "legacy finalize refuses sealed audio after episode publication withdrawn");
 const republishEpisodeLegacy=await admin.from("episodes")
  .update({is_published:true}).eq("id",episodeId);
 assert.equal(republishEpisodeLegacy.error,null,"local-only episode visibility restore");
 const deniedRowsLegacy=await admin.from("recordings").select("id")
  .eq("episode_id",episodeId);
 yes(!deniedRowsLegacy.error&&deniedRowsLegacy.data?.length===0,
  "revoked legacy finalize created no recording metadata");
 const retainedLegacyPart=await admin.storage.from(bucket).download(
  "owner/"+owner.uid+"/"+legacyId+"/part-0001.bin");
 yes(!retainedLegacyPart.error&&
  sha(Buffer.from(await retainedLegacyPart.data.arrayBuffer()))===sha(bytes),
  "denied legacy finalize preserved physically verified PRIVATE bytes");
 const finishedLegacy=await postLegacy("human-upload-finalize",
  {issue137LocalProbe:"finish",sessionId:legacyId},owner.session.cookie());
 yes(finishedLegacy.status===409&&!finishedLegacy.body.recordingId,
  "old legacy receipt remains HOLD after consent and rights regranted");
 const legacyRecording=await admin.from("recordings").select("id")
  .eq("episode_id",episodeId);
 yes(!legacyRecording.error&&legacyRecording.data?.length===0,
  "actual Human dev session/finalize integration never inserted recordings");
 const legacyBytes=await admin.storage.from(bucket).download(
  "owner/"+owner.uid+"/"+legacyId+"/part-0001.bin");
 yes(!legacyBytes.error&&
  sha(Buffer.from(await legacyBytes.data.arrayBuffer()))===sha(bytes),
  "legacy session/finalize uses same actual PRIVATE bytes and verified SHA");
 const staleLegacyAbort=await post({action:"abort",sessionId:legacyId},
  owner.session.cookie());
 yes(staleLegacyAbort.status===200&&staleLegacyAbort.body.deletedParts===2,
  "old legacy PRIVATE bytes are owner-cleanable after renewed consent");
 const legacyLeak=JSON.stringify([openedLegacy,finishedLegacy]);
 yes(!legacyLeak.includes(service)&&!legacyLeak.includes(secret)&&
  !legacyLeak.includes(owner.jwt),
  "existing Human endpoints did not leak privileged or bearer credentials");
 // NORMAL Human JSON session/finalize contract, NOT the probe marker.
 // The Next process has no service-role key: successful opening proves the
 // local-only branch did not use the legacy signed-upload URL factory.
 const normalRequest={seriesId,episodeId,fileName:"synthetic-local.wav",
  mimeType:"audio/wav",totalSizeBytes:total};
 const normalAnon=await postLegacy("human-upload-session",normalRequest);
 yes(normalAnon.status===401&&!normalAnon.body.uploadSessionId,
  "normal Human session JSON needs authenticated SSR cookie");
 const normalBearerOnly=await postLegacy("human-upload-session",
  normalRequest,"",{authorization:"Bearer "+owner.jwt});
 yes(normalBearerOnly.status===401&&!normalBearerOnly.body.uploadSessionId,
  "normal Human session cannot be authorized by arbitrary JWT header");
 const normalSpoof=await postLegacySpoofHost("human-upload-session",
  normalRequest,owner.session.cookie(),"localhost:"+portNext);
 yes(normalSpoof.status===404&&!normalSpoof.body.uploadSessionId,
  "normal Human session denies mismatched actual HTTP Host, no signer fallback");
 const normalObjectOverride=await postLegacy("human-upload-session",
  {...normalRequest,objectPath:"public/forged.wav"},owner.session.cookie());
 yes(normalObjectOverride.status===400&&!normalObjectOverride.body.uploadSessionId,
  "normal Human session refuses caller-chosen object path or extra fields");
 const normalOpened=await postLegacy("human-upload-session",
  normalRequest,owner.session.cookie());
 yes(normalOpened.status===201&&normalOpened.body.ok===true&&
  normalOpened.body.uploadMode==="local-private-staging-only"&&
  normalOpened.body.partCount===2&&
  typeof normalOpened.body.uploadSessionId==="string"&&
  !("token" in normalOpened.body)&&!("parts" in normalOpened.body)&&
  !("bucketName" in normalOpened.body),
  "normal Human session dev-only mode opens scoped PRIVATE ticket, no bearer");
 const normalId=normalOpened.body.uploadSessionId;
 const normalFinalize={...normalRequest,episodeNumber:1,isPublic:true,
  uploadSessionId:normalId};
 const normalTooEarly=await postLegacy("human-upload-finalize",
  normalFinalize,owner.session.cookie());
 yes(normalTooEarly.status===409&&!normalTooEarly.body.recordingId,
  "normal Human finalize refuses missing PRIVATE parts, no publication");
 const normalFirst=await post({action:"part",sessionId:normalId,index:0,
  expectedSha256:sha(bytes)},owner.session.cookie());
 yes(normalFirst.status===201,"normal Human ticket can allocate first PRIVATE part");
 yes((await put(normalFirst.body.partId,bytes,owner.session.cookie())).status===201,
  "normal Human ticket stored 8MiB PRIVATE bytes without signed bearer");
 const normalLast=await post({action:"part",sessionId:normalId,index:1,
  expectedSha256:sha(tail)},owner.session.cookie());
 yes(normalLast.status===201&&
  (await put(normalLast.body.partId,tail,owner.session.cookie())).status===201,
  "normal Human ticket stored exact final PRIVATE 256B part");
 const otherSessionContext=await postLegacy("human-upload-finalize",
  {...normalFinalize,seriesId:id()},owner.session.cookie());
 yes(otherSessionContext.status===403&&!otherSessionContext.body.recordingId,
  "normal Human finalize binds session to original series");
 const otherEpisodeContext=await postLegacy("human-upload-finalize",
  {...normalFinalize,episodeId:id()},owner.session.cookie());
 yes(otherEpisodeContext.status===403&&!otherEpisodeContext.body.recordingId,
  "normal Human finalize binds session to original episode");
 const alteredTotalContext=await postLegacy("human-upload-finalize",
  {...normalFinalize,totalSizeBytes:total+1},owner.session.cookie());
 yes(alteredTotalContext.status===403&&!alteredTotalContext.body.recordingId,
  "normal Human finalize rejects otherwise-valid wrong total byte count");
 const foreignNormalFinalize=await postLegacy("human-upload-finalize",
  normalFinalize,other.session.cookie());
 yes(foreignNormalFinalize.status===403&&!foreignNormalFinalize.body.recordingId,
  "normal Human finalize denies other consenting user");
 const privateNormalIntent=await postLegacy("human-upload-finalize",
  {...normalFinalize,isPublic:false},owner.session.cookie());
 yes(privateNormalIntent.status===400&&!privateNormalIntent.body.recordingId,
  "normal staging-only demonstration does not imply PRIVATE publication support");
 // NORMAL Studio JSON finalize must not inherit a stale pre-authorized
 // ticket after consent, author permission, R18 warning or episode visibility
 // is withdrawn. The older marker-only bridge had equivalent negatives, but
 // these prove the newly wired no-marker JSON path checks fresh authority too.
 const revokeNormalConsent=await admin.from("user_recording_consents")
  .update({consent_version:"2026-04-15"}).eq("user_id",owner.uid)
  .eq("consent_key","recording_studio_global");
 assert.equal(revokeNormalConsent.error,null,"local-only normal consent revoke");
 const heldNormalRow=await admin.from("issue137_http_local_multipart_sessions")
  .select("state").eq("id",normalId).single();
 yes(!heldNormalRow.error&&heldNormalRow.data.state==="HOLD",
  "normal JSON multipart receipt becomes HOLD on consent withdrawal");
 const deniedNormalConsent=await postLegacy("human-upload-finalize",
  normalFinalize,owner.session.cookie());
 yes(deniedNormalConsent.status===403&&!deniedNormalConsent.body.recordingId,
  "normal JSON finalize refuses PRIVATE parts after recording consent withdrawal");
 assert.equal((await admin.from("user_recording_consents")
  .update({consent_version:"2026-04-16"}).eq("user_id",owner.uid)
  .eq("consent_key","recording_studio_global")).error,null,
  "local-only normal consent restore");
 yes((await postLegacy("human-upload-finalize",
  normalFinalize,owner.session.cookie())).status===409,
  "normal JSON stale ticket does not revive after consent regrant");
 assert.equal((await admin.from("series").update({
  recording_permission_mode:"closed"}).eq("id",seriesId)).error,null,
  "local-only normal author permission closed");
 const deniedNormalClosed=await postLegacy("human-upload-finalize",
  normalFinalize,owner.session.cookie());
 yes(deniedNormalClosed.status===403&&!deniedNormalClosed.body.recordingId,
  "normal JSON finalize rejects sealed PRIVATE audio after author closes permission");
 assert.equal((await admin.from("series").update({
  recording_permission_mode:"open"}).eq("id",seriesId)).error,null,
  "local-only normal author permission restored");
 assert.equal((await admin.from("series").update({
  content_warnings:["sexual_r18"]}).eq("id",seriesId)).error,null,
  "local-only normal R18 warning raised");
 const deniedNormalWarning=await postLegacy("human-upload-finalize",
  normalFinalize,owner.session.cookie());
 yes(deniedNormalWarning.status===403&&!deniedNormalWarning.body.recordingId,
  "normal JSON finalize refuses new sexual_r18 warning despite general rating");
 assert.equal((await admin.from("series").update({
  content_warnings:[]}).eq("id",seriesId)).error,null,
  "local-only normal R18 warning restored");
 assert.equal((await admin.from("episodes").update({
  is_published:false}).eq("id",episodeId)).error,null,
  "local-only normal episode visibility revoked");
 const deniedNormalEpisode=await postLegacy("human-upload-finalize",
  normalFinalize,owner.session.cookie());
 yes(deniedNormalEpisode.status===403&&!deniedNormalEpisode.body.recordingId,
  "normal JSON finalize refuses session after episode unpublished");
 assert.equal((await admin.from("episodes").update({
  is_published:true}).eq("id",episodeId)).error,null,
  "local-only normal episode restored");
 const intactNormal=await admin.storage.from(bucket).download("owner/"+
  owner.uid+"/"+normalId+"/part-0001.bin");
 yes(!intactNormal.error&&
  sha(Buffer.from(await intactNormal.data.arrayBuffer()))===sha(bytes),
  "normal JSON stale-authority denials preserved the original PRIVATE SHA");
 const noRevokedNormalRows=await admin.from("recordings").select("id")
  .eq("episode_id",episodeId);
 yes(!noRevokedNormalRows.error&&noRevokedNormalRows.data?.length===0,
  "normal JSON revoked attempts created zero recordings");
 const oldNormalHeld=await postLegacy("human-upload-finalize",
  normalFinalize,owner.session.cookie());
 yes(oldNormalHeld.status===409&&!oldNormalHeld.body.recordingId,
  "old normal JSON receipt remains HOLD after all rights restored");
 const newNormalTicket=await postLegacy("human-upload-session",
  normalRequest,owner.session.cookie());
 yes(newNormalTicket.status===201&&!newNormalTicket.body.token,
  "new recording consent allows new PRIVATE-only normal JSON ticket");
 const freshNormalId=newNormalTicket.body.uploadSessionId;
 const firstFresh=await post({action:"part",sessionId:freshNormalId,
  index:0,expectedSha256:sha(bytes)},owner.session.cookie());
 yes(firstFresh.status===201&&
  (await put(firstFresh.body.partId,bytes,owner.session.cookie())).status===201,
  "fresh normal JSON ticket stores real first PRIVATE 8MiB");
 const lastFresh=await post({action:"part",sessionId:freshNormalId,
  index:1,expectedSha256:sha(tail)},owner.session.cookie());
 yes(lastFresh.status===201&&
  (await put(lastFresh.body.partId,tail,owner.session.cookie())).status===201,
  "fresh normal JSON ticket stores exact last PRIVATE 256 bytes");
 const normalSealed=await postLegacy("human-upload-finalize",
  {...normalFinalize,uploadSessionId:freshNormalId},owner.session.cookie());
 yes(normalSealed.status===409&&normalSealed.body.ok===false&&
  normalSealed.body.reason==="PRIVATE_PARTS_SEALED_NOT_PUBLISHED"&&
  !("recordingId" in normalSealed.body),
  "normal Human finalize returns explicit publication HOLD after PRIVATE sealing");
 const noNormalRecord=await admin.from("recordings").select("id")
  .eq("episode_id",episodeId);
 yes(!noNormalRecord.error&&noNormalRecord.data?.length===0,
  "normal Human session and finalize inserted no recording or public pointer");
 const normalPhysical=await admin.storage.from(bucket).download("owner/"+
  owner.uid+"/"+freshNormalId+"/part-0001.bin");
 yes(!normalPhysical.error&&
  sha(Buffer.from(await normalPhysical.data.arrayBuffer()))===sha(bytes),
  "normal Human API staged bytes privately with correct physical SHA");
 const oldNormalCleanup=await post({action:"abort",sessionId:normalId},
  owner.session.cookie());
 yes(oldNormalCleanup.status===200&&oldNormalCleanup.body.deletedParts===2,
  "stale normal JSON PRIVATE bytes can be removed after consent regrant");
 const normalNoSecret=JSON.stringify([normalOpened,normalSealed]);
 yes(!normalNoSecret.includes(service)&&!normalNoSecret.includes(secret)&&
  !normalNoSecret.includes(owner.jwt),
  "normal Human API did not return service key or session bearer");

 // Consent key itself is user-updatable: rename and back or DELETE/INSERT
 // must not revive a stale PRIVATE session, while unrelated consent keys
 // must never HOLD a recording ticket. Disposable database fixtures only.
 assert.equal((await admin.from("user_recording_consents").update({
  consent_key:"issue137_nonrecording_fixture"}).eq("user_id",owner.uid)
  .eq("consent_key","recording_studio_global")).error,null,
  "local consent key rename");
 const keyHeld=await admin.from("issue137_http_local_multipart_sessions")
  .select("state").eq("id",freshNormalId).single();
 yes(!keyHeld.error&&keyHeld.data.state==="HOLD",
  "renaming global consent key irrevocably HOLDS old sealed PRIVATE receipt");
 assert.equal((await admin.from("user_recording_consents").update({
  consent_key:"recording_studio_global"}).eq("user_id",owner.uid)
  .eq("consent_key","issue137_nonrecording_fixture")).error,null,
  "restore local global consent key");
 yes((await post({action:"finish",sessionId:freshNormalId},
  owner.session.cookie())).status===409,
  "consent key roundtrip cannot resurrect prior sealed upload");
 const oldKeyCleanup=await post({action:"abort",sessionId:freshNormalId},
  owner.session.cookie());
 yes(oldKeyCleanup.status===200&&oldKeyCleanup.body.deletedParts===2,
  "owner removes private audio after consent-key revocation");
 const keyDeletedTicket=await post(create,owner.session.cookie());
 yes(keyDeletedTicket.status===201,"new session issued before consent row deletion");
 assert.equal((await admin.from("user_recording_consents").delete()
  .eq("user_id",owner.uid)
  .eq("consent_key","recording_studio_global")).error,null,
  "local global consent row deleted");
 const deleteHeld=await admin.from("issue137_http_local_multipart_sessions")
  .select("state").eq("id",keyDeletedTicket.body.sessionId).single();
 yes(!deleteHeld.error&&deleteHeld.data.state==="HOLD",
  "deleting global consent row irrevocably HOLDS old ticket");
 assert.equal((await admin.from("user_recording_consents").insert({
  user_id:owner.uid,consent_key:"recording_studio_global",
  consent_version:"2026-04-16"})).error,null,
  "reinsert local global consent row");
 yes((await post({action:"part",sessionId:keyDeletedTicket.body.sessionId,
  index:0,expectedSha256:sha(bytes)},owner.session.cookie())).status===409,
  "delete/reinsert cannot reactivate stale upload part");
 const deletedAbort=await post({action:"abort",
  sessionId:keyDeletedTicket.body.sessionId},owner.session.cookie());
 yes(deletedAbort.status===200&&deletedAbort.body.deletedParts===0,
  "held deleted-consent ticket cleans without physical bytes");
 const unrelatedTicket=await post(create,owner.session.cookie());
 yes(unrelatedTicket.status===201,"current global consent permits fresh ticket");
 assert.equal((await admin.from("user_recording_consents").insert({
  user_id:owner.uid,consent_key:"issue137_other_consent",
  consent_version:"2026-04-16"})).error,null,"seed unrelated consent");
 assert.equal((await admin.from("user_recording_consents").update({
  consent_version:"2026-04-15"}).eq("user_id",owner.uid)
  .eq("consent_key","issue137_other_consent")).error,null,
  "withdraw unrelated consent");
 const otherKeyState=await admin.from("issue137_http_local_multipart_sessions")
  .select("state").eq("id",unrelatedTicket.body.sessionId).single();
 yes(!otherKeyState.error&&otherKeyState.data.state==="OPEN",
  "unrelated consent withdrawal leaves recording session OPEN");
 assert.equal((await admin.from("user_recording_consents").delete()
  .eq("user_id",owner.uid).eq("consent_key","issue137_other_consent")).error,null,
  "remove unrelated disposable row");
 yes((await post({action:"abort",sessionId:unrelatedTicket.body.sessionId},
  owner.session.cookie())).status===200,
  "owner can cleanup independent-key ticket");
 const huge=await post({...create,totalBytes:1024*1024*1024+1},owner.session.cookie());
 yes(huge.status===400,"greater-than-1GiB rejected before allocation");
 const billion=await post({...create,totalBytes:1024*1024*1024},owner.session.cookie());
 yes(billion.status===201&&billion.body.partCount===128&&
  billion.body.partSizeBytes===partSize,"1GiB logical session 128×8MiB, no bytes allocated");
 const atEnd=await post({action:"part",sessionId:billion.body.sessionId,
  index:127,expectedSha256:sha(bytes)},owner.session.cookie());
 yes(atEnd.status===201&&atEnd.body.byteCount===partSize,
  "1GiB logical final index127 is 8MiB and server allocated");
 yes((await post({action:"finish",sessionId:billion.body.sessionId},
  owner.session.cookie())).status===409,
  "1GiB metadata session refuses finish until all 128 part receipts SEALED");
 const live=await post(create,owner.session.cookie());
 yes(live.status===201&&live.body.partCount===2,"real two-part session issued");
 const sid=live.body.sessionId;
 const earlyFinish=await post({action:"finish",sessionId:sid},owner.session.cookie());
 yes(earlyFinish.status===409,"cannot complete before PRIVATE parts");
 const otherSession=await post(create,other.session.cookie());
 yes(otherSession.status===201,"independently authorized other actor");
 const p0=await post({action:"part",sessionId:sid,index:0,
  expectedSha256:sha(bytes)},owner.session.cookie());
 yes(p0.status===201&&p0.body.byteCount===partSize,"8MiB exact part lease allocated");
 const tooShort=await put(p0.body.partId,Buffer.alloc(512),owner.session.cookie());
 yes(tooShort.status===413,"declared raw byte count cannot mismatch 8MiB lease");
 const tooLarge=await put(p0.body.partId,Buffer.alloc(partSize+1),
  owner.session.cookie());
 yes(tooLarge.status===413,"Next rejects >8MiB HTTP PUT before worker");
 const p0Other=await post({action:"status",partId:p0.body.partId},other.session.cookie());
 yes(p0Other.status===403,"other consenting actor denied owner part status");
 const otherPut=await put(p0.body.partId,bytes,other.session.cookie());
 yes(otherPut.status===403,"other consenting actor denied raw PUT");
 const wrongDigest=await put(p0.body.partId,wrong,owner.session.cookie());
 yes(wrongDigest.status===422,"wrong same-size SHA denied with zero PRIVATE bytes");
 yes((await physical(sid,0))===null,"wrong digest wrote nothing");
 const p0ok=await put(p0.body.partId,bytes,owner.session.cookie());
 yes(p0ok.status===201&&p0ok.body.byteCount===partSize,
  "real Next ReadableStream 8MiB PUT, isolated worker SHA verified");
 yes(sha(await physical(sid,0))===sha(bytes),"actual PRIVATE 8MiB readback SHA matches");
 const reused=await post({action:"part",sessionId:sid,index:0,
  expectedSha256:sha(bytes)},owner.session.cookie());
 yes(reused.status===200&&reused.body.partId===p0.body.partId,
  "re-issuing same index/digest resumes existing durable part");
 yes((await put(p0.body.partId,bytes,owner.session.cookie())).status===409,
  "replayed full part cannot overwrite");
 const p0status=await post({action:"status",partId:p0.body.partId},owner.session.cookie());
 yes(p0status.status===200&&p0status.body.state==="SEALED",
  "durable SHA readback resumes after worker HTTP response");
 const conflict=await post({action:"part",sessionId:sid,index:0,
  expectedSha256:sha(wrong)},owner.session.cookie());
 yes(conflict.status===409,"same index cannot change expected digest");
 const p1=await post({action:"part",sessionId:sid,index:1,
  expectedSha256:sha(tail)},owner.session.cookie());
 yes(p1.status===201&&p1.body.byteCount===tail.length,
  "final logical part is exact remainder, no phantom 8MiB");
 yes((await put(p1.body.partId,tail,owner.session.cookie())).status===201,
  "partial final part uploaded with streaming path");
 // Invoke the actual UI's development-only client adapter against this real
 // Next+worker+Storage stack (no browser automation claimed). Simulate lost ACK
 // after a real PRIVATE PUT and require server-reconciled SHA receipt.
 const {stageHumanMultipartLocally}=await import(
  "../../src/lib/recording/localHumanMultipartClient.ts");
 const originalWindow=globalThis.window;
 const formerNodeEnv=process.env.NODE_ENV;
 globalThis.window={location:{hostname:"127.0.0.1"}};
 process.env.NODE_ENV="development";
 try{
  const localFile=new File([bytes,tail],"local-studio-probe.wav",{
   type:"audio/wav",lastModified:123456789});
  let adapterLease=null,adapterProgress=[],lostAck=false,uploads=0;
  const browserFetch=async (input,init={})=>{
   const response=await fetch(nextBase+input,{
    ...init,headers:{...init.headers,cookie:owner.session.cookie()},
    signal:AbortSignal.timeout(40000),redirect:"error"});
   if(init.method==="PUT"){
    uploads++;
    if(!lostAck&&response.status===201){
     lostAck=true; // Response was accepted but not delivered to caller.
     throw new Error("SIMULATED_ACK_LOST_AFTER_PRIVATE_STORAGE_PUT");
    }
   }
   return response;
  };
  const result=await stageHumanMultipartLocally({
   file:localFile,seriesId,episodeId,fetcher:browserFetch,
   onLease:lease=>{adapterLease=lease;},
   onProgress:progress=>{adapterProgress.push(progress);}
  });
  yes(lostAck,"studio client simulated ACK loss after actual accepted 8MiB PUT");
  yes(uploads===2,"studio client performs one PUT per part, no duplicate after ACK loss");
  yes(result.sessionId===adapterLease?.sessionId&&
   adapterProgress.at(-1)?.completedParts===2,
   "studio client adapter preserves durable session and reports real progress");
  yes((await physical(result.sessionId,0))?.equals(bytes)&&
   (await physical(result.sessionId,1))?.equals(tail),
   "studio adapter actual Storage PRIVATE part bytes unchanged by ACK loss");
  const noPublish=await admin.from("recordings").select("id")
   .eq("episode_id",episodeId);
  yes(!noPublish.error&&noPublish.data?.length===0,
   "development Studio staging must not publish or insert recording row");
 }finally{
  if(originalWindow===undefined)delete globalThis.window;
  else globalThis.window=originalWindow;
  if(formerNodeEnv===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=formerNodeEnv;
 }
  const finished=await post({action:"finish",sessionId:sid},owner.session.cookie());
 yes(finished.status===200&&finished.body.reason===
  "PRIVATE_PARTS_SEALED_NOT_PUBLISHED","two sealed parts produce receipt only, not published audio");
 const retained=await physical(sid,0);
 yes(retained?.equals(bytes),"final PRIVATE part preserved without combining 1GiB");
 const r18=await post(create,owner.session.cookie());
 yes(r18.status===201,"pre-restriction open allowed");
 const r18Part=await post({action:"part",sessionId:r18.body.sessionId,
  index:0,expectedSha256:sha(bytes)},owner.session.cookie());
 yes(r18Part.status===201,"part issued before R18 transition");
 const afterRating=await admin.from("series").update({content_rating:"r18"})
  .eq("id",seriesId);
 assert.equal(afterRating.error,null);
 const forbidden=await post({action:"part",sessionId:r18.body.sessionId,
  index:0,expectedSha256:sha(bytes)},owner.session.cookie());
 yes(forbidden.status===403,"R18 transition prevents issuing new part");
 yes((await put(r18Part.body.partId,bytes,owner.session.cookie())).status===403,
  "real 8MiB PUT refused after preissued part becomes R18");
 yes((await admin.storage.from(bucket).download("owner/"+owner.uid+"/"+
  r18.body.sessionId+"/part-0001.bin")).error!==null,
  "R18 transition leaves absent physical PRIVATE part");
 const restore=await admin.from("series").update({content_rating:"general"}).eq("id",seriesId);
 assert.equal(restore.error,null);
 const consent=await post(create,owner.session.cookie());
 yes(consent.status===201,"pre-consent-revocation session issued");
 const consentPart=await post({action:"part",sessionId:consent.body.sessionId,
  index:0,expectedSha256:sha(bytes)},owner.session.cookie());
 yes(consentPart.status===201,"prewithdrawal part issued with valid consent");
 const withdrawn=await admin.from("user_recording_consents")
  .update({consent_version:"2026-04-15"}).eq("user_id",owner.uid)
  .eq("consent_key","recording_studio_global");
 assert.equal(withdrawn.error,null);
 yes((await put(consentPart.body.partId,bytes,owner.session.cookie())).status===403,
  "consent withdrawn stops real PUT despite preissued part");
 yes((await admin.storage.from(bucket).download("owner/"+owner.uid+"/"+
  consent.body.sessionId+"/part-0001.bin")).error!==null,
  "withdrawn consent left zero PRIVATE physical bytes");
 yes((await post({action:"part",sessionId:consent.body.sessionId,
  index:1,expectedSha256:sha(tail)},owner.session.cookie())).status===403,
  "withdrawn consent stops new part allocation");
 const restored=await admin.from("user_recording_consents")
  .update({consent_version:"2026-04-16"}).eq("user_id",owner.uid)
  .eq("consent_key","recording_studio_global");
 assert.equal(restored.error,null,"restore test-local consent for recovery probe");
 const crashSession=await post(create,owner.session.cookie());
 yes(crashSession.status===201,"separate synthetic ACK-loss session issued");
 const crashPart=await post({action:"part",sessionId:crashSession.body.sessionId,
  index:0,expectedSha256:sha(bytes)},owner.session.cookie());
 yes(crashPart.status===201,"crash test lease allocated");
 await stop(worker);
 worker=start(workerScript,[],{...workerEnv,B2_MULTIPART_EXIT_AFTER_PUT_ONCE:"true"});
 await readyWorker(worker);
 const lostAck=await put(crashPart.body.partId,bytes,owner.session.cookie());
 yes(lostAck.status===503,"worker exit after physical PRIVATE accept loses HTTP ACK");
 await stop(worker);
 worker=start(workerScript,[],workerEnv);
 await readyWorker(worker);
 const reconciled=await post({action:"status",partId:crashPart.body.partId},
  owner.session.cookie());
 yes(reconciled.status===200&&reconciled.body.state==="SEALED",
  "fresh worker seals accepted 8MiB bytes after lost ACK, no duplicate PUT");
 yes((await put(crashPart.body.partId,bytes,owner.session.cookie())).status===409,
  "claimed-after-crash part never becomes reusable");
 const retainedAfterCrash=await admin.storage.from(bucket).download("owner/"+
  owner.uid+"/"+crashSession.body.sessionId+"/part-0001.bin");
 yes(!retainedAfterCrash.error&&
  sha(Buffer.from(await retainedAfterCrash.data.arrayBuffer()))===sha(bytes),
  "ack-loss recovery verifies real PRIVATE 8MiB physical bytes");
 const privatePublic=await fetch(ep.origin+"/storage/v1/object/public/"+bucket+"/"+
  "owner/"+owner.uid+"/"+sid+"/part-0001.bin",{headers:{apikey:anon},
  redirect:"error",signal:AbortSignal.timeout(12000)});
 yes(privatePublic.status>=400,"PRIVATE 8MiB part not readable via PUBLIC endpoint");
 const output=logs+JSON.stringify([live,p0,p0ok,finished]);
 yes(!output.includes(service)&&!output.includes(owner.jwt)&&
  !output.includes(secret),"neither process log nor API contains privileged key");
 // Real deterministic claim-vs-abort race. A claimed first-write can
 // arrive after HOLD; first abort MUST NOT claim cleanup success.
 await stop(worker);
 worker=start(workerScript,[],{...workerEnv,
  B2_LOCAL_TEST_PAUSE_AFTER_CLAIM_MS:"2500"});
 await readyWorker(worker);
 const raceOpen=await post(create,owner.session.cookie());
 yes(raceOpen.status===201,"race session opened with real GoTrue identity");
 const racePart=await post({action:"part",sessionId:raceOpen.body.sessionId,
  index:0,expectedSha256:sha(bytes)},owner.session.cookie());
 yes(racePart.status===201,"race part issued before abort");
 const raceWrite=put(racePart.body.partId,bytes,owner.session.cookie());
 let observedClaim=false;
 for(let count=0;count<100;count++){
  const q=await admin.from("issue137_http_local_multipart_parts")
   .select("state").eq("id",racePart.body.partId).maybeSingle();
  if(q.error)throw Error("RACE_CLAIM_QUERY_HOLD");
  if(q.data?.state==="CLAIMED"){observedClaim=true;break;}
  await sleep(25);
 }
 yes(observedClaim,"real SQL CLAIMED observed while raw Storage PUT is paused");
 const firstAbort=await post({action:"abort",sessionId:raceOpen.body.sessionId},
  owner.session.cookie());
 yes(firstAbort.status===409,"abort while claimed never declares cleanup complete");
 const partAfterAbort=await post({action:"part",sessionId:raceOpen.body.sessionId,
  index:1,expectedSha256:sha(tail)},owner.session.cookie());
 yes(partAfterAbort.status===409,
  "HOLD prevents new writes while earlier claim is still in-flight");
 const raceWriteResult=await raceWrite;
 yes(raceWriteResult.status===201,
  "already-claimed writer can physically commit after HOLD, demonstrating race");
 const afterRace=await admin.storage.from(bucket).download("owner/"+owner.uid+
  "/"+raceOpen.body.sessionId+"/part-0001.bin");
 yes(!afterRace.error&&
  sha(Buffer.from(await afterRace.data.arrayBuffer()))===sha(bytes),
  "race creates real PRIVATE bytes AFTER first abort HOLD");
 const wrongAbort=await post({action:"abort",sessionId:raceOpen.body.sessionId},
  other.session.cookie());
 yes(wrongAbort.status===403,
  "other valid user cannot perform cleanup of racing owner's session");
 const retryAbort=await post({action:"abort",sessionId:raceOpen.body.sessionId},
  owner.session.cookie());
 yes(retryAbort.status===200&&retryAbort.body.deletedParts===1,
  "owner retries after claim settled; physically verified cleanup");
 const afterRetry=await admin.storage.from(bucket).download("owner/"+owner.uid+
  "/"+raceOpen.body.sessionId+"/part-0001.bin");
 yes(!!afterRetry.error,"no orphan PRIVATE bytes after verified abort retry");
 // Distinct TOCTOU control: withdrawal AFTER durable CLAIM but BEFORE PUT.
 // It records a LOCAL PRIVATE leak-window RISK, not effective revocation.
 const afterClaimOpen=await post(create,owner.session.cookie());
 yes(afterClaimOpen.status===201,"pre-withdrawal session for post-CLAIM race");
 const afterClaimId=afterClaimOpen.body.sessionId;
 const afterClaimPart=await post({action:"part",sessionId:afterClaimId,
  index:0,expectedSha256:sha(bytes)},owner.session.cookie());
 yes(afterClaimPart.status===201,"pre-withdrawal part for post-CLAIM race");
 const afterClaimWrite=put(afterClaimPart.body.partId,bytes,owner.session.cookie());
 let claimVisible=false;
 for(let count=0;count<100;count++){
  const q=await admin.from("issue137_http_local_multipart_parts")
   .select("state").eq("id",afterClaimPart.body.partId).maybeSingle();
  if(q.error)throw Error("CONSENT_RACE_CLAIM_QUERY_HOLD");
  if(q.data?.state==="CLAIMED"){claimVisible=true;break;}
  await sleep(25);
 }
 yes(claimVisible,"real SQL CLAIM completed while provider PRIVATE PUT paused");
 const revokeAfterClaim=await admin.from("user_recording_consents")
  .update({consent_version:"2026-04-15"}).eq("user_id",owner.uid)
  .eq("consent_key","recording_studio_global");
 assert.equal(revokeAfterClaim.error,null,"local consent withdrawal during paused PUT");
 const postWithdrawalWrite=await afterClaimWrite;
 yes(postWithdrawalWrite.status===201,
  "RISK: after-CLAIM worker accepts PRIVATE bytes even after consent withdrawal");
 const revokedPhysical=await admin.storage.from(bucket).download(
  "owner/"+owner.uid+"/"+afterClaimId+"/part-0001.bin");
 yes(!revokedPhysical.error&&
  sha(Buffer.from(await revokedPhysical.data.arrayBuffer()))===sha(bytes),
  "RISK: actual LOCAL PRIVATE bytes stored after consent withdrawal");
 const rejectFinish=await post({action:"finish",sessionId:afterClaimId},
  owner.session.cookie());
 yes(rejectFinish.status===403&&!rejectFinish.body.recordingId,
  "late withdrawal still blocks finalize/publication");
 const ownerAbort=await post({action:"abort",sessionId:afterClaimId},
  owner.session.cookie());
 yes(ownerAbort.status===200&&ownerAbort.body.deletedParts===1,
  "owner cleans late-accepted PRIVATE bytes despite withdrawn consent");
 const gone=await admin.storage.from(bucket).download(
  "owner/"+owner.uid+"/"+afterClaimId+"/part-0001.bin");
 yes(!!gone.error,"post-withdrawal cleanup leaves zero PRIVATE bytes");
 assert.equal((await admin.from("user_recording_consents")
  .update({consent_version:"2026-04-16"}).eq("user_id",owner.uid)
  .eq("consent_key","recording_studio_global")).error,null,
  "restore disposable local consent for remaining tests");
 yes((await post({action:"part",sessionId:afterClaimId,
  index:1,expectedSha256:sha(tail)},owner.session.cookie())).status===409,
  "late revoked ticket cannot resume even after consent regrant");
 console.log("RISK: F2-P LOCAL post-CLAIM consent withdrawal accepts PRIVATE PUT; "+
  "finalize denies and owner cleanup succeeds, no atomic provider revocation");
 // Orphan PRIVATE data after ORIGINAL GoTrue session logout: the ordinary
 // user abort is correctly unavailable even if the obsolete JWT still has
 // unexpired exp. The following is a test-harness-only offline operator
 // recovery proof, NOT a callable API/Cron/deployed cleanup implementation.
 const orphan=await actor("orphan");
 assert.equal((await admin.from("user_recording_consents").insert({
  user_id:orphan.uid,consent_key:"recording_studio_global",
  consent_version:"2026-04-16"})).error,null,
  "synthetic orphan actor is consented before PRIVATE upload");
 const orphanOpen=await post(create,orphan.session.cookie());
 yes(orphanOpen.status===201,"isolated orphan actor opens new PRIVATE ticket");
 const orphanId=orphanOpen.body.sessionId;
 const orphanPart=await post({action:"part",sessionId:orphanId,
  index:0,expectedSha256:sha(bytes)},orphan.session.cookie());
 yes(orphanPart.status===201&&
  (await put(orphanPart.body.partId,bytes,orphan.session.cookie())).status===201,
  "real orphan owner stored first PRIVATE 8MiB before logout");
 // Three distinct orphan states are prepared while the original auth is
 // genuinely live. The later offline test alone mutates the fixtures.
 async function orphanFixture(label,uploaded){
  const opened=await post(create,orphan.session.cookie());
  yes(opened.status===201,label+": session opened under original GoTrue login");
  const part=await post({action:"part",sessionId:opened.body.sessionId,
   index:0,expectedSha256:sha(bytes)},orphan.session.cookie());
  yes(part.status===201,label+": first PRIVATE part issued");
  if(uploaded)yes((await put(part.body.partId,bytes,
   orphan.session.cookie())).status===201,
   label+": physically SEALED 8MiB before logout");
  return {id:opened.body.sessionId,partId:part.body.partId,
   path:"owner/"+orphan.uid+"/"+opened.body.sessionId+"/part-0001.bin"};
 }
 const claimedCase=await orphanFixture("CLAIMED",false);
 const missingCase=await orphanFixture("MISSING",true);
 const changedCase=await orphanFixture("SHA_MISMATCH",true);
 const orphanPath="owner/"+orphan.uid+"/"+orphanId+"/part-0001.bin";
 const oldOrphanCookie=orphan.session.cookie();
 const authSessionId=JSON.parse(
  Buffer.from(orphan.jwt.split(".")[1],"base64url").toString()).session_id;
 assert.match(authSessionId,/^[0-9a-f-]{36}$/iu);
 const logout=await orphan.session.auth.auth.signOut({scope:"global"});
 assert.equal(logout.error,null,"original synthetic GoTrue session signed out");
 // This direct PostgreSQL probe is allowed only for the verified ephemeral
 // Docker container and proves the session was really removed.
 const authRows=execFileSync("docker",["exec",db,"psql","-X","-q","-t","-A",
  "-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres","-c",
  "select count(*) from auth.sessions where id='"+authSessionId+"'::uuid"+
  " and user_id='"+orphan.uid+"'::uuid"],{encoding:"utf8",timeout:15000}).trim();
 yes(authRows==="0","old orphan auth.sessions row genuinely absent after logout");
 const staleAbort=await post({action:"abort",sessionId:orphanId},oldOrphanCookie);
 yes([401,403].includes(staleAbort.status)&&staleAbort.body.ok===false&&
  staleAbort.body.deletedParts===undefined,
  "logged-out actor cannot abort via old SSR-cookie/JWT (401 or 403)");
 yes((await post({action:"abort",sessionId:orphanId},other.session.cookie()))
  .status===403,"unrelated consenting actor cannot clean orphan's ticket");
 const staleFinish=await post({action:"finish",sessionId:orphanId},oldOrphanCookie);
 yes([401,403].includes(staleFinish.status)&&staleFinish.body.ok===false&&
  !staleFinish.body.recordingId,
  "logged-out actor cannot finalize orphan PRIVATE ticket (401 or 403)");
 // New GoTrue login by the SAME user is a different auth.sessions binding.
 // The original upload must remain inaccessible; a fresh ticket must work.
 const reloginJar=jar();
 const relogin=await reloginJar.auth.auth.signInWithPassword({
  email:orphan.email,password:orphan.pass});
 assert.equal(relogin.error,null,"same synthetic user can log in again");
 const reloginSessionId=JSON.parse(Buffer.from(
  relogin.data.session.access_token.split(".")[1],"base64url").toString()).session_id;
 yes(relogin.data.user.id===orphan.uid&&reloginSessionId!==authSessionId,
  "same owner re-login has a NEW live GoTrue session ID");
 const staleNewLoginAbort=await post({action:"abort",sessionId:orphanId},
  reloginJar.cookie());
 yes(staleNewLoginAbort.status===403&&staleNewLoginAbort.body.ok===false&&
  staleNewLoginAbort.body.deletedParts===undefined,
  "same user NEW auth session cannot abort ORIGINAL-session PRIVATE receipt");
 yes((await post({action:"finish",sessionId:orphanId},
  reloginJar.cookie())).status===403,
  "same user NEW session cannot finalize OLD original-session ticket");
 const freshReLogin=await post(create,reloginJar.cookie());
 yes(freshReLogin.status===201,"same owner fresh login can open NEW PRIVATE ticket");
 const freshReLoginAbort=await post({action:"abort",
  sessionId:freshReLogin.body.sessionId},reloginJar.cookie());
 yes(freshReLoginAbort.status===200&&freshReLoginAbort.body.deletedParts===0,
  "new login can safely abandon its OWN new empty PRIVATE ticket");
 const orphanFound=await admin.storage.from(bucket).download(orphanPath);
 yes(!orphanFound.error&&
  sha(Buffer.from(await orphanFound.data.arrayBuffer()))===sha(bytes),
  "logout strands actual intact PRIVATE bytes; never public/published");
 // Shut down the ONLY cooperative worker BEFORE the operator phase.
 // No user-facing delete endpoint, timers or new privileged credentials.
 await stop(worker);
 // A local operator must independently verify: original session revoked,
 // matching DB ticket owner, PRIVATE path exact, no pending CLAIMED writer,
 // observed SHA equals SEALED receipt; otherwise HOLD without deletion.
 const {data:orphanTicket,error:ticketError}=await admin
  .from("issue137_http_local_multipart_sessions").select("*")
  .eq("id",orphanId).single();
 assert.equal(ticketError,null,"test-only offline operator ticket read");
 const {data:orphanParts,error:partsError}=await admin
  .from("issue137_http_local_multipart_parts").select("*")
  .eq("multipart_id",orphanId).order("part_index");
 assert.equal(partsError,null,"test-only offline operator part receipt read");
 // Only privileged test harness may set HOLD; not a deployable DB migration.
 const {data:quarantined,error:quarantineError}=await admin
  .from("issue137_http_local_multipart_sessions").update({state:"HOLD"})
  .eq("id",orphanId).eq("user_id",orphan.uid)
  .eq("auth_session_id",authSessionId).eq("state","OPEN")
  .select("id").single();
 yes(!quarantineError&&quarantined?.id===orphanId,
  "offline test operator CAS quarantines only revoked exact owner ticket");
 orphanTicket.state="HOLD";
 function localRecoveryPaths(ticket,parts,ownerId){
  if(ticket?.state!=="HOLD"||ticket.user_id!==ownerId||
   !Array.isArray(parts)||parts.length>128||!parts.length||
   parts.some(p=>p.state==="CLAIMED"||p.state==="INTEGRITY_HOLD"))
   return null;
  const expectedPrefix="owner/"+ownerId+"/"+ticket.id+"/";
  const ids=new Set();
  for(const part of parts){
   if(!Number.isInteger(part.part_index)||part.part_index<0||
    part.part_index>=ticket.part_count||ids.has(part.part_index)||
    !["ISSUED","SEALED"].includes(part.state)||
    part.object_path!==expectedPrefix+"part-"+
     String(part.part_index+1).padStart(4,"0")+".bin"||
    !/^[a-f0-9]{64}$/u.test(part.expected_sha256))return null;
   ids.add(part.part_index);
  }
  return parts.map(p=>p.object_path);
 }
 // One offline verdict per exact ticket. No Storage DELETE is attempted
 // until every settled part's receipt and physical bytes are independently
 // reconciled. A failed GET is not treated as proof of safe deletion.
 async function offlineByteVerdict(ticket,parts,ownerId){
  const paths=localRecoveryPaths(ticket,parts,ownerId);
  if(!paths)return {reason:"LEDGER_OR_CLAIM_HOLD"};
  for(const part of parts){
   const obj=await admin.storage.from(bucket).download(part.object_path);
   if(part.state==="ISSUED"){
    if(!obj.error)return {reason:"UNEXPECTED_UNSEALED_BYTES_HOLD"};
    continue;
   }
   if(part.state!=="SEALED"||
    part.observed_sha256!==part.expected_sha256||
    !Number.isInteger(part.byte_count)||part.byte_count<1||
    part.byte_count>partSize)return {reason:"RECEIPT_INTEGRITY_HOLD"};
   if(obj.error)return {reason:"PRIVATE_BYTES_MISSING_HOLD"};
   const observed=Buffer.from(await obj.data.arrayBuffer());
   if(observed.length!==part.byte_count||
    sha(observed)!==part.expected_sha256)
    return {reason:"PHYSICAL_SHA_MISMATCH_HOLD"};
  }
  return {reason:"VERIFIED",paths};
 }
 yes(localRecoveryPaths(orphanTicket,orphanParts,other.uid)===null,
  "operator plan rejects foreign-owner cleanup request");
 yes(localRecoveryPaths({...orphanTicket,state:"OPEN"},orphanParts,
  orphan.uid)===null,"operator plan rejects unfenced OPEN ticket");
 yes(localRecoveryPaths(orphanTicket,
  orphanParts.map(p=>({...p,state:"CLAIMED"})),orphan.uid)===null,
  "operator plan refuses unacknowledged in-flight CLAIMED part");
 yes(localRecoveryPaths(orphanTicket,
  orphanParts.map(p=>({...p,object_path:"owner/"+other.uid+"/foreign.bin"})),
  orphan.uid)===null,"operator plan rejects foreign/out-of-scope object path");
 const safeVerdict=await offlineByteVerdict(orphanTicket,orphanParts,orphan.uid);
 const scopedPaths=safeVerdict.paths;
 yes(safeVerdict.reason==="VERIFIED"&&
  scopedPaths?.length===1&&scopedPaths[0]===orphanPath&&
  orphanParts[0].state==="SEALED"&&
  orphanParts[0].observed_sha256===sha(bytes),
  "one settled SEALED part is physically verified before scoped cleanup");

 // LOCAL-ONLY durable DELETE_INTENT: actual provider verification is
 // point-in-time; no provider-enforced revocation or DELETE_CONFIRMED.
 const deleteOp=id(),intentCall=operation=>admin.rpc(
  "issue137_http_local_delete_intent",{
   p_part:orphanPart.body.partId,p_user:orphan.uid,
   p_auth_session:authSessionId,p_operation:operation,p_epoch:1
  });
 const two=await Promise.all([intentCall(deleteOp),intentCall(deleteOp)]);
 yes(two.every(x=>!x.error)&&
  two.map(x=>x.data).sort().join(",")==="DELETE_INTENT,INTENT_REPLAY",
  "concurrent same-operation requests create one durable intent");
 const {data:intents,error:intentsError}=await admin.from(
  "issue137_http_local_delete_intents").select("*")
  .eq("part_id",orphanPart.body.partId);
 yes(!intentsError&&intents?.length===1&&
  intents[0].operation_id===deleteOp&&
  intents[0].owner_id===orphan.uid&&
  intents[0].original_auth_session_id===authSessionId&&
  intents[0].canonical_path===orphanPath&&
  intents[0].expected_sha256===sha(bytes)&&
  intents[0].expected_bytes===bytes.length&&
  intents[0].phase==="DELETE_INTENT",
  "SQL journal exactly binds original owner/session/path/SHA/bytes");
 const conflictingDeleteOperation=await intentCall(id());
 yes(!conflictingDeleteOperation.error&&
  conflictingDeleteOperation.data==="EPOCH_OR_OPERATOR_CONFLICT_HOLD",
  "a second operator cannot replace original DELETE_INTENT");
 const invalidEpoch=await admin.rpc("issue137_http_local_delete_intent",{
  p_part:orphanPart.body.partId,p_user:orphan.uid,
  p_auth_session:authSessionId,p_operation:id(),p_epoch:2});
 yes(!invalidEpoch.error&&invalidEpoch.data==="EPOCH_OR_OPERATION_HOLD",
  "a different epoch cannot reuse the same original part");
 const otherOwnerAttempt=await admin.rpc("issue137_http_local_delete_intent",{
  p_part:orphanPart.body.partId,p_user:other.uid,
  p_auth_session:authSessionId,p_operation:id(),p_epoch:1});
 yes(!otherOwnerAttempt.error&&
  otherOwnerAttempt.data==="LEDGER_OR_OWNER_HOLD",
  "SQL transaction refuses wrong original owner");
 const anonymous=createClient(ep.origin,anon,opts);
 const anonRpc=await anonymous.rpc("issue137_http_local_delete_intent",{
  p_part:orphanPart.body.partId,p_user:orphan.uid,
  p_auth_session:authSessionId,p_operation:id(),p_epoch:1});
 yes(!!anonRpc.error,"anon cannot invoke delete-intent RPC");
 const anonJournal=await anonymous.from(
  "issue137_http_local_delete_intents").select("operation_id");
 yes(!!anonJournal.error||anonJournal.data?.length===0,
  "anon has no access to owner/session deletion-journal data");
 const beforeCleanup=await admin.storage.from(bucket).download(orphanPath);
 yes(!beforeCleanup.error&&
  sha(Buffer.from(await beforeCleanup.data.arrayBuffer()))===
   orphanParts[0].expected_sha256,
  "operator verified exact original physical PRIVATE SHA before remove");
 const unrelatedPath="owner/"+owner.uid+"/"+sid+"/part-0001.bin";
 const unrelatedBefore=await admin.storage.from(bucket).download(unrelatedPath);
 yes(!unrelatedBefore.error&&
  sha(Buffer.from(await unrelatedBefore.data.arrayBuffer()))===sha(bytes),
  "separate owner's PRIVATE object exists before scoped recovery");
 const deletedOrphan=await admin.storage.from(bucket).remove(scopedPaths);
 assert.equal(deletedOrphan.error,null,"operator removed scoped local orphan only");
 const noOrphan=await admin.storage.from(bucket).download(orphanPath);
 yes(!!noOrphan.error,"offline operator physical readback confirms absence NOW");
 // A repeat attempt must not infer safe deletion from a 404. The LOCAL
 // ledger has no durable DELETED tombstone: the sealed receipt still exists.
 const retryWithoutTombstone=await offlineByteVerdict(
  orphanTicket,orphanParts,orphan.uid);
 yes(retryWithoutTombstone.reason==="PRIVATE_BYTES_MISSING_HOLD"&&
  !retryWithoutTombstone.paths,
  "repeat offline cleanup is HOLD, not a second claimed successful delete");
 const heldReceipt=await admin.from("issue137_http_local_multipart_parts")
  .select("state,expected_sha256,observed_sha256")
  .eq("id",orphanPart.body.partId).single();
 yes(!heldReceipt.error&&heldReceipt.data.state==="SEALED"&&
  heldReceipt.data.expected_sha256===sha(bytes)&&
  heldReceipt.data.observed_sha256===sha(bytes),
  "post-delete receipt still SEALED; no durable DELETE tombstone exists");

 const retryAfterDelete=await intentCall(deleteOp);
 yes(!retryAfterDelete.error&&retryAfterDelete.data==="INTENT_REPLAY",
  "after physical DELETE and 404, retry reads existing intent only");
 const journalAtAbsent=await admin.from("issue137_http_local_delete_intents")
  .select("phase,delete_epoch").eq("part_id",orphanPart.body.partId).single();
 yes(!journalAtAbsent.error&&
  journalAtAbsent.data.phase==="DELETE_INTENT"&&
  journalAtAbsent.data.delete_epoch===1,
  "point-in-time absence does not become DELETED_DURABLE");
 // Simulate an INDEPENDENT privileged Storage writer after cleanup.
 // upsert:false cannot prevent a first write once the path is absent.
 const revivedDifferent=await admin.storage.from(bucket).upload(orphanPath,wrong,{
  contentType:"application/octet-stream",upsert:false});
 assert.equal(revivedDifferent.error,null,
  "disposable alternate service_role can re-create missing PRIVATE path");
 const wrongRecreated=await admin.storage.from(bucket).download(orphanPath);
 yes(!wrongRecreated.error&&
  sha(Buffer.from(await wrongRecreated.data.arrayBuffer()))===sha(wrong),
  "different SHA PRIVATE bytes physically reappear AFTER verified delete");
 const mismatchAfterDelete=await offlineByteVerdict(
  orphanTicket,orphanParts,orphan.uid);
 yes(mismatchAfterDelete.reason==="PHYSICAL_SHA_MISMATCH_HOLD"&&
  !mismatchAfterDelete.paths,
  "late different-byte re-creation is detected and never called cleaned");
 // A privileged writer can also reproduce the exact original bytes.
 // Original-SHA readback alone CANNOT distinguish fresh unauthorized
 // re-creation from the pre-delete object without generation/fence proof.
 assert.equal((await admin.storage.from(bucket).remove([orphanPath])).error,null,
  "disposable fixture removes re-created incorrect bytes");
 assert.equal((await admin.storage.from(bucket).upload(orphanPath,bytes,{
  contentType:"application/octet-stream",upsert:false})).error,null,
  "independent local privileged writer can re-create original SHA after delete");
 const originalRecreated=await admin.storage.from(bucket).download(orphanPath);
 yes(!originalRecreated.error&&
  sha(Buffer.from(await originalRecreated.data.arrayBuffer()))===sha(bytes),
  "exact original-SHA PRIVATE content physically reappears after cleanup");
 const indistinguishable=await offlineByteVerdict(
  orphanTicket,orphanParts,orphan.uid);
 yes(indistinguishable.reason==="VERIFIED"&&
  indistinguishable.paths?.[0]===orphanPath,
  "RISK: no tombstone or provider generation fence; re-created exact bytes pass old receipt");

 const stillIntent=await admin.from("issue137_http_local_delete_intents")
  .select("phase,operation_id").eq("part_id",orphanPart.body.partId).single();
 yes(!stillIntent.error&&stillIntent.data.phase==="DELETE_INTENT"&&
  stillIntent.data.operation_id===deleteOp,
  "identical SHA privileged re-creation cannot erase stored intent");
 console.log("PASS: F2-P LOCAL one-shot SQL DELETE_INTENT concurrency/owner "+
  "fence; same-SHA re-creation remains a physical custody HOLD");
 console.log("RISK: LOCAL verified DELETE is point-in-time only; "+
  "post-delete privileged PUT revives different or identical bytes. "+
  "SEALED receipt is not a deletion tombstone");
 // Fixture teardown ONLY: never confuse this with a production cleanup
 // guarantee or an operator retry. Keep a separate other-owner SHA control.
 assert.equal((await admin.storage.from(bucket).remove([orphanPath])).error,null,
  "remove synthetic re-created object for isolated test teardown");
 yes(!!(await admin.storage.from(bucket).download(orphanPath)).error,
  "disposable post-recreation teardown restored observed PRIVATE absence");
 const untouched=await admin.storage.from(bucket).download(unrelatedPath);
 yes(!untouched.error&&
  sha(Buffer.from(await untouched.data.arrayBuffer()))===sha(bytes),
  "scoped orphan recovery did not delete another owner's PRIVATE bytes");
 // SOURCE + REAL DB + REAL PRIVATE Storage negative: never reclassify an
 // unsettled, unknown or tampered orphan as an authorized operator DELETE.
 // All synthetic fixtures belong to the same original logged-out actor.
 const fixtures=[
  {label:"CLAIMED",item:claimedCase},
  {label:"MISSING",item:missingCase},
  {label:"SHA_MISMATCH",item:changedCase}
 ];
 for(const {label,item} of fixtures){
  const {data:held,error:holdError}=await admin.from(
   "issue137_http_local_multipart_sessions").update({state:"HOLD"})
   .eq("id",item.id).eq("user_id",orphan.uid)
   .eq("auth_session_id",authSessionId).eq("state","OPEN")
   .select("*").single();
  yes(!holdError&&held?.state==="HOLD",
   label+": offline CAS fenced exact original session");
 }
 const claimedState=await admin.from("issue137_http_local_multipart_parts")
  .update({state:"CLAIMED"}).eq("id",claimedCase.partId)
  .eq("state","ISSUED").select("*").single();
 assert.equal(claimedState.error,null,"test-only unsettled CLAIMED SQL state");
 const claimedPut=await admin.storage.from(bucket).upload(
  claimedCase.path,bytes,{contentType:"application/octet-stream",upsert:false});
 assert.equal(claimedPut.error,null,
  "test-only alternate privileged writer staged actual bytes under CLAIMED");
 const missingRemove=await admin.storage.from(bucket).remove([missingCase.path]);
 assert.equal(missingRemove.error,null,
  "test-only privileged writer removed exact SEALED physical bytes");
 const missingPhysical=await admin.storage.from(bucket).download(missingCase.path);
 yes(!!missingPhysical.error,
  "real missing-byte fixture absent despite SEALED DB receipt");
 assert.equal((await admin.storage.from(bucket).remove(
  [changedCase.path])).error,null,
  "test-only privileged writer removed original SEALED bytes for same-length drift");
 assert.equal((await admin.storage.from(bucket).upload(
  changedCase.path,wrong,{contentType:"application/octet-stream",
  upsert:false})).error,null,
  "test-only privileged writer replaced exactly same-length PRIVATE bytes");
 const changedPhysical=await admin.storage.from(bucket).download(changedCase.path);
 yes(!changedPhysical.error&&
  sha(Buffer.from(await changedPhysical.data.arrayBuffer()))===sha(wrong)&&
  sha(wrong)!==sha(bytes),
  "actual provider now stores wrong same-length PRIVATE SHA");
 async function offlineSnapshot(sessionId){
  const {data:ticket,error:e1}=await admin.from(
   "issue137_http_local_multipart_sessions").select("*")
   .eq("id",sessionId).single();
  const {data:parts,error:e2}=await admin.from(
   "issue137_http_local_multipart_parts").select("*")
   .eq("multipart_id",sessionId).order("part_index");
  assert.equal(e1,null,"offline negative ticket state");
  assert.equal(e2,null,"offline negative part receipt state");
  return {ticket,parts};
 }
 const claimSnap=await offlineSnapshot(claimedCase.id);
 const claimVerdict=await offlineByteVerdict(
  claimSnap.ticket,claimSnap.parts,orphan.uid);
 yes(claimSnap.parts[0].state==="CLAIMED"&&
  claimVerdict.reason==="LEDGER_OR_CLAIM_HOLD",
  "real SQL CLAIMED plus provider bytes: offline DELETE refused");

 const unsettledIntent=await admin.rpc("issue137_http_local_delete_intent",{
  p_part:claimedCase.partId,p_user:orphan.uid,
  p_auth_session:authSessionId,p_operation:id(),p_epoch:1});
 yes(!unsettledIntent.error&&
  unsettledIntent.data==="LEDGER_OR_CLAIM_HOLD",
  "SQL CLAIMED part cannot receive delete-intent receipt");
 const claimedIntents=await admin.from("issue137_http_local_delete_intents")
  .select("operation_id").eq("part_id",claimedCase.partId);
 yes(!claimedIntents.error&&claimedIntents.data?.length===0,
  "CLAIMED path is not marked for irreversible DELETE");
 const claimedRemains=await admin.storage.from(bucket).download(claimedCase.path);
 yes(!claimedRemains.error&&
  sha(Buffer.from(await claimedRemains.data.arrayBuffer()))===sha(bytes),
  "unsettled CLAIMED physical PRIVATE 8MiB preserved under HOLD");
 const missingSnap=await offlineSnapshot(missingCase.id);
 const missingVerdict=await offlineByteVerdict(
  missingSnap.ticket,missingSnap.parts,orphan.uid);
 yes(missingSnap.parts[0].state==="SEALED"&&
  missingVerdict.reason==="PRIVATE_BYTES_MISSING_HOLD",
  "real SEALED DB/absent provider object discrepancy is HOLD, not cleanup PASS");
 const changedSnap=await offlineSnapshot(changedCase.id);
 const changedVerdict=await offlineByteVerdict(
  changedSnap.ticket,changedSnap.parts,orphan.uid);
 yes(changedSnap.parts[0].state==="SEALED"&&
  changedVerdict.reason==="PHYSICAL_SHA_MISMATCH_HOLD",
  "same-length provider tamper is HOLD, not authorized DELETE");
 const changedStillThere=await admin.storage.from(bucket).download(changedCase.path);
 yes(!changedStillThere.error&&
  sha(Buffer.from(await changedStillThere.data.arrayBuffer()))===sha(wrong),
  "tampered PRIVATE 8MiB retained for further reconciliation, never deleted");
 const foreignAfterNegatives=await admin.storage.from(bucket).download(unrelatedPath);
 yes(!foreignAfterNegatives.error&&
  sha(Buffer.from(await foreignAfterNegatives.data.arrayBuffer()))===sha(bytes),
  "CLAIMED/missing/changed operator negatives never touch unrelated user's audio");
 console.log("PASS: F2-P REAL LOCAL offline logout orphan CLAIMED/MISSING/SHA "+
  "mismatch HOLD with provider bytes preserved where present; "+
  "same-user new-session replay denied, fresh PRIVATE ticket allowed");
 worker=start(workerScript,[],workerEnv);await readyWorker(worker);
 yes((await post({action:"part",sessionId:orphanId,index:1,
  expectedSha256:sha(tail)},other.session.cookie())).status===403,
  "restart does not permit unrelated actor to reuse quarantined orphan");
 // Different case: an expired upload ticket with LIVE original auth session
 // remains owner-cleanable without privileged operator access.
 const expiresTicket=await post(create,owner.session.cookie());
 yes(expiresTicket.status===201,"live owner starts separately expirable ticket");
 const expiresPart=await post({action:"part",sessionId:expiresTicket.body.sessionId,
  index:0,expectedSha256:sha(bytes)},owner.session.cookie());
 yes(expiresPart.status===201&&
  (await put(expiresPart.body.partId,bytes,owner.session.cookie())).status===201,
  "expired-ticket fixture contains physical PRIVATE 8MiB");
 assert.equal((await admin.from("issue137_http_local_multipart_sessions")
  .update({expires_at:new Date(Date.now()-30000).toISOString()})
  .eq("id",expiresTicket.body.sessionId)).error,null,
  "only disposable multipart expiry moved into the past");
 yes((await post({action:"finish",sessionId:expiresTicket.body.sessionId},
  owner.session.cookie())).status===403,
  "expired ticket cannot finalize despite still-live auth session");
 yes((await post({action:"abort",sessionId:expiresTicket.body.sessionId},
  other.session.cookie())).status===403,
  "other owner denied abort of expired PRIVATE ticket");
 const expiresCleanup=await post({action:"abort",
  sessionId:expiresTicket.body.sessionId},owner.session.cookie());
 yes(expiresCleanup.status===200&&expiresCleanup.body.deletedParts===1,
  "live original owner safely aborts expired multipart ticket");
 const duplicateOwnerAbort=await post({action:"abort",
  sessionId:expiresTicket.body.sessionId},owner.session.cookie());
 yes(duplicateOwnerAbort.status===200&&
  duplicateOwnerAbort.body.reason==="PRIVATE_ABORTED_AND_PHYSICAL_ABSENT"&&
  duplicateOwnerAbort.body.deletedParts===1,
  "repeat owner abort returns verified physical absence without re-authorizing upload");
 yes((await post({action:"part",sessionId:expiresTicket.body.sessionId,
  index:1,expectedSha256:sha(tail)},owner.session.cookie())).status===403,
  "replayed abort leaves expired ticket unable to stage new PRIVATE part");
 console.log("RISK: LOCAL repeated abort deletedParts reflects scoped ledger paths, "+
  "not number of newly deleted physical objects");
 yes((await admin.storage.from(bucket).download("owner/"+owner.uid+"/"+
  expiresTicket.body.sessionId+"/part-0001.bin")).error!==null,
  "expired ticket owner cleanup physically removed PRIVATE bytes");
 const orphanRows=await admin.from("recordings").select("id")
  .eq("episode_id",episodeId);
 yes(!orphanRows.error&&orphanRows.data?.length===0,
  "offline orphan cleanup neither published nor created recording metadata");
 console.log("PASS: F2-P LOCAL logout-orphan recovery with STOPPED worker "+
  "and strict owner/session/path/digest gates; expired ticket owner aborts. "+
  "HOLD: no running operator, outside-writer revocation, or durable DELETE proof");
 await stop(worker);
 worker=start(workerScript,[],workerEnv);
 await readyWorker(worker);
 // Run graphical integration LAST so Chromium/Next dev memory and
 // worker teardown cannot interfere with independent preexisting HTTP negatives.
 // Actual headless Chromium controls the real Studio UI, not jsdom.
 const {runLocalStudioChromium}=await import("./human-studio-real-browser-local-e2e.mjs");
 await runLocalStudioChromium({nextBase,owner,other,seriesId,episodeId,
  bytes,tail,admin,bucket,post,put});
 yes(next?.exitCode===null && next?.signalCode===null,
  "Next process stayed alive throughout real Chromium UI probe");
 console.log("PASS: F2-P REAL LOCAL Next 8MiB streamed multipart "+
  checks+" checks; 1GiB/128-part metadata only, PRIVATE 8MiB+256 actual bytes, "+
  "resume, replay, owner, consent, R18, integrity and no public writes");
 console.log("HOLD: 1GiB payload not sent end-to-end, no Studio browser/TUS "+
  "6MiB transport integration or whole-recording publication; provider-wide "+
  "service_role/S3 overwrite remains possible");
}finally{
 await stop(next);await stop(worker);
}
