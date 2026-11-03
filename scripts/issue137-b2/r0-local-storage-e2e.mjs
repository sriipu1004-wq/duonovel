// #137 R0 — real disposable LOCAL GoTrue, PostgREST and Storage API.
 // Synthetic WAV only. NEVER run against hosted Supabase or real files/users.
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.R0_EPHEMERAL_CONFIRM,"local-only");
for (const forbidden of ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_DB_PASSWORD",
  "SUPABASE_ACCESS_TOKEN","AWS_SECRET_ACCESS_KEY","S3_SECRET_ACCESS_KEY"]) {
  assert.equal(process.env[forbidden],undefined,"refuse any hosted credentials");
}
const url=new URL(process.env.R0_LOCAL_URL||"");
assert.equal(url.protocol,"http:");
assert.ok(["127.0.0.1","localhost","[::1]"].includes(url.hostname));
assert.ok(["54321","54331"].includes(url.port),"refuse unexpected port");
const base=url.origin,anonKey=process.env.R0_ANON_KEY||"",
  serviceKey=process.env.R0_SERVICE_KEY||"";
assert.ok(anonKey&&serviceKey&&anonKey!==serviceKey);
const opts={auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}};
const service=createClient(base,serviceKey,opts);
const anon=createClient(base,anonKey,opts);
const id=()=>randomUUID(),checks={pass:0,deny:0};
function ok(error,label) {
  assert.equal(error,null,label+" must succeed");
  checks.pass++;
}
function deny(error,label) {
  assert.ok(error,label+" must reject");
  checks.deny++;
}
function sha(bytes){return createHash("sha256").update(bytes).digest("hex");}
const wave=Buffer.alloc(64);
wave.write("RIFF",0);wave.writeUInt32LE(56,4);wave.write("WAVEfmt ",8);
wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);
wave.writeUInt16LE(1,22);wave.writeUInt32LE(8000,24);
wave.writeUInt32LE(16000,28);wave.writeUInt16LE(2,32);
wave.writeUInt16LE(16,34);wave.write("data",36);wave.writeUInt32LE(20,40);
for(let i=44;i<64;i+=2)wave.writeInt16LE((i-44)*13,i);
const expectedDigest=sha(wave);

// Actual local GoTrue users and password-grant JWT, not fabricated claims.
async function makePerson(label) {
  const email="r0-"+label+"-"+id()+"@example.invalid";
  const password="R0-Local-A1!-"+id();
  const made=await service.auth.admin.createUser({email,password,email_confirm:true});
  ok(made.error,"create synthetic "+label);
  assert.ok(made.data?.user?.id);
  const client=createClient(base,anonKey,opts);
  const signed=await client.auth.signInWithPassword({email,password});
  ok(signed.error,"GoTrue "+label+" password login");
  assert.equal(signed.data?.user?.id,made.data.user.id);
  const checked=await client.auth.getUser();
  ok(checked.error,"GoTrue "+label+" current user");
  assert.equal(checked.data.user.id,made.data.user.id);
  return {id:made.data.user.id,client,token:signed.data.session.access_token};
}
const owner=await makePerson("owner"),other=await makePerson("other");
const seriesId=id(),episodeId=id(),recordingId=id(),backupNonce=id();
const objectPath="nemo/"+seriesId+"/"+episodeId+"/original.wav";
const newPath="nemo/"+seriesId+"/"+episodeId+"/forbidden.wav";
const backupPath="owner/"+owner.id+"/"+backupNonce+".wav";
const publicUrl=base+"/storage/v1/object/public/recording-audio/"+objectPath;
const privatePublicUrl=base+"/storage/v1/object/public/r0-private-backup/"+backupPath;
async function publicRead(localUrl) {
  const u=new URL(localUrl);
  assert.equal(u.origin,base,"never fetch a nonlocal origin");
  const res=await fetch(u,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000)});
  return {status:res.status,bytes:Buffer.from(await res.arrayBuffer())};
}
async function row(actor=anon) {
  const r=await actor.from("series")
    .select("id,publication_status,content_rating,content_warnings")
    .eq("id",seriesId);
  ok(r.error,"PostgREST view query");
  return r.data;
}

// Seed only synthetic local relational rows and isolated Storage buckets.
ok((await service.from("series").insert({
  id:seriesId,author_id:owner.id,publication_status:"public",
  content_rating:"general",content_warnings:[]
})).error,"seed owner source");
ok((await service.from("episodes").insert({
  id:episodeId,series_id:seriesId,posting_status:"posted",is_published:true
})).error,"seed posted episode");
ok((await service.storage.createBucket("recording-audio",{public:true})).error,
  "create local public audio bucket");
ok((await service.storage.createBucket("r0-private-backup",{public:false})).error,
  "create local private backup bucket");
ok((await service.storage.from("recording-audio").upload(objectPath,wave,{
  contentType:"audio/wav",upsert:false,cacheControl:"0"
})).error,"actual local PUBLIC Storage upload");
ok((await service.from("recordings").insert({
  id:recordingId,series_id:seriesId,episode_id:episodeId,reader_id:owner.id,
  is_public:true,audio_storage_path:publicUrl
})).error,"seed PUBLIC DB recording reference");
assert.equal((await row(anon)).length,1);checks.pass++;
assert.equal((await row(other.client)).length,1);checks.pass++;
let before=await publicRead(publicUrl);
assert.equal(before.status,200);
assert.equal(sha(before.bytes),expectedDigest);
checks.pass+=2;

// Real HTTP owner/other/anon RLS behavior; foreign and anon must not mutate.
const wrong=await other.client.from("series")
  .update({publication_status:"private"}).eq("id",seriesId).select("id");
assert.ok(wrong.error||wrong.data?.length===0,"non-owner must not mutate source");
checks.deny++;
const withoutSession=await anon.from("series")
  .update({publication_status:"private"}).eq("id",seriesId).select("id");
assert.ok(withoutSession.error||withoutSession.data?.length===0,
  "anonymous user must not mutate source");
checks.deny++;
assert.equal((await row(anon))[0].publication_status,"public");checks.pass++;

// Rating-only change is unsafe while PUBLIC URLs exist and must fail at DB.
const ratingOnly=await owner.client.from("series")
  .update({content_rating:"r18",content_warnings:["sexual_r18"]})
  .eq("id",seriesId).select("id");
assert.equal(ratingOnly.error?.code,"23514",
  "DB must reject unsafe PUBLIC-only R18 classification");
checks.deny++;

// Emergency owner action: a SINGLE real PostgREST UPDATE atomically hides
// the work and corrects rating. Existing PUBLIC bytes are NOT yet removed.
const emergency=await owner.client.from("series")
  .update({publication_status:"private",
    content_rating:"r18",content_warnings:["sexual_r18"]})
  .eq("id",seriesId).select("id,publication_status,content_rating,content_warnings");
ok(emergency.error,"atomic emergency private+R18 owner mutation");
assert.equal(emergency.data?.length,1);
assert.equal(emergency.data[0].publication_status,"private");
assert.equal(emergency.data[0].content_rating,"r18");
assert.ok(emergency.data[0].content_warnings.includes("sexual_r18"));
checks.pass+=4;
assert.equal((await row(anon)).length,0,"anon cannot see PRIVATE series");
assert.equal((await row(other.client)).length,0,"other cannot see PRIVATE series");
assert.equal((await row(owner.client)).length,1,"owner retains PRIVATE view");
checks.deny+=2;checks.pass++;
const stillPublic=await publicRead(publicUrl);
assert.equal(stillPublic.status,200,
  "real local public URL remains readable even after DB withdrawal");
assert.equal(sha(stillPublic.bytes),expectedDigest);
checks.pass+=2;

// Even privileged Storage writer must not create NEW PUBLIC media for
// a withdrawn source; the PostgreSQL trigger runs despite bypass-RLS.
const unsafe=await service.storage.from("recording-audio").upload(newPath,wave,{
  contentType:"audio/wav",upsert:false
});
deny(unsafe.error,"service-role PUBLIC upload after source withdrawn");
const republish=await owner.client.from("series")
  .update({publication_status:"public"}).eq("id",seriesId).select("id");
assert.equal(republish.error?.code,"23514",
  "old public media holds republish regardless of owner JWT");
checks.deny++;

// Copy with the REAL Storage API; a copy cannot revoke old public origin.
// Failed copy is non-destructive and must leave old media available.
const failedCopy=await service.storage.from("recording-audio").copy(
  "nemo/"+seriesId+"/"+episodeId+"/does-not-exist.wav",
  "owner/"+owner.id+"/"+id()+".wav",{destinationBucket:"r0-private-backup"});
deny(failedCopy.error,"nonexistent object copy is non-destructive");
assert.equal((await publicRead(publicUrl)).status,200);checks.pass++;
const copied=await service.storage.from("recording-audio").copy(objectPath,backupPath,{
  destinationBucket:"r0-private-backup"
});
ok(copied.error,"REAL Storage API cross-bucket PRIVATE backup copy");
// Owner-only PRIVATE read uses real local storage.objects RLS.
const saved=await owner.client.storage.from("r0-private-backup").download(backupPath);
ok(saved.error,"owner PRIVATE backup download");
assert.equal(sha(Buffer.from(await saved.data.arrayBuffer())),expectedDigest);
checks.pass++;
deny((await other.client.storage.from("r0-private-backup").download(backupPath)).error,
  "foreign PRIVATE backup read");
deny((await anon.storage.from("r0-private-backup").download(backupPath)).error,
  "anonymous PRIVATE backup read");
const wrongPublic=await publicRead(privatePublicUrl);
assert.notEqual(wrongPublic.status,200,"PRIVATE backup public URL must deny");
checks.deny++;
assert.equal((await publicRead(publicUrl)).status,200,
  "copy alone never revokes old PUBLIC URL");checks.pass++;

// A previously issued signed bearer (no token material logged) cannot
// resurrect a deleted origin in this LOCAL environment.
const signed=await service.storage.from("recording-audio")
  .createSignedUrl(objectPath,120);
ok(signed.error,"create LOCAL pre-retirement signed bearer");
assert.ok(signed.data?.signedUrl);
const oldSigned=new URL(signed.data.signedUrl,base);
assert.equal(oldSigned.origin,base);
assert.equal((await publicRead(oldSigned)).status,200);checks.pass++;

// Physical retirement via real Storage API, NEVER SQL DELETE storage.objects.
// Local responses do not establish hosted CDN propagation/browser erasure.
const deleted=await service.storage.from("recording-audio").remove([objectPath]);
ok(deleted.error,"REAL Storage API remove exactly one local PUBLIC object");
assert.equal(deleted.data?.length,1);
checks.pass++;
const noPublic=await publicRead(publicUrl);
assert.notEqual(noPublic.status,200,"old PUBLIC origin must no longer serve bytes");
const noSigned=await publicRead(oldSigned);
assert.notEqual(noSigned.status,200,"old signed bearer must not resurrect origin");
checks.deny+=2;
const backupAfter=await owner.client.storage.from("r0-private-backup").download(backupPath);
ok(backupAfter.error,"PRIVATE copy persists after PUBLIC removal");
assert.equal(sha(Buffer.from(await backupAfter.data.arrayBuffer())),expectedDigest);
checks.pass++;

// Unremoved historical DB URL reference still prevents publication.
const stillHeld=await owner.client.from("series")
  .update({publication_status:"public"}).eq("id",seriesId).select("id");
assert.equal(stillHeld.error?.code,"23514");
checks.deny++;
// Stop without republishing; this only models reference cleanup, and a
// real site must separately authorize provenance/rights-preserving edits.
ok((await service.from("recordings").delete().eq("id",recordingId)).error,
  "LOCAL synthetic reference cleanup");
const finalWork=(await row(owner.client))[0];
assert.equal(finalWork.publication_status,"private","never auto republish");
checks.pass++;
console.log("PASS: #137 REAL LOCAL GoTrue/PostgREST/Storage, "+
  checks.pass+" positive and "+checks.deny+" denied checks");
console.log("SAFE LIMIT: synthetic 64-byte WAV only; no hosted data; no CDN/browser "+
  "cache, production permissions, physical WORM or NEXT route E2E proven");
