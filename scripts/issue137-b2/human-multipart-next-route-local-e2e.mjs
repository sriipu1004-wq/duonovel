// Issue #137: actual HTTP Next.js Human upload-session API on disposable local Supabase.
// No hosted credentials, Production, shared auth, PUBLIC writes or external servers.
// A valid minted signed token remains a bearer until expiration; this test must report
// that risk rather than calling pre-sign checks a complete revocation solution.
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {execFileSync,spawn} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";
import {createClient} from "@supabase/supabase-js";
import {createServerClient} from "@supabase/ssr";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const supabaseUrl=new URL(process.env.B2_LOCAL_URL??"");
assert.equal(supabaseUrl.protocol,"http:");
assert.ok(["127.0.0.1","localhost"].includes(supabaseUrl.hostname));
assert.ok(["54321","54331"].includes(supabaseUrl.port));
assert.equal(supabaseUrl.pathname,"/");
assert.equal(supabaseUrl.search,"");
assert.equal(supabaseUrl.hash,"");
const net=process.env.B2_NETWORK??"",db=process.env.B2_DB_CONTAINER??"";
assert.match(net,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(db,/^[a-f0-9]{12,64}$/);
const localIds=execFileSync("docker",["ps","-q","--filter","network="+net],
 {encoding:"utf8",timeout:10000}).trim().split(/\s+/);
assert.ok(localIds.includes(db),"local PostgreSQL must be on the disposable network");
const anon=process.env.B2_ANON_KEY??"",service=process.env.B2_SERVICE_KEY??"";
assert.ok(anon.length>15&&service.length>15&&anon!==service);
for(const name of ["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY",
 "SUPABASE_SERVICE_ROLE_KEY","SUPABASE_HUMAN_RECORDING_BUCKET"]){
 assert.equal(process.env[name],undefined,"inherited app credentials prohibited: "+name);
}
const api=supabaseUrl.origin;
const clientOptions={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(api,service,clientOptions);
const anonClient=createClient(api,anon,clientOptions);
const uuid=()=>randomUUID();
const hash=b=>createHash("sha256").update(b).digest("hex");
const bucket="f2p-human-next-route-test";
const totalSize=4*1024*1024+64;
const port=39500+Math.floor(Math.random()*50);
const base="http://127.0.0.1:"+port;
let child,logs="",checks=0;
const check=(condition,label)=>{assert.ok(condition,label);checks++};
const sql=(statement)=>execFileSync("docker",["exec",db,"psql","-X","-v","ON_ERROR_STOP=1",
 "-U","postgres","-d","postgres","-c",statement],{encoding:"utf8",timeout:15000,stdio:["ignore","pipe","pipe"]});
async function makeRequest(payload,cookies){
 const response=await fetch(base+"/api/recordings/human-upload-session",{
  method:"POST",
  headers:{"content-type":"application/json",...(cookies?{cookie:cookies}:{})},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),
 });
 return {status:response.status,body:await response.json()};
}
function die(message){throw new Error(message);}
try{
 // This consent RLS fixture exists only in the isolated local Docker database.
 // Never add grant or policy to a hosted database in this exercise.
 sql("alter table public.user_recording_consents enable row level security; "+
  "grant select on public.user_recording_consents to authenticated; "+
  "create policy issue137_local_consent_select on public.user_recording_consents "+
  "for select to authenticated using (user_id=(select auth.uid()));");
 const email="human-api-"+uuid()+"@example.invalid",password="Local-"+uuid()+"aA1!";
 const userRes=await admin.auth.admin.createUser({email,password,email_confirm:true});
 assert.equal(userRes.error,null,"create synthetic GoTrue user");
 const userId=userRes.data.user.id,seriesId=uuid(),episodeId=uuid();
 const series=await admin.from("series").insert({
  id:seriesId,author_id:userId,publication_status:"public",
  content_rating:"general",content_warnings:[],recording_permission_mode:"open",
 });
 assert.equal(series.error,null,"insert disposable series");
 const episode=await admin.from("episodes").insert({
  id:episodeId,series_id:seriesId,body:"SYNTHETIC TEST ONLY",
  posting_status:"posted",is_published:true,
 });
 assert.equal(episode.error,null,"insert disposable posted episode");
 const b=await admin.storage.createBucket(bucket,{public:false,fileSizeLimit:16*1024*1024});
 assert.equal(b.error,null,"create isolated private Human staging bucket");
 const cookieJar=new Map();
 const authClient=createServerClient(api,anon,{
  cookies:{
   getAll:()=>[...cookieJar].map(([name,value])=>({name,value})),
   setAll:(entries)=>{for(const item of entries){if(item.value)cookieJar.set(item.name,item.value);else cookieJar.delete(item.name);}},
  },
 });
 const signIn=await authClient.auth.signInWithPassword({email,password});
 assert.equal(signIn.error,null,"login synthetic GoTrue actor");
 check(cookieJar.size>0,"Supabase SSR auth cookie must be minted");
 const cookieHeader=()=>[...cookieJar].map(([k,v])=>k+"="+v).join("; ");
 const payload={seriesId,episodeId,fileName:"synthetic.wav",mimeType:"audio/wav",totalSizeBytes:totalSize};
 // Use the exact repository Next.js server implementation, not a direct imported mock.
 const root=new URL("../../",import.meta.url).pathname;
 const cli=new URL("../../node_modules/next/dist/bin/next",import.meta.url).pathname;
 const env={...process.env,NEXT_TELEMETRY_DISABLED:"1",NODE_ENV:"development",
  NEXT_PUBLIC_SUPABASE_URL:api,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,
  SUPABASE_SERVICE_ROLE_KEY:service,SUPABASE_HUMAN_RECORDING_BUCKET:bucket,
  NEXT_PUBLIC_SITE_URL:base,DO_NOT_CONTACT_PRODUCTION:"true"};
 child=spawn(process.execPath,[cli,"dev","--hostname","127.0.0.1","--port",String(port)],{
  cwd:root,env,detached:true,stdio:["ignore","pipe","pipe"],
 });
 for(const stream of [child.stdout,child.stderr]){
  stream.on("data",chunk=>{logs=(logs+String(chunk)).slice(-6000);});
 }
 let ready=false;
 for(let attempt=0;attempt<130;attempt++){
  if(child.exitCode!==null)die("Next local API exited before readiness");
  try{
   const x=await makeRequest(payload,null);
   if(x.status===401){ready=true;break;}
  }catch{}
  await sleep(500);
 }
 check(ready,"real Next API localhost must become ready and deny anonymous request");
 const anonymous=await makeRequest(payload,null);
 check(anonymous.status===401,"anonymous Human session API must return 401");
 const noConsent=await makeRequest(payload,cookieHeader());
 check(noConsent.status===403,"valid user without consent must return 403");
 const old=await admin.from("user_recording_consents").insert({
  user_id:userId,consent_key:"recording_studio_global",consent_version:"2026-04-15",
 });
 assert.equal(old.error,null,"seed stale local consent");
 const stale=await makeRequest(payload,cookieHeader());
 check(stale.status===403,"stale consent must not issue a signed upload token");
 const accepted=await admin.from("user_recording_consents")
  .update({consent_version:"2026-04-16"}).eq("user_id",userId)
  .eq("consent_key","recording_studio_global");
 assert.equal(accepted.error,null,"accept current synthetic consent");
 const valid=await makeRequest(payload,cookieHeader());
 check(valid.status===200 && valid.body.ok===true,"accepted user must get multipart session");
 check(valid.body.bucketName===bucket && valid.body.parts?.length===1,
  "real API signed part remains in isolated private bucket");
 const part=valid.body.parts[0];
 check(typeof part.token==="string"&&part.token.length>10,"real signer minted token");
 check(part.objectPath.startsWith("human-temp/"),"signed part uses temp key only");
 // Verify that post-issuance change is NOT a revocation of the signed bearer.
 const removed=await admin.from("user_recording_consents")
  .update({consent_version:"2026-04-15"}).eq("user_id",userId)
  .eq("consent_key","recording_studio_global");
 assert.equal(removed.error,null);
 const revokedRequest=await makeRequest(payload,cookieHeader());
 check(revokedRequest.status===403,"NEW API token must be denied after consent withdrawal");
 const first=Buffer.alloc(totalSize,0x42),second=Buffer.alloc(totalSize,0x2b);
 first.set(Buffer.from("RIFF"),0);first.set(Buffer.from("WAVE"),8);
 second.set(Buffer.from("RIFF"),0);second.set(Buffer.from("WAVE"),8);
 const store=anonClient.storage.from(bucket);
 const firstPut=await store.uploadToSignedUrl(part.objectPath,part.token,first,{contentType:"audio/wav"});
 // The bearer remains valid after consent withdrawal; record that as RISK, not
 // a fictional end-to-end revocation PASS.
 check(!firstPut.error,"preissued bearer still uploads after app consent withdrawal (known risk)");
 console.log("RISK: actual LOCAL Next API issued token remains valid after consent withdrawal");
 const replay=await store.uploadToSignedUrl(part.objectPath,part.token,second,{contentType:"audio/wav"});
 check(!!replay.error,"NEW upsert:false signed token must reject same-key replay");
 const downloaded=await admin.storage.from(bucket).download(part.objectPath);
 assert.equal(downloaded.error,null);
 const actual=Buffer.from(await downloaded.data.arrayBuffer());
 check(hash(actual)===hash(first),"duplicate signed PUT must preserve first bytes");
 const clean=await admin.storage.from(bucket).remove([part.objectPath]);
 assert.equal(clean.error,null);
 checks++;
 // Test a provider-side DB read failure without granting new tokens.
 sql("revoke select on public.user_recording_consents from authenticated;");
 const consentDbError=await makeRequest(payload,cookieHeader());
 check(consentDbError.status===503,"consent database SELECT failure must fail closed as 503");
 // After session logout, the app cannot mint new tokens.
 const signedOut=await authClient.auth.signOut({scope:"global"});
 assert.equal(signedOut.error,null);
 const afterLogout=await makeRequest(payload,cookieHeader());
 check(afterLogout.status===401,"logout must prevent new API token issuance");
 console.log("PASS: "+checks+" actual LOCAL Next HTTP Human session, GoTrue cookie, consent RLS, revoke, 503, signed Storage first-write, duplicate and logout checks");
 console.log("HOLD: bearer token unrevoked after consent withdrawal; no Production or browser E2E");
}finally{
 if(child?.pid){
  try{process.kill(-child.pid,"SIGTERM");}catch{}
  await sleep(350);
  try{process.kill(-child.pid,"SIGKILL");}catch{}
 }
}
