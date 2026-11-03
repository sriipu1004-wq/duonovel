// #137 R0 synthetic multi-object retirement/recovery REAL local Storage drill.
// Never point this script at hosted Supabase. Not a reusable deletion utility.
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {readFileSync,writeFileSync,realpathSync} from "node:fs";
import {basename,join} from "node:path";
import {createClient} from "@supabase/supabase-js";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.R0_EPHEMERAL_CONFIRM,"local-only");
for(const forbidden of ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_DB_PASSWORD",
 "SUPABASE_ACCESS_TOKEN","AWS_SECRET_ACCESS_KEY","S3_SECRET_ACCESS_KEY"])
 assert.equal(process.env[forbidden],undefined,"refuse hosted credentials");
const endpoint=new URL(process.env.R0_LOCAL_URL||"");
assert.equal(endpoint.protocol,"http:");
assert.ok(["localhost","127.0.0.1","[::1]"].includes(endpoint.hostname));
assert.ok(["54321","54331"].includes(endpoint.port));
const base=endpoint.origin;
const workspace=realpathSync(process.env.R0_WORKSPACE||"/nonexistent");
assert.ok(/^libread-r0-[a-zA-Z0-9]{8}$/.test(basename(workspace)),
 "journal must live inside runner's unique disposable workspace");
const anonKey=process.env.R0_ANON_KEY||"",serviceKey=process.env.R0_SERVICE_KEY||"";
assert.ok(anonKey.length>15&&serviceKey.length>15&&anonKey!==serviceKey);
const opts={auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}};
const service=createClient(base,serviceKey,opts),anon=createClient(base,anonKey,opts);
const uuid=()=>randomUUID(),digest=b=>createHash("sha256").update(b).digest("hex");
const count={positive:0,denied:0};
function yes(cond,detail){assert.ok(cond,detail);count.positive++;}
function no(cond,detail){assert.ok(cond,detail);count.denied++;}
function success(res,detail){assert.equal(res.error,null,detail+": "+String(res.error?.message||""));count.positive++;return res;}
async function person(label){
 const email="r0-retire-"+label+"-"+uuid()+"@example.invalid";
 const password="LOCAL-ONLY-"+uuid()+"-A1!";
 const a=success(await service.auth.admin.createUser({email,password,email_confirm:true}),"create fake "+label);
 const client=createClient(base,anonKey,opts);
 success(await client.auth.signInWithPassword({email,password}),"log in fake "+label);
 return {id:a.data.user.id,client};
}
const owner=await person("owner"),other=await person("other");
const seriesId=uuid(),episodeId=uuid(),otherSeries=uuid(),otherEpisode=uuid();
for(const [s,e] of [[seriesId,episodeId],[otherSeries,otherEpisode]]){
 success(await service.from("series").insert({
  id:s,author_id:owner.id,publication_status:"public",content_rating:"general",
  content_warnings:[],title:"ISOLATED BATCH RETIREMENT"
 }),"seed synthetic series");
 success(await service.from("episodes").insert({
  id:e,series_id:s,episode_number:1,posting_status:"posted",is_published:true
 }),"seed synthetic episode");
}
const prefix="nemo/"+seriesId+"/"+episodeId+"/";
const noise=Buffer.alloc(384);noise.write("RIFF",0);noise.writeUInt32LE(376,4);
noise.write("WAVE",8);for(let i=12;i<noise.length;i++)noise[i]=i%233;
const timing=Buffer.from(JSON.stringify({kind:"SYNTHETIC-TIMING",milliseconds:[0,150,300],nonce:uuid()}));
const orphan=Buffer.from("SYNTHETIC UNREFERENCED AUDIO "+uuid()+" "+uuid());
const unaffected=Buffer.from("RIFF-SYNTHETIC-UNRELATED-"+uuid());
const plan=[
 {kind:"matched-wav",path:prefix+"matched.wav",bytes:noise,type:"audio/wav",dbReference:true},
 {kind:"timing-json",path:prefix+"matched.json",bytes:timing,type:"application/json",dbReference:false},
 {kind:"unreferenced-webm",path:prefix+"orphan.webm",bytes:orphan,type:"audio/webm",dbReference:false}
];
const untouchedPath="aivis/"+otherSeries+"/"+otherEpisode+"/untouched.wav";
const backupNonce=uuid(),recordingId=uuid(),journalFile=join(workspace,"retirement-synthetic-journal.json");
const publicUrl=path=>base+"/storage/v1/object/public/recording-audio/"+path;
const privateUrl=path=>base+"/storage/v1/object/public/r0-private-backup/"+path;
const localFetch=async uri=>{
 const u=new URL(uri,base);
 assert.equal(u.origin,base,"forbid external URL");
 const res=await fetch(u,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000)});
 return {status:res.status,body:Buffer.from(await res.arrayBuffer())};
};
const bucket=service.storage.from("recording-audio");
const privateBucket=service.storage.from("r0-private-backup");
const expected=plan.map((item,i)=>({
 kind:item.kind,path:item.path,bytes:item.bytes.length,sha256:digest(item.bytes),
 backupPath:"owner/"+owner.id+"/"+backupNonce+"/backup/"+i+"-"+item.kind,
 restorePath:"owner/"+owner.id+"/"+backupNonce+"/restored/"+i+"-"+item.kind,
 provenance:"SYNTHETIC-FIXTURE-AUTHORIZED-ONLY",
 status:"pending",dbReference:item.dbReference
}));
function validate(j,allowStates){
 yes(j.version===1&&j.environment==="ISOLATED_LOCAL"&&j.seriesId===seriesId,
  "durable journal is isolated to exact synthetic source");
 yes(Array.isArray(j.assets)&&j.assets.length===3&&j.assets.every((x,i)=>
  expected[i].path===x.path&&expected[i].sha256===x.sha256&&
  expected[i].bytes===x.bytes&&expected[i].backupPath===x.backupPath&&
  expected[i].restorePath===x.restorePath&&
  x.provenance==="SYNTHETIC-FIXTURE-AUTHORIZED-ONLY"&&
  allowStates.includes(x.status)),"manifest exact paths, lengths, digests and synthetic rights");
}
const writeJournal=j=>writeFileSync(journalFile,JSON.stringify(j,null,2)+"\n",{mode:0o600});
const readJournal=()=>JSON.parse(readFileSync(journalFile,"utf8"));
let journal={version:1,environment:"ISOLATED_LOCAL",seriesId,assets:expected};
writeJournal(journal);
validate(readJournal(),["pending"]);
const tampered=structuredClone(journal);
tampered.assets[2].provenance="UNVERIFIED-REAL-WORLD-RIGHTS";
assert.throws(()=>validate(tampered,["pending"]),"unverified rights cannot enter the removal plan");
count.denied++;
const badDigest=structuredClone(journal);
badDigest.assets[0].sha256="0".repeat(64);
assert.throws(()=>validate(badDigest,["pending"]),"altered backup checksum cannot be trusted");
count.denied++;

// Every source byte is synthetic and uploaded to real local Supabase Storage.
for(const item of plan){
 success(await bucket.upload(item.path,item.bytes,{contentType:item.type,upsert:false,cacheControl:"0"}),
  "upload synthetic "+item.kind);
 const r=await localFetch(publicUrl(item.path));
 yes(r.status===200&&digest(r.body)===digest(item.bytes),"verify original public bytes "+item.kind);
}
success(await bucket.upload(untouchedPath,unaffected,{contentType:"audio/wav",upsert:false}),
 "unrelated public work seed");
success(await service.from("recordings").insert({
 id:recordingId,series_id:seriesId,episode_id:episodeId,is_public:true,
 audio_storage_path:publicUrl(plan[0].path)
}),"exact one indexed WAV reference");
const indexed=success(await service.from("recordings").select("id,audio_storage_path").eq("series_id",seriesId),
 "read synthetic indexed references");
yes(indexed.data.length===1&&indexed.data[0].audio_storage_path===publicUrl(plan[0].path),
 "sidecar and orphan have NO indexed recordings reference");

// Owner can hide the work even before physical retirement; others cannot.
const foreign=await other.client.from("series").update({publication_status:"private"})
 .eq("id",seriesId).select("id");
no(foreign.error||foreign.data?.length===0,"nonowner cannot unpublish synthetic work");
const hidden=success(await owner.client.from("series").update({
 publication_status:"private",content_rating:"r18",content_warnings:["sexual_r18"]
}).eq("id",seriesId).select("publication_status,content_rating"),
 "atomic owner PRIVATE+R18 before evacuation");
yes(hidden.data.length===1&&hidden.data[0].publication_status==="private",
 "logical hide does not delete physical origins");
no((await anon.from("series").select("id").eq("id",seriesId)).data.length===0,
 "anonymous cannot see withdrawn work");
const signed=success(await bucket.createSignedUrl(plan[0].path,120),
 "issue only local test signed bearer before retirement");
const signedUrl=new URL(signed.data.signedUrl,base);
yes((await localFetch(signedUrl)).status===200,"signed bearer works before removal");
no((await owner.client.from("series").update({publication_status:"public"})
 .eq("id",seriesId).select("id")).error?.code==="23514",
 "republish held while origin/recording references exist");

// Copy ALL paths first; copy alone must not mark original as retired.
for(const item of journal.assets){
 success(await bucket.copy(item.path,item.backupPath,{destinationBucket:"r0-private-backup"}),
  "copy named object into owner PRIVATE backup");
 const ownerRead=success(await owner.client.storage.from("r0-private-backup").download(item.backupPath),
  "owner may read private backup");
 yes(digest(Buffer.from(await ownerRead.data.arrayBuffer()))===item.sha256,
  "full-byte backup SHA256 "+item.kind);
 no((await other.client.storage.from("r0-private-backup").download(item.backupPath)).error,
  "foreign user denied private copy");
 no((await anon.storage.from("r0-private-backup").download(item.backupPath)).error,
  "anonymous denied private copy");
 no((await localFetch(privateUrl(item.backupPath))).status!==200,
  "PRIVATE backup has no public object URL");
 yes((await localFetch(publicUrl(item.path))).status===200,
  "private copy does not revoke original");
}

// Controlled deletion is an exact object manifest operation. No wildcard/bucket
// delete or direct SQL storage.objects DELETE. Simulate a crash AFTER first
// successful deletion and durable checkpoint; reopen the journal and resume.
async function removeExact(item){
 const ownerProof=success(await owner.client.storage.from("r0-private-backup").download(item.backupPath),
  "recheck backup immediately before retirement");
 yes(digest(Buffer.from(await ownerProof.data.arrayBuffer()))===item.sha256,
  "refuse remove unless digest matches");
 const current=await localFetch(publicUrl(item.path));
 yes(current.status===200&&digest(current.body)===item.sha256,
  "verify exact old origin before removal");
 const result=success(await bucket.remove([item.path]),"remove EXACT synthetic origin");
 yes(result.data?.length===1,"Storage API removed one intended object");
 no((await localFetch(publicUrl(item.path))).status!==200,"old origin no longer serves");
 item.status="retired";
 writeJournal(journal);
}
let intentionalFailure=false;
try{
 await removeExact(journal.assets[0]);
 throw new Error("ISSUE137_SYNTHETIC_PARTIAL_BATCH_INTERRUPT");
}catch(e){
 assert.equal(e.message,"ISSUE137_SYNTHETIC_PARTIAL_BATCH_INTERRUPT");
 intentionalFailure=true;
}
yes(intentionalFailure,"injected failure after one committed Storage deletion");
yes((await localFetch(publicUrl(plan[1].path))).status===200 &&
    (await localFetch(publicUrl(plan[2].path))).status===200,
  "partial failure left pending sidecar and orphan untouched");
no((await localFetch(signedUrl)).status!==200,
 "retired WAV old signed bearer cannot resurrect local origin");
no((await owner.client.from("series").update({publication_status:"public"})
  .eq("id",seriesId).select("id")).error?.code==="23514",
 "partial batch cannot republish hidden work");

// Re-read a FILE journal (as after process restart), verify stable exact manifest
// and resume ONLY pending items. Already retired item is never deleted twice.
journal=readJournal();
validate(journal,["pending","retired"]);
yes(journal.assets.filter(x=>x.status==="retired").length===1,
 "restart journal identifies exactly one retired asset");
for(const item of journal.assets){
 if(item.status==="retired"){
  no((await localFetch(publicUrl(item.path))).status!==200,
   "resumption refuses re-delete/overwrite prior retired origin");
  continue;
 }
 await removeExact(item);
}
journal=readJournal();
validate(journal,["retired"]);
yes(journal.assets.every(x=>x.status==="retired"),"resume completes exact 3 synthetic assets");
for(const item of journal.assets){
 no((await localFetch(publicUrl(item.path))).status!==200,
  "public source absent after complete batch");
 const backed=success(await owner.client.storage.from("r0-private-backup").download(item.backupPath),
  "private backup survives removal");
 yes(digest(Buffer.from(await backed.data.arrayBuffer()))===item.sha256,
  "backup digest still exact after retirement");
}
// Even after old origins are physically gone, the historic PUBLIC DB URL
// reference must continue to hold re-publication until separately resolved.
no((await owner.client.from("series").update({publication_status:"public"})
  .eq("id",seriesId).select("id")).error?.code==="23514",
 "old indexed recording reference holds re-publication");
const db=success(await service.from("recordings").select("id,audio_storage_path").eq("id",recordingId),
 "synthetic historical reference preserved");
yes(db.data.length===1&&db.data[0].audio_storage_path===publicUrl(plan[0].path),
 "retirement never silently deletes authorship/provenance reference");

// Rehearse restoration ONLY into a different private path. Never republish.
for(const item of journal.assets){
 success(await privateBucket.copy(item.backupPath,item.restorePath),
  "copy backup to an isolated PRIVATE restore destination");
 const restored=success(await owner.client.storage.from("r0-private-backup").download(item.restorePath),
  "owner reads restored PRIVATE object");
 yes(digest(Buffer.from(await restored.data.arrayBuffer()))===item.sha256,
  "full-byte private restore digest");
 no((await other.client.storage.from("r0-private-backup").download(item.restorePath)).error,
  "foreign user still denied restored PRIVATE bytes");
 no((await anon.storage.from("r0-private-backup").download(item.restorePath)).error,
  "anonymous still denied restored PRIVATE bytes");
 no((await localFetch(privateUrl(item.restorePath))).status!==200,
  "RESTORED PRIVATE object never has public URL");
}
const unaffectedOrigin=await localFetch(publicUrl(untouchedPath));
yes(unaffectedOrigin.status===200&&digest(unaffectedOrigin.body)===digest(unaffected),
 "unrelated public work is not retired");
const ownerFinal=success(await owner.client.from("series").select("publication_status,content_rating")
 .eq("id",seriesId),"read final owner series");
yes(ownerFinal.data.length===1&&ownerFinal.data[0].publication_status==="private"&&
 ownerFinal.data[0].content_rating==="r18","never auto-republish retired work");
console.log("PASS: #137 REAL LOCAL synthetic 3-object retirement/resume/private-restore "+
 count.positive+" positive / "+count.denied+" denied checks");
console.log("LIMIT: journal reload is not process-kill recovery; tiny synthetic bytes, "+
 "one local Storage origin; CDN/S3/retries under real faults, DB snapshot restore, "+
 "rights and hosted media are UNVERIFIED. RELEASE_HOLD.");
