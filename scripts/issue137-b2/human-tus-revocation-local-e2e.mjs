// Issue #137: real LOCAL Supabase GoTrue + TUS resumable PRIVATE Storage negative probe.
// Exploratory observations are PASS/RISK/UNVERIFIED distinctly, not rollout authorization.
// NO hosted API, PUBLIC object, real account, service key, TUS URL, JWT or password in logs.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const url=new URL(process.env.B2_LOCAL_URL??"");
assert.equal(url.protocol,"http:");
assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));
assert.ok(["54321","54331"].includes(url.port));
assert.equal(url.pathname,"/");
assert.equal(url.search,"");
assert.equal(url.hash,"");
const network=process.env.B2_NETWORK??"",database=process.env.B2_DB_CONTAINER??"";
assert.match(network,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(database,/^[a-f0-9]{12,64}$/);
const ids=execFileSync("docker",["ps","-q","--filter","network="+network],
 {encoding:"utf8",timeout:10000}).trim().split(/\s+/);
assert.ok(ids.includes(database),"test must only use disposable Docker PostgreSQL");
const anon=process.env.B2_ANON_KEY??"",service=process.env.B2_SERVICE_KEY??"";
assert.ok(anon.length>15&&service.length>15&&anon!==service);
for(const key of ["SUPABASE_SERVICE_ROLE_KEY","NEXT_PUBLIC_SUPABASE_URL","SUPABASE_HUMAN_RECORDING_BUCKET"])
 assert.equal(process.env[key],undefined,"hosted credential or bucket environment may not leak into probe");
const api=url.origin,bucket="f2p-tus-revocation-local",id=()=>randomUUID();
const transport={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(api,service,transport);
const size=6*1024*1024+128,chunk=6*1024*1024;
const bytes=Buffer.alloc(size,0x46),alternate=Buffer.alloc(size,0x37);
bytes.set(Buffer.from("RIFF"),0);bytes.set(Buffer.from("WAVE"),8);
alternate.set(Buffer.from("RIFF"),0);alternate.set(Buffer.from("WAVE"),8);
const sha=x=>createHash("sha256").update(x).digest("hex");
let n=0,risks=0,observations=[];
const verified=(value,message)=>{assert.ok(value,message);n++};
const qid=x=>{assert.match(x,/^[0-9a-f-]{36}$/);return "'"+x+"'::uuid";};
function sql(query){
 return execFileSync("docker",["exec",database,"psql","-X","-q","-t","-A",
  "-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres","-c",query],
  {encoding:"utf8",timeout:15000,stdio:["ignore","pipe","pipe"]}).trim();
}
async function actor(){
 const email="f2p-tus-"+id()+"@example.invalid",password="F2P-"+id()+"-Aa1!";
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
 assert.equal(created.error,null,"synthetic GoTrue actor created");
 const client=createClient(api,anon,transport);
 const login=await client.auth.signInWithPassword({email,password});
 assert.equal(login.error,null,"synthetic GoTrue sign-in");
 const jwt=login.data.session?.access_token;
 verified(typeof jwt==="string"&&jwt.length>50,"signed local JWT");
 return {id:created.data.user.id,client,jwt};
}
function meta(path){
 return ["bucketName "+Buffer.from(bucket).toString("base64"),
  "objectName "+Buffer.from(path).toString("base64"),
  "contentType "+Buffer.from("audio/wav").toString("base64")].join(",");
}
const tusRoot=api+"/storage/v1/upload/resumable";
function scoped(raw){
 const result=new URL(raw,tusRoot);
 assert.equal(result.origin,api,"TUS URL origin cannot escape local disposable service");
 assert.ok(result.pathname.startsWith("/storage/v1/upload/resumable/"),
  "TUS resume URL must stay on LOCAL resumable endpoint");
 return result.toString();
}
async function request(url,method,jwt,headers={},body){
 const res=await fetch(url,{method,headers:{
  apikey:anon,"tus-resumable":"1.0.0",
  ...(jwt?{authorization:"Bearer "+jwt}:{}),...headers},
  ...(body!==undefined?{body}:{}),redirect:"error",cache:"no-store",
  signal:AbortSignal.timeout(20000)});
 return res;
}
async function begin(path,jwt){
 const response=await request(tusRoot,"POST",jwt,{
  "upload-length":String(size),"upload-metadata":meta(path)});
 const result={status:response.status,url:null};
 if(response.status===201){
  const loc=response.headers.get("location");
  verified(!!loc,"accepted TUS POST must return location");
  result.url=scoped(loc);
 }
 await response.arrayBuffer();
 return result;
}
async function head(uri,jwt){
 const res=await request(uri,"HEAD",jwt);
 return {status:res.status,offset:Number(res.headers.get("upload-offset")??"-1")};
}
async function patch(uri,jwt,offset,data){
 const res=await request(uri,"PATCH",jwt,{
  "upload-offset":String(offset),"content-type":"application/offset+octet-stream"},
  data);
 const out={status:res.status,offset:Number(res.headers.get("upload-offset")??"-1")};
 await res.arrayBuffer();
 return out;
}
const pathOf=(u)=>"owner/"+u.id+"/"+id()+".wav";
async function getObject(path){
 const obj=await admin.storage.from(bucket).download(path);
 return obj.error?null:Buffer.from(await obj.data.arrayBuffer());
}
async function clear(path){
 const del=await admin.storage.from(bucket).remove([path]);
 assert.equal(del.error,null,"local synthetic object cleanup");
 n++;
}
const observe=(label,value)=>{
 observations.push({label,value});
 console.log("OBSERVED: TUS LOCAL "+label+" "+value);
};
const risk=(label,value)=>{
 risks++;observations.push({label,value});
 console.log("RISK: TUS LOCAL "+label+" "+value);
};
async function initial(path,jwt){
 const opened=await begin(path,jwt);
 verified(opened.status===201,"valid owner TUS session POST must return 201, observed "+opened.status);
 const before=await head(opened.url,jwt);
 verified([200,204].includes(before.status)&&before.offset===0,
  "TUS HEAD initial offset must be 0");
 const first=await patch(opened.url,jwt,0,bytes.subarray(0,chunk));
 verified(first.status===204&&first.offset===chunk,
  "first 6MiB chunk must commit at TUS offset 6MiB, observed "+first.status+" "+first.offset);
 return opened.url;
}
async function finalAttempt(label,uri,jwt,path){
 const final=await patch(uri,jwt,chunk,bytes.subarray(chunk));
 const found=await getObject(path);
 if(final.status===204){
  risk(label,"POST-revocation PATCH accepted (204), physical="+(found?"present":"missing"));
 } else {
  observe(label,"POST-revocation PATCH rejected status="+final.status+
   ", physical="+(found?"present":"missing"));
 }
 return {final,found};
}
async function ensurePrivate(path){
 const get=await fetch(api+"/storage/v1/object/public/"+bucket+"/"+path,{
  headers:{apikey:anon},redirect:"error",signal:AbortSignal.timeout(12000)});
 verified(get.status>=400&&get.status<500,"PRIVATE test object must never be PUBLIC");
}
async function setGate(user,field,value){
 assert.ok(["consent_ok","owner_ok","rights_ok","r18_ok"].includes(field));
 sql("update libread_internal.issue137_tus_local_grants set "+field+"="+(value?"true":"false")+
  " where actor_id="+qid(user.id));
}
const actorA=await actor(),actorB=await actor();
const b=(await admin.storage.getBucket(bucket));verified(b.error===null&&b.data?.public===false,"dedicated TUS bucket stays PRIVATE");
for(const person of [actorA,actorB]){
 sql("insert into libread_internal.issue137_tus_local_grants(actor_id) values("+qid(person.id)+")");
 const c=await admin.from("user_recording_consents").insert({
  user_id:person.id,consent_key:"recording_studio_global",consent_version:"2026-04-16"});
 assert.equal(c.error,null,"synthetic consent record seeded");
}
let totalObjects=0;
// First: normal complete and byte-exact PRIVATE readback after network resume.
{
 const path=pathOf(actorA),uri=await initial(path,actorA.jwt);
 const resume=await head(uri,actorA.jwt);
 verified(resume.offset===chunk,"TUS HEAD resumable offset must persist");
 const last=await patch(uri,actorA.jwt,resume.offset,bytes.subarray(chunk));
 verified(last.status===204&&last.offset===size,"authorized TUS upload must complete");
 const found=await getObject(path);
 verified(found?.length===size&&sha(found)===sha(bytes),"TUS PRIVATE physical SHA readback");
 await ensurePrivate(path);totalObjects++;
 const repeat=await patch(uri,actorA.jwt,size,Buffer.alloc(0));
 observe("same-URL completed replay","status="+repeat.status);
 await clear(path);
}
// Cross-user and anonymous TUS POST on path of actorA must never create a PUBLIC asset.
{
 for(const [label,jwt] of [["anon",null],["other actor",actorB.jwt]]){
  const path=pathOf(actorA),x=await begin(path,jwt);
  if(x.url){
   const one=await patch(x.url,jwt,0,bytes.subarray(0,chunk));
   observe(label+" foreign-path initiation","201, first-PATCH="+one.status);
   if(one.status===204){
    const end=await patch(x.url,jwt,chunk,bytes.subarray(chunk));
    if(end.status===204)risk(label+" foreign-path completed","wrong-owner TUS completed");
    else observe(label+" foreign-path completion","denied="+end.status);
   }
  }else observe(label+" foreign-path initiation","denied="+x.status);
  const found=await getObject(path);
  if(found)risk(label+" foreign-path physical object","unexpected PRIVATE object");
  else n++;
  if(found)await clear(path);
 }
}
// Different actor / anonymous bearer on same started upload URL.
{
 for(const [label,jwt] of [["other actor",actorB.jwt],["anonymous",null]]){
  const path=pathOf(actorA),uri=await initial(path,actorA.jwt);
  const second=await patch(uri,jwt,chunk,bytes.subarray(chunk));
  const found=await getObject(path);
  if(second.status===204)risk(label+" reused TUS URL","PATCH final accepted; physical="+(found?"present":"missing"));
  else observe(label+" reused TUS URL","PATCH denied="+second.status);
  if(!found){
   const complete=await patch(uri,actorA.jwt,chunk,bytes.subarray(chunk));
   verified(complete.status===204,"legitimate actor can complete after denied reused URL");
  }
  await clear(path);
 }
}
// Consent withdrawal after a first chunk: does TUS recheck at final PATCH?
{
 const path=pathOf(actorA),uri=await initial(path,actorA.jwt);
 await setGate(actorA,"consent_ok",false);
 await finalAttempt("consent revoked",uri,actorA.jwt,path);
 await setGate(actorA,"consent_ok",true);
 if(await getObject(path))await clear(path);
}
// Real global recording-consent TABLE version withdrawal, independent of
// the synthetic grants switch. This tests the exact version used by Human API.
{
 const path=pathOf(actorA),uri=await initial(path,actorA.jwt);
 const revoked=await admin.from("user_recording_consents")
  .update({consent_version:"2026-04-15"}).eq("user_id",actorA.id)
  .eq("consent_key","recording_studio_global");
 assert.equal(revoked.error,null,"revoke actual LOCAL consent row");
 const row=await admin.from("user_recording_consents").select("consent_version")
  .eq("user_id",actorA.id).eq("consent_key","recording_studio_global").single();
 verified(row.error===null&&row.data?.consent_version==="2026-04-15",
  "synthetic DB consent row really changed before TUS PATCH");
 await finalAttempt("real consent_version revoked",uri,actorA.jwt,path);
 const restored=await admin.from("user_recording_consents")
  .update({consent_version:"2026-04-16"}).eq("user_id",actorA.id)
  .eq("consent_key","recording_studio_global");
 assert.equal(restored.error,null,"restore synthetic consent for remaining cases");
 if(await getObject(path))await clear(path);
}
// Owner/right/R18 withdrawal after partial commit; no false assumption of RLS.
for(const flag of ["owner_ok","rights_ok","r18_ok"]){
 const path=pathOf(actorA),uri=await initial(path,actorA.jwt);
 await setGate(actorA,flag,false);
 await finalAttempt(flag+" revoked",uri,actorA.jwt,path);
 await setGate(actorA,flag,true);
 if(await getObject(path))await clear(path);
}
// Logout invalidation of the original GoTrue session, with stale old JWT.
{
 const path=pathOf(actorB),uri=await initial(path,actorB.jwt);
 const logout=await actorB.client.auth.signOut({scope:"global"});
 assert.equal(logout.error,null,"synthetic global logout");
 const sessionExists=sql("select count(*) from auth.sessions where user_id="+qid(actorB.id));
 observe("GoTrue session count after logout",sessionExists);
 await finalAttempt("logout stale JWT",uri,actorB.jwt,path);
 if(await getObject(path))await clear(path);
}
// Two distinct upload URLs aimed at the SAME object key (no upsert); first finish
// must preserve bytes if the second also tries to commit.
{
 const path=pathOf(actorA);
 const [u1,u2]=await Promise.all([begin(path,actorA.jwt),begin(path,actorA.jwt)]);
 if(u1.url&&u2.url){
  const first=await patch(u1.url,actorA.jwt,0,bytes.subarray(0,chunk));
  verified(first.status===204,"first duplicate upload chunk accepted");
  const done=await patch(u1.url,actorA.jwt,chunk,bytes.subarray(chunk));
  verified(done.status===204,"first duplicate URL completed");
  const second=await patch(u2.url,actorA.jwt,0,alternate.subarray(0,chunk));
  if(second.status===204){
   const last=await patch(u2.url,actorA.jwt,chunk,alternate.subarray(chunk));
   if(last.status===204)risk("different-URL duplicate upload","second completion returned 204");
   else observe("different-URL duplicate completion","second rejected="+last.status);
  }else observe("different-URL duplicate first PATCH","second rejected="+second.status);
  const got=await getObject(path);
  verified(got!==null&&sha(got)===sha(bytes),
   "duplicate TUS URL must never replace first committed physical bytes");
  await clear(path);
 }else{
  observe("different-URL duplicate initiation","statuses="+u1.status+","+u2.status);
  if(u1.url){
   const first=await patch(u1.url,actorA.jwt,0,bytes.subarray(0,chunk));
   verified(first.status===204,"first upload chunk");
   const done=await patch(u1.url,actorA.jwt,chunk,bytes.subarray(chunk));
   verified(done.status===204,"first upload completion");
   const got=await getObject(path);
   verified(sha(got)===sha(bytes),"physical bytes preserved");
   await clear(path);
  }
 }
}
console.log("PASS: F2-P real LOCAL TUS "+n+" control checks, "+observations.length+
 " observed classifications, "+risks+" risk flags; anonymous/other actor, resume,"+
 " consent/owner/rights/R18/session revocation, competing URLs and PRIVATE bytes");
console.log("HOLD: an OBSERVED 204 after revocation is an authorization bypass for TUS "+
 "continuation, not a successful security control; neither route integration nor "+
 "Production byte/rights safety was tested");
