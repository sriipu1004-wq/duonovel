// Issue #137 R0: REAL isolated Next.js HTTP route + disposable GoTrue/RLS.
 // No mock auth, no Production, no real media/rights/owner state.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {setTimeout as sleep} from "node:timers/promises";
import {createClient} from "@supabase/supabase-js";
import {createServerClient} from "@supabase/ssr";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.R0_EPHEMERAL_CONFIRM,"local-only");
const local=new URL(process.env.R0_LOCAL_URL||"");
assert.ok(local.protocol==="http:"&&
  ["127.0.0.1","localhost","[::1]"].includes(local.hostname)&&
  ["54321","54331"].includes(local.port)&&
  local.pathname==="/"&&!local.search&&!local.hash,
  "supabase origin must be local-only");
for (const key of ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_DB_PASSWORD",
  "SUPABASE_ACCESS_TOKEN","NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY","AWS_SECRET_ACCESS_KEY"]) {
  assert.equal(process.env[key],undefined,"inherited hosted credential forbidden");
}
const api=local.origin, anonKey=process.env.R0_ANON_KEY||"",
  serviceKey=process.env.R0_SERVICE_KEY||"";
assert.ok(anonKey.length>15&&serviceKey.length>15&&anonKey!==serviceKey);
const root=fileURLToPath(new URL("../../",import.meta.url));
const cli=fileURLToPath(new URL("../../node_modules/next/dist/bin/next",import.meta.url));
assert.deepEqual(readdirSync(root).filter(x=>/^\.env(?:\.|$)/u.test(x)&&
  !/\.(?:example|sample|template)$/u.test(x)),[],
  "do not load existing untracked dotenv files");
const service=createClient(api,serviceKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
});
const id=()=>randomUUID(),n={positive:0,denied:0};
function pass(cond,label){assert.ok(cond,label);n.positive++;}
function deny(cond,label){assert.ok(cond,label);n.denied++;}
const port=39760+Math.floor(Math.random()*12),base="http://127.0.0.1:"+port;
const bytes=Buffer.alloc(64);
bytes.write("RIFF",0);bytes.writeUInt32LE(56,4);
bytes.write("WAVEfmt ",8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);
bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);
bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);
bytes.writeUInt16LE(16,34);bytes.write("data",36);bytes.writeUInt32LE(20,40);
const sha=x=>createHash("sha256").update(x).digest("hex");

async function actor(label) {
  const email="r0-next-"+label+"-"+id()+"@example.invalid";
  const password="Next-R0-"+id()+"A1!";
  const result=await service.auth.admin.createUser({email,password,email_confirm:true});
  assert.equal(result.error,null,"create synthetic "+label);
  const cookieStore=new Map();
  const client=createServerClient(api,anonKey,{
    auth:{autoRefreshToken:false,persistSession:false},
    cookies:{
      getAll:()=>[...cookieStore].map(([name,value])=>({name,value})),
      setAll:entries=>{for(const item of entries){
        if(item.value)cookieStore.set(item.name,item.value);
        else cookieStore.delete(item.name);
      }}
    }
  });
  const signed=await client.auth.signInWithPassword({email,password});
  assert.equal(signed.error,null,"real local GoTrue login "+label);
  assert.equal(signed.data?.user?.id,result.data.user.id);
  const verified=await client.auth.getUser();
  assert.equal(verified.error,null,"GoTrue verified session");
  assert.equal(verified.data?.user?.id,result.data.user.id);
  pass(cookieStore.size>0,"real Supabase SSR cookies issued");
  const cookie=()=>[...cookieStore].map(([k,v])=>k+"="+v).join("; ");
  return {id:result.data.user.id,cookie};
}

const owner=await actor("owner"),other=await actor("other");
const seriesId=id(),episodeId=id(),recordingId=id();
const syntheticTitle="R0-ISOLATED-READER-SEARCH-"+id().slice(0,8).toUpperCase();
const syntheticBody="R0 ISOLATED NOVEL BODY - NO REAL USER TEXT";
const publicPath="nemo/"+seriesId+"/"+episodeId+"/original.wav";
const publicUrl=api+"/storage/v1/object/public/recording-audio/"+publicPath;
assert.equal((await service.from("series").insert({
  id:seriesId,author_id:owner.id,publication_status:"public",
  title:syntheticTitle,description:"ISOLATED NOVEL SUMMARY",
  source_language:"ja",translation_permission_mode:"open",
  content_rating:"general",content_warnings:[],content_warning_locks:[]
})).error,null,"seed synthetic owner series");
assert.equal((await service.from("users").insert({
  id:owner.id,display_name:"R0 ISOLATED SYNTHETIC AUTHOR"
})).error,null,"seed synthetic author profile");
assert.equal((await service.from("episodes").insert({
  id:episodeId,series_id:seriesId,episode_number:1,
  body:syntheticBody,posting_status:"posted",is_published:true
})).error,null,"seed synthetic episode");
assert.equal((await service.storage.from("recording-audio").upload(publicPath,bytes,{
  contentType:"audio/wav",upsert:false,cacheControl:"0"
})).error,null,"seed one local PUBLIC WAV");
assert.equal((await service.from("recordings").insert({
  id:recordingId,series_id:seriesId,episode_id:episodeId,is_public:true,
  audio_storage_path:publicUrl
})).error,null,"seed legacy local PUBLIC recording reference");

// A SECOND real public R18 work exercises viewer JWT, opted-in RLS and
// Work/Reader/Search without ever putting restricted cards in an anon cache.
const r18SeriesId=id(),r18EpisodeId=id();
const r18Title="R0-R18-SIGNED-READER-"+id().slice(0,8).toUpperCase();
const r18Body="R0 R18 AUTHORIZED READER ONLY "+id().slice(0,8);
assert.equal((await service.from("users").insert({
 id:other.id,display_name:"R0 SYNTHETIC OPTED IN READER",
 show_r18_content:true,r18_confirmed_at:new Date().toISOString()
})).error,null,"synthetic opted in reader profile");
assert.equal((await service.from("series").insert({
 id:r18SeriesId,author_id:owner.id,title:r18Title,
 publication_status:"public",content_rating:"r18",
 content_warnings:["sexual_r18"],content_warning_locks:[],
 source_language:"ja",translation_permission_mode:"open"
})).error,null,"seed public R18 source without old PUBLIC media");
assert.equal((await service.from("episodes").insert({
 id:r18EpisodeId,series_id:r18SeriesId,episode_number:1,
 body:r18Body,posting_status:"posted",is_published:true
})).error,null,"seed posted age-gated R18 episode");

// These are direct authority reads by the test harness only.
async function state(){
  const r=await service.from("series")
    .select("publication_status,content_rating,content_warnings").eq("id",seriesId).single();
  assert.equal(r.error,null);
  return r.data;
}
async function oldUrl(){
  const r=await fetch(publicUrl,{cache:"no-store",redirect:"error",
    signal:AbortSignal.timeout(15000)});
  return {status:r.status,digest:sha(Buffer.from(await r.arrayBuffer()))};
}
async function getPage(path,cookie=""){
  const u=new URL(path,base);
  assert.equal(u.origin,base,"site page must only use local Next origin");
  const r=await fetch(u,{cache:"no-store",redirect:"error",
    headers:{"cache-control":"no-cache",...(cookie?{cookie}:{})},
    signal:AbortSignal.timeout(20000)});
  return {status:r.status,body:await r.text()};
}
async function post(payload,cookie){
  const r=await fetch(base+"/api/series/"+seriesId+"/content-rating",{
    method:"POST",headers:{"content-type":"application/json",
      ...(cookie?{cookie}:{}), "cache-control":"no-store"},
    body:JSON.stringify(payload),redirect:"error",cache:"no-store",
    signal:AbortSignal.timeout(20000)
  });
  let body;const raw=await r.text();
  try{body=JSON.parse(raw)}catch{body=null}
  return {status:r.status,body,validJson:body!==null};
}
const nextEnv={
  PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,
  NODE_ENV:"development",CI:"true",NEXT_TELEMETRY_DISABLED:"1",
  DO_NOT_CONTACT_PRODUCTION:"true",R0_EPHEMERAL_CONFIRM:"local-only",
  NEXT_PUBLIC_SUPABASE_URL:api,NEXT_PUBLIC_SUPABASE_ANON_KEY:anonKey,
  NEXT_PUBLIC_SITE_URL:base,
  // The REAL public Work/Reader/Search app uses a trusted server client.
  // This key is ephemeral, generated by the isolated local Supabase CLI
  // and is confined to the 127.0.0.1 Next process; never use hosted keys.
  SUPABASE_SERVICE_ROLE_KEY:serviceKey
};
// No hosted credentials can be inherited. The local-only service key is
// required to exercise the actual privileged Reader/Search data flow.
assert.equal(nextEnv.SUPABASE_SERVICE_ROLE_KEY,serviceKey);
assert.ok(["127.0.0.1","localhost","[::1]"].includes(new URL(nextEnv.NEXT_PUBLIC_SUPABASE_URL).hostname));
assert.equal(nextEnv.R0_SERVICE_KEY,undefined);
let next,log="";
try {
  next=spawn(process.execPath,[cli,"dev","--hostname","127.0.0.1",
    "--port",String(port)],{
    cwd:root,env:nextEnv,detached:true,stdio:["ignore","pipe","pipe"]
  });
  for(const stream of [next.stdout,next.stderr])stream.on("data",chunk=>{
    log=(log+String(chunk)).slice(-2500);
  });
  let ready=false;
  for(let tries=0;tries<150;tries++){
    if(next.exitCode!==null)throw Error("NEXT_LOCAL_PROCESS_EXITED");
    try{
      const r=await post({rating:"general"},null);
      if(r.status===401){ready=true;break}
      if(r.status>=500&&tries>8)throw Error("NEXT_ROUTE_5XX_WHILE_BOOTING");
    }catch(e){
      if(String(e).includes("NEXT_ROUTE_5XX"))throw e;
    }
    await sleep(350);
  }
  pass(ready,"real local Next.js HTTP route ready and anonymous 401");
  // Populate the SAME Next server cache before the atomic mutation.
  // Do not satisfy this contract with PostgREST-only or mocked HTML.
  // Search inputs echo q into their HTML; never use the FULL private marker
  // as q, or the post-withdrawal assertion would report a false data leak.
  // Query a broad synthetic prefix and check only the full unique result title.
  const searchPath="/search?q="+encodeURIComponent("R0-ISOLATED-READER");
  const workPath="/works/"+seriesId;
  const readerPath="/read/"+seriesId+"/1";
  // One ACTUAL GoTrue SSR authenticated R18 viewer versus anonymous reader.
  const r18SearchPath="/search?q="+encodeURIComponent("R0-R18-SIGNED");
  const r18WorkPath="/works/"+r18SeriesId;
  const r18ReaderPath="/read/"+r18SeriesId+"/1";
  const r18AnonSearch=await getPage(r18SearchPath);
  deny(r18AnonSearch.status===200&&!r18AnonSearch.body.includes(r18Title),
    "anonymous Search must not serialize R18 title");
  const r18AnonWork=await getPage(r18WorkPath);
  deny(!r18AnonWork.body.includes(r18Title),
    "anonymous Work must not serialize R18 title");
  const r18AnonReader=await getPage(r18ReaderPath);
  deny(!r18AnonReader.body.includes(r18Body),
    "anonymous Reader must not serialize restricted R18 body");
  const r18AuthorizedSearch=await getPage(r18SearchPath,other.cookie());
  pass(r18AuthorizedSearch.status===200&&
    r18AuthorizedSearch.body.includes(r18Title),
    "authenticated age-confirmed opted-in R18 reader sees Search result");
  const r18AuthorizedWork=await getPage(r18WorkPath,other.cookie());
  pass(r18AuthorizedWork.status===200&&
    r18AuthorizedWork.body.includes(r18Title),
    "authenticated opted-in R18 reader sees Work detail");
  const r18AuthorizedReader=await getPage(r18ReaderPath,other.cookie());
  pass(r18AuthorizedReader.status===200&&
    r18AuthorizedReader.body.includes(r18Body),
    "authenticated opted-in R18 reader sees actual Reader body");
  // Revoke only R18 opt-in; use SAME cookie, SAME Next process and the
  // previously warmed Search to catch stale session/profile/cache results.
  assert.equal((await service.from("users").update({
    show_r18_content:false
  }).eq("id",other.id)).error,null,"revoke synthetic R18 preference");
  const r18RevokedSearch=await getPage(r18SearchPath,other.cookie());
  deny(r18RevokedSearch.status===200&&!r18RevokedSearch.body.includes(r18Title),
    "R18 preference revocation removes warmed Search title");
  const r18RevokedWork=await getPage(r18WorkPath,other.cookie());
  deny(!r18RevokedWork.body.includes(r18Title),
    "R18 preference revocation hides Work detail");
  const r18RevokedReader=await getPage(r18ReaderPath,other.cookie());
  deny(!r18RevokedReader.body.includes(r18Body),
    "R18 preference revocation hides Reader body");
  const initialSearch=await getPage(searchPath);
  pass(initialSearch.status===200&&initialSearch.body.includes(syntheticTitle),
    "Search actual HTTP must show the synthetic published work before withdrawal; HTTP "+
    initialSearch.status);
  const initialWork=await getPage(workPath);
  pass(initialWork.status===200&&initialWork.body.includes(syntheticTitle),
    "Work actual HTTP must display published synthetic work before withdrawal; HTTP "+
    initialWork.status);
  const initialReader=await getPage(readerPath);
  pass(initialReader.status===200&&initialReader.body.includes(syntheticBody),
    "Reader actual HTTP must display published synthetic episode before withdrawal; HTTP "+
    initialReader.status);
  const standard={warnings:["sexual_r18"]};
  const anon=await post({...standard,emergencyUnpublish:true},null);
  deny(anon.status===401&&anon.body?.error==="authentication_required",
    "anonymous cannot force emergency unpublish");
  const foreign=await post({...standard,emergencyUnpublish:true},other.cookie());
  deny(foreign.status===403&&foreign.body?.error==="forbidden",
    "signed-in other user cannot change owner work");
  const malformed=await post({...standard,emergencyUnpublish:"yes"},owner.cookie());
  deny(malformed.status===400&&malformed.body?.error==="invalid_emergency_unpublish",
    "string emergency flag rejected");
  const noWarnings=await post({emergencyUnpublish:true},owner.cookie());
  deny(noWarnings.status===400&&noWarnings.body?.error==="invalid_content_warnings",
    "invalid rating/warning payload rejected");
  const stale=await post({...standard,emergencyUnpublish:true,
    createdAfter:"2099-01-01T00:00:00Z"},owner.cookie());
  deny(stale.status===409&&stale.body?.error==="series_not_created_after_pending_selection",
    "createdAfter guard rejects inconsistent source selection");
  const ratedPublic=await post({...standard,emergencyUnpublish:false},owner.cookie());
  deny(ratedPublic.status===409&&
    ratedPublic.body?.error==="media_containment_required"&&
    ratedPublic.body.persisted===false,
    "legacy PUBLIC work cannot silently become publicly R18");
  assert.equal((await state()).publication_status,"public");
  assert.equal((await state()).content_rating,"general");
  pass(true,"rejected rating mutation leaves DB unchanged");
  const emergency=await post({...standard,emergencyUnpublish:true},owner.cookie());
  assert.equal(emergency.status,200,
    "real Next owner HTTP emergency must succeed, status="+emergency.status+
    " error="+String(emergency.body?.error??"none"));
  pass(emergency.body?.ok===true,"real Next handler reports success");
  pass(emergency.body?.publicationStatus==="private",
    "Next HTTP response includes authoritative PRIVATE status");
  pass(emergency.body?.rating==="r18"&&
    emergency.body?.warnings?.includes("sexual_r18"),
    "Next HTTP corrected rating and warning");
  pass(emergency.body?.publicMediaStatus==="unverified",
    "response never claims old Public URL erased");
  pass(!JSON.stringify(emergency.body).includes("storage/v1/object"),
    "Next never exposes raw Public URL in response");
  const after=await state();
  pass(after.publication_status==="private"&&after.content_rating==="r18"&&
    after.content_warnings.includes("sexual_r18"),
    "one real PostgREST DB update atomically persisted PRIVATE + R18");
  const still=await oldUrl();
  pass(still.status===200&&still.digest===sha(bytes),
    "physical Public WAV still reachable after Next logical withdrawal");
  // Next App Router can emit HTTP 200 for a STREAMED notFound() response;
  // the 404 UI and its robots noindex marker are the actual fail-closed
  // evidence. Both serialized HTML and RSC payload must omit private text.
  // See https://nextjs.org/docs/app/api-reference/file-conventions/not-found
  function noindexNotFound(page,secretMarker){
    // Next may reorder HTML attributes or use "noindex,nofollow"; select
    // a SINGLE robots meta and independently inspect its content attribute.
    const metaTags=page.body.match(/<meta\b[^>]*>/gi)||[];
    const robotsTags=metaTags.filter(tag=>/\bname\s*=\s*["']robots["']/i.test(tag));
    const robotsNoindex=robotsTags.some(tag=>
      /\bcontent\s*=\s*["'][^"']*\bnoindex\b/i.test(tag));
    const streamed404=page.status===200&&robotsNoindex;
    const plain404=page.status===404;
    console.log("EVIDENCE: robotsMeta="+robotsTags.length+
      " noindex="+robotsNoindex+" status="+page.status);
    return (plain404||streamed404)&&!page.body.includes(secretMarker);
  }
  const withdrawnWork=await getPage(workPath);
  console.log("EVIDENCE: post-withdraw Work status="+withdrawnWork.status+
    " noindex="+/name=["']robots["']/.test(withdrawnWork.body)+
    " containsSyntheticTitle="+withdrawnWork.body.includes(syntheticTitle));
  deny(noindexNotFound(withdrawnWork,syntheticTitle),
    "Work HTTP must fail closed (404 or streamed 200+noindex), with no private title");
  const withdrawnReader=await getPage(readerPath);
  console.log("EVIDENCE: post-withdraw Reader status="+withdrawnReader.status+
    " noindex="+/name=["']robots["']/.test(withdrawnReader.body)+
    " containsSyntheticBody="+withdrawnReader.body.includes(syntheticBody));
  deny(noindexNotFound(withdrawnReader,syntheticBody),
    "Reader HTTP must fail closed (404 or streamed 200+noindex), no private episode");
  const withdrawnSearch=await getPage(searchPath);
  deny(withdrawnSearch.status===200&&!withdrawnSearch.body.includes(syntheticTitle),
    "same Search HTML request must no longer show cached unpublished work");
  const afterAnon=await post({...standard,emergencyUnpublish:true},null);
  deny(afterAnon.status===401,"anonymous stays denied after withdrawal");
  const afterOther=await post({...standard,emergencyUnpublish:true},other.cookie());
  deny([403,404].includes(afterOther.status),
    "other never gains access to owner's now-private source");
  const republish=await service.from("series")
    .update({publication_status:"public"}).eq("id",seriesId).select("id");
  deny(republish.error?.code==="23514",
    "DB candidate denies re-publication with old Public file+reference");
  console.log("PASS: #137 REAL LOCAL Next SSR-cookie POST + local RLS, "+
    n.positive+" positive / "+n.denied+" denied checks");
  console.log("RISK: successfully withdrawn DB source does NOT revoke old Public Storage URL");
  console.log("LIMIT: LOCAL Next Reader/Search HTML fail-close is NOT hosted CDN/browser, p95 or cache consistency across pods");
} finally {
  if(next?.pid){
    try{process.kill(-next.pid,"SIGTERM")}catch{}
    for(let i=0;i<18;i++){
      try{process.kill(-next.pid,0)}catch{next=null;break}
      await sleep(250);
    }
    if(next){
      try{process.kill(-next.pid,"SIGKILL")}catch{}
      console.log("NOTICE: local Next process required forced group cleanup");
    }
  }
}
