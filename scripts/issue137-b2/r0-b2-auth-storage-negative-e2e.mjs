// Issue #137 B2/R0: REAL but disposable GoTrue/PostgREST/Storage negatives.
// No hosted URLs, no real assets, no Production users, no global secrets.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {createClient} from "@supabase/supabase-js";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.R0_EPHEMERAL_CONFIRM,"local-only");
for(const name of ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_DB_PASSWORD",
 "SUPABASE_ACCESS_TOKEN","AWS_SECRET_ACCESS_KEY","S3_SECRET_ACCESS_KEY"]){
 assert.equal(process.env[name],undefined,"No hosted credentials");
}
const endpoint=new URL(process.env.R0_LOCAL_URL||"");
assert.equal(endpoint.protocol,"http:");
assert.ok(["127.0.0.1","localhost","[::1]"].includes(endpoint.hostname));
assert.ok(["54321","54331"].includes(endpoint.port));
const base=endpoint.origin, anonKey=process.env.R0_ANON_KEY||"",
 serviceKey=process.env.R0_SERVICE_KEY||"";
assert.ok(anonKey.length>15&&serviceKey.length>15&&anonKey!==serviceKey);
const opts={auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}};
const service=createClient(base,serviceKey,opts),anon=createClient(base,anonKey,opts);
const id=()=>randomUUID(),counts={positive:0,denied:0};
function yes(condition,message){assert.ok(condition,message);counts.positive++;}
function blocked(condition,message){assert.ok(condition,message);counts.denied++;}
function noError(resp,label){assert.equal(resp.error,null,label+": "+String(resp.error?.message||""));counts.positive++;return resp;}
function denied(resp,label){blocked(Boolean(resp.error),label);return resp;}
async function user(label){
 const email="r0-b2-"+label+"-"+id()+"@example.invalid",password="Local-"+id()+"-A1!";
 const u=noError(await service.auth.admin.createUser({email,password,email_confirm:true}),"GoTrue create "+label);
 const c=createClient(base,anonKey,opts);
 const signed=noError(await c.auth.signInWithPassword({email,password}),"GoTrue auth "+label);
 yes(signed.data.user.id===u.data.user.id,"GoTrue identity");
 noError(await service.from("users").insert({
  id:u.data.user.id,display_name:"ISOLATED "+label,
  show_r18_content:false,r18_confirmed_at:null
 }),"seed isolated user preference");
 return {id:u.data.user.id,client:c};
}
const owner=await user("owner"),reader=await user("reader");
const seriesId=id(),episodeId=id();
noError(await service.from("series").insert({
 id:seriesId,author_id:owner.id,title:"ISOLATED-R18-NONPUBLIC",
 publication_status:"public",content_rating:"r18",
 content_warnings:["sexual_r18"],content_warning_locks:[]
}),"seed R18 without PUBLIC media");
noError(await service.from("episodes").insert({
 id:episodeId,series_id:seriesId,episode_number:1,
 posting_status:"posted",is_published:true,body:"SYNTHETIC AGE-GATED BODY"
}),"seed age-gated episode");
async function visible(client,table,queryId){
 const res=await client.from(table).select("id").eq("id",queryId);
 noError(res,"RLS "+table+" SELECT");
 return (res.data||[]).length;
}
yes(await visible(owner.client,"series",seriesId)===1,
 "owner may manage own R18 series even without R18 reader preference");
blocked(await visible(anon,"series",seriesId)===0,
 "anon cannot read published R18");
blocked(await visible(reader.client,"series",seriesId)===0,
 "non-opted-in signed-in reader cannot read R18");
blocked(await visible(anon,"episodes",episodeId)===0,
 "anon cannot read R18 episode");
noError(await service.from("users").update({
 show_r18_content:true,r18_confirmed_at:null
}).eq("id",reader.id),"opt-in without confirmed age");
blocked(await visible(reader.client,"series",seriesId)===0,
 "preference without age confirmation remains blocked");
noError(await service.from("users").update({
 show_r18_content:false,r18_confirmed_at:new Date().toISOString()
}).eq("id",reader.id),"age confirmed without preference");
blocked(await visible(reader.client,"series",seriesId)===0,
 "age confirmation without preference remains blocked");
noError(await service.from("users").update({
 show_r18_content:true,r18_confirmed_at:new Date().toISOString()
}).eq("id",reader.id),"age and opt-in both accepted");
yes(await visible(reader.client,"series",seriesId)===1,
 "current DB age+opt-in permits R18 public work without refreshing JWT");
yes(await visible(reader.client,"episodes",episodeId)===1,
 "R18 authorized reader sees posted episode");
denied(await anon.rpc("libread_public_catalog_revision"),
 "anonymous cannot invoke internal catalog epoch RPC");
const epochBefore=noError(await service.rpc("libread_public_catalog_revision"),
 "service-only catalog epoch before withdrawal").data;
yes(typeof epochBefore==="number"&&epochBefore>0,"trusted revision is positive");
noError(await owner.client.from("series").update({
 publication_status:"private"
}).eq("id",seriesId),"owner R18 emergency private transition");
blocked(await visible(reader.client,"series",seriesId)===0,
 "previously authorized R18 reader loses nonpublic series");
blocked(await visible(reader.client,"episodes",episodeId)===0,
 "previously authorized R18 reader loses private episode");
yes(await visible(owner.client,"series",seriesId)===1,
 "owner retains private R18 source");
const epochAfter=noError(await service.rpc("libread_public_catalog_revision"),
 "service-only epoch after withdrawal").data;
yes(epochAfter>epochBefore,"catalog epoch advances transactionally after source UPDATE");

// Storage guards are tested against REAL local Storage API and service_role.
const wave=Buffer.alloc(64);wave.write("RIFF",0);wave.write("WAVE",8);
const digest=x=>createHash("sha256").update(x).digest("hex");
const localUrl=path=>base+"/storage/v1/object/public/recording-audio/"+path;
denied(await service.storage.from("recording-audio").upload(
 "nemo/"+seriesId+"/"+episodeId+"/unsafe.wav",wave,
 {contentType:"audio/wav",upsert:false}),
 "privileged service_role cannot publish R18 audio");
const alternate="r0-alt-public";
noError(await service.storage.createBucket(alternate,{public:true}),
 "create unrelated synthetic PUBLIC bucket");
denied(await service.storage.from(alternate).upload(
 "misplaced/alternate.wav",wave,{contentType:"audio/wav"}),
 "privileged service_role cannot evade R18 via alternate PUBLIC audio bucket");
noError(await service.storage.from(alternate).upload(
 "illustrations/safe.png",Buffer.from("SYNTHETIC-IMAGE-NOT-AUDIO"),
 {contentType:"image/png",upsert:false}),
 "unrelated non-audio public illustration remains supported");

// PRIVATE and existing populated private backup buckets must never flip PUBLIC.
const humanBucket=await service.storage.getBucket("human-recording-audio");
if(humanBucket.error)noError(await service.storage.createBucket("human-recording-audio",{public:false}),
 "create disposable Human PRIVATE bucket");
denied(await service.storage.updateBucket("human-recording-audio",{public:true}),
 "human PRIVATE bucket cannot become PUBLIC even when empty");
denied(await service.storage.updateBucket("r18-recording-audio",{public:true}),
 "R18 PRIVATE bucket cannot become PUBLIC");
denied(await service.storage.updateBucket("r0-private-backup",{public:true}),
 "populated private backup bucket cannot become PUBLIC");

// Private Human reference must be physically backed in protected bucket, with
// matching narrator/source, no AI voice model, not merely a URL or a claimed tag.
const humanPath="human/"+seriesId+"/"+episodeId+"/"+reader.id+
 "/session-one/playback-from-test.m4a";
noError(await service.storage.from("human-recording-audio").upload(
 humanPath,Buffer.from("SYNTHETIC-PRIVATE-M4A-PLACEHOLDER"),
 {contentType:"audio/mp4",upsert:false}),
 "upload synthetic Human object in PRIVATE bucket");
const humanRef={
 series_id:seriesId,episode_id:episodeId,reader_id:reader.id,
 reader_user_id:reader.id,reader_name:"ISOLATED HUMAN",
 voice_model_id:null,is_public:false,audio_storage_path:humanPath
};
const persistedHumanId=id();
noError(await service.from("recordings").insert({...humanRef,id:persistedHumanId}),
 "backed private Human reference accepted");
// All narrator/voice provenance fields must be revalidated on UPDATE, not
// only on insertion or changes to audio_storage_path.
denied(await service.from("recordings").update({reader_id:owner.id}).eq("id",persistedHumanId),
 "post-insert Human narrator reader_id reassignment denied");
denied(await service.from("recordings").update({reader_user_id:owner.id}).eq("id",persistedHumanId),
 "post-insert Human narrator reader_user_id reassignment denied");
denied(await service.from("recordings").update({reader_name:""}).eq("id",persistedHumanId),
 "post-insert Human narrator display-name removal denied");
denied(await service.from("recordings").update({voice_model_id:id()}).eq("id",persistedHumanId),
 "post-insert Human voice provenance conversion denied");
denied(await service.from("recordings").insert({
 ...humanRef,id:id(),reader_id:owner.id,reader_user_id:owner.id}),
 "wrong Human narrator reference refused on R18");
denied(await service.from("recordings").insert({
 ...humanRef,id:id(),audio_storage_path:humanPath.replace("test.m4a","missing.m4a")}),
 "missing Human PRIVATE object cannot authorize R18 recording");
denied(await service.from("recordings").insert({
 ...humanRef,id:id(),voice_model_id:id()}),
 "AI voice_model_id cannot spoof PRIVATE Human narration");
denied(await service.from("recordings").insert({
 ...humanRef,id:id(),audio_storage_path:localUrl("nemo/"+seriesId+"/"+episodeId+"/old.wav")}),
 "PUBLIC audio URL cannot authorize R18 recording");

// An AI R18 path prefix must resolve to physical private WAV bytes,
// bound to the same source and episode. A fake string must fail closed.
const aiPath="nemo/"+seriesId+"/"+episodeId+"/isolated-"+id()+".wav";
const privateAiRef="r18-private:"+aiPath;
denied(await service.from("recordings").insert({
 id:id(),series_id:seriesId,episode_id:episodeId,reader_id:reader.id,is_public:true,
 audio_storage_path:privateAiRef
}),"PRIVATE AI pointer without object bytes rejected");
noError(await service.storage.from("r18-recording-audio").upload(
 aiPath,wave,{contentType:"audio/wav",upsert:false}),
 "stage isolated AI WAV bytes in PRIVATE bucket");
const privateAiId=id();
noError(await service.from("recordings").insert({
 id:privateAiId,series_id:seriesId,episode_id:episodeId,reader_id:reader.id,
 is_public:true,audio_storage_path:privateAiRef
}),"correct source/episode physical PRIVATE AI recording accepted");
denied(await service.from("recordings").insert({
 id:id(),series_id:seriesId,episode_id:episodeId,reader_id:reader.id,is_public:true,
 audio_storage_path:"r18-private:nemo/"+seriesId+"/"+id()+"/different.wav"
}),"AI private path with wrong episode ID rejected");
denied(await service.from("recordings").update({
 audio_storage_path:"r18-private:aivis/"+seriesId+"/"+episodeId+"/not-present.wav"
}).eq("id",privateAiId),"AI private pointer changed to missing object rejected");

// Distinct test: privileged upsert into a previously recorded Public origin
// after emergency PRIVATE must not change origin bytes on failed DB update.
const generalId=id(),generalEpisode=id(),originalPath="nemo/"+generalId+"/"+generalEpisode+"/original.wav";
noError(await service.from("series").insert({
 id:generalId,author_id:owner.id,title:"ISOLATED GENERAL",
 publication_status:"public",content_rating:"general",
 content_warnings:[],content_warning_locks:[]
}),"seed general source");
noError(await service.from("episodes").insert({
 id:generalEpisode,series_id:generalId,posting_status:"posted",
 is_published:true,episode_number:1
}),"seed general episode");
// HIGH conditional leak: a GENERAL published source is NOT consent to place
// a PRIVATE Human original, playback or timing file on a PUBLIC origin.
// Verify with actual local service-role Storage API before any H1 DB row.
const publicHumanPrefix="human/"+generalId+"/"+generalEpisode+"/"+reader.id+"/session-guard";
for(const [name,contentType] of [
 ["original.webm","audio/webm"],
 ["playback.m4a","audio/mp4"],
 ["timing.json","application/json"],
]){
 const key=publicHumanPrefix+"/"+name;
 denied(await service.storage.from("recording-audio").upload(
  key,Buffer.from("SYNTHETIC-NO-PUBLIC-HUMAN"),{contentType,upsert:false}),
  "B2 blocks PUBLIC Human "+name+" even on GENERAL posted source");
 blocked(Boolean((await service.storage.from("recording-audio").download(key)).error),
  "rejected PUBLIC Human "+name+" leaves zero physical readable bytes");
}
denied(await service.storage.from(alternate).upload(
 publicHumanPrefix+"/timing.json",Buffer.from("{}"),
 {contentType:"application/json",upsert:false}),
 "alternate PUBLIC bucket cannot receive Human timing JSON");
const approvedHumanPrivateKey=publicHumanPrefix+"/original.webm";
noError(await service.storage.from("human-recording-audio").upload(
 approvedHumanPrivateKey,Buffer.from("SYNTHETIC-PRIVATE-CONTROL"),
 {contentType:"audio/webm",upsert:false}),
 "canonical PRIVATE Human original stays supported");
blocked(Boolean((await anon.storage.from("human-recording-audio")
 .download(approvedHumanPrivateKey)).error),
 "anonymous cannot read allowed PRIVATE Human original");
noError(await service.storage.from("recording-audio").upload(originalPath,wave,{
 contentType:"audio/wav",upsert:false}),"public general audio allowed before withdrawal");
noError(await owner.client.from("series").update({
 publication_status:"private",content_rating:"r18",
 content_warnings:["sexual_r18"]
}).eq("id",generalId),"atomic withdrawal of recorded general source");
const changed=Buffer.alloc(64,0x41);changed.write("RIFF",0);
const rewrite=await service.storage.from("recording-audio").upload(originalPath,changed,{
 contentType:"audio/wav",upsert:true});
denied(rewrite,"privileged overwrite cannot mutate withdrawn Public origin");
const origin=await fetch(localUrl(originalPath),{cache:"no-store",redirect:"error",
 signal:AbortSignal.timeout(12000)});
yes(origin.status===200,"old origin still exists until physical retirement");
yes(digest(Buffer.from(await origin.arrayBuffer()))===digest(wave),
 "failed privileged overwrite did not corrupt original bytes");
console.log("PASS: #137 R18 + private Human + privileged Storage LOCAL negatives, "+
 counts.positive+" positive / "+counts.denied+" denied checks");
console.log("LIMIT: synthetic local Supabase only; NOT hosted RLS/CDN/S3 or actual rights.");
