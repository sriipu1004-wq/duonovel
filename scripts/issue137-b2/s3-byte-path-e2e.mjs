// F2-P actual S3-compatible localhost protocol; synthetic disposable data only.
import assert from "node:assert/strict";
import {createHash,createHmac,randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const ep=new URL(process.env.B2_LOCAL_URL||"");
assert.equal(ep.protocol,"http:");
assert.ok(["127.0.0.1","localhost","[::1]"].includes(ep.hostname));
assert.ok(["54321","54331"].includes(ep.port));
const network=process.env.B2_NETWORK||"",dbid=process.env.B2_DB_CONTAINER||"";
assert.match(network,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(dbid,/^[a-f0-9]{12,64}$/);
assert.ok(execFileSync("docker",["ps","-q","--filter","network="+network],{encoding:"utf8",timeout:10000}).trim().split(/\s+/).includes(dbid));
const anon=process.env.B2_ANON_KEY,admin=process.env.B2_SERVICE_KEY;
assert.ok(anon&&admin&&anon!==admin);
function db(sql){return execFileSync("docker",["exec",dbid,"psql","-X","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-At","-c",sql],{encoding:"utf8",timeout:14000,stdio:["ignore","pipe","pipe"]}).trim();}
async function api(method,path,body,type="application/json",upsert=false,token=admin){
 const headers={apikey:token,Authorization:"Bearer "+token};
 if(body!==undefined)headers["content-type"]=type;
 if(upsert)headers["x-upsert"]="true";
 const res=await fetch(ep.origin+path,{method,headers,body:body===undefined?undefined:type==="application/json"?JSON.stringify(body):body,signal:AbortSignal.timeout(20000)});
 return {status:res.status,bytes:Buffer.from(await res.arrayBuffer())};
}
const ok=r=>[200,201,204].includes(r.status),sha=x=>createHash("sha256").update(x).digest("hex"),hm=(k,x)=>createHmac("sha256",k).update(x).digest();
async function s3(method,bucket,key,body,contentType){
 const bytes=body===undefined?Buffer.alloc(0):Buffer.from(body);
 const path="/storage/v1/s3/"+encodeURIComponent(bucket)+"/"+key.split("/").map(encodeURIComponent).join("/");
 const time=new Date().toISOString().replace(/[:-]|\.\d{3}/g,"");
 const day=time.slice(0,8),scope=day+"/local/s3/aws4_request",hash=sha(bytes);
 const signed="host;x-amz-content-sha256;x-amz-date;x-amz-security-token";
 const canon="host:"+ep.host+"\n"+"x-amz-content-sha256:"+hash+"\n"+"x-amz-date:"+time+"\n"+"x-amz-security-token:"+admin+"\n";
 const request=method+"\n"+path+"\n\n"+canon+"\n"+signed+"\n"+hash;
 const toSign="AWS4-HMAC-SHA256\n"+time+"\n"+scope+"\n"+sha(request);
 const signing=hm(hm(hm(hm("AWS4"+anon,day),"local"),"s3"),"aws4_request");
 const signature=createHmac("sha256",signing).update(toSign).digest("hex");
 const headers={"x-amz-content-sha256":hash,"x-amz-date":time,"x-amz-security-token":admin,
 Authorization:"AWS4-HMAC-SHA256 Credential=stub/"+scope+", SignedHeaders="+signed+", Signature="+signature};
 if(contentType)headers["content-type"]=contentType;
 const res=await fetch(ep.origin+path,{method,headers,body:method==="PUT"?bytes:undefined,signal:AbortSignal.timeout(20000)});
 return {status:res.status,bytes:Buffer.from(await res.arrayBuffer())};
}
function wav(){
 const b=Buffer.alloc(48);b.write("RIFF",0);b.writeUInt32LE(40,4);b.write("WAVEfmt ",8);
 b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
 b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write("data",36);b.writeUInt32LE(4,40);b.writeInt16LE(200,44);b.writeInt16LE(-200,46);return b;
}
const privateBucket="f2p-s3-private",publicBucket="f2p-s3-public";
const privateKey="unknown/"+randomUUID()+"/synthetic.wav",probeKey="s3/"+randomUUID()+"/probe.txt";
const publicKey="misc/"+randomUUID()+"/opaque.txt";
for(const [id,visibility] of [[privateBucket,false],[publicBucket,true]]){
 const r=await api("POST","/storage/v1/bucket",{id,name:id,public:visibility});
 assert.ok(ok(r),"local bucket creation "+id+" HTTP "+r.status);
}
// Fail closed on protocol/signature unavailability. This is not a safe denial.
const probe=await s3("PUT",privateBucket,probeKey,"S3-SYNTHETIC-PROBE","text/plain");
assert.ok(ok(probe),"BLOCKED: local signed S3 PutObject unavailable HTTP "+probe.status);
const got=await s3("GET",privateBucket,probeKey);
assert.ok(ok(got)&&got.bytes.equals(Buffer.from("S3-SYNTHETIC-PROBE")),
 "BLOCKED: local signed S3 GetObject unavailable HTTP "+got.status);
console.log("PASS: F2-P actual LOCAL signed S3 PUT/GET roundtrip");
const prior=Buffer.from("SYNTHETIC-PRIVATE-ORIGINAL");
const seeded=await api("POST","/storage/v1/object/"+privateBucket+"/"+privateKey,prior,"audio/wav");
assert.ok(ok(seeded),"seed private source "+seeded.status);
// Test-only field-specific guard identical in scope to the candidate trigger.
db("create or replace function libread_internal.issue137_s3_test_stop() "+
 "returns trigger language plpgsql set search_path='' as $$ begin "+
 "raise exception using errcode='42501',message='B2_SYNTHETIC_METADATA_GUARD'; end $$; "+
 "create trigger zz_issue137_s3_test_stop before update of bucket_id,name,metadata "+
 "on storage.objects for each row when (new.bucket_id='f2p-s3-private') "+
 "execute function libread_internal.issue137_s3_test_stop()");
const restUp=await api("POST","/storage/v1/object/"+privateBucket+"/"+privateKey,
 Buffer.from("DENIED-REST"),"audio/wav",true);
assert.ok(restUp.status>=400,"TEST INVALID: REST metadata guard did not reject x-upsert");
const still=await api("GET","/storage/v1/object/authenticated/"+privateBucket+"/"+privateKey);
assert.ok(ok(still)&&still.bytes.equals(prior),"TEST INVALID: REST replaced guarded private bytes");
console.log("PASS: F2-P LOCAL REST x-upsert intercepted by metadata guard");
const audio=wav(),attempt=await s3("PUT",privateBucket,privateKey,audio,"audio/wav");
const after=await api("GET","/storage/v1/object/authenticated/"+privateBucket+"/"+privateKey);
assert.ok(ok(after),"private S3 overwrite verification unavailable HTTP "+after.status);
const changed=after.bytes.equals(audio),preserved=after.bytes.equals(prior);
assert.ok(changed||preserved,"S3 caused partial or unrecognized private byte state");
assert.equal(Number(db("select count(*) from storage.objects where bucket_id='f2p-s3-private'")),2);
if(changed){
 assert.ok(ok(attempt),"S3 modified bytes despite failure status");
 console.log("RISK: F2-P LOCAL S3 replaced PRIVATE bytes despite metadata guard");
}else{
 assert.ok(attempt.status>=400,"S3 claimed successful overwrite without byte change");
 console.log("PASS: F2-P LOCAL S3 refused guarded private overwrite with bytes unchanged");
}
const plain=Buffer.from("SYNTHETIC-PUBLIC-TEXT");
assert.ok(ok(await api("POST","/storage/v1/object/"+publicBucket+"/"+publicKey,plain,"text/plain")));
const disguised=await s3("PUT",publicBucket,publicKey,audio,"text/plain");
const visible=await api("GET","/storage/v1/object/public/"+publicBucket+"/"+publicKey,undefined,"application/json",false,anon);
if(ok(disguised)){
 assert.ok(ok(visible)&&visible.bytes.equals(audio),"S3 public disguise bytes mismatch");
 const mime=db("select coalesce(metadata->>'mimetype','') from storage.objects where bucket_id='f2p-s3-public'");
 console.log("RISK: F2-P LOCAL S3 public text MIME served valid synthetic WAV; stored_audio_mime="+mime.startsWith("audio/"));
}else{
 assert.ok(disguised.status>=400&&ok(visible)&&visible.bytes.equals(plain),
 "S3 public denial must preserve original bytes");
 console.log("PASS: F2-P LOCAL S3 public disguise PUT refused, original text retained");
}
console.log("SYNTHETIC ONLY: provider-direct byte writes, external S3 backend, CDN and Production untested");
