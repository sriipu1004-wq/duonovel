// Issue #137 disposable read-only integrity process; NOT a deployed endpoint.
// The process gets ONLY a user-scoped, server-provisioned auditor JWT + anon key.
// It cannot change Storage, receipt, published rights or release disposition.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
for(const name of ["B2_SERVICE_KEY","SUPABASE_SERVICE_ROLE_KEY",
 "SUPABASE_S3_ACCESS_KEY_ID","SUPABASE_S3_SECRET_ACCESS_KEY",
 "NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY"])
 assert.equal(process.env[name],undefined,"auditor must never have privileged app env: "+name);
const ep=new URL(process.env.B2_LOCAL_URL??"");
assert.ok(ep.protocol==="http:"&&["127.0.0.1","localhost"].includes(ep.hostname)&&
 ["54321","54331"].includes(ep.port)&&ep.pathname==="/"&&!ep.search&&!ep.hash);
const key=process.env.B2_ANON_KEY??"",jwt=process.env.B2_AUDITOR_JWT??"",
 ticket=process.env.B2_AUDIT_TICKET??"";
assert.ok(key.length>15&&jwt.length>30);
assert.match(ticket,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu);
const client=createClient(ep.origin,key,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 global:{headers:{Authorization:"Bearer "+jwt}}
});
try{
 const {data,error}=await client.rpc("issue137_http_local_auditor_receipt",{p_ticket:ticket});
 if(error||!data||data.bucket!=="f2p-http-privileged-worker-private"||
  typeof data.path!=="string"||
  !/^[a-f0-9]{64}$/u.test(data.expectedSha256??"")){
  console.log("HOLD: READONLY_AUDIT_DENIED_OR_NO_SEALED_RECEIPT");
  process.exitCode=4;
 }else{
  const response=await client.storage.from(data.bucket).download(data.path);
  if(response.error||!response.data){
   console.log("HOLD: READONLY_AUDIT_PRIVATE_FETCH_DENIED");
   process.exitCode=5;
  }else{
   const bytes=Buffer.from(await response.data.arrayBuffer());
   const digest=createHash("sha256").update(bytes).digest("hex");
   if(digest!==data.expectedSha256){
    console.log("HOLD: READONLY_AUDIT_PHYSICAL_SHA_MISMATCH");
    process.exitCode=3;
   }else{
    console.log("PASS: READONLY_AUDIT_PRIVATE_PHYSICAL_SHA_MATCH");
   }
  }
 }
}catch{
 console.log("HOLD: READONLY_AUDIT_PROVIDER_ERROR");
 process.exitCode=6;
}
