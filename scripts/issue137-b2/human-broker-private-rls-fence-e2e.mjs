// Issue #137: exclusively disposable localhost GoTrue/PostgreSQL/Storage.
import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {randomUUID,createHash} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {createDisposableHumanOneShotBroker} from "./human-one-shot-broker-local.mjs";
import {createDisposablePrivateByteRecovery} from "./human-broker-byte-recovery-local.mjs";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const endpoint=process.env.B2_LOCAL_URL??"",url=new URL(endpoint);
assert.equal(url.protocol,"http:");
assert.ok(["127.0.0.1","localhost","[::1]"].includes(url.hostname));
assert.ok(["54321","54331"].includes(url.port));
assert.equal(url.pathname,"/");assert.equal(url.search,"");assert.equal(url.hash,"");
const net=process.env.B2_NETWORK??"",pg=process.env.B2_DB_CONTAINER??"";
assert.match(net,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(pg,/^[a-f0-9]{12,64}$/);
assert.ok(execFileSync("docker",["ps","-q","--filter","network="+net],
 {encoding:"utf8",timeout:10000}).trim().split(/\s+/).includes(pg));
const anon=process.env.B2_ANON_KEY??"",adminKey=process.env.B2_SERVICE_KEY??"";
assert.ok(anon&&adminKey&&anon!==adminKey);
const bucket="f2p-broker-private-stage",uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const id=()=>randomUUID(),hash=v=>createHash("sha256").update(v).digest("hex");
const qid=x=>{assert.ok(uuid.test(x));return "'"+x+"'::uuid";};
const qhash=x=>{assert.match(x,/^[0-9a-f]{64}$/);return "'"+x+"'";};
function sql(statement){
 return execFileSync("docker",["exec",pg,"psql","-X","-Atq",
  "-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-c",statement],{
 encoding:"utf8",timeout:15000,stdio:["ignore","pipe","pipe"]}).trim();
}
let n=0,storageWrites=0;
function yes(x,message){assert.ok(x,message);n++;}
function deny(x,message){
 yes(x.status>=400&&x.status<500,message+" returned "+x.status);
}
const authOpts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(url.origin,adminKey,authOpts);
async function createPerson(app_metadata={}){
 const email="f2p-rlsbroker-"+id()+"@example.invalid",password="F2P-"+id()+"-A1!";
 const user=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata});
 assert.equal(user.error,null,"create local user");
 const client=createClient(url.origin,anon,authOpts);
 const login=await client.auth.signInWithPassword({email,password});
 assert.equal(login.error,null,"login local user");
 const jwt=login.data.session?.access_token;yes(jwt,"local JWT exists");
 const claims=JSON.parse(Buffer.from(jwt.split(".")[1],"base64url").toString());
 yes(claims.sub===user.data.user.id&&uuid.test(claims.session_id),
  "session must bind to real actor");
 return {id:user.data.user.id,sessionId:claims.session_id,jwt,client,claims};
}
const actor=await createPerson(),rogue=await createPerson(),
 brokerUser=await createPerson({libread_local_broker:true});
yes(brokerUser.claims.app_metadata?.libread_local_broker===true,
 "GoTrue broker-only signed app_metadata required");
yes(!actor.claims.app_metadata?.libread_local_broker,
 "ordinary user must not inherit broker flag");
sql("insert into libread_internal.issue137_human_broker_local_identity(user_id)"+
 " values("+qid(brokerUser.id)+");");
sql("insert into libread_internal.issue137_human_broker_grants(actor_id)"+
 " values("+qid(actor.id)+");");
const grant="libread_internal.issue137_human_broker_grants";
const permits="libread_internal.issue137_human_broker_permits";
const store={
 async issueAtomic(p){
  const value=sql("insert into "+permits+
   "(permit_id,token_sha256,actor_id,session_id,object_id,expected_sha256,expires_at)"+
   " select "+qid(p.permitId)+","+qhash(p.tokenHash)+","+
   qid(p.actorId)+","+qid(p.sessionId)+","+qid(p.objectId)+","+
   qhash(p.expectedSha256)+","+
   "'"+p.expiresAt+"'::timestamptz from "+grant+" g where "+
   "g.actor_id="+qid(p.actorId)+" and g.recording_consent"+
   " and g.owner_allowed and g.rights_allowed and exists ("+
   "select 1 from auth.sessions s where s.id="+qid(p.sessionId)+
   " and s.user_id="+qid(p.actorId)+") returning permit_id;");
  return value===p.permitId;
 },
 async claimAtomic(p){
  const value=sql("update "+permits+" p set claimed_at=clock_timestamp()"+
   " from "+grant+" g where p.permit_id="+qid(p.permitId)+
   " and p.token_sha256="+qhash(p.tokenHash)+
   " and p.actor_id="+qid(p.actorId)+
   " and p.session_id="+qid(p.sessionId)+
   " and p.expected_sha256="+qhash(p.bytesHash)+
   " and p.claimed_at is null and p.expires_at>clock_timestamp()"+
   " and g.actor_id=p.actor_id and g.recording_consent"+
   " and g.owner_allowed and g.rights_allowed"+
   " and exists(select 1 from auth.sessions s where s.id=p.session_id"+
   " and s.user_id=p.actor_id) returning p.object_id;");
  return uuid.test(value)?{objectId:value}:null;
 }
};
async function storage(method,path,auth,bytes,extra={}){
 const headers={apikey:anon,Authorization:"Bearer "+auth,...extra};
 if(bytes)headers["Content-Type"]="audio/wav";
 const r=await fetch(url.origin+path,{method,headers,body:bytes,
  cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
 const buffer=Buffer.from(await r.arrayBuffer());
 return {status:r.status,body:buffer};
}
const pathFor=x=>"owner/"+actor.id+"/"+x+".wav";
const put=(path,jwt,bytes,extra={})=>
 storage("POST","/storage/v1/object/"+bucket+"/"+path,jwt,bytes,extra);
const get=(path,jwt)=>storage("GET","/storage/v1/object/authenticated/"+
 bucket+"/"+path,jwt);
const bytes=Buffer.alloc(48);
bytes.write("RIFF",0);bytes.writeUInt32LE(40,4);bytes.write("WAVEfmt ",8);
bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);
bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);
bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);
bytes.write("data",36);bytes.writeUInt32LE(4,40);
bytes.writeInt16LE(11,44);bytes.writeInt16LE(-11,46);
const observed=await admin.storage.getBucket(bucket);
assert.equal(observed.error,null);
yes(observed.data?.public===false,"broker bucket must be PRIVATE");
const direct=pathFor(id());
deny(await put(direct,actor.jwt,bytes),"ordinary JWT direct INSERT without permit");
deny(await put(direct,rogue.jwt,bytes),"other user direct INSERT");
deny(await put(direct,brokerUser.jwt,bytes),"broker JWT without claimed permit");
deny(await put(pathFor(id()),anon,bytes),"anon direct INSERT");
yes(sql("select count(*) from storage.objects where bucket_id='"+bucket+"'")==="0",
 "denied direct Storage writes must not persist objects");
const newBroker=createDisposableHumanOneShotBroker({
 apiUrl:endpoint,anonKey:anon,store,
 stagePrivate:async args=>{
  const path=pathFor(args.objectId);
  storageWrites++;
  const r=await put(path,brokerUser.jwt,args.bytes);
  if(![200,201].includes(r.status))throw Error("BROKER_RLS_STAGE_DENIED:"+r.status);
  const saved=await get(path,args.userJwt);
  if(saved.status!==200||hash(saved.body)!==hash(args.bytes))
   throw Error("BROKER_PRIVATE_DIGEST_HOLD");
  return {path,bucket,sha256:hash(saved.body)};
 }
});
const issue=(payload=bytes)=>
 newBroker.issue({userJwt:actor.jwt,actorId:actor.id,
  objectId:id(),expectedSha256:hash(payload)});
const stage=(permit,payload=bytes)=>
 newBroker.stage({userJwt:actor.jwt,capability:permit.capability,bytes:payload});
const mint=await issue();
const permitId=mint.capability.split(".")[0];
const permitPath=sql("select 'owner/'||actor_id::text||'/'||object_id::text||'.wav'"+
 " from "+permits+" where permit_id="+qid(permitId));
deny(await put(permitPath,actor.jwt,bytes),
 "ordinary JWT direct write despite unclaimed permit");
deny(await put(permitPath,brokerUser.jwt,bytes),
 "broker JWT cannot write until permit atomically claimed");
const out=await stage(mint);
yes(out.path===permitPath&&out.bucket===bucket&&out.sha256===hash(bytes),
 "broker claimed permit then stored exact PRIVATE bytes");
const readonly=await get(permitPath,actor.jwt);
yes(readonly.status===200&&hash(readonly.body)===hash(bytes),
 "owner private download works without broker JWT");
const anonymousGet=await storage("GET","/storage/v1/object/public/"+
 bucket+"/"+permitPath,anon);
deny(anonymousGet,"anonymous public-route GET blocked");
deny(await put(permitPath,brokerUser.jwt,bytes),
 "same-key replay WITHOUT upsert blocked");
deny(await put(permitPath,brokerUser.jwt,bytes,{"x-upsert":"true"}),
 "same-key broker JWT UPSERT blocked by restrictive UPDATE fence");
const after=await get(permitPath,actor.jwt);
yes(after.status===200&&hash(after.body)===hash(bytes),
 "upsert attempts cannot alter original bytes");
async function createClaimed(){
 const c=await issue();
 const key=c.capability.split(".")[0];
 const p="owner/"+actor.id+"/"+
   sql("select object_id from "+permits+" where permit_id="+qid(key))+".wav";
 sql("update "+permits+" set claimed_at=clock_timestamp()"+
  " where permit_id="+qid(key)+";");
 return {permit:c,path:p,id:key};
}
const expired=await createClaimed();
sql("update "+permits+" set expires_at=clock_timestamp()-interval '1 second'"+
 " where permit_id="+qid(expired.id)+";");
deny(await put(expired.path,brokerUser.jwt,bytes),
 "expired claimed permit blocked by actual Storage RLS");
const revokeConsent=await createClaimed();
sql("update "+grant+" set recording_consent=false"+
 " where actor_id="+qid(actor.id)+";");
deny(await put(revokeConsent.path,brokerUser.jwt,bytes),
 "revoked consent denied at Storage INSERT");
sql("update "+grant+" set recording_consent=true"+
 " where actor_id="+qid(actor.id)+";");
const revokeOwner=await createClaimed();
sql("update "+grant+" set owner_allowed=false"+
 " where actor_id="+qid(actor.id)+";");
deny(await put(revokeOwner.path,brokerUser.jwt,bytes),
 "revoked ownership denied at Storage INSERT");
sql("update "+grant+" set owner_allowed=true"+
 " where actor_id="+qid(actor.id)+";");
const revokeRights=await createClaimed();
sql("update "+grant+" set rights_allowed=false"+
 " where actor_id="+qid(actor.id)+";");
deny(await put(revokeRights.path,brokerUser.jwt,bytes),
 "revoked rights denied at Storage INSERT");
sql("update "+grant+" set rights_allowed=true"+
 " where actor_id="+qid(actor.id)+";");
const parallel=await createClaimed();
const outcomes=await Promise.all([
 put(parallel.path,brokerUser.jwt,bytes),
 put(parallel.path,brokerUser.jwt,bytes)
]);
yes(outcomes.filter(r=>[200,201].includes(r.status)).length===1&&
 outcomes.filter(r=>r.status>=400).length===1,
 "two simultaneous Storage POSTs to the same claimed permit must preserve one-first-write");
const concurrentSaved=await get(parallel.path,actor.jwt);
yes(concurrentSaved.status===200&&hash(concurrentSaved.body)===hash(bytes),
 "parallel Storage uploads kept exact original bytes");
// ADVERSARIAL CONTROL: the RLS helper can inspect permit metadata, NOT
// physical bytes. A leaked broker-scoped JWT can substitute same-size WAV
// bytes at a currently claimed path. Application broker digest controls only
// requests it directly handles, not alternate holders of this principal.
const tamper=await createClaimed();
const tampered=Buffer.from(bytes);
tampered.writeInt16LE(99,44);
const bypass=await put(tamper.path,brokerUser.jwt,tampered);
yes([200,201].includes(bypass.status),
 "fixture must expose broker-principal SHA substitution risk");
const tamperedRead=await get(tamper.path,actor.jwt);
yes(tamperedRead.status===200&&hash(tamperedRead.body)===hash(tampered)&&
 hash(tamperedRead.body)!==hash(bytes),
 "provider-side RLS alone cannot authenticate actual audio SHA");
// Nonproduction mixed evidence: real LOCAL provider bytes + mock-only recovery
// ledger. The provider RLS (above) allowed tampered content; recovery must HOLD.
const receipts="libread_internal.issue137_human_broker_receipts";
// DB-owned one-use ledger: PostgreSQL durability + version CAS, not mock memory.
function getReceipt(key){
 const text=sql("select json_build_object("+
  "'id',r.permit_id,'actorId',p.actor_id,'sessionId',p.session_id,"+
  "'objectId',p.object_id,'bucket','f2p-broker-private-stage',"+
  "'path','owner/'||p.actor_id::text||'/'||p.object_id::text||'.wav',"+
  "'expectedSha256',p.expected_sha256,'state',r.state,"+
  "'attempted',r.attempted,'version',r.version)::text from "+
  receipts+" r join "+permits+" p on p.permit_id=r.permit_id"+
  " where r.permit_id="+qid(key));
 return text?JSON.parse(text):null;
}
function snapshotFor(permitId,objectPath,attempted){
 const result=sql("insert into "+receipts+"(permit_id,attempted,version)"+
  " select p.permit_id,"+(attempted?"true,1":"false,0")+
  " from "+permits+" p where p.permit_id="+qid(permitId)+
  " and p.claimed_at is not null and p.actor_id="+qid(actor.id)+
  " and p.session_id="+qid(actor.sessionId)+
  " returning permit_id;");
 assert.equal(result,permitId,"a claimed permit is required for durable recovery ledger");
 const row=getReceipt(permitId);
 assert.equal(row?.path,objectPath,"recovery path must match claimed private object");
 return row;
}
function recoveryFor(receipt,{lostAcknowledgement=false}={}){
 // All receipt reads, markAttempt and seal execute against real LOCAL PG.
 // The GoTrue/Storage credentials remain in this trusted disposable test
 // closure, never returned to the browser or to the recovery module config.
 const ledger={
  get:async key=>getReceipt(key),
  markAttempt:async(key,revision)=>{
   assert.ok(Number.isSafeInteger(revision)&&revision>=0);
   return sql("update "+receipts+" r set attempted=true,version=version+1"+
    " from "+permits+" p where r.permit_id="+qid(key)+
    " and p.permit_id=r.permit_id and p.claimed_at is not null"+
    " and p.expires_at>clock_timestamp() and r.state='CLAIMED'"+
    " and not r.attempted and r.version="+revision+
    " returning r.permit_id;")===key;
  },
  seal:async(key,revision,digest)=>{
   assert.ok(Number.isSafeInteger(revision)&&revision>=0);
   return sql("update "+receipts+" r set"+
    " state='SEALED_PRIVATE_SNAPSHOT',version=version+1,"+
    " verified_sha256="+qhash(digest)+",verified_at=clock_timestamp()"+
    " from "+permits+" p join "+grant+" g on g.actor_id=p.actor_id"+
    " where r.permit_id="+qid(key)+
    " and p.permit_id=r.permit_id and p.claimed_at is not null"+
    " and r.attempted and r.state='CLAIMED'"+
    " and r.version="+revision+" and p.expected_sha256="+qhash(digest)+
    " and g.recording_consent and g.owner_allowed and g.rights_allowed"+
    " and exists(select 1 from auth.sessions s where s.id=p.session_id"+
    " and s.user_id=p.actor_id) returning r.permit_id;")===key;
  }
 };
 const reader={
  putNew:async(bucketId,p,raw)=>{
   assert.equal(bucketId,bucket);assert.equal(p,receipt.path);
   const written=await put(p,brokerUser.jwt,raw);
   if(![200,201].includes(written.status))throw Error("LOCAL_STORAGE_PUT_DENIED");
   if(lostAcknowledgement)throw Error("SYNTHETIC_ACK_LOST_AFTER_PROVIDER_ACCEPTED");
  },
  readPrivate:async(bucketId,p)=>{
   assert.equal(bucketId,bucket);assert.equal(p,receipt.path);
   const r=await get(p,actor.jwt);
   return r.status===200?{objectId:receipt.objectId,bytes:r.body}:null;
  }
 };
 return createDisposablePrivateByteRecovery({
  apiUrl:endpoint,ledger,storage:reader,
  freshAuthority:async()=>sql(
   "select count(*) from "+grant+" g join auth.sessions s"+
   " on s.user_id=g.actor_id where g.actor_id="+qid(actor.id)+
   " and s.id="+qid(actor.sessionId)+
   " and g.recording_consent and g.owner_allowed and g.rights_allowed"
  )==="1",
  writerIsolated:async()=>brokerUser.claims.app_metadata?.libread_local_broker===true&&
   sql("select count(*) from libread_internal.issue137_human_broker_local_identity"+
   " where user_id="+qid(brokerUser.id))==="1"
 });
}
const corruptReceipt=snapshotFor(tamper.id,tamper.path,true);
const corruptCheck=await recoveryFor(corruptReceipt).reconcile(tamper.id);
yes(corruptCheck.status==="BYTE_MISMATCH_HOLD"&&
 corruptReceipt.state==="CLAIMED",
 "REAL LOCAL provider altered PRIVATE WAV must not obtain verified receipt");
const goodReceipt=snapshotFor(permitId,permitPath,true);
const goodCheck=await recoveryFor(goodReceipt).reconcile(permitId);
yes(goodCheck.status==="PRIVATE_SNAPSHOT_VERIFIED_ONLY"&&
 getReceipt(permitId)?.state==="SEALED_PRIVATE_SNAPSHOT",
 "REAL LOCAL provider exact PRIVATE WAV permits snapshot receipt only");
// Simulate losing a successful PUT response; no second write is allowed.
// Reconcile using actual localhost Storage GET and synthetic CAS ledger.
// This is NOT a real process-kill/durable DB recovery proof.
const interrupted=await createClaimed();
const interruptedReceipt=snapshotFor(interrupted.id,interrupted.path,false);
const recovery=recoveryFor(interruptedReceipt,{lostAcknowledgement:true});
const held=await recovery.stage(interrupted.id,bytes);
yes(held.status==="AMBIGUOUS_PUT_HOLD"&&getReceipt(interrupted.id)?.attempted,
 "ambiguous LOCAL PUT must remain consumed and require fresh reconciliation");
const dontRetry=await recovery.stage(interrupted.id,bytes);
yes(dontRetry.status==="ALREADY_ATTEMPTED_HOLD",
 "ambiguous LOCAL PUT must not retry at Storage");
const retrieved=await recovery.reconcile(interrupted.id);
yes(retrieved.status==="PRIVATE_SNAPSHOT_VERIFIED_ONLY",
 "actual LOCAL PRIVATE byte GET + mock CAS reconciles lost acknowledgement");
const noReplay=await put(interrupted.path,brokerUser.jwt,bytes);
deny(noReplay,"RLS must deny replay after reconciled simulated ACK loss");
const clearInterrupted=await admin.storage.from(bucket).remove([interrupted.path]);
assert.equal(clearInterrupted.error,null,"cleanup synthetic recovered PRIVATE object");n++;
console.log("PASS: F2-P REAL LOCAL PostgreSQL durable receipt CAS + PRIVATE provider-byte readback and ACK-loss reconciliation");
const purge=await admin.storage.from(bucket).remove([tamper.path]);
assert.equal(purge.error,null,"remove disposable substituted test object");n++;
console.log("RISK: LOCAL leaked restricted broker JWT can insert altered bytes into a claimed path; RLS does not validate physical SHA");
const sessionKill=await createClaimed();
const loggedOut=await actor.client.auth.signOut({scope:"global"});
assert.equal(loggedOut.error,null,"real local GoTrue global logout");n++;
yes(sql("select count(*) from auth.sessions where id="+qid(actor.sessionId))==="0",
 "GoTrue global logout must delete auth.sessions row");
deny(await put(sessionKill.path,brokerUser.jwt,bytes),
 "claimed permit cannot write after actor session logout at Storage RLS");
const finalCount=sql("select count(*) from storage.objects where bucket_id='"+bucket+"'");
yes(finalCount==="2","only two granted objects should exist");
const publicFlip=await admin.storage.updateBucket(bucket,{public:true});
yes(!!publicFlip.error,"even privileged local bucket flag flip must fail");
const last=await admin.storage.getBucket(bucket);
yes(last.data?.public===false,"private bucket remains private");
console.log("PASS: F2-P "+n+
 " REAL LOCAL provider-side broker-only PRIVATE RLS, direct-JWT denies, "+
 "real session/consent/rights revocation, expiry, parallel first-write");
console.log("LIMIT: privileged service-role and S3 bypass RLS; broker staging "+
 "does not atomically commit bytes with DB claim");
