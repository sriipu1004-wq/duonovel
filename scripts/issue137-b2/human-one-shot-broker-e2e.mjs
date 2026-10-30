// Real LOCAL GoTrue + atomic PostgreSQL authority/nonce + PRIVATE Storage.
// ALL credentials ephemeral. Neither JWT, capability, passwords nor SQL secret
// hashes are emitted. Never contact hosted Supabase or production.
import assert from "node:assert/strict";
import {execFile,execFileSync} from "node:child_process";
import {promisify} from "node:util";
import {randomUUID,createHash} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {createDisposableHumanOneShotBroker} from "./human-one-shot-broker-local.mjs";
import * as rlsModule from "../../src/lib/recording/rlsScopedPrivateWriterLocal.ts";
const {createDisposableRlsScopedPrivateWriter}=rlsModule.default??rlsModule;
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const raw=process.env.B2_LOCAL_URL??"",url=new URL(raw);
assert.equal(url.protocol,"http:");
assert.ok(["127.0.0.1","localhost","[::1]"].includes(url.hostname));
assert.ok(["54321","54331"].includes(url.port));
assert.equal(url.pathname,"/");assert.equal(url.search,"");assert.equal(url.hash,"");
const bridge=process.env.B2_NETWORK??"",dbid=process.env.B2_DB_CONTAINER??"";
assert.match(bridge,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(dbid,/^[a-f0-9]{12,64}$/);
assert.ok(execFileSync("docker",["ps","-q","--filter","network="+bridge],
 {encoding:"utf8",timeout:10000}).trim().split(/\s+/).includes(dbid));
const anon=process.env.B2_ANON_KEY??"",service=process.env.B2_SERVICE_KEY??"";
assert.ok(anon&&service&&anon!==service);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const hex=/^[0-9a-f]{64}$/u;
const quoteId=s=>{assert.ok(uuid.test(s),"invalid fixture UUID");return "'"+s+"'::uuid";};
const quoteHash=s=>{assert.ok(hex.test(s),"invalid fixture digest");return "'"+s+"'";};
const sql=q=>execFileSync("docker",["exec",dbid,"psql","-X","-U","postgres",
 "-d","postgres","-v","ON_ERROR_STOP=1","-Atq","-c",q],{
 encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:18000}).trim();
const sqlExecAsync=promisify(execFile);
const sqlAsync=async q=>{
 const {stdout}=await sqlExecAsync("docker",["exec",dbid,"psql","-X","-U","postgres",
  "-d","postgres","-v","ON_ERROR_STOP=1","-Atq","-c",q],{
  encoding:"utf8",timeout:18000,maxBuffer:1024*1024});
 return stdout.trim();
};
const hash=b=>createHash("sha256").update(b).digest("hex");
const id=()=>randomUUID();
let checks=0;
function yes(v,msg){assert.ok(v,msg);checks++;}
async function person(){
 const email="f2p-oneuse-"+id()+"@example.invalid";
 const password="F2P-"+id()+"-Aa1!";
 const admin=createClient(url.origin,service,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const a=await admin.auth.admin.createUser({email,password,email_confirm:true});
 assert.equal(a.error,null,"create synthetic user");
 const client=createClient(url.origin,anon,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const signed=await client.auth.signInWithPassword({email,password});
 assert.equal(signed.error,null,"login synthetic user");
 const jwt=signed.data.session?.access_token;
 assert.ok(jwt,"missing real local GoTrue session");
 const claim=JSON.parse(Buffer.from(jwt.split(".")[1],"base64url").toString());
 assert.equal(claim.sub,a.data.user.id);
 assert.ok(uuid.test(claim.session_id),"live session claim must be UUID");
 const exists=sql("select count(*) from auth.sessions where id="+quoteId(claim.session_id)+
  " and user_id="+quoteId(claim.sub)+";");
 assert.equal(exists,"1","actual local auth.sessions row missing");checks+=5;
 return {id:claim.sub,sessionId:claim.session_id,jwt,client};
}
const owner=await person(),stranger=await person();
const grantTable="libread_internal.issue137_human_broker_grants";
const permits="libread_internal.issue137_human_broker_permits";
sql("insert into "+grantTable+"(actor_id) values("+quoteId(owner.id)+"),("+quoteId(stranger.id)+");");
checks++;
function setGrant(field,value){
 assert.ok(["recording_consent","owner_allowed","rights_allowed"].includes(field));
 sql("update "+grantTable+" set "+field+"="+(value?"true":"false")+
  " where actor_id="+quoteId(owner.id)+";");
 checks++;
}
const store={
 issueAtomic:async p=>{
  const {permitId,tokenHash,actorId,sessionId,objectId,expectedSha256,expiresAt}=p;
  assert.ok(new Date(expiresAt).getTime()>Date.now()&&
   new Date(expiresAt).getTime()<=Date.now()+31_000);
  assert.ok(uuid.test(permitId)&&uuid.test(objectId));
  const value=sql("insert into "+permits+
   "(permit_id,token_sha256,actor_id,session_id,object_id,expected_sha256,expires_at) "+
   "select "+quoteId(permitId)+","+quoteHash(tokenHash)+","+
   quoteId(actorId)+","+quoteId(sessionId)+","+quoteId(objectId)+","+
   quoteHash(expectedSha256)+","+
   "'"+expiresAt+"'::timestamptz"+
   " from "+grantTable+" g where g.actor_id="+quoteId(actorId)+
   " and g.recording_consent and g.owner_allowed and g.rights_allowed "+
   " and exists(select 1 from auth.sessions s where s.id="+quoteId(sessionId)+
   " and s.user_id="+quoteId(actorId)+") returning permit_id;");
  return value===permitId;
 },
 claimAtomic:async p=>{
  const {permitId,tokenHash,actorId,sessionId,bytesHash}=p;
  const got=await sqlAsync("update "+permits+" c set claimed_at=clock_timestamp()"+
   " from "+grantTable+" g where c.permit_id="+quoteId(permitId)+
   " and c.token_sha256="+quoteHash(tokenHash)+
   " and c.actor_id="+quoteId(actorId)+
   " and c.session_id="+quoteId(sessionId)+
   " and c.expected_sha256="+quoteHash(bytesHash)+
   " and c.claimed_at is null and c.expires_at > clock_timestamp()"+
   " and g.actor_id=c.actor_id and g.recording_consent"+
   " and g.owner_allowed and g.rights_allowed"+
   " and exists(select 1 from auth.sessions s where s.id=c.session_id"+
   " and s.user_id=c.actor_id) returning c.object_id;");
  return uuid.test(got)?{objectId:got}:null;
 }
};
const rls=createDisposableRlsScopedPrivateWriter({apiUrl:raw,anonKey:anon});
let writeCount=0;
const broker=createDisposableHumanOneShotBroker({
 apiUrl:raw,anonKey:anon,store,
 stagePrivate:async p=>{writeCount++;return rls.stageAsUser(p)}
});
function wav(i=3){
 const b=Buffer.alloc(48);b.write("RIFF",0);b.writeUInt32LE(40,4);
 b.write("WAVEfmt ",8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);
 b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);
 b.writeUInt16LE(16,34);b.write("data",36);b.writeUInt32LE(4,40);
 b.writeInt16LE(i,44);b.writeInt16LE(-i,46);
 return b;
}
const bytes=wav(),different=wav(11);
const mint=(p=owner,what=bytes,objectId=id())=>
 broker.issue({userJwt:p.jwt,actorId:p.id,objectId,expectedSha256:hash(what)});
const stage=(cap,p=owner,what=bytes)=>broker.stage({
 userJwt:p.jwt,capability:cap.capability,bytes:what});
async function deny(p,regex,name){
 await assert.rejects(p,regex,name);checks++;
}
const first=await mint();
yes(typeof first.capability==="string"&&first.capability.length>60,
 "opaque one-time token exists");
await deny(stage(first,stranger),/HUMAN_BROKER_CLAIM_DENIED/,"different actor claim must be rejected");
yes(writeCount===0,"cross-actor attempt reached storage");
await deny(stage({capability:first.capability.slice(0,-1)+(first.capability.endsWith("0")?"1":"0")}),/HUMAN_BROKER_CLAIM_DENIED/,
 "tampered bearer must be rejected");
await deny(stage(first,owner,different),/HUMAN_BROKER_CLAIM_DENIED/,
 "different same-length content must be rejected before storage");
const saved=await stage(first);
assert.equal(saved.status,"RLS_PRIVATE_BYTES_ONLY");
assert.equal(saved.sha256,hash(bytes));checks+=2;
await deny(stage(first),/HUMAN_BROKER_CLAIM_DENIED/,"one-use replay denied");
const guest=createClient(url.origin,anon,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const anonGet=await guest.storage.from(saved.bucket).download(saved.path);
yes(!!anonGet.error,"private stage must not be anonymously readable");
const upsert=await fetch(url.origin+"/storage/v1/object/"+saved.bucket+"/"+saved.path,{
 method:"POST",headers:{apikey:anon,Authorization:"Bearer "+owner.jwt,
  "Content-Type":"audio/wav","x-upsert":"true"},body:different,
 signal:AbortSignal.timeout(12000)});
yes(upsert.status>=400&&upsert.status<500,"user JWT x-upsert denied by Storage RLS");
const ownerRead=await fetch(url.origin+"/storage/v1/object/authenticated/"+
 saved.bucket+"/"+saved.path,{headers:{apikey:anon,Authorization:"Bearer "+owner.jwt},
 signal:AbortSignal.timeout(12000)});
yes(ownerRead.status===200&&hash(Buffer.from(await ownerRead.arrayBuffer()))===hash(bytes),
 "stored first-write bytes never changed");
const concurrent=await mint();
const simultaneous=await Promise.allSettled([stage(concurrent),stage(concurrent)]);
const success=simultaneous.filter(x=>x.status==="fulfilled");
const rejected=simultaneous.filter(x=>x.status==="rejected");
yes(success.length===1&&rejected.length===1&&
 String(rejected[0].reason).includes("HUMAN_BROKER_CLAIM_DENIED"),
 "concurrent same permit must commit exactly one write");
const used=sql("select count(*) from "+permits+" where "+
 "permit_id="+quoteId(concurrent.capability.split(".")[0])+
 " and claimed_at is not null;");
yes(used==="1","atomic nonce consumption lost race");
// NEGATIVE CONTROL: the earlier user-scoped fixture still permits raw JWT
// INSERT by owner without this broker. This PROVES a live route would need
// provider-side bucket/RLS fencing; the broker alone is not global containment.
const directPath="owner/"+owner.id+"/"+id()+".wav";
const direct=await fetch(url.origin+"/storage/v1/object/f2p-rls-user-stage/"+
 directPath,{method:"POST",
 headers:{apikey:anon,Authorization:"Bearer "+owner.jwt,
 "Content-Type":"audio/wav"},body:bytes,signal:AbortSignal.timeout(12000)});
yes(direct.status===200||direct.status===201,
 "baseline test invalid: current owner RLS directly permits bypassing broker");
const outside=await adminDeleteDirect();
async function adminDeleteDirect(){
 const privilege=createClient(url.origin,service,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 return privilege.storage.from("f2p-rls-user-stage").remove([directPath]);
}
assert.equal(outside.error,null,"synthetic direct-bypass test cleanup");checks++;
console.log("RISK: LOCAL direct owner JWT Storage INSERT bypasses one-shot broker under old RLS fixture");

const duringConsent=await mint();
setGrant("recording_consent",false);
await deny(stage(duringConsent),/HUMAN_BROKER_CLAIM_DENIED/,
 "consent revoked after issue must deny without write");
await deny(mint(),/HUMAN_BROKER_ISSUE_DENIED/,
 "consent revoked must deny new capability");
setGrant("recording_consent",true);
const duringRights=await mint();
setGrant("rights_allowed",false);
await deny(stage(duringRights),/HUMAN_BROKER_CLAIM_DENIED/,
 "rights revoked after issue must deny");
setGrant("rights_allowed",true);
const duringOwner=await mint();
setGrant("owner_allowed",false);
await deny(stage(duringOwner),/HUMAN_BROKER_CLAIM_DENIED/,
 "owner rights revoked after issue must deny");
setGrant("owner_allowed",true);
const expired=await mint();
const expiredId=expired.capability.split(".")[0];
sql("update "+permits+" set expires_at=clock_timestamp()-interval '1 second'"+
 " where permit_id="+quoteId(expiredId)+";");
await deny(stage(expired),/HUMAN_BROKER_CLAIM_DENIED/,
 "expired permit must fail without clock waiting");
const toDelete=await mint();
const beforeLogout=await stage(toDelete);
const admin=createClient(url.origin,service,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const gone=await admin.storage.from(beforeLogout.bucket).remove([beforeLogout.path]);
assert.equal(gone.error,null,"disposable cleanup");checks++;
await deny(stage(toDelete),/HUMAN_BROKER_CLAIM_DENIED/,
 "cleanup cannot resurrect a consumed permit");
const missing=await admin.storage.from(beforeLogout.bucket).download(beforeLogout.path);
yes(!!missing.error,"cleaned private stage not recreated");
const signedOutPermit=await mint();
const logout=await owner.client.auth.signOut({scope:"global"});
assert.equal(logout.error,null,"real global logout");checks++;
const sessionRemaining=sql("select count(*) from auth.sessions where id="+
 quoteId(owner.sessionId)+" and user_id="+quoteId(owner.id)+";");
yes(sessionRemaining==="0","real GoTrue global signOut must delete auth.sessions row");
await deny(stage(signedOutPermit),/HUMAN_BROKER_CLAIM_DENIED|HUMAN_BROKER_IDENTITY_DENIED/,
 "revoked real session must fail even with old JWT");
await deny(mint(),/HUMAN_BROKER_ISSUE_DENIED|HUMAN_BROKER_IDENTITY_DENIED/,
 "logged-out session must not issue new permit");
const tokenOnly={capability:first.capability};
await deny(broker.stage({userJwt:service,capability:tokenOnly.capability,bytes}),
 /HUMAN_BROKER_IDENTITY_REQUIRED/,
 "service-role JWT must never be upload identity");
assert.throws(()=>createDisposableHumanOneShotBroker({
 apiUrl:"https://www.syosetu-libread.com",anonKey:anon,store,
 stagePrivate:()=>{throw Error("MUST_NOT_CALL");}
}),/HUMAN_BROKER_LOCAL_ONLY/);checks++;
console.log("PASS: F2-P "+checks+
 " REAL LOCAL Human one-use broker, live session/consent/owner/rights, nonce race,"+
 " expiry, SHA-bound first-write, RLS private, no replay after cleanup");
console.log("RELEASE HOLD: candidate not wired to Human API; existing signed upload URL"+
 " and direct user JWT Storage routes remain outside this broker");
