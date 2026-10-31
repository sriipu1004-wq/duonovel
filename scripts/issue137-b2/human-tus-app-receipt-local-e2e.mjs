// #137 REAL disposable Supabase TUS -> physical PRIVATE SHA -> durable PG CAS.
// It proves a point-in-time snapshot ONLY. This is not a browser/API publisher
// or proof that other service_role/S3 writers cannot mutate bytes afterward.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {execFileSync,execFile} from "node:child_process";
import {promisify} from "node:util";
import {createClient} from "@supabase/supabase-js";
const asyncExecFile=promisify(execFile);
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const target=new URL(process.env.B2_LOCAL_URL??"");
assert.equal(target.protocol,"http:");
assert.ok(["127.0.0.1","localhost"].includes(target.hostname));
assert.ok(["54321","54331"].includes(target.port));
assert.equal(target.pathname,"/");
assert.equal(target.search,"");
assert.equal(target.hash,"");
const network=process.env.B2_NETWORK??"",database=process.env.B2_DB_CONTAINER??"";
assert.match(network,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(database,/^[a-f0-9]{12,64}$/);
const ids=execFileSync("docker",["ps","-q","--filter","network="+network],
 {encoding:"utf8",timeout:10000}).trim().split(/\s+/);
assert.ok(ids.includes(database),"isolated Docker PostgreSQL must exist");
for(const name of ["SUPABASE_SERVICE_ROLE_KEY","NEXT_PUBLIC_SUPABASE_URL",
 "NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_HUMAN_RECORDING_BUCKET"])
 assert.equal(process.env[name],undefined,"hosted app credentials forbidden");
const anon=process.env.B2_ANON_KEY??"",service=process.env.B2_SERVICE_KEY??"";
assert.ok(anon.length>15&&service.length>15&&anon!==service);
const api=target.origin,bucket="f2p-tus-app-authority-local",uuid=()=>randomUUID();
const admin=createClient(api,service,{auth:{
 persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const good=Buffer.alloc(6*1024*1024+96,0x45),bad=Buffer.alloc(good.length,0x4a);
for(const b of [good,bad]){b.write("RIFF",0);b.write("WAVE",8);}
const hash=b=>createHash("sha256").update(b).digest("hex");
const expected=hash(good),size=good.length,chunk=6*1024*1024;
const sqlArgs=q=>["exec",database,"psql","-X","-q","-t","-A",
 "-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres","-c",q];
function sql(q){return execFileSync("docker",sqlArgs(q),
 {encoding:"utf8",timeout:20000,stdio:["ignore","pipe","pipe"]}).trim();}
async function asyncSql(q){const z=await asyncExecFile("docker",sqlArgs(q),
 {encoding:"utf8",timeout:20000,maxBuffer:1024*1024});return z.stdout.trim();}
function U(s){assert.match(s,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);return "'"+s+"'::uuid";}
function H(s){assert.match(s,/^[a-f0-9]{64}$/);return "'"+s+"'";}
function N(n){assert.ok(Number.isSafeInteger(n)&&n>=0);return String(n);}
let checks=0;
function yes(val,message){assert.ok(val,message);checks++;}
async function seed(){
 const email="receipt-"+uuid()+"@example.invalid",password="Local-"+uuid()+"Aa1!";
 const create=await admin.auth.admin.createUser({email,password,email_confirm:true});
 assert.equal(create.error,null,"local actor");
 const client=createClient(api,anon,{auth:{
  persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const session=await client.auth.signInWithPassword({email,password});
 assert.equal(session.error,null,"local actor login");
 const id=create.data.user.id;
 for(const [table,row] of [
  ["users",{id,display_name:"SYNTHETIC"}],
  ["user_recording_consents",{user_id:id,consent_key:"recording_studio_global",
    consent_version:"2026-04-16"}]
 ]){
  const result=await admin.from(table).insert(row);
  assert.equal(result.error,null,"seed "+table);
 }
 const sid=uuid(),eid=uuid();
 const s=await admin.from("series").insert({id:sid,author_id:id,
  publication_status:"public",content_rating:"general",content_warnings:[],
  recording_permission_mode:"open"});
 assert.equal(s.error,null,"seed synthetic series");
 const e=await admin.from("episodes").insert({id:eid,series_id:sid,
  body:"SYNTHETIC",posting_status:"posted",is_published:true});
 assert.equal(e.error,null,"seed synthetic episode");
 return {actorId:id,sid,eid,jwt:session.data.session.access_token};
}
function mint(actor,bytes=good){
 const lid=uuid();
 const path="owner/"+actor.actorId+"/series/"+actor.sid+"/episode/"+
  actor.eid+"/"+lid+".wav";
 sql("insert into libread_internal.issue137_tus_app_leases "+
 "(lease_id,actor_id,series_id,episode_id,object_path,expected_sha256,expires_at) values ("+
 [U(lid),U(actor.actorId),U(actor.sid),U(actor.eid),"'"+path+"'",
  H(expected),"clock_timestamp()+interval '10 minutes'"].join(",")+")");
 sql("insert into libread_internal.issue137_tus_app_receipts "+
 "(lease_id,expected_bytes) values ("+U(lid)+","+N(size)+")");
 return {id:lid,path,bytes};
}
function meta(path){
 return ["bucketName "+Buffer.from(bucket).toString("base64"),
  "objectName "+Buffer.from(path).toString("base64"),
  "contentType "+Buffer.from("audio/wav").toString("base64")].join(",");
}
const tusRoot=api+"/storage/v1/upload/resumable";
async function request(uri,method,jwt,headers={},body){
 const res=await fetch(uri,{method,headers:{
  apikey:anon,"tus-resumable":"1.0.0","authorization":"Bearer "+jwt,
  ...headers},...(body!==undefined?{body}:{}),cache:"no-store",
  redirect:"error",signal:AbortSignal.timeout(20000)});
 const result={status:res.status,offset:Number(res.headers.get("upload-offset")??"-1"),
  location:res.headers.get("location")};
 await res.arrayBuffer();
 return result;
}
async function upload(actor,lease,bytes=good){
 const opened=await request(tusRoot,"POST",actor.jwt,{
  "upload-length":String(bytes.length),"upload-metadata":meta(lease.path)});
 yes(opened.status===201&&!!opened.location,"private TUS init 201");
 const location=new URL(opened.location,tusRoot);
 assert.equal(location.origin,api);
 assert.ok(location.pathname.startsWith("/storage/v1/upload/resumable/"));
 const uri=location.toString();
 const first=await request(uri,"PATCH",actor.jwt,{
  "upload-offset":"0","content-type":"application/offset+octet-stream"},
  bytes.subarray(0,chunk));
 yes(first.status===204&&first.offset===chunk,"TUS first 6MiB");
 const resumed=await request(uri,"HEAD",actor.jwt);
 yes([200,204].includes(resumed.status)&&resumed.offset===chunk,"resumable offset");
 const last=await request(uri,"PATCH",actor.jwt,{
  "upload-offset":String(chunk),"content-type":"application/offset+octet-stream"},
  bytes.subarray(chunk));
 yes(last.status===204&&last.offset===bytes.length,"TUS final commit");
}
async function physical(lease){
 const out=await admin.storage.from(bucket).download(lease.path);
 if(out.error)return null;
 return Buffer.from(await out.data.arrayBuffer());
}
function receipt(lease){
 const json=sql("select row_to_json(r)::text from libread_internal.issue137_tus_app_receipts r "+
 "where lease_id="+U(lease.id));
 return json?JSON.parse(json):null;
}
function objectId(lease){
 const raw=sql("select id from storage.objects where bucket_id='"+bucket+
 "' and name='"+lease.path+"'");
 return raw||null;
}
function claimQuery(lease){
 return "update libread_internal.issue137_tus_app_receipts set "+
 "state='VERIFYING',attempted=true,version=version+1 "+
 "where lease_id="+U(lease.id)+" and state='STAGED' and version=0 "+
 "and not attempted returning version";
}
function hold(lease,reason){
 assert.match(reason,/^[A-Z_]{4,40}$/);
 const result=sql("update libread_internal.issue137_tus_app_receipts set "+
 "state='HOLD',hold_reason='"+reason+"',version=version+1 "+
 "where lease_id="+U(lease.id)+
 " and state='VERIFYING' and attempted and version=1 returning version");
 yes(result==="2","durable HOLD before any publication");
}
function sealQuery(lease,verifiedSha,providerId){
 // A server would only call this AFTER streamed physical readback. PostgreSQL
 // checks a fresh DB authority graph, provider object identity and optimistic
 // version, but cannot verify the Storage bytes transactionally.
 return "update libread_internal.issue137_tus_app_receipts r set "+
 "state='SEALED_PRIVATE_SNAPSHOT',verified_sha256="+H(verifiedSha)+
 ",verified_bytes="+N(size)+",provider_object_id="+U(providerId)+
 ",verified_at=clock_timestamp(),version=r.version+1 "+
 "from libread_internal.issue137_tus_app_leases l "+
 "join public.series s on s.id=l.series_id "+
 "join public.episodes e on e.id=l.episode_id and e.series_id=s.id "+
 "join public.user_recording_consents c on c.user_id=l.actor_id "+
 "join public.users u on u.id=l.actor_id "+
 "join storage.objects o on o.name=l.object_path and o.bucket_id='"+bucket+"' "+
 "where r.lease_id=l.lease_id and l.lease_id="+U(lease.id)+
 " and r.state='VERIFYING' and r.attempted and r.version=1 "+
 "and r.expected_bytes="+N(size)+" and l.expected_sha256="+H(verifiedSha)+
 " and o.id="+U(providerId)+" and l.state='active' "+
 "and l.expires_at>clock_timestamp() and "+
 "c.consent_key='recording_studio_global' and c.consent_version='2026-04-16' "+
 "and s.recording_permission_mode='open' and "+
 "(s.author_id=l.actor_id or (s.publication_status='public' and "+
 "e.posting_status='posted' and e.is_published is true)) and "+
 "(s.author_id=l.actor_id or (s.content_rating is distinct from 'r18' "+
 "and not ('sexual_r18'=any(coalesce(s.content_warnings,'{}'::text[]))) "+
 ") or (u.show_r18_content is true and u.r18_confirmed_at is not null)) "+
 "and exists(select 1 from auth.sessions a where a.user_id=l.actor_id) "+
 "returning r.version";
}
async function verifiedBytes(lease){
 const bytes=await physical(lease);
 const id=objectId(lease);
 if(!bytes||bytes.length!==size||!id)return null;
 return {sha:hash(bytes),id};
}
async function preseal(lease){
 const bytes=await verifiedBytes(lease);
 if(!bytes){hold(lease,"MISSING_BYTES");return null;}
 if(bytes.sha!==expected){hold(lease,"BYTE_MISMATCH");return null;}
 return bytes;
}
async function reconcile(lease){
 const r=receipt(lease);
 if(!r||r.state!=="SEALED_PRIVATE_SNAPSHOT")return "HOLD_NOT_SEALED";
 const b=await verifiedBytes(lease);
 if(!b || b.sha!==r.verified_sha256 || b.id!==r.provider_object_id)
  return "HOLD_PHYSICAL_DRIFT";
 return "PRIVATE_SNAPSHOT_VERIFIED_ONLY";
}
async function remove(lease){
 const d=await admin.storage.from(bucket).remove([lease.path]);
 assert.equal(d.error,null,"only synthetic PRIVATE object cleanup");
}
const actor=await seed();
yes(sql("select has_table_privilege('authenticated',"+
 "'libread_internal.issue137_tus_app_receipts','UPDATE')")==="f",
 "browser role cannot mutate receipts");

// CASE 1: actual 6MiB+ TUS, SHA re-read, one-shot PostgreSQL CAS,
// competing seal writers (one wins); neither success is a publish decision.
const normal=mint(actor);
await upload(actor,normal);
const claim=sql(claimQuery(normal));
yes(claim==="1","durable attempt CAS succeeds before verification");
const evidence=await preseal(normal);
yes(evidence?.sha===expected&&!!evidence.id,"physical bytes verified independently");
const [a,b]=await Promise.all([asyncSql(sealQuery(normal,evidence.sha,evidence.id)),
 asyncSql(sealQuery(normal,evidence.sha,evidence.id))]);
yes([a,b].filter(x=>x==="2").length===1,
 "two concurrent seals must yield precisely one CAS winner");
yes(await reconcile(normal)==="PRIVATE_SNAPSHOT_VERIFIED_ONLY",
 "sealed physical snapshot verified without public grant");
yes(receipt(normal).state==="SEALED_PRIVATE_SNAPSHOT","PostgreSQL receipt durable");
console.log("PASS: F2-P TUS receipt exact SHA + real PRIVATE Storage + atomic concurrent CAS one-winner");
await remove(normal);

// CASE 2: same-size substituted audio is accepted at Storage ingress;
// verification rejects and permanently records HOLD, never seal.
const tampered=mint(actor,bad);
await upload(actor,tampered,bad);
yes(sql(claimQuery(tampered))==="1","tampered lease marked attempted once");
const reject=await preseal(tampered);
yes(reject===null&&receipt(tampered).state==="HOLD"&&
 receipt(tampered).hold_reason==="BYTE_MISMATCH","tampered bytes durable HOLD");
yes(sql(sealQuery(tampered,expected,objectId(tampered)))==="",
 "tampered HOLD can never advance to sealed");
console.log("PASS: F2-P TUS same-size byte substitution detected via full provider readback, HOLD persisted");
await remove(tampered);

// CASE 3: provider PUT succeeded and seal was persisted, but seal response lost.
// Recovery reads ONLY provider object and receipt, never retransmits bytes.
const lostAck=mint(actor);
await upload(actor,lostAck);
yes(sql(claimQuery(lostAck))==="1","lost-ACK attempt recorded");
const receiptBytes=await preseal(lostAck);
yes(!!receiptBytes,"bytes re-read before lost-ACK seal");
yes(sql(sealQuery(lostAck,receiptBytes.sha,receiptBytes.id))==="2",
 "CAS committed (simulate lost ACK by discarding result)");
yes(await reconcile(lostAck)==="PRIVATE_SNAPSHOT_VERIFIED_ONLY",
 "lost ACK reconciled without a second Storage upload");
yes(sql(claimQuery(lostAck))==="","no repeat attempt on already sealed receipt");
console.log("PASS: F2-P TUS lost-ACK receipt reconciliation without duplicate PUT");
await remove(lostAck);

// CASE 4: race between duplicate verification attempts; only one claim
// can transition the row. No Storage writes by either duplicate verifier.
const race=mint(actor);
await upload(actor,race);
const claims=await Promise.all([asyncSql(claimQuery(race)),asyncSql(claimQuery(race))]);
yes(claims.filter(x=>x==="1").length===1,
 "concurrent claim must have exactly one winner");
const raceBytes=await preseal(race);
yes(!!raceBytes,"race physical bytes intact");
yes(sql(sealQuery(race,raceBytes.sha,raceBytes.id))==="2",
 "one claimant can seal");
console.log("PASS: F2-P TUS concurrent claim CAS one-winner");
await remove(race);

// CASE 5: revoke real app recording consent after TUS complete, before
// durable CAS. Verifying the correct digest alone must NOT override revocation.
const revoked=mint(actor);
await upload(actor,revoked);
yes(sql(claimQuery(revoked))==="1","revocation case attempted once");
const beforeRevocation=await preseal(revoked);
yes(!!beforeRevocation,"bytes exist before revocation");
const d=await admin.from("user_recording_consents")
 .update({consent_version:"2026-04-15"}).eq("user_id",actor.actorId)
 .eq("consent_key","recording_studio_global");
assert.equal(d.error,null,"local consent revoke");
yes(sql(sealQuery(revoked,beforeRevocation.sha,beforeRevocation.id))==="",
 "fresh consent withdrawal blocks DB seal");
hold(revoked,"AUTHORITY_REVOKED");
yes(receipt(revoked).state==="HOLD","revocation persisted HOLD");
console.log("PASS: F2-P TUS fresh consent withdrawal fails closed at receipt CAS");
await remove(revoked);

// CASE 6: privileged service-role path can delete and re-create a SEALED
// path after evidence. CAS cannot make Storage immutable by itself.
// Show the explicit detection on second readback, never call it release GO.
const changed=mint(actor);
const restore=await admin.from("user_recording_consents")
 .update({consent_version:"2026-04-16"}).eq("user_id",actor.actorId)
 .eq("consent_key","recording_studio_global");
assert.equal(restore.error,null);
await upload(actor,changed);
yes(sql(claimQuery(changed))==="1","privileged bypass proof claimed");
const original=await preseal(changed);
yes(sql(sealQuery(changed,original.sha,original.id))==="2","baseline snapshot sealed");
await remove(changed);
const replaced=await admin.storage.from(bucket)
 .upload(changed.path,bad,{upsert:false,contentType:"audio/wav"});
assert.equal(replaced.error,null,"synthetic service-role alternate write bypass");
yes(await reconcile(changed)==="HOLD_PHYSICAL_DRIFT",
 "post-seal privileged write detected on independent readback");
console.log("RISK: F2-P LOCAL privileged service-role writer can replace sealed PRIVATE bytes; CAS is NOT provider immutability");
await remove(changed);
console.log("PASS: F2-P REAL LOCAL TUS durable receipt "+checks+
 " checks; physical SHA, duplicate claim/seal CAS, mismatch, ACK-loss, revocation, "+
 "post-seal tamper detection; PRIVATE snapshot ONLY, never PUBLIC_READY");
