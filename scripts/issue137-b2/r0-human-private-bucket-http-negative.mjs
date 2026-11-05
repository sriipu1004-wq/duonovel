// #137 HIGH conditional PUBLIC-leak: real LOCAL GoTrue/Next/Storage route negative.
// A distinct, already-verified loopback-only disposable stack is provided by
// r0-run-local-storage.sh AFTER H1+H2 are installed. No hosted keys or media.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.R0_EPHEMERAL_CONFIRM,"local-only");
for (const name of ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_DB_PASSWORD",
  "SUPABASE_ACCESS_TOKEN","NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY","AWS_SECRET_ACCESS_KEY","S3_SECRET_ACCESS_KEY",
  "OPENAI_API_KEY"]) {
  assert.equal(process.env[name],undefined,"No hosted/external keys allowed");
}
const endpoint=new URL(process.env.R0_LOCAL_URL||"");
assert.ok(endpoint.protocol==="http:" &&
  endpoint.hostname==="127.0.0.1" &&
  endpoint.port==="54321" && endpoint.pathname==="/" &&
  !endpoint.search && !endpoint.hash);
const api=endpoint.origin,anonKey=process.env.R0_ANON_KEY||"",
 serviceKey=process.env.R0_SERVICE_KEY||"";
assert.ok(anonKey.length>15 && serviceKey.length>15 && anonKey!==serviceKey);
const root=fileURLToPath(new URL("../../",import.meta.url));
const cli=fileURLToPath(new URL("../../node_modules/next/dist/bin/next",import.meta.url));
assert.deepEqual(readdirSync(root).filter(x=>/^\.env(?:\.|$)/u.test(x) &&
  !/\.(?:example|sample|template)$/u.test(x)),[],
  "No developer/hosted .env may enter the isolated server");
const service=createClient(api,serviceKey,{
 auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
});
const seriesId=randomUUID(),episodeId=randomUUID();
const email="issue137-bucketfix-"+randomUUID()+"@example.invalid";
const password="LOCAL-"+randomUUID()+"A1!";
const u=await service.auth.admin.createUser({email,password,email_confirm:true});
assert.equal(u.error,null,"seed only disposable GoTrue identity");
const userId=u.data.user.id;
const store=new Map(),signed=createServerClient(api,anonKey,{
 auth:{autoRefreshToken:false,persistSession:false},
 cookies:{
  getAll:()=>[...store].map(([name,value])=>({name,value})),
  setAll:entries=>{for(const entry of entries){
   if(entry.value)store.set(entry.name,entry.value);
   else store.delete(entry.name);
  }}
 }
});
const login=await signed.auth.signInWithPassword({email,password});
assert.equal(login.error,null,"real local signed-in session required");
assert.equal(login.data.user.id,userId);
const cookies=()=>[...store].map(([key,value])=>key+"="+value).join("; ");
assert.ok(cookies().length>25,"actual local SSR cookie required");
function noError(result,message){assert.equal(result.error,null,message);}
noError(await service.from("users").insert({id:userId,display_name:"ISOLATED HUMAN PRIVATE GUARD"}),
 "seed isolated Human narrator profile");
noError(await service.from("series").insert({
 id:seriesId,author_id:userId,title:"ISOLATED-GENERAL-SOURCE",
 publication_status:"public",content_rating:"general",content_warnings:[],
 content_warning_locks:[],recording_permission_mode:"open"
}),"seed posted GENERAL series");
noError(await service.from("episodes").insert({
 id:episodeId,series_id:seriesId,episode_number:1,
 body:"SYNTHETIC TEST BODY",is_published:true,posting_status:"posted"
}),"seed posted GENERAL episode");
noError(await service.from("user_recording_consents").insert({
 user_id:userId,consent_key:"recording_studio_global",consent_version:"2026-04-16"
}),"seed current synthetic consent");

const port=39830+Math.floor(Math.random()*8),base="http://127.0.0.1:"+port;
const nextEnv={
 PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,
 NODE_ENV:"development",CI:"true",NEXT_TELEMETRY_DISABLED:"1",
 DO_NOT_CONTACT_PRODUCTION:"true",R0_EPHEMERAL_CONFIRM:"local-only",
 NEXT_PUBLIC_SUPABASE_URL:api,NEXT_PUBLIC_SUPABASE_ANON_KEY:anonKey,
 NEXT_PUBLIC_SITE_URL:base,SUPABASE_SERVICE_ROLE_KEY:serviceKey,
 // The EXACT audited failure configuration; intentional only on this runner.
 SUPABASE_HUMAN_RECORDING_BUCKET:"recording-audio",
};
let next,log="";
try {
 next=spawn(process.execPath,[cli,"dev","--hostname","127.0.0.1","--port",String(port)],{
  cwd:root,env:nextEnv,detached:true,stdio:["ignore","pipe","pipe"]
 });
 for(const stream of [next.stdout,next.stderr])stream.on("data",chunk=>{
  log=(log+String(chunk)).slice(-2500);
 });
 let ready=false;
 for(let i=0;i<150;i++){
  if(next.exitCode!==null)throw Error("LOCAL_NEXT_EXIT_BEFORE_READY");
  try{
   const res=await fetch(base+"/api/recordings/human-publish",{
    method:"POST",signal:AbortSignal.timeout(9000)
   });
   if(res.status===401){ready=true;break}
  }catch{}
  await sleep(350);
 }
 assert.ok(ready,"misconfigured Next must be reachable only on loopback");
 const response=await fetch(base+"/api/recordings/human-upload-session",{
  method:"POST",
  headers:{"content-type":"application/json",Cookie:cookies()},
  body:JSON.stringify({
   seriesId,episodeId,fileName:"synthetic.wav",mimeType:"audio/wav",
   totalSizeBytes:8*1024*1024+1
  }),
  signal:AbortSignal.timeout(25000)
 });
 const session=await response.json();
 assert.equal(response.status,500,"PUBLIC-bucket config must block signed multipart");
 assert.equal(session.ok,false);
 assert.equal(session.parts,undefined,"no upload bearer may escape");
 assert.equal(session.detail,"human_private_bucket_name_unapproved",
  "guard must be the reason, not an earlier auth/consent/route failure");

 // Genuine small WAV header, no transcription or paid ASR is permitted.
 const wave=Buffer.alloc(64);wave.write("RIFF",0);wave.write("WAVE",8);
 const data=new FormData();
 for(const [key,value] of Object.entries({
  seriesId,episodeId,episodeNumber:"1",isPublic:"false"
 }))data.set(key,value);
 data.set("audio",new Blob([wave],{type:"audio/wav"}),"synthetic.wav");
 const single=await fetch(base+"/api/recordings/human-publish",{
  method:"POST",headers:{Cookie:cookies()},body:data,
  signal:AbortSignal.timeout(25000)
 });
 const outcome=await single.json();
 assert.equal(single.status,500,"PRIVATE Human single upload must fail before bytes");
 assert.equal(outcome.ok,false);
 assert.equal(outcome.detail,"human_private_bucket_name_unapproved",
  "single-upload guard must precede ASR and Storage writes");

 const publicObjects=await service.storage.from("recording-audio")
  .list("human/"+seriesId+"/"+episodeId,{limit:100});
 noError(publicObjects,"verify absent PUBLIC Human object prefix");
 assert.equal((publicObjects.data||[]).length,0,
  "neither route may persist a PUBLIC Human original/part/timing object");
 const recordingRows=await service.from("recordings")
  .select("id",{count:"exact",head:true}).eq("episode_id",episodeId);
 noError(recordingRows,"verify no Human DB publish");
 assert.equal(recordingRows.count,0);
 console.log("PASS: real LOCAL misconfigured Next/GoTrue GENERAL source blocks "+
  "single PRIVATE Human upload and multipart signed bearer before PUBLIC "+
  "Storage bytes; zero PUBLIC objects and zero recordings");
} finally {
 if(next?.pid) {
  try{process.kill(-next.pid,"SIGTERM")}catch{}
  for(let i=0;i<25;i++){
   try{process.kill(-next.pid,0)}catch{next=null;break}
   await sleep(150);
  }
  if(next?.pid){try{process.kill(-next.pid,"SIGKILL")}catch{}}
 }
}
