// Issue #137: disposable-only FULL PUBLIC freeze against REAL TUS session
// using a genuine synthetic local service-role credential. Never hosted.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.R0_EPHEMERAL_CONFIRM,"local-only");
assert.equal(process.env.R0_LOCAL_URL,"http://127.0.0.1:54321");
for(const name of ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_ACCESS_TOKEN",
 "AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY","S3_SECRET_ACCESS_KEY"]){
 assert.equal(process.env[name],undefined,"hosted credential prohibited");
}
const base=new URL(process.env.R0_LOCAL_URL).origin,key=process.env.R0_SERVICE_KEY||"";
const anon=process.env.R0_ANON_KEY||"";
assert.ok(key.length>30&&anon.length>30&&key!==anon);
const s=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const id=()=>randomUUID(),bytes=Buffer.from("LOCAL-SYNTHETIC-TUS-CONTROL");
const sha=b=>createHash("sha256").update(b).digest("hex");
const headers={Authorization:"Bearer "+key,apikey:anon,"Tus-Resumable":"1.0.0"};
async function push(bucket,name){
 const metadata=[["bucketName",bucket],["objectName",name],
  ["contentType","application/octet-stream"]].map(([k,v])=>
  k+" "+Buffer.from(v,"utf8").toString("base64")).join(",");
 const start=await fetch(base+"/storage/v1/upload/resumable",{
  method:"POST",cache:"no-store",redirect:"error",
  headers:{...headers,"Upload-Length":String(bytes.length),
   "Upload-Metadata":metadata},
  signal:AbortSignal.timeout(15000)
 });
 if(start.status>=400)return start.status;
 assert.equal(start.status,201,"session must be created, not mistaken for a deny");
 const where=start.headers.get("location");
 assert.ok(where,"TUS location missing");
 const dest=new URL(where,base);
 assert.equal(dest.origin,base);
 assert.ok(dest.pathname.startsWith("/storage/v1/upload/resumable"));
 const finish=await fetch(dest,{
  method:"PATCH",cache:"no-store",redirect:"error",
  headers:{...headers,"Content-Type":"application/offset+octet-stream",
   "Upload-Offset":"0"},body:bytes,signal:AbortSignal.timeout(15000)
 });
 return finish.status;
}
const privateKey="tus/"+id()+".bin";
const privateStatus=await push("r18-recording-audio",privateKey);
assert.ok([200,204].includes(privateStatus),
 "LOCAL privileged TUS PRIVATE positive control failed status="+privateStatus);
const control=await s.storage.from("r18-recording-audio").download(privateKey);
assert.equal(control.error,null,"PRIVATE TUS byte-backed GET");
assert.equal(sha(Buffer.from(await control.data.arrayBuffer())),sha(bytes));
const publicKey="misc/"+id()+".bin";
const denyStatus=await push("r0-freeze-public-alt",publicKey);
assert.ok(denyStatus>=400,"privileged TUS cannot commit disguised PUBLIC bytes");
const absent=await s.storage.from("r0-freeze-public-alt").download(publicKey);
assert.ok(absent.error,"denied TUS PUBLIC bytes must be absent");
console.log("PASS: #137 local privileged TUS PRIVATE positive / disguised PUBLIC denied with no bytes");
console.log("HOLD: hosted TUS, generated signed URLs, CDN and Storage provider parity unverified");
