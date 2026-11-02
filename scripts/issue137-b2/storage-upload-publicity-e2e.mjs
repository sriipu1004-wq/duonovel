// F2-P: ACTUAL disposable local Storage HTTP upload/upsert vs bucket PUT.
// Test-only PostgreSQL triggers create a provable race; never contact hosted.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {setTimeout as sleep} from "node:timers/promises";
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const url=new URL(process.env.B2_LOCAL_URL||"");
assert.equal(url.protocol,"http:");
assert.ok(["127.0.0.1","localhost","[::1]"].includes(url.hostname));
assert.ok(["54321","54331"].includes(url.port));
const net=process.env.B2_NETWORK||"",container=process.env.B2_DB_CONTAINER||"";
assert.match(net,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(container,/^[a-f0-9]{12,64}$/);
const members=execFileSync("docker",["ps","-q","--filter","network="+net],
 {encoding:"utf8",timeout:10000}).trim().split(/\s+/);
assert.ok(members.includes(container),"DB not on the isolated network");
const admin=process.env.B2_SERVICE_KEY,anon=process.env.B2_ANON_KEY;
assert.ok(admin&&anon&&admin!==anon);
function db(sql){
 return execFileSync("docker",["exec",container,"psql","-X","-U","postgres","-d","postgres",
  "-v","ON_ERROR_STOP=1","-At","-c",sql],{
  encoding:"utf8",timeout:12000,stdio:["ignore","pipe","pipe"]}).trim();
}
async function api(method,path,{body,type="application/json",token=admin,upsert=false}={}){
 const headers={apikey:token,Authorization:"Bearer "+token};
 if(body!==undefined)headers["Content-Type"]=type;
 if(upsert)headers["x-upsert"]="true";
 const response=await fetch(url.origin+path,{
  method,headers,body:body===undefined?undefined:
   type==="application/json"?JSON.stringify(body):body,
  signal:AbortSignal.timeout(24000)});
 return {status:response.status,body:await response.text()};
}
function safeCode(x){
 try{const j=JSON.parse(x.body);return String(j.errorCode??j.code??j.error??"none")
  .replace(/[^A-Za-z0-9_-]/g,"").slice(0,48);}catch{return "unparsed";}
}
function success(x,label){assert.ok([200,201,204].includes(x.status),
 label+": HTTP "+x.status+" code="+safeCode(x));}
function denied(x,label){assert.ok(x.status>=400&&x.status<500,label+": expected 4xx, got "+x.status);}
async function onSleep(label){
 for(let i=0;i<75;i++){
  const count=Number(db("select count(*) from pg_stat_activity "+
   "where datname=current_database() and wait_event='PgSleep' and pid<>pg_backend_pid()"));
  if(count>0)return;
  await sleep(100);
 }
 assert.fail(label+": no real PostgreSQL PgSleep observed, concurrency unproven");
}
function flag(id){
 const s=db("select public from storage.buckets where id='"+id+"'");
 assert.ok(["t","f"].includes(s),"no local bucket");return s;
}
function count(id){return Number(db("select count(*) from storage.objects where bucket_id='"+id+"'"));}
const uploadFirst="f2p-api-upload-first";
const overwriteFirst="f2p-api-overwrite-first";
const bucketFirst="f2p-api-bucket-first";
const filename="unknown/"+randomUUID()+"/"+randomUUID()+"/synthetic.wav";
const object=(id)=>"/storage/v1/object/"+id+"/"+filename;
const publicObject=(id)=>"/storage/v1/object/public/"+id+"/"+filename;
const bucketPath=(id)=>"/storage/v1/bucket/"+id;
const upload=(id,body,upsert=false)=>api("POST",object(id),{body,type:"audio/wav",upsert});
const promote=(id)=>api("PUT",bucketPath(id),{body:{public:true}});
for(const id of [uploadFirst,overwriteFirst,bucketFirst])
 success(await api("POST","/storage/v1/bucket",{body:{id,name:id,public:false}}),"make "+id);
success(await upload(overwriteFirst,"ORIGINAL-SYNTHETIC"),"seed upsert object");
assert.equal(count(overwriteFirst),1);
// Only test-owned local triggers; candidate production SQL is NOT changed.
const testSql=[
 "create or replace function libread_internal.issue137_f2p_test_pause()",
 "returns trigger language plpgsql set search_path='' as $$",
 "begin perform pg_sleep(2.5); return new; end; "+String.fromCharCode(36,36)+";",
 "create trigger zz_issue137_f2p_api_insert_pause",
 "after insert on storage.objects for each row",
 "when (new.bucket_id='f2p-api-upload-first')",
 "execute function libread_internal.issue137_f2p_test_pause();",
 "create trigger zz_issue137_f2p_api_upsert_pause",
 "after update of metadata on storage.objects for each row",
 "when (new.bucket_id='f2p-api-overwrite-first')",
 "execute function libread_internal.issue137_f2p_test_pause();",
 "create trigger zz_issue137_f2p_api_bucket_pause",
 "after update of public on storage.buckets for each row",
 "when (new.id='f2p-api-bucket-first')",
 "execute function libread_internal.issue137_f2p_test_pause();"
].join("\n");
db(testSql);
// Direction A: actual Storage POST first, after metadata insert it sleeps.
// Concurrent actual bucket PUT must wait and reject existing private bytes.
const inserting=upload(uploadFirst,"INSERTED-SYNTHETIC");
await onSleep("Storage POST INSERT");
const promotingAfterInsert=promote(uploadFirst);
const [inserted,promotionDenied]=await Promise.all([inserting,promotingAfterInsert]);
console.log("F2-P upload-first real Storage API statuses POST="+inserted.status+
 " code="+safeCode(inserted)+" bucketPUT="+promotionDenied.status+
 " code="+safeCode(promotionDenied));
const uploadCommitted=[200,201,204].includes(inserted.status);
const bucketPromoted=[200,201,204].includes(promotionDenied.status);
assert.notEqual(uploadCommitted,bucketPromoted,
 "overlapping Storage requests must have exactly one allowed committed outcome");
if(uploadCommitted){
 denied(promotionDenied,"publicity must reject committed new private audio");
 assert.equal(flag(uploadFirst),"f");assert.equal(count(uploadFirst),1);
 console.log("PASS: F2-P actual LOCAL Storage POST first, bucket PUT denied; bytes PRIVATE");
}else{
 denied(inserted,"new audio must be denied if competing bucket publicity wins");
 success(promotionDenied,"empty bucket allowed to become PUBLIC");
 assert.equal(flag(uploadFirst),"t");assert.equal(count(uploadFirst),0);
 console.log("PASS: F2-P actual LOCAL bucket publicity first, overlapping POST denied; zero objects");
}
assert.notEqual((await api("GET",publicObject(uploadFirst),{token:anon})).status,200,
 "concurrent operations must never expose audio at public Storage URL");
// Direction B: actual bucket PUT first, after bucket row update sleeps.
// Subsequent actual Storage audio POST must see PUBLIC and reject.
const promotingFirst=promote(bucketFirst);
await onSleep("Storage bucket PUT UPDATE");
const insertingAfterPromotion=upload(bucketFirst,"DENIED-SYNTHETIC");
const [promotionOK,insertionDenied]=await Promise.all([promotingFirst,insertingAfterPromotion]);
success(promotionOK,"promote empty bucket by Storage PUT");
denied(insertionDenied,"Storage POST against concurrently promoted PUBLIC bucket");
assert.equal(flag(bucketFirst),"t");assert.equal(count(bucketFirst),0);
assert.notEqual((await api("GET",publicObject(bucketFirst),{token:anon})).status,200);
console.log("PASS: F2-P actual LOCAL Storage bucket PUT first / concurrent audio POST denied");
// Direction C: Storage x-upsert same path. This MUST exercise metadata UPDATE
// and return exact replacement bytes or the claim of protection is invalid.
const overwriting=upload(overwriteFirst,"REPLACED-SYNTHETIC",true);
await onSleep("Storage x-upsert metadata UPDATE");
const promotingAfterOverwrite=promote(overwriteFirst);
const [overwritten,promoteDenied]=await Promise.all([overwriting,promotingAfterOverwrite]);
success(overwritten,"actual local Storage x-upsert");
denied(promoteDenied,"concurrent publicity after Storage overwrite");
assert.equal(flag(overwriteFirst),"f");assert.equal(count(overwriteFirst),1);
const download=await api("GET","/storage/v1/object/authenticated/"+overwriteFirst+"/"+filename);
success(download,"authenticated service-role private download");
assert.equal(download.body,"REPLACED-SYNTHETIC","replacement bytes must be real");
console.log("PASS: F2-P actual LOCAL Storage x-upsert / bucket PUT denied, exact bytes replaced");
console.log("SYNTHETIC ONLY: real LOCAL Storage HTTP, not hosted data/CDN or byte-only provider bypass");
