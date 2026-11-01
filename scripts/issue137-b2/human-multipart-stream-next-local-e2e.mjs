// Issue #137: real localhost Next SSR -> bounded 8MiB stream -> local worker
// -> durable PostgreSQL receipt and PRIVATE Storage. 1GiB protocol metadata
// only, NEVER a 1GiB memory allocation, PUBLIC write, Production or paid host.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
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
 B2_LOCAL_HUMAN_MULTIPART_MODE:"enabled"};
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
 return {uid:created.data.user.id,session,jwt:signed.data.session.access_token};
}
async function parse(r){
 const txt=await r.text();let body={};try{body=JSON.parse(txt);}catch{}
 return {status:r.status,body,raw:txt};
}
async function post(body,cookie=""){
 return parse(await fetch(nextBase+api,{method:"POST",
  headers:{"content-type":"application/json",...(cookie?{cookie}:{})},
  body:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:"error"}));
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
 // Actual headless Chromium controls the real Studio UI, not jsdom.
 const {runLocalStudioChromium}=await import("./human-studio-real-browser-local-e2e.mjs");
 await runLocalStudioChromium({nextBase,owner,other,seriesId,episodeId,
  bytes,tail,admin,bucket,post,put});
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
 console.log("PASS: F2-P REAL LOCAL Next 8MiB streamed multipart "+
  checks+" checks; 1GiB/128-part metadata only, PRIVATE 8MiB+256 actual bytes, "+
  "resume, replay, owner, consent, R18, integrity and no public writes");
 console.log("HOLD: 1GiB payload not sent end-to-end, no Studio browser/TUS "+
  "6MiB transport integration or whole-recording publication; provider-wide "+
  "service_role/S3 overwrite remains possible");
}finally{
 await stop(next);await stop(worker);
}
