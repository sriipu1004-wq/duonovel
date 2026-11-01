// Issue #137: REAL disposable GoTrue+PostgREST issue RPC + PRIVATE TUS.
// No live Next route, hosted credentials, production migrations or signed URLs.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {createClient} from "@supabase/supabase-js";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const u=new URL(process.env.B2_LOCAL_URL??"");
assert.equal(u.protocol,"http:");
assert.ok(["localhost","127.0.0.1"].includes(u.hostname));
assert.ok(["54321","54331"].includes(u.port));
assert.equal(u.pathname,"/");assert.equal(u.search,"");assert.equal(u.hash,"");
const network=process.env.B2_NETWORK??"",db=process.env.B2_DB_CONTAINER??"";
assert.match(network,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(db,/^[a-f0-9]{12,64}$/);
const member=execFileSync("docker",["ps","-q","--filter","network="+network],
 {encoding:"utf8",timeout:10000}).trim().split(/\s+/);
assert.ok(member.includes(db),"disposable database not found");
for(const k of ["SUPABASE_SERVICE_ROLE_KEY","NEXT_PUBLIC_SUPABASE_URL",
 "NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_HUMAN_RECORDING_BUCKET"])
 assert.equal(process.env[k],undefined,"hosted credential not allowed");
const origin=u.origin,anon=process.env.B2_ANON_KEY??"",
 service=process.env.B2_SERVICE_KEY??"";
assert.ok(anon.length>15&&service.length>15&&anon!==service);
const config={auth:{persistSession:false,autoRefreshToken:false,
 detectSessionInUrl:false}},id=()=>randomUUID();
const admin=createClient(origin,service,config);
const size=6*1024*1024+96,part=6*1024*1024;
const bytes=Buffer.alloc(size,0x32);bytes.write("RIFF",0);bytes.write("WAVE",8);
const sha=buf=>createHash("sha256").update(buf).digest("hex");
const expectedSha=sha(bytes),bucket="f2p-tus-app-authority-local";
const issueName="issue137_tus_local_issue";
let checks=0;function yes(x,msg){assert.ok(x,msg);checks++;}
function SQL(stmt){
 return execFileSync("docker",["exec",db,"psql","-X","-q","-t","-A",
  "-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres","-c",stmt],
  {encoding:"utf8",timeout:15000,stdio:["ignore","pipe","pipe"]}).trim();
}
const uuid=x=>{assert.match(x,/^[a-f0-9-]{36}$/i);return "'"+x+"'::uuid";};
async function actor(consent=true){
 const email="issuer-"+id()+"@example.invalid",password="Local-"+id()+"Aa1!";
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
 assert.equal(created.error,null);
 const client=createClient(origin,anon,config);
 const logged=await client.auth.signInWithPassword({email,password});
 assert.equal(logged.error,null);
 const actorId=created.data.user.id;
 const profile=await admin.from("users").insert({id:actorId,display_name:"LOCAL"});
 assert.equal(profile.error,null);
 if(consent){
  const c=await admin.from("user_recording_consents").insert({
   user_id:actorId,consent_key:"recording_studio_global",consent_version:"2026-04-16"});
  assert.equal(c.error,null);
 }
 return {id:actorId,email,password,client,jwt:logged.data.session.access_token};
}
async function issue(client,seriesId,episodeId,bytesCount=size,hash=expectedSha){
 return client.rpc(issueName,{p_series_id:seriesId,p_episode_id:episodeId,
  p_expected_sha256:hash,p_size_bytes:bytesCount});
}
async function blocked(label,client,sid,eid,count=true){
 const before=SQL("select count(*) from libread_internal.issue137_tus_app_leases"+
  " where issued_session_id is not null");
 const r=await issue(client,sid,eid);
 yes(r.error!==null&&r.data===null,label+" must fail closed");
 const after=SQL("select count(*) from libread_internal.issue137_tus_app_leases"+
  " where issued_session_id is not null");
 if(count)yes(after===before,label+" must not create an issuer lease");
}
async function metadata(path){
 return ["bucketName "+Buffer.from(bucket).toString("base64"),
  "objectName "+Buffer.from(path).toString("base64"),
  "contentType "+Buffer.from("audio/wav").toString("base64")].join(",");
}
const root=origin+"/storage/v1/upload/resumable";
async function req(url,method,jwt,extra={},body){
 const response=await fetch(url,{method,headers:{
  apikey:anon,"tus-resumable":"1.0.0",
  ...(jwt?{authorization:"Bearer "+jwt}:{}),...extra},
  ...(body===undefined?{}:{body}),
  redirect:"error",signal:AbortSignal.timeout(18000)});
 const result={status:response.status,
  offset:Number(response.headers.get("upload-offset")??"-1"),
  location:response.headers.get("location")};
 await response.arrayBuffer();return result;
}
async function begin(lease,jwt){
 const a=await req(root,"POST",jwt,{
  "upload-length":String(size),"upload-metadata":await metadata(lease.objectPath)});
 const link=a.location?new URL(a.location,root):null;
 if(link){assert.equal(link.origin,origin);assert.ok(
  link.pathname.startsWith("/storage/v1/upload/resumable/"));}
 return {...a,url:link?.toString()??null};
}
async function send(url,jwt,offset,partBytes){
 return req(url,"PATCH",jwt,{"upload-offset":String(offset),
  "content-type":"application/offset+octet-stream"},partBytes);
}
async function physical(path){
 const r=await admin.storage.from(bucket).download(path);
 return r.error?null:Buffer.from(await r.data.arrayBuffer());
}
const owner=await actor(),narrator=await actor(),foreign=await actor();
const sid=id(),eid=id(),other=id();
for(const [table,row] of [
 ["series",{id:sid,author_id:owner.id,publication_status:"public",
  recording_permission_mode:"open",content_rating:"general",content_warnings:[]}],
 ["episodes",{id:eid,series_id:sid,body:"SYNTHETIC",
  posting_status:"posted",is_published:true}],
 ["episodes",{id:other,series_id:sid,body:"SYNTHETIC 2",
  posting_status:"posted",is_published:true}]
]){
 const r=await admin.from(table).insert(row);assert.equal(r.error,null);
}
const privateBucket=await admin.storage.getBucket(bucket);
yes(privateBucket.error===null&&privateBucket.data?.public===false,
 "disposable stage bucket must be PRIVATE");
const asAnon=createClient(origin,anon,config);
await blocked("anonymous issuer",asAnon,sid,eid);
await blocked("cross-series/episode issuer",narrator.client,id(),eid);
await blocked("forged episode issuer",narrator.client,sid,id());
const invalid=await issue(narrator.client,sid,eid,size,"z".repeat(64));
yes(invalid.error!==null&&invalid.data===null,"invalid SHA never issued");
const tooBig=await issue(narrator.client,sid,eid,16777217);
yes(tooBig.error!==null&&tooBig.data===null,"invalid size never issued");
const published=await admin.from("series").update({
 publication_status:"private"}).eq("id",sid);
assert.equal(published.error,null);
await blocked("private series non-owner",narrator.client,sid,eid);
await admin.from("series").update({publication_status:"public"}).eq("id",sid);
await admin.from("series").update({recording_permission_mode:"closed"}).eq("id",sid);
await blocked("closed permission author",owner.client,sid,eid);
await admin.from("series").update({recording_permission_mode:"open"}).eq("id",sid);
await admin.from("series").update({content_rating:"r18",
 content_warnings:["sexual_r18"]}).eq("id",sid);
await blocked("R18 display OFF",narrator.client,sid,eid);
await admin.from("users").update({show_r18_content:true}).eq("id",narrator.id);
await blocked("R18 age unconfirmed",narrator.client,sid,eid);
await admin.from("users").update({
 r18_confirmed_at:new Date().toISOString()}).eq("id",narrator.id);
const eligible=await issue(narrator.client,sid,eid);
assert.equal(eligible.error,null,"authenticated real-field issuer");
const lease=eligible.data;
yes(lease&&typeof lease.leaseId==="string"&&typeof lease.objectPath==="string",
 "server-minted opaque issuer lease");
yes(Object.keys(lease).sort().join(",")==="expiresAt,leaseId,mode,objectPath"&&
 lease.mode==="PRIVATE_JWT_TUS_LOCAL_ONLY",
 "issuer returns NO signed URL, JWT, S3 or service key");
yes(lease.objectPath.startsWith("owner/"+narrator.id+"/series/"+sid+
 "/episode/"+eid+"/"),"server-bound canonical owner and episode path");
yes(SQL("select issued_session_id is not null and expected_bytes="+size+
 " from libread_internal.issue137_tus_app_leases where lease_id="+
 uuid(lease.leaseId))==="t","lease binds real GoTrue session and byte count");
const fromForeign=await begin(lease,foreign.jwt);
yes(fromForeign.status!==201,"foreign JWT cannot open owner stage");
const start=await begin(lease,narrator.jwt);
yes(start.status===201&&!!start.url,"owner JWT starts PRIVATE TUS without signed URL");
const first=await send(start.url,narrator.jwt,0,bytes.subarray(0,part));
yes(first.status===204&&first.offset===part,"PRIVATE TUS first 6MiB staged");
const revoke=await admin.from("user_recording_consents").update({
 consent_version:"2026-04-15"}).eq("user_id",narrator.id);
assert.equal(revoke.error,null);
yes(SQL("select state from libread_internal.issue137_tus_app_leases"+
 " where lease_id="+uuid(lease.leaseId))==="revoked",
 "consent change permanently tombstones local issuer ticket");
const withdrawn=await send(start.url,narrator.jwt,part,bytes.subarray(part));
yes(withdrawn.status===403,"revoked consent blocks final TUS PATCH");
yes((await physical(lease.objectPath))===null,"no committed object after revoke");
const restore=await admin.from("user_recording_consents").update({
 consent_version:"2026-04-16"}).eq("user_id",narrator.id);
assert.equal(restore.error,null);
const replay=await send(start.url,narrator.jwt,part,bytes.subarray(part));
yes(replay.status===403,"old lease stays revoked after consent regrant");
const fresh=await issue(narrator.client,sid,eid);
assert.equal(fresh.error,null,"new valid ticket after regrant");
const stale=fresh.data;
const loggedOut=await narrator.client.auth.signOut({scope:"global"});
assert.equal(loggedOut.error,null);
yes(SQL("select count(*) from auth.sessions where user_id="+uuid(narrator.id))==="0",
 "GoTrue original session invalidated");
const oldLogin=await begin(stale,narrator.jwt);
yes(oldLogin.status!==201,"expired session cannot begin TUS");
const clientAgain=createClient(origin,anon,config);
const relogin=await clientAgain.auth.signInWithPassword({
 email:narrator.email,password:narrator.password});
assert.equal(relogin.error,null);
const newSession=await begin(stale,relogin.data.session.access_token);
yes(newSession.status!==201,"fresh session cannot revive OLD ticket");
yes((await physical(stale.objectPath))===null,"stale lease never produced bytes");
console.log("PASS: #137 REAL LOCAL self-issued PRIVATE JWT TUS "+checks+
 " checks: no signed URL, true owner/session/consent/R18/permission, "+
 "revocation monotonic, logout/relogin and no PUBLIC release");
console.log("HOLD: disposable SQL/RPC is NOT deployed app route, per-byte "+
 "immutable SHA/privileged S3 fence, or hosted release authority");
