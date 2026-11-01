// Issue #137: ACTUAL Next.js dev-only app HTTP route -> separate local worker
// -> GoTrue + PostgreSQL durable claim + PRIVATE Supabase Storage.
// No hosted secrets, Production, merge, fee, PUBLIC bytes or real uploads.
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
assert.ok(ep.protocol==="http:"&&["127.0.0.1","localhost"].includes(ep.hostname)&&
 ["54321","54331"].includes(ep.port)&&ep.pathname==="/"&&!ep.search&&!ep.hash);
const network=process.env.B2_NETWORK??"",db=process.env.B2_DB_CONTAINER??"";
assert.match(network,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(db,/^[a-f0-9]{12,64}$/);
const active=execFileSync("docker",["ps","-q","--filter","network="+network],
 {encoding:"utf8",timeout:10000}).trim().split(/\s+/);
assert.ok(active.includes(db),"only verified disposable PostgreSQL accepted");
for(const k of ["SUPABASE_SERVICE_ROLE_KEY","NEXT_PUBLIC_SUPABASE_URL",
 "NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_HUMAN_RECORDING_BUCKET"])
 assert.equal(process.env[k],undefined,"unexpected app secret from parent "+k);
const anon=process.env.B2_ANON_KEY??"",service=process.env.B2_SERVICE_KEY??"";
assert.ok(anon.length>15&&service.length>15&&service!==anon);
const root=fileURLToPath(new URL("../../",import.meta.url));
const next=fileURLToPath(new URL("../../node_modules/next/dist/bin/next",import.meta.url));
const workerScript=fileURLToPath(new URL("./privileged-http-boundary-process-local.mjs",import.meta.url));
assert.deepEqual(readdirSync(root).filter(x=>/^\.env(?:\.|$)/.test(x)&&
 !/\.(?:example|sample|template)$/.test(x)),[],"Next may not load untracked .env");
const uid=()=>randomUUID(),hash=x=>createHash("sha256").update(x).digest("hex");
const bucket="f2p-http-privileged-worker-private";
const basePort=39650+Math.floor(Math.random()*30);
const workerPort=39890+Math.floor(Math.random()*80);
const base="http://127.0.0.1:"+basePort;
const workerBase="http://127.0.0.1:"+workerPort;
const secret=uid()+uid();
const common={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,
 NODE_ENV:"development",DO_NOT_CONTACT_PRODUCTION:"true",
 B2_EPHEMERAL_CONFIRM:"local-only"};
const workerEnv={...common,B2_LOCAL_URL:ep.origin+"/",B2_ANON_KEY:anon,
 B2_SERVICE_KEY:service,B2_HTTP_BOUNDARY_ROLE:"worker",
 B2_HTTP_BOUNDARY_PORT:String(workerPort),B2_LOCAL_WORKER_INNER_TOKEN:secret};
const nextEnv={...common,CI:"true",NEXT_TELEMETRY_DISABLED:"1",
 NEXT_PUBLIC_SUPABASE_URL:ep.origin,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,
 NEXT_PUBLIC_SITE_URL:base,B2_LOCAL_HUMAN_WORKER_MODE:"enabled",
 B2_LOCAL_HUMAN_WORKER_URL:workerBase+"/",B2_LOCAL_WORKER_INNER_TOKEN:secret};
assert.equal(nextEnv.B2_SERVICE_KEY,undefined);
assert.equal(nextEnv.SUPABASE_SERVICE_ROLE_KEY,undefined);
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(ep.origin,service,options);
const wav=Buffer.alloc(48);wav.write("RIFF",0);wav.writeUInt32LE(40,4);
wav.write("WAVEfmt ",8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);
wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);
wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write("data",36);
wav.writeUInt32LE(4,40);wav.writeInt16LE(19,44);wav.writeInt16LE(-19,46);
let worker,nextProcess,workerLog="",nextLog="",checks=0;
const check=(condition,label)=>{assert.ok(condition,label);checks++};
function spawnChild(script,args,env,kind){
 const child=spawn(process.execPath,[script,...args],{cwd:root,env,detached:true,
  stdio:["ignore","pipe","pipe"]});
 for(const stream of [child.stdout,child.stderr])
  stream.on("data",v=>{
   const part=String(v);
   if(kind==="worker")workerLog=(workerLog+part).slice(-4000);
   else nextLog=(nextLog+part).slice(-4000);
  });
 return child;
}
async function ready(url,kind,child){
 for(let n=0;n<150;n++){
  if(child.exitCode!==null)throw Error(kind+"_EXITED_EARLY");
  try{
   if(kind==="worker"){
    const r=await fetch(url+"/health",{signal:AbortSignal.timeout(1800)});
    if(r.status===200&&(await r.json()).role==="worker")return;
   }else{
    const a=await request({action:"issue",seriesId:uid(),
     episodeId:uid(),expectedSha256:hash(wav)});
    if(a.status===401)return;
   }
  }catch{}
  await sleep(400);
 }
 throw Error(kind+"_NOT_READY");
}
function jar(){
 const saved=new Map();
 const auth=createServerClient(ep.origin,anon,{cookies:{
  getAll:()=>[...saved].map(([name,value])=>({name,value})),
  setAll:xs=>{for(const x of xs){if(x.value)saved.set(x.name,x.value);
   else saved.delete(x.name);}}
 }});
 return {auth,cookie:()=>[...saved].map(([a,b])=>a+"="+b).join("; ")};
}
const path="/api/recordings/human-local-stage";
async function request(payload, cookie="",additionalHeaders={}){
 const response=await fetch(base+path,{method:"POST",headers:{
  "content-type":"application/json",...(cookie?{cookie}:{}),...additionalHeaders},
  body:JSON.stringify(payload),redirect:"error",
  cache:"no-store",signal:AbortSignal.timeout(20000)});
 const raw=await response.text();
 let data={};try{data=JSON.parse(raw);}catch{}
 return {status:response.status,data,raw};
}
async function user(label){
 const email="next-local-worker-"+label+"-"+uid()+"@example.invalid";
 const password="Local-"+uid()+"aA1!";
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
 assert.equal(created.error,null,"local GoTrue create "+label);
 const session=jar(),signed=await session.auth.auth.signInWithPassword({email,password});
 assert.equal(signed.error,null,"local GoTrue cookie login "+label);
 check(session.cookie().length>20,"valid SSR session cookie");
 return {id:created.data.user.id,session,jwt:signed.data.session.access_token};
}
async function readPath(path){
 const r=await admin.storage.from(bucket).download(path);
 return r.error?null:Buffer.from(await r.data.arrayBuffer());
}
try{
 const owner=await user("owner");
 const other=await user("other");
 const seriesId=uid(),episodeId=uid();
 assert.equal((await admin.from("series").insert({
  id:seriesId,author_id:owner.id,publication_status:"public",
  content_rating:"general",content_warnings:[],recording_permission_mode:"open"
 })).error,null,"synthetic open/public series");
 assert.equal((await admin.from("episodes").insert({
  id:episodeId,series_id:seriesId,body:"LOCAL TEST ONLY",
  posting_status:"posted",is_published:true
 })).error,null,"synthetic posted episode");
 const signedConsent=await admin.from("user_recording_consents").insert({
  user_id:owner.id,consent_key:"recording_studio_global",
  consent_version:"2026-04-16"});
 assert.equal(signedConsent.error,null,"local owner consent");
 worker=spawnChild(workerScript,[],workerEnv,"worker");
 await ready(workerBase,"worker",worker);
 nextProcess=spawnChild(next,["dev","--hostname","127.0.0.1",
  "--port",String(basePort)],nextEnv,"next");
 await ready(base,"next",nextProcess);
 const issueBody={action:"issue",seriesId,episodeId,expectedSha256:hash(wav)};
 const anonymous=await request(issueBody);
 check(anonymous.status===401,"real Next route denies anonymous");
 const forgedBearer=await request(issueBody,"",{Authorization:"Bearer "+owner.jwt});
 check(forgedBearer.status===401,"raw bearer header cannot substitute for actual SSR cookie");
 const injection=await request({...issueBody,bucketName:"recording-audio",
  objectPath:"public/fake"},owner.session.cookie());
 check(injection.status===400,"real Next refuses browser-supplied bucket and path");
 const issued=await request(issueBody,owner.session.cookie());
 check(issued.status===201&&issued.data.ok===true&&
  /^[a-f0-9-]{36}$/u.test(issued.data.ticket),"cookie-authenticated real Next issues ticket");
 check(Object.keys(issued.data).sort().join(",")==="ok,ticket",
  "no signed URL, privileged token or actual private object path exposed");
 const t=issued.data.ticket,objectPath="owner/"+owner.id+"/"+t+".wav";
 const otherConsent=await admin.from("user_recording_consents").insert({
  user_id:other.id,consent_key:"recording_studio_global",
  consent_version:"2026-04-16"
 });
 assert.equal(otherConsent.error,null,"other real actor also has current consent");
 const otherEligible=await request(issueBody,other.session.cookie());
 check(otherEligible.status===201&&otherEligible.data.ok===true,
  "other user independently authorized for the public/open series and episode");
 const wrong=await request({action:"stage",ticket:t,
  bytesBase64:wav.toString("base64")},other.session.cookie());
 check(wrong.status===403&&!(await readPath(objectPath)),
  "other real SSR session cannot spend owner ticket");
 const replayPayload={action:"stage",ticket:t,bytesBase64:wav.toString("base64")};
 const staged=await request(replayPayload,owner.session.cookie());
 check(staged.status===201&&staged.data.status==="PRIVATE_SEALED_SNAPSHOT",
  "real Next owner relays a valid PRIVATE first-write");
 check((await readPath(objectPath))?.equals(wav),"physical synthetic PRIVATE bytes equal owner WAV");
 const again=await request(replayPayload,owner.session.cookie());
 check(again.status===409,"real Next cannot reuse consumed ticket");
 const recover=await request({action:"recover",ticket:t},owner.session.cookie());
 check(recover.status===200&&recover.data.ticket===t,
  "durable sealed receipt reconciled via real Next route");
 const huge=await request({action:"stage",ticket:uid(),
  bytesBase64:"a".repeat(1500001)},owner.session.cookie());
 check(huge.status===413,"bounded Next route rejects >1.5MB JSON before worker");
 const disallowed=await request({...issueBody,expectedSha256:"00"},
  owner.session.cookie());
 check(disallowed.status===400,"mismatched expected SHA rejected");
 const oldTicket=await request(issueBody,owner.session.cookie());
 check(oldTicket.status===201,"pre-withdrawal ticket issue");
 const out=await admin.from("user_recording_consents")
  .update({consent_version:"2026-04-15"}).eq("user_id",owner.id)
  .eq("consent_key","recording_studio_global");
 assert.equal(out.error,null,"local consent withdrawal");
 const rejected=await request({action:"stage",ticket:oldTicket.data.ticket,
  bytesBase64:wav.toString("base64")},owner.session.cookie());
 check(rejected.status===403&&
  !(await readPath("owner/"+owner.id+"/"+oldTicket.data.ticket+".wav")),
  "freshly withdrawn consent rejects pre-issued ticket, no PRIVATE write");
 // Confirm that eligibility is rechecked at the moment of STAGE:
 // a previously valid owner/consent ticket must fail after R18 transition.
 const restored=await admin.from("user_recording_consents")
  .update({consent_version:"2026-04-16"}).eq("user_id",owner.id)
  .eq("consent_key","recording_studio_global");
 assert.equal(restored.error,null,"restore local consent for isolated R18 transition");
 const beforeR18=await request(issueBody,owner.session.cookie());
 check(beforeR18.status===201,"owner can issue before R18 reclassification");
 const rating=await admin.from("series").update({content_rating:"r18"})
  .eq("id",seriesId);
 assert.equal(rating.error,null,"local series becomes R18");
 const blockedR18=await request({action:"stage",ticket:beforeR18.data.ticket,
  bytesBase64:wav.toString("base64")},owner.session.cookie());
 check(blockedR18.status===403&&
  !(await readPath("owner/"+owner.id+"/"+beforeR18.data.ticket+".wav")),
  "R18 transition rejects pre-issued owner ticket without PRIVATE write");
 const ratedIssue=await request(issueBody,owner.session.cookie());
 check(ratedIssue.status===403,"R18 series cannot obtain new local stage ticket");
 const resetRating=await admin.from("series").update({content_rating:"general"})
  .eq("id",seriesId);
 assert.equal(resetRating.error,null,"restore synthetic general rating");
 const staleCookie=owner.session.cookie();
 const signOut=await owner.session.auth.auth.signOut({scope:"global"});
 assert.equal(signOut.error,null,"real GoTrue logout");
 const afterLogout=await request(issueBody,staleCookie);
 check([401,403].includes(afterLogout.status),
  "old SSR cookie after global logout cannot mint a new ticket");
 const publicGet=await fetch(ep.origin+"/storage/v1/object/public/"+
  bucket+"/"+objectPath,{headers:{apikey:anon},redirect:"error",
  signal:AbortSignal.timeout(10000)});
 check(publicGet.status>=400,"PRIVATE bytes are not available via public endpoint");
 const remaining=await admin.storage.from(bucket).list("owner/"+owner.id,
  {limit:100});
 assert.equal(remaining.error,null,"trusted synthetic storage read");
 const original=(await readPath(objectPath));
 check(original?.equals(wav),"legitimate owner first-write remains unchanged");
 const output=workerLog+nextLog+[issued,staged,again,rejected].map(x=>x.raw).join("");
 check(!output.includes(service)&&!output.includes(owner.jwt)&&
  !output.includes(secret),"no privileged key, JWT or relay token leaked in output");
 // Kill the worker, then exercise an authorized session to prove Next fails 503
 // without ever silently using a project admin credential as fallback.
 const reAccepted=await admin.from("user_recording_consents")
  .update({consent_version:"2026-04-16"}).eq("user_id",owner.id)
  .eq("consent_key","recording_studio_global");
 assert.equal(reAccepted.error,null);
 // No need to create an additional account: the prior logout test already
 // covers live-session revocation. Worker-unavailable is checked via another
 // actually authenticated user with accepted consent and the same public work.
 if(worker?.pid){try{process.kill(-worker.pid,"SIGTERM");}catch{}
  await sleep(400);try{process.kill(-worker.pid,"SIGKILL");}catch{}}
 const unavailable=await request(issueBody,other.session.cookie());
 check(unavailable.status===503,"real Next fails closed when privileged worker is absent");
 console.log("PASS: F2-P REAL LOCAL Next.js Human worker route "+checks+
  " checks; SSR cookie -> no-admin Next -> independent worker -> "+
  "durable PRIVATE, consent/replay/wrong-owner/size/logout/worker-down negatives");
 console.log("HOLD: real route is development-only / one-shot <=1MiB, "+
  "not the signed Human 8MiB multipart API or 1GiB streaming; "+
  "Reader and AI writers still privileged; service-role alternate holder remains");
}finally{
 for(const ch of [nextProcess,worker]){
  if(ch?.pid){try{process.kill(-ch.pid,"SIGTERM");}catch{}
   await sleep(350);try{process.kill(-ch.pid,"SIGKILL");}catch{}}
 }
}
