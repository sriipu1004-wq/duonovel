// Issue #137, disposable-only Storage public write freeze. NOT hosted.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {createClient} from "@supabase/supabase-js";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.R0_EPHEMERAL_CONFIRM,"local-only");
assert.equal(process.env.R0_LOCAL_URL,"http://127.0.0.1:54321");
for(const key of ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_DB_PASSWORD",
  "SUPABASE_ACCESS_TOKEN","AWS_SECRET_ACCESS_KEY","S3_SECRET_ACCESS_KEY"]){
 assert.equal(process.env[key],undefined,"hosted credentials forbidden");
}
const db=process.env.R0_LOCAL_DB_URL||"";
assert.match(db,/^postgresql:\/\/postgres:[^@]+@127[.]0[.]0[.]1:54322\/postgres$/u);
const key=process.env.R0_SERVICE_KEY||"",anon=process.env.R0_ANON_KEY||"";
assert.ok(key.length>30&&anon.length>30&&key!==anon);
const api=new URL(process.env.R0_LOCAL_URL).origin;
const s=createClient(api,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
const id=()=>randomUUID(),body=Buffer.from("LOCAL-SYNTHETIC-NONPRODUCTION-AUDIO");
const digest=b=>createHash("sha256").update(b).digest("hex");
const original="disguised/"+id()+".bin", next="disguised/"+id()+".bin";
const signedName="signed/"+id()+".bin", illustration="asset/"+id()+".png";
const publicBucket="r0-freeze-public-alt";
let positive=0,negative=0;
function ok(value,what){assert.ok(value,what);positive++}
function blocked(value,what){assert.ok(value,what);negative++}
function good(r,what){assert.equal(r.error,null,what+": "+String(r.error?.message||""))}
async function verify(bucket,name,bytes){
 const result=await s.storage.from(bucket).download(name);
 good(result,"read existing");
 ok(digest(Buffer.from(await result.data.arrayBuffer()))===digest(bytes),"bytes preserved");
}
async function absent(bucket,name){
 blocked(Boolean((await s.storage.from(bucket).download(name)).error),"no stored object: "+bucket);
}
async function publicBucketEnsure(name){
 const existing=await s.storage.getBucket(name);
 if(existing.error) good(await s.storage.createBucket(name,{public:true}),"local public bucket");
 else ok(existing.data?.public===true,"PUBLIC control bucket");
}
await publicBucketEnsure(publicBucket);
await publicBucketEnsure("bgm-library");
await publicBucketEnsure("illustrations");
const backup=await s.storage.getBucket("r0-private-backup");
if(backup.error){
 good(await s.storage.createBucket("r0-private-backup",{public:false}),
  "seed local PRIVATE static S3 byte-backed control bucket");
} else {
 ok(backup.data?.public===false,"existing PRIVATE static S3 control bucket");
}

good(await s.storage.from(publicBucket).upload(original,body,{
 contentType:"application/octet-stream",upsert:false,cacheControl:"0"
}),"BEFORE freeze, mislabeled PUBLIC bytes accepted by existing MIME/extension gate");
good(await s.storage.from("illustrations").upload(illustration,body,{
 contentType:"image/png",upsert:false,cacheControl:"0"
}),"BEFORE freeze, ordinary image write allowed");
const signed=await s.storage.from(publicBucket).createSignedUploadUrl(signedName);
good(signed,"pre-issued LOCAL PUBLIC signed upload");
ok(Boolean(signed.data?.token),"existing bearer minted");
const sql=fileURLToPath(new URL("./r0-full-public-write-freeze-local.sql",import.meta.url));
const install=spawnSync("psql",["-X",db,"-v","ON_ERROR_STOP=1","-f",sql],{
 encoding:"utf8",timeout:30000,
 env:{PATH:process.env.PATH,HOME:process.env.HOME,PGCONNECT_TIMEOUT:"8"}
});
ok(install.status===0&&install.stdout.includes(
 "ISSUE137_LOCAL_FULL_PUBLIC_WRITE_FREEZE_INSTALLED"),"LOCAL sentinel required for SQL install");
blocked(Boolean((await s.storage.from(publicBucket).upload(next,body,{
 contentType:"application/octet-stream",upsert:false
})).error),"service role PUBLIC disguised new bytes blocked");
await absent(publicBucket,next);
blocked(Boolean((await s.storage.from(publicBucket).update(original,Buffer.from("CHANGED"),{
 contentType:"application/octet-stream"
})).error),"service role cannot replace old PUBLIC bytes");
await verify(publicBucket,original,body);
blocked(Boolean((await s.storage.from(publicBucket).remove([original])).error),
 "service role cannot delete old PUBLIC bytes");
await verify(publicBucket,original,body);
blocked(Boolean((await s.storage.from("illustrations").upload(
 "asset/"+id()+".png",body,{contentType:"image/png"}
)).error),"legitimate PUBLIC illustration writes also blocked");
blocked(Boolean((await s.storage.from("bgm-library").upload(
 "audio/"+id()+".bin",body,{contentType:"application/octet-stream"}
)).error),"PUBLIC BGM writes also blocked");
await verify("illustrations",illustration,body);
blocked(Boolean((await s.storage.from(publicBucket).uploadToSignedUrl(
 signedName,signed.data.token,body,{contentType:"application/octet-stream"}
)).error),"previously signed PUBLIC upload cannot persist bytes");
await absent(publicBucket,signedName);
blocked(Boolean((await s.storage.createBucket("r0-new-public-"+id(),{
 public:true
})).error),"new PUBLIC bucket creation blocked");
const priv="r0-private-"+id();
good(await s.storage.createBucket(priv,{public:false}),"PRIVATE bucket creation retained");
blocked(Boolean((await s.storage.updateBucket(priv,{public:true})).error),
 "cannot flip empty PRIVATE bucket to PUBLIC");
const p=await s.storage.getBucket(priv);
good(p,"private bucket remains present");
ok(p.data.public===false,"private visibility preserved");
const privatePath="nemo/"+id()+".wav";
good(await s.storage.from("r18-recording-audio").upload(privatePath,body,{
 contentType:"audio/wav",upsert:false
}),"new PRIVATE bytes remain writable");
await verify("r18-recording-audio",privatePath,body);
await verify(publicBucket,original,body);
console.log("PASS: #137 LOCAL full PUBLIC freeze service_role REST/signed "+
 positive+" positive / "+negative+" denied; old GET and PRIVATE writes intact");
console.log("HOLD: provider-managed schema unsupported; benign BGM/image writes frozen; hosted S3, CDN, rights and rollback unverified");
