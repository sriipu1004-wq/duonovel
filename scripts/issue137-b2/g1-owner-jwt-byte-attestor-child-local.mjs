// Issue #137 G2: disposable NO-ADMIN physical SHA attestor process.
// NEVER deploy as a trusted attestor: this uses the narrator's own GoTrue JWT.
// This child has no DB role, Docker socket, project-wide service-role or S3 key.
// Stage policy and current auth.session/consent/R18 are enforced by actual Storage RLS.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createClient} from "@supabase/supabase-js";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
for(const key of ["B2_SERVICE_KEY","SUPABASE_SERVICE_ROLE_KEY",
 "B2_DB_CONTAINER","B2_NETWORK","PGPASSWORD","DATABASE_URL",
 "NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY"])
 assert.equal(process.env[key],undefined,"privileged env forbidden: "+key);
const ep=new URL(process.env.B2_LOCAL_URL??"");
assert.ok(ep.protocol==="http:"&&["127.0.0.1","localhost"].includes(ep.hostname)&&
 ["54321","54331"].includes(ep.port)&&ep.pathname==="/"&&!ep.search&&!ep.hash);
const anon=process.env.B2_ANON_KEY??"",jwt=process.env.B2_G1_ATTESTOR_JWT??"";
const path=process.env.B2_G1_ATTESTOR_PATH??"";
const expected=process.env.B2_G1_ATTESTOR_SHA256??"";
const size=Number(process.env.B2_G1_ATTESTOR_BYTES??"0");
const uuid="[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
assert.ok(anon.length>15&&jwt.length>30&&anon!==jwt);
assert.ok(new RegExp("^owner/"+uuid+"/series/"+uuid+"/episode/"+uuid+"/"+uuid+"\\.wav$","iu").test(path));
assert.match(expected,/^[a-f0-9]{64}$/u);
assert.ok(Number.isSafeInteger(size)&&size>=44&&size<=16*1024*1024);
const client=createClient(ep.origin,anon,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 global:{headers:{Authorization:"Bearer "+jwt}}
});
try {
 // This call is NOT an independent worker identity. It validates the user JWT;
 // Storage RLS independently checks current GoTrue session and lease.
 const auth=await client.auth.getUser(jwt);
 if(auth.error||!auth.data.user)throw Error("ACTOR_HOLD");
 const res=await client.storage.from("f2p-tus-app-authority-local").download(path);
 if(res.error||!res.data)throw Error("STORAGE_RLS_HOLD");
 const bytes=Buffer.from(await res.data.arrayBuffer());
 const sha=createHash("sha256").update(bytes).digest("hex");
 if(bytes.length!==size||sha!==expected)throw Error("PHYSICAL_SHA_HOLD");
 process.stdout.write(JSON.stringify({ok:true,sha256:sha,bytes:bytes.length})+"\n");
}catch{
 process.stdout.write(JSON.stringify({ok:false,reason:"NO_ADMIN_ATTESTATION_HOLD"})+"\n");
 process.exitCode=4;
}
