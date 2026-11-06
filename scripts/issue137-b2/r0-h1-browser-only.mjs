// #137 H1-installed real Chromium multipart gate, separate from legacy
// Reader/Search seed rows (which H1 correctly rejects if directly inserted).
// Unlinked loopback-only Supabase / Next / synthetic bytes, no paid ASR.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {setTimeout as sleep} from "node:timers/promises";
import {createClient} from "@supabase/supabase-js";
import {createServerClient} from "@supabase/ssr";
import {runH2BrowserMultipart} from "./r0-h2-browser-runner.mjs";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.R0_EPHEMERAL_CONFIRM,"local-only");
assert.equal(process.env.R0_H1_BROWSER_PHASE,"preview-hold");
assert.equal(process.env.R0_LOCAL_URL,"http://127.0.0.1:54321");
for(const key of ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_DB_PASSWORD",
 "SUPABASE_ACCESS_TOKEN","NEXT_PUBLIC_SUPABASE_URL",
 "NEXT_PUBLIC_SUPABASE_ANON_KEY","OPENAI_API_KEY",
 "AWS_SECRET_ACCESS_KEY","S3_SECRET_ACCESS_KEY"])
 assert.equal(process.env[key],undefined,"hosted/paid credential forbidden: "+key);
const api=process.env.R0_LOCAL_URL,anonKey=process.env.R0_ANON_KEY,
 serviceKey=process.env.R0_SERVICE_KEY;
assert.ok(anonKey?.length>15&&serviceKey?.length>15&&anonKey!==serviceKey);
const root=fileURLToPath(new URL("../../",import.meta.url));
const cli=fileURLToPath(new URL("../../node_modules/next/dist/bin/next",import.meta.url));
assert.deepEqual(readdirSync(root).filter(x=>/^\.env(?:\.|$)/u.test(x)&&
 !/\.(?:example|sample|template)$/u.test(x)),[],
 "do not load any real dotenv files");
const service=createClient(api,serviceKey,{auth:{persistSession:false,
 autoRefreshToken:false,detectSessionInUrl:false}});
async function actor(label){
 const email="h1-chromium-"+label+"-"+randomUUID()+"@example.invalid";
 const password="H1-synthetic-"+randomUUID()+"A1!";
 const user=await service.auth.admin.createUser({email,password,email_confirm:true});
 assert.equal(user.error,null,"disposable GoTrue create");
 const id=user.data.user.id,cookies=new Map();
 const client=createServerClient(api,anonKey,{auth:{autoRefreshToken:false,
  persistSession:false},cookies:{
   getAll:()=>[...cookies].map(([name,value])=>({name,value})),
   setAll:items=>{for(const item of items)
    if(item.value)cookies.set(item.name,item.value);else cookies.delete(item.name);}
  }});
 const signed=await client.auth.signInWithPassword({email,password});
 assert.equal(signed.error,null,"disposable authenticated JWT");
 assert.equal(signed.data.user.id,id);
 assert.ok(cookies.size>0);
 const profile=await service.from("users").insert({
  id,display_name:"H1 LOCAL "+label.toUpperCase()+" NARRATOR"});
 assert.equal(profile.error,null,"disposable public.users profile");
 return {id,db:client,cookie:()=>[...cookies].map(([k,v])=>k+"="+v).join("; ")};
}
const owner=await actor("owner"),other=await actor("other");
const port=39780+Math.floor(Math.random()*20);
const base="http://127.0.0.1:"+port;
const nextEnv={
 PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,
 NODE_ENV:"development",CI:"true",NEXT_TELEMETRY_DISABLED:"1",
 DO_NOT_CONTACT_PRODUCTION:"true",R0_EPHEMERAL_CONFIRM:"local-only",
 NEXT_PUBLIC_SUPABASE_URL:api,NEXT_PUBLIC_SUPABASE_ANON_KEY:anonKey,
 NEXT_PUBLIC_SITE_URL:base,SUPABASE_SERVICE_ROLE_KEY:serviceKey,
 // Deliberately stop before final media write, normalization or paid ASR.
 LIBREAD_F2P_MEDIA_WRITER_MODE:"preview-hold",VERCEL_ENV:"preview"
};
let next=null,browser=null,tail="";
try {
 next=spawn(process.execPath,[cli,"dev","--hostname","127.0.0.1",
  "--port",String(port)],{cwd:root,env:nextEnv,detached:true,
  stdio:["ignore","pipe","pipe"]});
 for(const stream of [next.stdout,next.stderr])stream.on("data",chunk=>{
  tail=(tail+String(chunk)).slice(-1900);
 });
 let ready=false;
 for(let n=0;n<130;n++){
  if(next.exitCode!==null)throw Error("H1_NEXT_EXITED");
  try{
   const r=await fetch(base+"/",{redirect:"error",
    signal:AbortSignal.timeout(3500)});
   if(r.status===200||r.status===404){ready=true;break;}
  }catch{}
  await sleep(450);
 }
 assert.ok(ready,"isolated real Next dev server ready");
 const {chromium}=await import("playwright");
 browser=await chromium.launch({headless:true,args:["--no-sandbox"],
  timeout:45000});
 const context=await browser.newContext({serviceWorkers:"block"});
 const allowed=new Set([base,api]);
 await context.route("**/*",route=>{
  const target=new URL(route.request().url());
  return allowed.has(target.origin)?route.continue():route.abort("blockedbyclient");
 });
 const cookieEntries=owner.cookie().split("; ").map(pair=>{
  const sep=pair.indexOf("=");assert.ok(sep>0);
  return {name:pair.slice(0,sep),value:pair.slice(sep+1),url:base};
 });
 await context.addCookies(cookieEntries);
 await runH2BrowserMultipart({context,owner,other,base,api,anonKey,service});
 await context.close();
 console.log("PASS: B2/R0+H1+H2 single-stack actual 8MiB+ Chromium two-part "+
  "finalize reached pre-ASR F2P HOLD, owner profile RLS and abort; "+
  "no paid external media processing or Human publication");
} catch(error){
 console.error("H1_BROWSER_INTEGRATION_FAIL:",error);
 console.error("NEXT_LOCAL_LOG_TAIL:",tail);
 throw error;
} finally {
 if(browser)try{await browser.close()}catch{}
 if(next?.pid){
  try{process.kill(-next.pid,"SIGTERM")}catch{}
  for(let i=0;i<18;i++){
   try{process.kill(-next.pid,0)}catch{next=null;break;}
   await sleep(250);
  }
  if(next)try{process.kill(-next.pid,"SIGKILL")}catch{}
 }
}
