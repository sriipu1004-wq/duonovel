// Issue #137 / PR #153: isolated source-bound writer boundary + real LOCAL Storage.
// This is a harness, NOT calling synthesis codecs or author endpoints. It imports
// the exact app guard, uses only disposable local credentials and synthetic media.
import assert from "node:assert/strict";
import {createHash, randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import * as boundaryModule from "../../src/lib/recording/publicMediaWriterBoundary.ts";
const {checkNonproductionMediaWriterBoundary}=boundaryModule.default??boundaryModule;
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const ep=new URL(process.env.B2_LOCAL_URL??"");
assert.equal(ep.protocol,"http:");
assert.ok(["localhost","127.0.0.1","[::1]"].includes(ep.hostname));
assert.ok(["54321","54331"].includes(ep.port));
assert.equal(ep.pathname,"/");assert.equal(ep.search,"");assert.equal(ep.hash,"");
const bridge=process.env.B2_NETWORK??"",dbid=process.env.B2_DB_CONTAINER??"";
assert.match(bridge,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(dbid,/^[a-f0-9]{12,64}$/);
assert.ok(execFileSync("docker",["ps","-q","--filter","network="+bridge],
 {encoding:"utf8",timeout:12000}).trim().split(/\s+/).includes(dbid));
const admin=process.env.B2_SERVICE_KEY,anon=process.env.B2_ANON_KEY;
assert.ok(admin&&anon&&admin!==anon);
const checksum=x=>createHash("sha256").update(x).digest("hex");
const uuid=()=>randomUUID();
function wav(){
 const b=Buffer.alloc(48);b.write("RIFF",0);b.writeUInt32LE(40,4);
 b.write("WAVEfmt ",8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);
 b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);
 b.writeUInt16LE(16,34);b.write("data",36);b.writeUInt32LE(4,40);
 b.writeInt16LE(40,44);b.writeInt16LE(-40,46);return b;
}
const audio=wav(),timing=Buffer.from('{"sample":"local-only","words":[]}');
const buckets={ai:"f2p-writer-sim-private-ai",human:"f2p-writer-sim-private-human"};
async function call(method,path,body,token=admin,type="application/json"){
 const headers={apikey:token,Authorization:"Bearer "+token};
 if(body!==undefined)headers["Content-Type"]=type;
 const response=await fetch(ep.origin+path,{method,headers,
  body:body===undefined?undefined:(type==="application/json"&&!Buffer.isBuffer(body))?JSON.stringify(body):body,
  cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
 return {status:response.status,bytes:Buffer.from(await response.arrayBuffer())};
}
const ok=r=>[200,201,204].includes(r.status);
let checks=0,networkWrites=0;
for(const b of Object.values(buckets)){
 const made=await call("POST","/storage/v1/bucket",{id:b,name:b,public:false});
 assert.ok(ok(made),"create disposable PRIVATE bucket "+b+" HTTP "+made.status);checks++;
 const get=await call("GET","/storage/v1/bucket/"+b);
 assert.ok(ok(get),"bucket metadata HTTP "+get.status);
 const meta=JSON.parse(get.bytes.toString("utf8"));
 assert.equal(meta.public,false,"bucket must be PRIVATE");checks++;
}
const cases=[
 {label:"Nemo",kind:"ai-recording",bucket:buckets.ai,items:[
   ["audio.wav",audio,"audio/wav"],["timing.json",timing,"application/json"]]},
 {label:"Aivis",kind:"ai-recording",bucket:buckets.ai,items:[
   ["audio.wav",audio,"audio/wav"],["timing.json",timing,"application/json"]]},
 {label:"Human",kind:"human-recording",bucket:buckets.human,items:[
   ["original.wav",audio,"audio/wav"],["playback.wav",audio,"audio/wav"],
   ["timing.json",timing,"application/json"]]},
];
const env={LIBREAD_F2P_MEDIA_WRITER_MODE:"preview-hold",VERCEL_ENV:"preview"};
for(const writer of cases){
 const root="writers/"+writer.label.toLowerCase()+"/"+uuid();
 const attemptedPublic="writer-hold/"+uuid()+"/"+writer.label.toLowerCase()+".wav";
 const publicPath="/storage/v1/object/public/recording-audio/"+attemptedPublic;
 let uploadCalled=false;
 // This is a simulated invocation using the app's EXACT guard, not actual
 // narrator/codec execution. A PUBLIC candidate must never invoke upload.
 const run=async(isPublic)=>{
  const result=checkNonproductionMediaWriterBoundary({
   kind:writer.kind,isPublicCandidate:isPublic,env});
  assert.equal(result.status,"PRIVATE_ONLY_UNCHANGED");
  uploadCalled=true;
  for(const [name,bytes,mime] of writer.items){
   const path=root+"/"+name;
   const uploaded=await call("POST","/storage/v1/object/"+writer.bucket+"/"+path,bytes,admin,mime);
   networkWrites++;
   assert.ok(ok(uploaded),writer.label+" PRIVATE "+name+" upload HTTP "+uploaded.status);
   checks++;
   const reply=await call("GET","/storage/v1/object/authenticated/"+
    writer.bucket+"/"+path);
   assert.equal(reply.status,200);
   assert.equal(checksum(reply.bytes),checksum(bytes),"PRIVATE byte digest mismatch");
   checks+=2;
   const denied=await call("GET","/storage/v1/object/public/"+writer.bucket+"/"+path,
     undefined,anon);
   assert.ok(denied.status>=400&&denied.status<500,
     "SECURITY FAIL: "+writer.label+" PRIVATE became anonymous");
   checks++;
  }
 };
 const before=networkWrites;
 await assert.rejects(run(true),/F2P_PREVIEW_PUBLIC_MEDIA_HOLD/);
 assert.equal(networkWrites,before,"PUBLIC candidate attempted PRIVATE write");
 assert.equal(uploadCalled,false,"PUBLIC candidate reached Storage upload");
 checks+=3;
 const missing=await call("GET",publicPath,undefined,anon);
 assert.ok(missing.status>=400&&missing.status<500,"PUBLIC bytes unexpectedly visible");
 checks++;
 await run(false);
 assert.ok(uploadCalled,writer.label+" PRIVATE branch should remain writable");
 checks++;
 // A failed subsequent PUBLIC decision must not delete existing PRIVATE bytes.
 uploadCalled=false;
 await assert.rejects(run(true),/F2P_PREVIEW_PUBLIC_MEDIA_HOLD/);
 assert.equal(uploadCalled,false,"revoked PUBLIC decision touched legacy PRIVATE data");
 const existing=await call("GET","/storage/v1/object/authenticated/"+
  writer.bucket+"/"+root+"/"+writer.items[0][0]);
 assert.ok(ok(existing)&&existing.bytes.equals(writer.items[0][1]),
  "PUBLIC hold damaged already-saved PRIVATE bytes");
 checks+=3;
 // Unexpected deployment configuration must fail, not downgrade the guard.
 assert.throws(()=>checkNonproductionMediaWriterBoundary({
   kind:writer.kind,isPublicCandidate:false,env:{
     LIBREAD_F2P_MEDIA_WRITER_MODE:"preview-hold",VERCEL_ENV:"production",
   }}),/F2P_PREVIEW_GUARD_WRONG_ENVIRONMENT/);
 checks++;
}
assert.equal(networkWrites,7,"Nemo(2)+Aivis(2)+Human(3) synthetic PRIVATE uploads");
console.log("PASS: F2-P "+checks+
 " REAL LOCAL guarded simulated Nemo/Aivis/Human public deny and private byte preservation; "+
 networkWrites+" PRIVATE Storage writes, ZERO PUBLIC Storage write calls");
console.log("SCOPE: exact app guard imported; synthetic transport only; no real synthesis, signed Human multipart, "+
 "deployed Preview flag or provider-wide privileged S3 enforcement tested");
