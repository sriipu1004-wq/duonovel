// Issue #137: real LOCAL HTTP ingress -> isolated privileged worker -> real
// disposable GoTrue/PostgREST/Storage. This is NOT a deployed gateway.
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {spawn,execFileSync} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";
import {createClient} from "@supabase/supabase-js";
import {readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const ep=new URL(process.env.B2_LOCAL_URL??"");
assert.ok(ep.protocol==="http:"&&["localhost","127.0.0.1"].includes(ep.hostname)&&
 ["54321","54331"].includes(ep.port)&&ep.pathname==="/"&&!ep.search&&!ep.hash);
const net=process.env.B2_NETWORK??"",db=process.env.B2_DB_CONTAINER??"";
assert.match(net,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(db,/^[a-f0-9]{12,64}$/);
assert.ok(execFileSync("docker",["ps","-q","--filter","network="+net],{
 encoding:"utf8",timeout:10000}).trim().split(/\s+/).includes(db));
const anon=process.env.B2_ANON_KEY??"",service=process.env.B2_SERVICE_KEY??"";
assert.ok(anon.length>15&&service.length>15&&anon!==service);
for(const key of ["NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY",
 "SUPABASE_HUMAN_RECORDING_BUCKET","NEXT_PUBLIC_SUPABASE_ANON_KEY"])
 assert.equal(process.env[key],undefined,"hosted app vars forbidden");
const root=fileURLToPath(new URL("../../",import.meta.url));
assert.deepEqual(readdirSync(root).filter(name=>/^\.env(?:\.|$)/.test(name)&&
 !/\.(?:example|sample|template)$/.test(name)),[],"unexpected .env secret");
const script=fileURLToPath(new URL("./privileged-http-boundary-process-local.mjs",import.meta.url));
const admin=createClient(ep.origin,service,{auth:{
 persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const id=()=>randomUUID(),hash=b=>createHash("sha256").update(b).digest("hex");
const bucket="f2p-http-privileged-worker-private";
const workerPort=39800+Math.floor(Math.random()*90),
 ingressPort=39700+Math.floor(Math.random()*90);
const workerUrl="http://127.0.0.1:"+workerPort,
 ingressUrl="http://127.0.0.1:"+ingressPort;
const internal=id()+id(),children=[];
const wav=Buffer.alloc(48);
wav.write("RIFF",0);wav.writeUInt32LE(40,4);wav.write("WAVEfmt ",8);
wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);
wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
wav.write("data",36);wav.writeUInt32LE(4,40);
wav.writeInt16LE(11,44);wav.writeInt16LE(-11,46);
const changed=Buffer.from(wav);changed.writeInt16LE(57,44);
const common={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,
 DO_NOT_CONTACT_PRODUCTION:"true",B2_EPHEMERAL_CONFIRM:"local-only",
 B2_LOCAL_URL:ep.origin+"/",B2_ANON_KEY:anon,
 B2_LOCAL_WORKER_INNER_TOKEN:internal};
let checks=0;
function check(value,label){assert.ok(value,label);checks++;}
function start(role,extra={}){
 const env={...common,B2_HTTP_BOUNDARY_ROLE:role,
  B2_HTTP_BOUNDARY_PORT:String(role==="worker"?workerPort:ingressPort),...extra};
 if(role==="ingress")assert.equal(env.B2_SERVICE_KEY,undefined);
 else assert.equal(env.B2_SERVICE_KEY,service);
 const child=spawn(process.execPath,[script],{cwd:root,env,detached:true,
  stdio:["ignore","pipe","pipe"]});
 let output="";
 for(const st of [child.stdout,child.stderr])
  st.on("data",b=>{output=(output+String(b)).slice(-2500);});
 children.push({child,getLogs:()=>output});
 return child;
}
async function healthy(url,role,child){
 for(let tries=0;tries<60;tries++){
  if(child.exitCode!==null)throw Error(role+"_WORKER_EXITED_EARLY_HOLD");
  try{
   const r=await fetch(url+"/health",{redirect:"error",
    signal:AbortSignal.timeout(1500)});
   if(r.status===200&&(await r.json()).role===role)return;
  }catch{}
  await sleep(200);
 }
 throw Error(role+"_HEALTH_NOT_READY_HOLD");
}
async function post(url,path,jwt,body,internalHeader){
 const headers={"content-type":"application/json"};
 if(jwt)headers.authorization="Bearer "+jwt;
 if(internalHeader)headers["x-b2-internal-token"]=internalHeader;
 const r=await fetch(url+path,{method:"POST",headers,body:JSON.stringify(body),
  cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
 return {status:r.status,body:await r.json()};
}
async function actor(){
 const email="http-worker-"+id()+"@example.invalid",password="Local-"+id()+"A1!";
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
 assert.equal(created.error,null,"create local synthetic user");
 const client=createClient(ep.origin,anon,{auth:{
  persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const login=await client.auth.signInWithPassword({email,password});
 assert.equal(login.error,null,"real local actor login");
 const uid=created.data.user.id,jwt=login.data.session?.access_token;
 check(typeof jwt==="string"&&jwt.length>30,"GoTrue access token");
 return {uid,jwt,client};
}
async function physical(path){
 const r=await admin.storage.from(bucket).download(path);
 return r.error?null:Buffer.from(await r.data.arrayBuffer());
}
async function issue(a,seriesId,episodeId,sha=hash(wav)){
 return post(ingressUrl,"/issue",a.jwt,{seriesId,episodeId,expectedSha256:sha});
}
async function stage(a,ticket,bytes=wav,more={}){
 return post(ingressUrl,"/stage",a.jwt,{ticket,bytesBase64:bytes.toString("base64"),...more});
}
function path(a,ticket){return "owner/"+a.uid+"/"+ticket+".wav";}
try{
 // The actual child environment is allowlisted, no admin key for ingress.
 // Poisoned ingress must fail before binding its HTTP listener.
 const polluted=start("ingress",{B2_SERVICE_KEY:"SYNTHETIC_FORBIDDEN"});
 await new Promise((resolve,reject)=>{
  const t=setTimeout(()=>reject(Error("POISON_WAIT_HOLD")),5000);
  polluted.once("exit",code=>{clearTimeout(t);
   if(code!==1)reject(Error("POISON_ACCEPTED_HOLD"));else resolve();});
 });
 check(true,"admin-key-poisoned ingress refused startup");
 const bucketRes=await admin.storage.createBucket(bucket,{public:false,
  fileSizeLimit:1024*1024});
 assert.equal(bucketRes.error,null,"create synthetic PRIVATE bucket");
 const a=await actor(),b=await actor(),seriesId=id(),episodeId=id();
 assert.equal((await admin.from("series").insert({id:seriesId,author_id:a.uid,
  publication_status:"public",content_rating:"general",content_warnings:[],
  recording_permission_mode:"open"})).error,null,"local series");
 assert.equal((await admin.from("episodes").insert({id:episodeId,series_id:seriesId,
  body:"LOCAL",posting_status:"posted",is_published:true})).error,null,"local episode");
 const consent=(user,version)=>admin.from("user_recording_consents").upsert({
  user_id:user.uid,consent_key:"recording_studio_global",
  consent_version:version},{onConflict:"user_id,consent_key"});
 assert.equal((await consent(a,"2026-04-16")).error,null);
 assert.equal((await consent(b,"2026-04-16")).error,null);
 const worker=start("worker",{B2_SERVICE_KEY:service});
 await healthy(workerUrl,"worker",worker);
 const ingress=start("ingress",{B2_HTTP_WORKER_URL:workerUrl+"/"});
 await healthy(ingressUrl,"ingress",ingress);
 const noAuth=await post(ingressUrl,"/issue",null,{
  seriesId,episodeId,expectedSha256:hash(wav)});
 check(noAuth.status===401,"anonymous ingress rejected");
 const rawDirect=await post(workerUrl,"/issue",a.jwt,{
  seriesId,episodeId,expectedSha256:hash(wav)});
 check(rawDirect.status===403,"direct worker request without internal token rejected");
 const forged=await post(ingressUrl,"/issue",a.jwt,{
  seriesId,episodeId,expectedSha256:hash(wav),bucket:"recording-audio"});
 check(forged.status===400,"client cannot select PUBLIC bucket");
 const otherSeries=await issue(a,id(),episodeId);
 check(otherSeries.status===403,"nonexistent series not authorized");
 const ticket=await issue(a,seriesId,episodeId);
 check(ticket.status===201&&ticket.body.ok&&
  /^[a-f0-9-]{36}$/u.test(ticket.body.ticket),"fresh authorized ticket");
 const t=ticket.body.ticket;
 const stolen=await stage(b,t);
 check(stolen.status===403,"other user cannot spend ticket");
 const spoof=await stage(a,t,wav,{path:"public/file.wav"});
 check(spoof.status===400,"caller cannot select Storage destination");
 const mutation=await stage(a,t,changed);
 check(mutation.status===422,"same-size modified bytes rejected");
 check((await physical(path(a,t)))===null,"invalid stage did not write bytes");
 const direct=await a.client.storage.from(bucket).upload(path(a,t),wav,{
  contentType:"audio/wav",upsert:false});
 check(!!direct.error,"ordinary user JWT cannot insert directly into privileged bucket");
 const successful=await stage(a,t);
 check(successful.status===201&&successful.body.status==="PRIVATE_STAGED_UNVERIFIED",
  "separate worker writes PRIVATE for authorized user");
 const stored=await physical(path(a,t));
 check(stored?.equals(wav),"trusted test harness verifies physical bytes");
 const replay=await stage(a,t,changed);
 check(replay.status===409,"ticket reuse cannot overwrite");
 check((await physical(path(a,t)))?.equals(wav),"replay preserved original");
 const noPublic=await fetch(ep.origin+"/storage/v1/object/public/"+bucket+"/"+path(a,t),{
  headers:{apikey:anon},redirect:"error",signal:AbortSignal.timeout(12000)});
 check(noPublic.status>=400,"private bytes not available on PUBLIC endpoint");
 const revokedTicket=await issue(a,seriesId,episodeId);
 check(revokedTicket.status===201,"ticket issued with fresh consent");
 assert.equal((await consent(a,"2026-04-15")).error,null,"withdraw local consent");
 const afterRevoke=await stage(a,revokedTicket.body.ticket);
 check(afterRevoke.status===403,"revoked user cannot stage pre-issued ticket");
 check((await physical(path(a,revokedTicket.body.ticket)))===null,
  "revocation blocked PRIVATE write");
 assert.equal((await consent(a,"2026-04-16")).error,null,"restore local consent");
 const parallel=await issue(a,seriesId,episodeId);
 check(parallel.status===201,"parallel control issued");
 const attempts=await Promise.all([
  stage(a,parallel.body.ticket),stage(a,parallel.body.ticket)
 ]);
 check(attempts.filter(x=>x.status===201).length===1&&
  attempts.filter(x=>x.status===409).length===1,
  "concurrent duplicate ticket has one winner");
 check((await physical(path(a,parallel.body.ticket)))?.equals(wav),
  "parallel requests left original bytes");
 const observed=await admin.storage.getBucket(bucket);
 check(observed.data?.public===false,"bucket remains PRIVATE");
 const outputs=children.map(c=>c.getLogs()).join("\n");
 check(!outputs.includes(service)&&!outputs.includes(a.jwt)&&
  !outputs.includes(b.jwt)&&!outputs.includes(internal),
  "no local bearer, service key or internal token in child logs");
 check(!JSON.stringify([successful,ticket,stolen,afterRevoke]).includes(service),
  "no worker service key in client responses");
 console.log("PASS: F2-P REAL LOCAL separate HTTP ingress/privileged worker "+
  checks+" checks; 2 processes, owner GoTrue, fresh consent, PRIVATE first-write, "+
  "wrong-user/replay/revocation/parallel negatives and zero PUBLIC media");
 console.log("HOLD: ingress has test-only internal relay secret; trusted worker remains "+
  "project-wide service_role and a separate holder still bypasses Storage RLS. "+
  "No deployed per-route custody, durable ticket ledger, 1GiB streaming, authenticated "+
  "Reader/AI/Human production compatibility, or physical immutability.");
}finally{
 for(const {child} of children.reverse())if(child.pid){
  try{process.kill(-child.pid,"SIGTERM");}catch{}
  await sleep(200);
  try{process.kill(-child.pid,"SIGKILL");}catch{}
 }
}
