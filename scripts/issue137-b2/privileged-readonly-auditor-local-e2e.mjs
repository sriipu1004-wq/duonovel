// Issue #137: real disposable Supabase restricted auditor credential custody.
// Run AFTER privileged-http-boundary-local-e2e creates/seals synthetic receipts.
// All fixtures are localhost-only. No production or external credentials.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {execFileSync,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {readdirSync} from "node:fs";
import {createClient} from "@supabase/supabase-js";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const ep=new URL(process.env.B2_LOCAL_URL??"");
assert.ok(ep.protocol==="http:"&&["127.0.0.1","localhost"].includes(ep.hostname)&&
 ["54321","54331"].includes(ep.port)&&ep.pathname==="/"&&!ep.search&&!ep.hash);
const net=process.env.B2_NETWORK??"",db=process.env.B2_DB_CONTAINER??"";
assert.match(net,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(db,/^[a-f0-9]{12,64}$/);
assert.ok(execFileSync("docker",["ps","-q","--filter","network="+net],
 {encoding:"utf8",timeout:10000}).trim().split(/\s+/).includes(db));
const anon=process.env.B2_ANON_KEY??"",service=process.env.B2_SERVICE_KEY??"";
assert.ok(anon.length>15&&service.length>15&&anon!==service);
for(const k of ["SUPABASE_SERVICE_ROLE_KEY","NEXT_PUBLIC_SUPABASE_URL",
 "NEXT_PUBLIC_SUPABASE_ANON_KEY"])assert.equal(process.env[k],undefined);
const root=fileURLToPath(new URL("../../",import.meta.url));
assert.deepEqual(readdirSync(root).filter(s=>/^\.env(?:\.|$)/.test(s)&&
 !/\.(?:example|sample|template)$/.test(s)),[],"unexpected .env secret");
const script=fileURLToPath(new URL("./privileged-readonly-audit-process-local.mjs",import.meta.url));
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(ep.origin,service,options);
const uuid=()=>randomUUID();
const bucket="f2p-http-privileged-worker-private",table="issue137_http_local_tickets";
const sha=x=>createHash("sha256").update(x).digest("hex");
const sql=q=>execFileSync("docker",["exec",db,"psql","-X","-Atq","-U",
 "postgres","-d","postgres","-v","ON_ERROR_STOP=1","-c",q],{
 encoding:"utf8",timeout:15000}).trim();
let checks=0;
function check(cond,label){assert.ok(cond,label);checks++;}
async function user({app=false,spoof=false}={}){
 const email="readonly-local-"+uuid()+"@example.invalid";
 const password="Local-"+uuid()+"aA1!";
 const meta=app?{libread_local_auditor:true}:{};
 const created=await admin.auth.admin.createUser({
  email,password,email_confirm:true,app_metadata:meta,
  user_metadata:spoof?{libread_local_auditor:true}:{}
 });
 assert.equal(created.error,null,"local auditor user creation");
 const client=createClient(ep.origin,anon,options);
 const login=await client.auth.signInWithPassword({email,password});
 assert.equal(login.error,null,"GoTrue synthetic sign-in");
 const jwt=login.data.session?.access_token;
 check(typeof jwt==="string"&&jwt.length>30,"synthetic auditor JWT");
 return {id:created.data.user.id,client,jwt};
}
function isolatedAudit(actor,ticket){
 const env={
  PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,
  DO_NOT_CONTACT_PRODUCTION:"true",B2_EPHEMERAL_CONFIRM:"local-only",
  B2_LOCAL_URL:ep.origin+"/",B2_ANON_KEY:anon,
  B2_AUDITOR_JWT:actor.jwt,B2_AUDIT_TICKET:ticket
 };
 check(env.B2_SERVICE_KEY===undefined&&
  env.SUPABASE_SERVICE_ROLE_KEY===undefined,"auditor child has no project-wide admin key");
 const p=spawnSync(process.execPath,[script],{cwd:root,env,encoding:"utf8",
  timeout:20000,maxBuffer:8192});
 check(!p.error,"auditor child process launched");
 const combined=(p.stdout??"")+(p.stderr??"");
 check(!combined.includes(service)&&!combined.includes(actor.jwt),
  "no service_role or auditor JWT in local audit output");
 return {status:p.status,stdout:p.stdout??"",stderr:p.stderr??""};
}
async function bytesAt(path){
 const r=await admin.storage.from(bucket).download(path);
 assert.equal(r.error,null,"trusted test fixture Storage read");
 return Buffer.from(await r.data.arrayBuffer());
}
const sealed=await admin.from(table).select(
 "ticket,user_id,session_id,object_path,expected_sha256,state")
 .eq("state","SEALED_PRIVATE_SNAPSHOT");
assert.equal(sealed.error,null,"existing LOCAL durable receipts");
check(sealed.data.length>=2,"prior HTTP fixture produced multiple real sealed receipts");
let original;
for(const item of sealed.data){
 const count=sql("select count(*) from auth.sessions where id='"+
  item.session_id+"'::uuid and user_id='"+item.user_id+"'::uuid");
 if(count!=="0")continue;
 try{
  const raw=await bytesAt(item.object_path);
  if(sha(raw)===item.expected_sha256){original=item;break;}
 }catch{}
}
check(!!original,"a sealed PRIVATE receipt must outlive its original GoTrue session");
const auditor=await user({app:true}),impostor=await user({spoof:true}),
 unregistered=await user({app:true});
const insert=await admin.from("issue137_http_local_auditor_identities")
 .insert({user_id:auditor.id});
assert.equal(insert.error,null,"register synthetic auditor identity with local service role");
const denial=await auditor.client.from(table).select("ticket").eq("ticket",original.ticket);
check(!!denial.error,"auditor JWT cannot directly read sealed ledger table");
const rpcImpostor=await impostor.client.rpc("issue137_http_local_auditor_receipt",
 {p_ticket:original.ticket});
check(!rpcImpostor.error&&rpcImpostor.data===null,
 "user_metadata auditor spoof must not receive trusted receipt");
const rpcUnregistered=await unregistered.client.rpc(
 "issue137_http_local_auditor_receipt",{p_ticket:original.ticket});
check(!rpcUnregistered.error&&rpcUnregistered.data===null,
 "app_metadata alone without independently registered identity is insufficient");
const spoofRead=await impostor.client.storage.from(bucket).download(original.object_path);
check(!!spoofRead.error,"unregistered user cannot GET protected PRIVATE object");
const unregisteredRead=await unregistered.client.storage.from(bucket)
 .download(original.object_path);
check(!!unregisteredRead.error,"app_metadata-only actor cannot GET protected bytes");
const rpc=await auditor.client.rpc("issue137_http_local_auditor_receipt",
 {p_ticket:original.ticket});
check(!rpc.error&&rpc.data?.path===original.object_path&&
 rpc.data?.expectedSha256===original.expected_sha256,
 "restricted auditor can read scoped sealed receipt via RLS-backed RPC");
const direct=await auditor.client.storage.from(bucket).download(original.object_path);
check(!direct.error&&sha(Buffer.from(await direct.data.arrayBuffer()))===
 original.expected_sha256,"real provider authenticated PRIVATE GET for read-only auditor");
const fake=uuid(),nonsealed="owner/"+auditor.id+"/"+fake+".wav";
const data=Buffer.alloc(48);data.write("RIFF",0);data.write("WAVE",8);
const unwritten=await admin.storage.from(bucket).upload(nonsealed,data,{upsert:false});
assert.equal(unwritten.error,null,"trusted harness creates nonsealed PRIVATE object");
const deniedUnsealed=await auditor.client.storage.from(bucket).download(nonsealed);
check(!!deniedUnsealed.error,"auditor cannot read unsealed/unregistered object");
const deniedWrite=await auditor.client.storage.from(bucket)
 .upload("owner/"+auditor.id+"/"+uuid()+".wav",data,{upsert:false});
check(!!deniedWrite.error,"auditor JWT cannot INSERT Storage objects");
const altered=Buffer.alloc(48,0x23);altered.write("RIFF",0);altered.write("WAVE",8);
const deniedOverwrite=await auditor.client.storage.from(bucket)
 .upload(original.object_path,altered,{upsert:true});
check(!!deniedOverwrite.error,"auditor JWT cannot UPDATE/upsert sealed PRIVATE bytes");
const deniedRemove=await auditor.client.storage.from(bucket)
 .remove([original.object_path]);
check(!!deniedRemove.error,"auditor JWT cannot DELETE sealed PRIVATE bytes");
const match=isolatedAudit(auditor,original.ticket);
check(match.status===0&&match.stdout.includes("READONLY_AUDIT_PRIVATE_PHYSICAL_SHA_MATCH"),
 "dedicated no-admin auditor process confirms original SHA after owner logout");
const holdByMissing=isolatedAudit(impostor,original.ticket);
check(holdByMissing.status===4&&holdByMissing.stdout.includes("READONLY_AUDIT_DENIED"),
 "unregistered auditor child fails closed");
const overwrite=await admin.storage.from(bucket).upload(
 original.object_path,altered,{contentType:"audio/wav",upsert:true});
assert.equal(overwrite.error,null,"intentional alternate project service-role bypass");
check(sha(await bytesAt(original.object_path))!==original.expected_sha256,
 "actual provider physical bytes drifted while DB receipt remains unchanged");
const mismatch=isolatedAudit(auditor,original.ticket);
check(mismatch.status===3&&mismatch.stdout.includes(
 "READONLY_AUDIT_PHYSICAL_SHA_MISMATCH"),
 "independent no-admin auditor detects privileged post-seal physical overwrite");
const ledger=await admin.from(table).select("state,expected_sha256")
 .eq("ticket",original.ticket).single();
check(ledger.data?.state==="SEALED_PRIVATE_SNAPSHOT"&&
 ledger.data?.expected_sha256===original.expected_sha256,
 "mismatch detected without illicit ledger mutation; release remains HOLD");
const off=await auditor.client.auth.signOut({scope:"global"});
assert.equal(off.error,null,"real local auditor logout");
const oldId=JSON.parse(Buffer.from(auditor.jwt.split(".")[1],
 "base64url").toString()).session_id;
check(sql("select count(*) from auth.sessions where id='"+oldId+"'::uuid")==="0",
 "auditor GoTrue session is actually revoked");
const stale=isolatedAudit(auditor,original.ticket);
check(stale.status===4,"revoked auditor JWT denied by live session lookup");
const publicGet=await fetch(ep.origin+"/storage/v1/object/public/"+
 bucket+"/"+original.object_path,{
 headers:{apikey:anon},signal:AbortSignal.timeout(12000),redirect:"error"});
check(publicGet.status>=400,"PRIVATE audio remains inaccessible through public route");
console.log("PASS: F2-P REAL LOCAL independent read-only auditor "+checks+
 " checks: scoped JWT/registry/RLS, no admin key, owner-logout SHA MATCH, "+
 "service-role tamper MISMATCH HOLD, auditor revocation, no PUBLIC access");
console.log("RISK: independent project-wide service_role still overwrites PRIVATE "+
 "bytes; auditor only detects when invoked; trusted ledger assumed, "+
 "no scheduled monitor, prevention, production credential custody or WORM");
