// #137: REAL SigV4 S3 protocol against an EXCLUSIVELY disposable local
// Supabase GoTrue/Postgres/Storage stack. Never contact hosted S3 or buckets.
// A service-role JWT is a local S3 session token: privileges bypass RLS,
// hence the actual PG Storage triggers must block public-media writes.
import assert from "node:assert/strict";
import {createHash,createHmac,randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.R0_EPHEMERAL_CONFIRM,"local-only");
for(const name of ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_DB_PASSWORD",
 "SUPABASE_ACCESS_TOKEN","AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY",
 "S3_SECRET_ACCESS_KEY"]){
 assert.equal(process.env[name],undefined,"inherited hosted credential "+name);
}
const url=new URL(process.env.R0_LOCAL_URL||"");
assert.equal(url.protocol,"http:");
assert.ok(["127.0.0.1","localhost","[::1]"].includes(url.hostname));
assert.ok(["54321","54331"].includes(url.port));
assert.equal(url.pathname,"/");assert.equal(url.search,"");assert.equal(url.hash,"");
const api=url.origin,anon=process.env.R0_ANON_KEY||"",
  serviceKey=process.env.R0_SERVICE_KEY||"";
assert.ok(anon.length>15&&serviceKey.length>15&&anon!==serviceKey);
const service=createClient(api,serviceKey,{auth:{
 persistSession:false,autoRefreshToken:false,detectSessionInUrl:false
}});
const id=()=>randomUUID();
const hash=b=>createHash("sha256").update(b).digest("hex");
const hmac=(key,value)=>createHmac("sha256",key).update(value).digest();
const wave=Buffer.alloc(64);
wave.write("RIFF",0);wave.writeUInt32LE(56,4);wave.write("WAVE",8);
wave.write("fmt ",12);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);
wave.writeUInt16LE(1,22);wave.writeUInt32LE(8000,24);
wave.writeUInt32LE(16000,28);wave.writeUInt16LE(2,32);
wave.writeUInt16LE(16,34);wave.write("data",36);wave.writeUInt32LE(20,40);
const changed=Buffer.from(wave);changed.writeInt16LE(11,44);
let passed=0,denied=0;
function yes(ok,label){assert.ok(ok,label);passed++;}
function no(ok,label){assert.ok(ok,label);denied++;}
function signer(token){
 assert.ok([serviceKey,anon].includes(token));
 return async (method,bucket,objectKey,bytes=wave)=>{
  assert.ok(/^[a-z0-9_-]+$/u.test(bucket));
  assert.ok(/^(?:[a-z0-9-]+\/)*[a-z0-9-]+[.](?:wav|m4a)$/u.test(objectKey));
  const resource="/storage/v1/s3/"+bucket+"/"+objectKey;
  const endpoint=new URL(resource,api);
  assert.equal(endpoint.origin,api);
  const time=new Date().toISOString().replace(/[:-]|\.\d{3}/gu,"");
  const day=time.slice(0,8),payloadHash=hash(bytes);
  const headers={
   "content-type":"audio/wav",
   "host":endpoint.host,
   "x-amz-content-sha256":payloadHash,
   "x-amz-date":time,
   "x-amz-security-token":token
  };
  const keys=Object.keys(headers).sort();
  const canon=keys.map(k=>k+":"+headers[k].trim()+"\n").join("");
  const signed=keys.join(";");
  const request=[method,endpoint.pathname,"",canon,signed,payloadHash].join("\n");
  const scope=day+"/local/s3/aws4_request";
  const signature=hash(request);
  const stringToSign=["AWS4-HMAC-SHA256",time,scope,signature].join("\n");
  const signingKey=hmac(hmac(hmac(hmac("AWS4"+anon,day),"local"),"s3"),"aws4_request");
  const signatureHex=createHmac("sha256",signingKey).update(stringToSign).digest("hex");
  const authorization="AWS4-HMAC-SHA256 Credential=stub/"+scope+
    ", SignedHeaders="+signed+", Signature="+signatureHex;
  const response=await fetch(endpoint,{
   method,headers:{...headers,authorization},
   body:bytes,redirect:"error",cache:"no-store",
   signal:AbortSignal.timeout(15000)
  });
  const raw=await response.text();
  // Never echo keys, signed tokens, full S3 headers or provider error dumps.
  const code=/<Code>([^<]{1,100})<\/Code>/u.exec(raw)?.[1]||"none";
  return {status:response.status,code};
 };
}
const putPrivileged=signer(serviceKey),putAnonymous=signer(anon);
async function insert(table,row,label){
 const {error}=await service.from(table).insert(row);
 assert.equal(error,null,label+": "+String(error?.code||""));
}
const owner=(await service.auth.admin.createUser({
 email:"r0-s3-"+id()+"@example.invalid",
 password:"Synthetic-S3-"+id()+"aA9!",email_confirm:true
}));
assert.equal(owner.error,null,"seed synthetic GoTrue owner");
async function work(rating){
 const series=id(),episode=id();
 await insert("series",{id:series,author_id:owner.data.user.id,
   publication_status:"public",recording_permission_mode:"open",
   content_rating:rating,
   content_warnings:rating==="r18"?["sexual_r18"]:[]},
   "insert synthetic local work");
 await insert("episodes",{id:episode,series_id:series,
   episode_number:1,posting_status:"posted",is_published:true},
   "insert synthetic local episode");
 return {series,episode};
}
const controlBucket="r0-private-backup",controlKey="s3-control/"+id()+".wav";
const control=await putPrivileged("PUT",controlBucket,controlKey);
yes([200,201].includes(control.status),
  "ACTUAL signed privileged S3 PUT to private fixture must succeed (not only REST), status="+control.status+" code="+control.code);
const controlRead=await service.storage.from(controlBucket).download(controlKey);
yes(!controlRead.error&&hash(Buffer.from(await controlRead.data.arrayBuffer()))===hash(wave),
  "S3->REST interop preserved real local bytes");
const r18=await work("r18"),r18Path="nemo/"+r18.series+"/"+r18.episode+"/forbidden.wav";
const r18Put=await putPrivileged("PUT","recording-audio",r18Path);
no(r18Put.status>=400,
  "SERVICE_ROLE_S3_BYPASS: protected R18 public audio MUST be denied");
const r18Absent=await service.storage.from("recording-audio").download(r18Path);
no(Boolean(r18Absent.error),"denied privileged S3 PUT must not persist public bytes");
const anonPrivate=await putAnonymous("PUT","r18-recording-audio",
 "nemo/"+r18.series+"/"+r18.episode+"/anon.wav");
no(anonPrivate.status>=400,"anonymous S3 must not write R18 private audio");
const privatePath="nemo/"+r18.series+"/"+r18.episode+"/valid.wav";
const privatePut=await putPrivileged("PUT","r18-recording-audio",privatePath);
yes([200,201].includes(privatePut.status),
  "SERVICE_ROLE S3 path must permit staging exact physically PRIVATE AI bytes");
const privateRead=await service.storage.from("r18-recording-audio").download(privatePath);
yes(!privateRead.error&&hash(Buffer.from(await privateRead.data.arrayBuffer()))===hash(wave),
 "privileged S3 private bytes must be real and readable over local REST");
const altBucket="r0-s3-alternate-public";
const created=await service.storage.createBucket(altBucket,{public:true});
assert.equal(created.error,null,"create synthetic local alternative public bucket");
const altPut=await putPrivileged("PUT",altBucket,"misplaced/"+id()+".wav");
no(altPut.status>=400,
 "SERVICE_ROLE S3 cannot evade R18 guard through alternative public audio bucket");
const general=await work("general"),original="nemo/"+general.series+"/"+general.episode+"/original.wav";
const generalPut=await putPrivileged("PUT","recording-audio",original);
yes([200,201].includes(generalPut.status),
  "signed S3 must permit ordinary general-public audio before withdrawal");
const old=await fetch(api+"/storage/v1/object/public/recording-audio/"+original,
 {cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000)});
yes(old.status===200&&hash(Buffer.from(await old.arrayBuffer()))===hash(wave),
 "public general audio origin contains first-write bytes");
const withdraw=await service.from("series").update({
 publication_status:"private",content_rating:"r18",
 content_warnings:["sexual_r18"]
}).eq("id",general.series).select("id");
yes(!withdraw.error&&withdraw.data?.length===1,
 "emergency PRIVATE+R18 change commits while old S3 object exists");
const [replayA,replayB]=await Promise.all([
 putPrivileged("PUT","recording-audio",original,changed),
 putPrivileged("PUT","recording-audio",original,changed)
]);
no(replayA.status>=400&&replayB.status>=400,
 "parallel privileged S3 overwrite attempts after withdrawal MUST both fail");
const oldAfter=await fetch(api+"/storage/v1/object/public/recording-audio/"+original,
 {cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000)});
yes(oldAfter.status===200&&hash(Buffer.from(await oldAfter.arrayBuffer()))===hash(wave),
 "denied privileged S3 overwrite preserved old PUBLIC bytes (but URL remains live)");
const newPublic=await putPrivileged("PUT","recording-audio",
 "nemo/"+general.series+"/"+general.episode+"/new.wav",changed);
no(newPublic.status>=400,
 "privileged S3 cannot insert another public object for withdrawn PRIVATE work");
console.log("PASS: #137 ACTUAL local SigV4 S3 service-role session, "+
 passed+" positive / "+denied+" denied; private/public provenance, alternate bucket, parallel overwrite");
console.log("HOLD: service_role S3 bypasses RLS; this proves only local DB-trigger fencing, not remote keys, direct backend, multipart/TUS, CDN, WORM or rights");
