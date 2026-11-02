// Issue #137: real Next.js HTTP credential-withholding contrast on a
// disposable LOCAL Supabase stack. No hosted accounts or application changes.
// Importantly, this does NOT prove deployment-level per-route secret custody.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {execFileSync,spawn} from "node:child_process";
import {readdirSync} from "node:fs";
import {setTimeout as sleep} from "node:timers/promises";
import {createClient} from "@supabase/supabase-js";
import {createServerClient} from "@supabase/ssr";
import {fileURLToPath} from "node:url";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const ep=new URL(process.env.B2_LOCAL_URL??"");
assert.equal(ep.protocol,"http:");
assert.ok(["127.0.0.1","localhost"].includes(ep.hostname));
assert.ok(["54321","54331"].includes(ep.port));
assert.equal(ep.pathname,"/");
assert.equal(ep.search,"");
assert.equal(ep.hash,"");
const net=process.env.B2_NETWORK??"",db=process.env.B2_DB_CONTAINER??"";
assert.match(net,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(db,/^[a-f0-9]{12,64}$/);
const ids=execFileSync("docker",["ps","-q","--filter","network="+net],
 {encoding:"utf8",timeout:10000}).trim().split(/\s+/);
assert.ok(ids.includes(db),"local PostgreSQL must be on disposable network");
const anon=process.env.B2_ANON_KEY??"",service=process.env.B2_SERVICE_KEY??"";
assert.ok(anon.length>15&&service.length>15&&anon!==service);
for(const key of ["SUPABASE_SERVICE_ROLE_KEY","NEXT_PUBLIC_SUPABASE_URL",
 "NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_HUMAN_RECORDING_BUCKET"]){
 assert.equal(process.env[key],undefined,"unexpected app credential: "+key);
}
const root=fileURLToPath(new URL("../../",import.meta.url));
const cli=fileURLToPath(new URL("../../node_modules/next/dist/bin/next",import.meta.url));
// next dev loads .env* automatically: block any untracked runtime secrets.
const envFiles=readdirSync(root).filter(name=>/^\.env(?:\.|$)/.test(name)&&
 !/\.(?:example|sample|template)$/.test(name));
assert.deepEqual(envFiles,[],"NO-KEY test cannot run with .env files");
const admin=createClient(ep.origin,service,{auth:{persistSession:false,autoRefreshToken:false}});
const bucket="f2p-no-admin-next-private",port=39600+Math.floor(Math.random()*50);
const base="http://127.0.0.1:"+port,id=()=>randomUUID();
const childEnv={
 PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,
 NEXT_TELEMETRY_DISABLED:"1",NODE_ENV:"development",CI:"true",
 NEXT_PUBLIC_SUPABASE_URL:ep.origin,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,
 SUPABASE_HUMAN_RECORDING_BUCKET:bucket,
 NEXT_PUBLIC_SITE_URL:base,DO_NOT_CONTACT_PRODUCTION:"true"
};
assert.equal(childEnv.SUPABASE_SERVICE_ROLE_KEY,undefined);
const jar=new Map();
const auth=createServerClient(ep.origin,anon,{cookies:{
 getAll:()=>[...jar].map(([name,value])=>({name,value})),
 setAll:items=>{for(const item of items){
  if(item.value)jar.set(item.name,item.value);else jar.delete(item.name);
 }}
}});
const cookies=()=>[...jar].map(([k,v])=>k+"="+v).join("; ");
let child,checks=0,logs="";
function check(value,reason){assert.ok(value,reason);checks++;}
async function post(path,authorized=false,payload=null,multipart=false){
 const headers=authorized?{cookie:cookies()}:{};
 let body;
 if(multipart){
  const form=new FormData(),bytes=Buffer.alloc(48);
  bytes.write("RIFF",0);bytes.write("WAVE",8);
  form.set("audio",new File([bytes],"local.wav",{type:"audio/wav"}));
  body=form;
 }else{headers["content-type"]="application/json";body=JSON.stringify(payload);}
 const response=await fetch(base+path,{method:"POST",headers,body,
  redirect:"error",signal:AbortSignal.timeout(15000)});
 const raw=await response.text();
 let json;try{json=JSON.parse(raw);}catch{json={};}
 return {status:response.status,json};
}
const payload={seriesId:id(),episodeId:id(),fileName:"synthetic.wav",
 mimeType:"audio/wav",totalSizeBytes:4*1024*1024+64};
function sql(q){execFileSync("docker",["exec",db,"psql","-X",
 "-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres","-c",q],
 {encoding:"utf8",timeout:15000,stdio:["ignore","pipe","pipe"]});}
try{
 // Earlier local full-key route test intentionally revoked this SELECT grant.
 // Restore it for a fresh actor, retaining the already-created RLS policy.
 sql("grant select on public.user_recording_consents to authenticated;");
 const email="no-admin-next-"+id()+"@example.invalid",password="Local-"+id()+"aA1!";
 const actor=await admin.auth.admin.createUser({email,password,email_confirm:true});
 assert.equal(actor.error,null,"synthetic auth user creation");
 const userId=actor.data.user.id;
 assert.equal((await admin.from("series").insert({
  id:payload.seriesId,author_id:userId,publication_status:"public",
  content_rating:"general",content_warnings:[],recording_permission_mode:"open"
 })).error,null,"disposable series");
 assert.equal((await admin.from("episodes").insert({
  id:payload.episodeId,series_id:payload.seriesId,body:"LOCAL ONLY",
  posting_status:"posted",is_published:true
 })).error,null,"disposable episode");
 assert.equal((await admin.from("user_recording_consents").insert({
  user_id:userId,consent_key:"recording_studio_global",
  consent_version:"2026-04-16"
 })).error,null,"current local consent");
 assert.equal((await admin.storage.createBucket(bucket,{public:false,
  fileSizeLimit:16*1024*1024})).error,null,"local PRIVATE stage bucket");
 const logged=await auth.auth.signInWithPassword({email,password});
 assert.equal(logged.error,null,"real disposable GoTrue login");
 check(jar.size>0,"session cookie exists");
 child=spawn(process.execPath,[cli,"dev","--hostname","127.0.0.1",
  "--port",String(port)],{cwd:root,env:childEnv,detached:true,
  stdio:["ignore","pipe","pipe"]});
 for(const stream of [child.stdout,child.stderr])
  stream.on("data",part=>{logs=(logs+String(part)).slice(-4000);});
 let ready=false;
 for(let i=0;i<130;i++){
  if(child.exitCode!==null)throw Error("NO_ADMIN_NEXT_EXITED_EARLY_HOLD");
  try{
   const result=await post("/api/recordings/upload-check",false,null,true);
   if(result.status===401){ready=true;break;}
  }catch{}
  await sleep(500);
 }
 check(ready,"real no-admin Next HTTP must be ready and anonymous 401");
 const anonCheck=await post("/api/recordings/upload-check",false,null,true);
 check(anonCheck.status===401,"user-only upload check must deny anonymous");
 const preflight=await post("/api/recordings/upload-check",true,null,true);
 check(preflight.status===200&&preflight.json?.ok===true&&
  preflight.json?.result?.decision==="passed",
  "signed-in upload preflight works without privileged credentials");
 const anonSession=await post("/api/recordings/human-upload-session",false,payload);
 check(anonSession.status===401,"anonymous signer must fail authorization");
 const denied=await post("/api/recordings/human-upload-session",true,payload);
 check(denied.status===500&&denied.json?.ok===false,
  "authorized legacy signer fails closed without admin secret");
 check(!denied.json?.parts&&!denied.json?.token&&!denied.json?.uploadSessionId,
  "must not return a signed multipart bearer");
 const contents=await admin.storage.from(bucket).list("",{limit:100});
 assert.equal(contents.error,null,"real PRIVATE Storage listing");
 check(contents.data.length===0,"no PRIVATE part was written on signer failure");
 console.log("PASS: F2-P actual LOCAL no-admin Next HTTP boundary "+checks+
  " controls; signed-in preflight 200, authorized legacy signer 500/no bearer, zero PRIVATE objects");
 console.log("HOLD: withholding service key breaks legitimate Human signer; no deployed per-route "+
  "credential custody, user-JWT TUS Next wiring, alternate privileged-writer containment or Production E2E");
}finally{
 if(child?.pid){
  try{process.kill(-child.pid,"SIGTERM");}catch{}
  await sleep(350);
  try{process.kill(-child.pid,"SIGKILL");}catch{}
 }
}
