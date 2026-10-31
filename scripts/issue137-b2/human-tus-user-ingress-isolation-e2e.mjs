// Issue #137: real localhost PRIVATE TUS upload through independently running
// user-JWT-only Node process. Parent fixture owns test-local admin bootstrap;
// child does NOT inherit it. Process isolation != production credential custody.
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {fork,execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {createClient} from "@supabase/supabase-js";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const endpoint=new URL(process.env.B2_LOCAL_URL??"");
assert.equal(endpoint.protocol,"http:");
assert.ok(["127.0.0.1","localhost"].includes(endpoint.hostname));
assert.ok(["54321","54331"].includes(endpoint.port));
assert.equal(endpoint.pathname,"/");
assert.equal(endpoint.search,"");
assert.equal(endpoint.hash,"");
const net=process.env.B2_NETWORK??"",db=process.env.B2_DB_CONTAINER??"";
assert.match(net,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(db,/^[a-f0-9]{12,64}$/);
assert.ok(execFileSync("docker",["ps","-q","--filter","network="+net],{
 encoding:"utf8",timeout:10000}).trim().split(/\s+/).includes(db));
const anon=process.env.B2_ANON_KEY??"",service=process.env.B2_SERVICE_KEY??"";
assert.ok(anon.length>15&&service.length>15&&anon!==service);
for(const name of ["SUPABASE_SERVICE_ROLE_KEY","NEXT_PUBLIC_SUPABASE_URL",
 "SUPABASE_HUMAN_RECORDING_BUCKET"])
 assert.equal(process.env[name],undefined,"hosted credentials prohibited");
const origin=endpoint.origin,bucket="f2p-tus-app-authority-local",id=()=>randomUUID();
const workerFile=fileURLToPath(new URL("./human-tus-user-ingress-process-local.mjs",import.meta.url));
const userClient={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(origin,service,userClient);
const bytes=Buffer.alloc(6*1024*1024+96,0x51);
bytes.write("RIFF",0);bytes.write("WAVE",8);
const changed=Buffer.from(bytes);changed[changed.length-2]=0x45;
const hash=b=>createHash("sha256").update(b).digest("hex");
const expected=hash(bytes);
let tests=0;const check=(value,reason)=>{assert.ok(value,reason);tests++};
const uuid=x=>{assert.match(x,/^[a-f0-9-]{36}$/);return "'"+x+"'::uuid";};
function sql(query){
 return execFileSync("docker",["exec",db,"psql","-X","-q","-t","-A",
  "-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres","-c",query],{
  encoding:"utf8",timeout:12000,stdio:["ignore","pipe","pipe"]}).trim();
}
const onlyEnv={DO_NOT_CONTACT_PRODUCTION:"true",B2_EPHEMERAL_CONFIRM:"local-only",
 B2_LOCAL_URL:origin+"/",B2_ANON_KEY:anon};
function createChild(extra={}){
 const child=fork(workerFile,[],{env:{...onlyEnv,...extra},
  stdio:["ignore","pipe","pipe","ipc"],execArgv:[]});
 let outputs="",replies=[];
 child.stdout.on("data",v=>{outputs+=v.toString().slice(0,256);});
 child.stderr.on("data",v=>{outputs+=v.toString().slice(0,256);});
 child.on("message",m=>{replies.push(m);});
 return {child,replies,getLogs:()=>outputs};
}
async function call(proc,kind,payload={}){
 const seq=id();
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{proc.child.off("message",onMsg);
   reject(new Error("IPC_WAIT_HOLD"));},30000);
  const onMsg=m=>{
   if(m?.seq!==seq)return;
   clearTimeout(timer);proc.child.off("message",onMsg);
   resolve(m);
  };
  proc.child.on("message",onMsg);
  proc.child.send({kind,seq,...payload},err=>{
   if(err){clearTimeout(timer);proc.child.off("message",onMsg);reject(err);}
  });
 });
}
async function stop(proc){
 if(!proc.child.connected){if(proc.child.exitCode===null)proc.child.kill();return;}
 try{const x=await call(proc,"stop");check(x.status==="STOPPED","local child stop ACK");}
 catch{proc.child.kill();}
}
async function actor(){
 const email="isolated-tus-"+id()+"@example.invalid",password="Local-"+id()+"Ab1!";
 const create=await admin.auth.admin.createUser({email,password,email_confirm:true});
 assert.equal(create.error,null,"local synthetic user");
 const client=createClient(origin,anon,userClient);
 const signed=await client.auth.signInWithPassword({email,password});
 assert.equal(signed.error,null,"local GoTrue login");
 const userId=create.data.user.id;
 const u=await admin.from("users").insert({id:userId,display_name:"LOCAL"});
 assert.equal(u.error,null,"local profile");
 const c=await admin.from("user_recording_consents").insert({
  user_id:userId,consent_key:"recording_studio_global",consent_version:"2026-04-16"});
 assert.equal(c.error,null,"local recording consent");
 check(typeof signed.data.session?.access_token==="string","authenticated JWT exists");
 return {id:userId,jwt:signed.data.session.access_token};
}
const person=await actor(),other=await actor(),sid=id(),eid=id();
const series=await admin.from("series").insert({
 id:sid,author_id:person.id,publication_status:"public",
 content_rating:"general",content_warnings:[],recording_permission_mode:"open"});
assert.equal(series.error,null,"test series");
const episode=await admin.from("episodes").insert({
 id:eid,series_id:sid,body:"LOCAL",posting_status:"posted",is_published:true});
assert.equal(episode.error,null,"test episode");
const privateBucket=await admin.storage.getBucket(bucket);
check(privateBucket.error===null&&privateBucket.data?.public===false,
 "dedicated local stage bucket PRIVATE");
function lease(owner=person){
 const leaseId=id(),path="owner/"+owner.id+"/series/"+sid+"/episode/"+eid+
 "/"+leaseId+".wav";
 sql("insert into libread_internal.issue137_tus_app_leases"+
 " (lease_id,actor_id,series_id,episode_id,object_path,expected_sha256,expires_at) values ("+
 [uuid(leaseId),uuid(owner.id),uuid(sid),uuid(eid),"'"+path+"'",
  "'"+expected+"'","clock_timestamp()+interval '10 minutes'"].join(",")+")");
 return {id:leaseId,path,actorId:owner.id};
}
const config=(a,l)=>({jwt:a.jwt,actorId:a.id,seriesId:sid,episodeId:eid,
 leaseId:l.id,expectedSha256:expected,sizeBytes:bytes.length});
async function physical(path){
 const res=await admin.storage.from(bucket).download(path);
 if(res.error)return null;
 return Buffer.from(await res.data.arrayBuffer());
}
async function clean(path){
 const res=await admin.storage.from(bucket).remove([path]);
 assert.equal(res.error,null,"clean PRIVATE fixture object");
}
function safeReplies(proc){
 const str=JSON.stringify(proc.replies);
 check(!str.includes(service)&&!str.includes(anon)&&
  !str.includes(person.jwt)&&!str.includes(other.jwt),
 "no session/admin tokens in user process replies");
 check(!proc.getLogs().includes(service)&&!proc.getLogs().includes(person.jwt),
 "no admin/user token in stdout/stderr");
}
// A poisoned *synthetic* privileged environment must fail at startup; actual
// admin keys are NEVER passed to the child through environment or IPC.
{
 const bad=createChild({B2_SERVICE_KEY:"SYNTHETIC_FORBIDDEN_KEY"});
 const exit=await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new Error("POISONED_START_WAIT_HOLD")),10000);
  bad.child.once("exit",(code,signal)=>{clearTimeout(timeout);resolve({code,signal});});
 });
 check(exit.code===2,"child startup must fail closed when privileged env var present");
 check(bad.replies.length===0,"poisoned worker issued no reply");
}
// Real worker receives only public anon key via env and a JWT of one logged-in
// user at bootstrap. Public HTTP route/worker startup is NOT deployed.
{
 const owned=lease(),proc=createChild();
 try{
  const wrongIdentity=await call(proc,"bootstrap",{config:{...config(person,owned),jwt:other.jwt}});
  check(wrongIdentity.status==="IDENTITY_HOLD","wrong actor bootstrap rejected");
  const ok=await call(proc,"bootstrap",{config:config(person,owned)});
  check(ok.status==="READY_USER_ONLY","signed in user, no admin env");
  const forged=await call(proc,"stage",{data:{bytesBase64:bytes.toString("base64"),
   bucket:"f2p-s3-public",path:"misc/forbidden.wav"}});
  check(forged.status==="INVALID_REQUEST_HOLD","caller cannot supply bucket/path");
  const wrong=await call(proc,"stage",{data:{bytesBase64:changed.toString("base64")}});
  check(wrong.status==="BYTE_MISMATCH_HOLD","worker rejects changed audio bytes");
  check((await physical(owned.path))===null,"invalid media never reaches Storage");
  const okPut=await call(proc,"stage",{data:{bytesBase64:bytes.toString("base64")}});
  check(okPut.status==="PRIVATE_TUS_STAGED_UNVERIFIED",
   "real user-only process TUS committed PRIVATE chunked object");
  const read=await physical(owned.path);
  check(read?.length===bytes.length&&hash(read)===expected,
   "independent privileged local-only fixture readback SHA matches");
  const replay=await call(proc,"stage",{data:{bytesBase64:bytes.toString("base64")}});
  check(replay.status==="ONE_ATTEMPT_HOLD","worker cannot retry with stale bootstrap");
  const publicRead=await fetch(origin+"/storage/v1/object/public/"+bucket+"/"+owned.path,{
   headers:{apikey:anon},redirect:"error",signal:AbortSignal.timeout(10000)});
  check(publicRead.status>=400&&publicRead.status<500,"PRIVATE remains unreadable publicly");
  safeReplies(proc);
  await clean(owned.path);
  console.log("PASS: F2-P LOCAL user-JWT-only child TUS 6MiB resume; no admin env, no dynamic path, exact PRIVATE digest");
 }finally{await stop(proc);}
}
// Worker has correct GoTrue identity but no trusted lease for its own actor.
// App-policy/RLS blocks a fabricated stage; no backend privilege fallback.
{
 const foreign=lease(person),proc=createChild();
 try{
  const payload=config(other,foreign);
  const boot=await call(proc,"bootstrap",{config:payload});
  check(boot.status==="READY_USER_ONLY","valid second user session bootstrap");
  const put=await call(proc,"stage",{data:{bytesBase64:bytes.toString("base64")}});
  check(put.status==="STORAGE_DENIED_HOLD",
   "actual Storage RLS rejects unleased different actor TUS stage");
  check((await physical("owner/"+other.id+"/series/"+sid+
   "/episode/"+eid+"/"+foreign.id+".wav"))===null,
   "forged owner has no PRIVATE physical object");
  safeReplies(proc);
 }finally{await stop(proc);}
}
// Consent withdrawal *after bootstrap* must be enforced by Storage, not a
// cached allow-list inside the no-admin process.
{
 const revoked=lease(person),proc=createChild();
 try{
  check((await call(proc,"bootstrap",{config:config(person,revoked)})).status===
   "READY_USER_ONLY","bootstrap before revocation succeeds");
  const update=await admin.from("user_recording_consents")
   .update({consent_version:"2026-04-15"}).eq("user_id",person.id)
   .eq("consent_key","recording_studio_global");
  assert.equal(update.error,null,"withdraw local real consent version");
  const denied=await call(proc,"stage",{data:{bytesBase64:bytes.toString("base64")}});
  check(denied.status==="STORAGE_DENIED_HOLD",
   "Storage RLS enforces fresh consent after bootstrap");
  check((await physical(revoked.path))===null,
   "revoked actor left no PRIVATE object");
  safeReplies(proc);
  console.log("PASS: F2-P LOCAL user-only child revoked consent fails closed at provider");
 }finally{await stop(proc);}
}
console.log("PASS: F2-P REAL LOCAL user-process credential boundary "+tests+
 " checks; parent retains synthetic admin privilege, child never receives it; "+
 "no PUBLIC media or hosted API executed");
console.log("HOLD: worker process is not an independently provisioned credential boundary; "+
 "its parent/test fixture owns service role, user JWT remains bearer, "+
 "other service-role/S3 writers can still replace bytes; no deployed separation");
