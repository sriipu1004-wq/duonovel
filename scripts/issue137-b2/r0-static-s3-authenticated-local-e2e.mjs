// #137: NONPRODUCTION only. Authenticated full-access static S3 SigV4
// against a TEMPORARY sibling Storage server on the CLI's disposable DB.
// First demonstrate real PRIVATE byte-backed success; a 403-only result is FAIL.
import assert from "node:assert/strict";
import {createHmac,createHash,randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.R0_EPHEMERAL_CONFIRM,"local-only");
for(const k of ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_DB_PASSWORD",
 "SUPABASE_ACCESS_TOKEN","AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY",
 "S3_SECRET_ACCESS_KEY"]){
 assert.equal(process.env[k],undefined,"no inherited hosted credential: "+k);
}
const apiUrl=new URL(process.env.R0_LOCAL_URL||"");
assert.equal(apiUrl.href,"http://127.0.0.1:54321/");
const staticUrl=new URL(process.env.R0_STATIC_S3_BASE||"");
assert.equal(staticUrl.href,"http://127.0.0.1:54333/");
const accessKey=process.env.R0_STATIC_S3_ACCESS_ID||"";
const secretKey=process.env.R0_STATIC_S3_SECRET||"";
assert.match(accessKey,/^[a-f0-9]{32}$/u);
assert.match(secretKey,/^[a-f0-9]{64}$/u);
const api=apiUrl.origin,base=staticUrl.origin;
const serviceKey=process.env.R0_SERVICE_KEY||"";
const anon=process.env.R0_ANON_KEY||"";
assert.ok(serviceKey.length>30&&anon.length>30&&anon!==serviceKey);
const service=createClient(api,serviceKey,{auth:{
 autoRefreshToken:false,persistSession:false,detectSessionInUrl:false
}});
const uuid=()=>randomUUID();
const sha=b=>createHash("sha256").update(b).digest("hex");
const hmac=(key,value)=>createHmac("sha256",key).update(value).digest();
const wave=Buffer.alloc(64);
wave.write("RIFF",0);wave.writeUInt32LE(56,4);wave.write("WAVE",8);
wave.write("fmt ",12);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);
wave.writeUInt16LE(1,22);wave.writeUInt32LE(8000,24);
wave.writeUInt32LE(16000,28);wave.writeUInt16LE(2,32);
wave.writeUInt16LE(16,34);wave.write("data",36);wave.writeUInt32LE(20,40);
const changed=Buffer.from(wave);changed.writeInt16LE(17,44);
let positive=0,negative=0;
function yes(condition,label){assert.ok(condition,label);positive++}
function denied(condition,label){assert.ok(condition,label);negative++}
function good(result,label){assert.equal(result.error,null,label)}
async function staticPut(bucket,key,bytes=wave,mime="audio/wav"){
 assert.match(bucket,/^[a-z0-9-]+$/u);
 assert.match(key,/^(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(?:wav|webm|m4a|json|bin|png)$/u);
 const endpoint=new URL("/s3/"+bucket+"/"+key,base);
 assert.equal(endpoint.origin,base);
 const stamp=new Date().toISOString().replace(/[:-]|\.\d{3}/gu,"");
 const day=stamp.slice(0,8),bodySha=sha(bytes);
 const headers={"content-type":mime,"host":endpoint.host,
  "x-amz-content-sha256":bodySha,"x-amz-date":stamp};
 const signedHeaders=Object.keys(headers).sort();
 const canonicalHeaders=signedHeaders.map(k=>k+":"+headers[k].trim()+"\n").join("");
 const canonicalRequest=["PUT",endpoint.pathname,"",canonicalHeaders,
  signedHeaders.join(";"),bodySha].join("\n");
 const scope=day+"/local/s3/aws4_request";
 const toSign=["AWS4-HMAC-SHA256",stamp,scope,sha(canonicalRequest)].join("\n");
 const signingKey=hmac(hmac(hmac(hmac("AWS4"+secretKey,day),"local"),"s3"),"aws4_request");
 const signature=createHmac("sha256",signingKey).update(toSign).digest("hex");
 const authorization="AWS4-HMAC-SHA256 Credential="+accessKey+"/"+scope+
  ", SignedHeaders="+signedHeaders.join(";")+", Signature="+signature;
 const response=await fetch(endpoint,{method:"PUT",
  headers:{...headers,authorization},body:bytes,redirect:"error",
  cache:"no-store",signal:AbortSignal.timeout(15000)});
 // For failed PRIVATE positive control ONLY: print the bounded S3 error
 // code (not the raw XML, request path, headers, signature or credentials).
 if(response.status>=400 && bucket==="r0-private-backup"){
  const raw=await response.text();
  const safeCode=/<Code>([A-Za-z0-9]{1,64})<\/Code>/u.exec(raw)?.[1]||"unknown";
  console.error("STATIC_S3_PRIVATE_CONTROL_REJECTED: status="+response.status+" code="+safeCode);
 }
 return response.status;
}
async function unreadable(bucket,key,label){
 const r=await service.storage.from(bucket).download(key);
 denied(Boolean(r.error),label);
}
async function byteMatch(bucket,key,expected,label){
 const r=await service.storage.from(bucket).download(key);
 good(r,label+" must remain physically readable");
 yes(sha(Buffer.from(await r.data.arrayBuffer()))===sha(expected),label);
}
const bk=await service.storage.getBucket("r0-private-backup");
good(bk,"local private backup bucket exists");
yes(bk.data.public===false,"control bucket is actually PRIVATE");
const control="static-control/"+uuid()+".wav";
const allowed=await staticPut("r0-private-backup",control);
yes([200,201].includes(allowed),
 "REAL static S3 authenticated PRIVATE positive PUT failed, status="+allowed);
await byteMatch("r0-private-backup",control,wave,
 "static S3 positive control preserved exact bytes through REST");

// F2-P disposable local ALL-PUBLIC freeze, after real positive static SigV4.
const freezeProbe=process.env.R0_FULL_PUBLIC_FREEZE_PROBE||"";
assert.ok(["","local-only"].includes(freezeProbe),"unapproved S3 mode");
if(freezeProbe==="local-only"){
 const synthetic=Buffer.from("LOCAL-SYNTHETIC-WAV-DISGUISED-MIME");
 for(const [bucket,name,mime] of [
  ["r0-freeze-public-alt","misc/"+uuid()+".bin","application/octet-stream"],
  ["bgm-library","catalog/"+uuid()+".bin","application/octet-stream"],
  ["illustrations","asset/"+uuid()+".png","image/png"]
 ]){
  const status=await staticPut(bucket,name,synthetic,mime);
  denied(status>=400,"full-access STATIC S3 must not write PUBLIC: "+bucket);
  await unreadable(bucket,name,"denied STATIC S3 PUBLIC bytes absent: "+bucket);
 }
 const privateName="static-control/"+uuid()+".wav";
 yes([200,201].includes(await staticPut("r0-private-backup",privateName)),
  "authenticated STATIC S3 retains PRIVATE write capability");
 await byteMatch("r0-private-backup",privateName,wave,
  "static S3 private control byte-backed after global freeze");
 console.log("PASS: #137 local fully authenticated STATIC S3 full PUBLIC "+
  "freeze "+positive+" positive / "+negative+" denied assertions");
 console.log("HOLD: managed Storage trigger local-only; BGM and image writes frozen");
 process.exit(0);
}

const owner=await service.auth.admin.createUser({
 email:"issue137-static-"+uuid()+"@example.invalid",
 password:"LOCAL-STATIC-"+uuid()+"Ab1!",email_confirm:true
});
good(owner,"isolated GoTrue test identity");
async function work(rating){
 const series=uuid(),episode=uuid();
 good(await service.from("series").insert({
  id:series,author_id:owner.data.user.id,publication_status:"public",
  recording_permission_mode:"open",content_rating:rating,
  content_warnings:rating==="r18"?["sexual_r18"]:[]
 }),"create local synthetic series");
 good(await service.from("episodes").insert({
  id:episode,series_id:series,episode_number:1,
  posting_status:"posted",is_published:true
 }),"create local synthetic episode");
 return {series,episode};
}
const r18=await work("r18");
const blockedR18="nemo/"+r18.series+"/"+r18.episode+"/static-denied.wav";
denied((await staticPut("recording-audio",blockedR18))>=400,
 "static full-access S3 must not publish R18 to PUBLIC");
await unreadable("recording-audio",blockedR18,"R18 denied bytes absent");
const privateAi="nemo/"+r18.series+"/"+r18.episode+"/private-static.wav";
yes([200,201].includes(await staticPut("r18-recording-audio",privateAi)),
 "static S3 can store legitimate PRIVATE AI object");
await byteMatch("r18-recording-audio",privateAi,wave,"PRIVATE AI bytes intact");

const alternate="r0-static-alternate-public";
good(await service.storage.createBucket(alternate,{public:true}),
 "create local alternate PUBLIC bucket");
const altKey="misplaced/"+uuid()+".wav";
denied((await staticPut(alternate,altKey))>=400,
 "static full-access S3 must not bypass alternate PUBLIC bucket guard");
await unreadable(alternate,altKey,"alternate PUBLIC audio bytes absent");

const general=await work("general");
const publicHuman="human/"+general.series+"/"+general.episode+"/"+
 owner.data.user.id+"/session-static/original.webm";
denied((await staticPut("recording-audio",publicHuman,
 Buffer.from("LOCAL-SYNTHETIC-PRIVATE-ONLY"),"audio/webm"))>=400,
 "GENERAL publication cannot permit a new PRIVATE Human original on PUBLIC");
await unreadable("recording-audio",publicHuman,"PUBLIC Human bytes absent");

const original="nemo/"+general.series+"/"+general.episode+"/static-original.wav";
yes([200,201].includes(await staticPut("recording-audio",original)),
 "static S3 must allow legitimate GENERAL public source");
await byteMatch("recording-audio",original,wave,"GENERAL public bytes intact");
good(await service.from("series").update({
 publication_status:"private",content_rating:"r18",
 content_warnings:["sexual_r18"]
}).eq("id",general.series),"emergency PRIVATE+R18");
denied((await staticPut("recording-audio",original,changed))>=400,
 "static S3 overwrite of withdrawn PUBLIC origin must fail");
const late="nemo/"+general.series+"/"+general.episode+"/static-late.wav";
denied((await staticPut("recording-audio",late,changed))>=400,
 "static S3 new PUBLIC object for withdrawn source must fail");
await unreadable("recording-audio",late,"withdrawn new PUBLIC bytes absent");
await byteMatch("recording-audio",original,wave,
 "withdrawn old PUBLIC bytes not overwritten (still reachable, retirement HOLD)");
console.log("PASS: #137 REAL isolated full-access STATIC S3 "+
 positive+" positive / "+negative+" denied assertions; "+
 "PRIVATE custody and PUBLIC guards enforced; old PUBLIC origin still requires retirement");
console.log("HOLD: hosted keys, provider parity, TUS, CDN, legacy bytes, rights and restore unverified");
