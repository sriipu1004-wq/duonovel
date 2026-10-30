// Issue #137: TEST/MODEL ONLY. No provider credentials or network calls.
// Correctness of injected ledgers/readbacks is NOT proven by this mock.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {createDisposablePrivateByteRecovery} from "./human-broker-byte-recovery-local.mjs";

process.env.DO_NOT_CONTACT_PRODUCTION="true";
process.env.B2_EPHEMERAL_CONFIRM="local-only";
process.env.B2_LOCAL_URL="http://127.0.0.1:54321/";
const digest=v=>createHash("sha256").update(v).digest("hex");
const uuid=()=>randomUUID(),bytes=Buffer.from("RIFF-local-fixture-synthetic-only");
let checks=0;
const result=(r,want)=>{assert.equal(r.status,want);checks++;};
function fixture(overrides={}) {
 const actorId=uuid(),objectId=uuid(),id=uuid(),sessionId=uuid();
 const row={id,actorId,objectId,sessionId,
  bucket:"f2p-broker-private-stage",
  path:"owner/"+actorId+"/"+objectId+".wav",
  expectedSha256:digest(bytes),state:"CLAIMED",attempted:false,version:0};
 const state={row,objects:new Map(),puts:0,reads:0,seals:0,
  isolated:true,authorized:true,onPut:null,onRead:null,readError:false};
 Object.assign(state,overrides);
 const ledger={
  get:async key=>key===row.id?{...row}:null,
  markAttempt:async(key,v)=>{
   if(key!==row.id||v!==row.version||row.attempted||row.state!=="CLAIMED")return false;
   row.attempted=true;row.version++;return true;
  },
  seal:async(key,v,expected)=>{
   if(key!==row.id||v!==row.version||row.state!=="CLAIMED"||
      !row.attempted||row.expectedSha256!==expected)return false;
   row.state="SEALED_PRIVATE_SNAPSHOT";row.version++;state.seals++;return true;
  }
 };
 const storage={
  putNew:async(bucket,path,payload)=>{
   state.puts++;
   if(state.objects.has(bucket+"/"+path))throw Error("EXISTS");
   state.objects.set(bucket+"/"+path,Buffer.from(payload));
   if(state.onPut)await state.onPut(state);
  },
  readPrivate:async(bucket,path)=>{
   state.reads++;
   if(state.onRead)await state.onRead(state);
   if(state.readError)throw Error("READ_FAILURE");
   const payload=state.objects.get(bucket+"/"+path);
   return payload?{bytes:Buffer.from(payload),objectId:row.objectId}:null;
  }
 };
 const candidate=createDisposablePrivateByteRecovery({
  apiUrl:process.env.B2_LOCAL_URL,ledger,storage,
  freshAuthority:async()=>state.authorized===true,
  writerIsolated:async()=>state.isolated===true
 });
 return {...state,candidate,id,row,storage,ledger};
}
{
 const f=fixture();
 result(await f.candidate.stage(f.id,bytes),"PRIVATE_SNAPSHOT_VERIFIED_ONLY");
 assert.equal(f.objects.size,1);checks++; // exactly one PRIVATE modeled object
 assert.equal(f.row.state,"SEALED_PRIVATE_SNAPSHOT");checks++;
 result(await f.candidate.reconcile(f.id),"NOT_RECONCILABLE_HOLD");
 result(await f.candidate.stage(f.id,bytes),"ALREADY_ATTEMPTED_HOLD");
}
{
 const f=fixture();
 result(await f.candidate.stage(f.id,Buffer.from("different-same-size-or-less")),"INPUT_BYTES_HOLD");
 assert.equal(f.row.attempted,false);checks++;
 result(await f.candidate.stage(uuid(),bytes),"UNKNOWN_CLAIM_HOLD");
}
{
 const f=fixture();
 f.row.bucket="recording-audio";
 result(await f.candidate.stage(f.id,bytes),"UNKNOWN_CLAIM_HOLD");
 assert.equal(f.row.attempted,false);checks++;
}
{
 const f=fixture();
 const blocked=createDisposablePrivateByteRecovery({
  apiUrl:process.env.B2_LOCAL_URL,ledger:f.ledger,storage:f.storage,
  freshAuthority:async()=>true,writerIsolated:async()=>false});
 result(await blocked.stage(f.id,bytes),"WRITER_ISOLATION_HOLD");
 assert.equal(f.row.attempted,false);checks++;
}
{
 const f=fixture();
 const blocked=createDisposablePrivateByteRecovery({
  apiUrl:process.env.B2_LOCAL_URL,ledger:f.ledger,storage:f.storage,
  freshAuthority:async()=>false,writerIsolated:async()=>true});
 result(await blocked.stage(f.id,bytes),"AUTHORITY_HOLD");
 assert.equal(f.row.attempted,false);checks++;
}
{
 const f=fixture({onPut:async()=>{throw Error("ACK_LOST_AFTER_WRITE");}});
 result(await f.candidate.stage(f.id,bytes),"AMBIGUOUS_PUT_HOLD");
 assert.equal(f.row.attempted,true);checks++;
 result(await f.candidate.stage(f.id,bytes),"ALREADY_ATTEMPTED_HOLD");
 result(await f.candidate.reconcile(f.id),"PRIVATE_SNAPSHOT_VERIFIED_ONLY");
 assert.equal(f.row.state,"SEALED_PRIVATE_SNAPSHOT");checks++;
}
{
 const f=fixture({onPut:async state=>{
  state.objects.clear();throw Error("FAIL_BEFORE_BYTES_DURABLE");
 }});
 result(await f.candidate.stage(f.id,bytes),"AMBIGUOUS_PUT_HOLD");
 result(await f.candidate.reconcile(f.id),"MISSING_BYTES_HOLD");
 assert.equal(f.row.state,"CLAIMED");checks++;
 result(await f.candidate.stage(f.id,bytes),"ALREADY_ATTEMPTED_HOLD");
}
{
 const f=fixture({onPut:async state=>{
  state.objects.set(f.row.bucket+"/"+f.row.path,Buffer.from("ROGUE-MODIFIED-BYTES"));
 }});
 result(await f.candidate.stage(f.id,bytes),"BYTE_MISMATCH_HOLD");
 assert.equal(f.row.state,"CLAIMED");checks++;
 result(await f.candidate.reconcile(f.id),"BYTE_MISMATCH_HOLD");
}
{
 const f=fixture({onPut:async state=>{state.authorized=false;}});
 result(await f.candidate.stage(f.id,bytes),"AUTHORITY_HOLD");
 assert.equal(f.row.state,"CLAIMED");checks++;
}
{
 const f=fixture({onRead:async state=>{state.isolated=false;}});
 result(await f.candidate.stage(f.id,bytes),"WRITER_ISOLATION_HOLD");
 assert.equal(f.row.state,"CLAIMED");checks++;
}
{
 const f=fixture({onRead:async state=>{state.readError=true;}});
 result(await f.candidate.stage(f.id,bytes),"PRIVATE_READ_HOLD");
 assert.equal(f.row.state,"CLAIMED");checks++;
}
{
 const f=fixture();
 await f.ledger.markAttempt(f.id,0);
 f.objects.set(f.row.bucket+"/"+f.row.path,Buffer.from(bytes));
 const staleRead=createDisposablePrivateByteRecovery({
  apiUrl:process.env.B2_LOCAL_URL,ledger:f.ledger,
  storage:{putNew:f.storage.putNew,
   readPrivate:async()=>({objectId:uuid(),bytes:Buffer.from(bytes)})},
  freshAuthority:async()=>true,writerIsolated:async()=>true});
 result(await staleRead.reconcile(f.id),"OBJECT_IDENTITY_HOLD");
 assert.equal(f.row.state,"CLAIMED");checks++;
}
{
 const f=fixture();
 await f.ledger.markAttempt(f.id,0);
 f.objects.set(f.row.bucket+"/"+f.row.path,Buffer.from(bytes));
 const [a,b]=await Promise.all([f.candidate.reconcile(f.id),f.candidate.reconcile(f.id)]);
 assert.equal([a.status,b.status].filter(v=>v==="PRIVATE_SNAPSHOT_VERIFIED_ONLY").length,1);
 assert.equal([a.status,b.status].filter(v=>v==="SEAL_CONFLICT_HOLD"||
   v==="CLAIM_REVISION_HOLD"||v==="NOT_RECONCILABLE_HOLD").length,1);
 checks+=2;
}
{
 assert.throws(()=>createDisposablePrivateByteRecovery({
  apiUrl:process.env.B2_LOCAL_URL,serviceRoleKey:"should-not-be-accepted"
 }),/F2P_RECOVERY_PRIVILEGED_INPUT_DENIED/);checks++;
 assert.throws(()=>createDisposablePrivateByteRecovery({
  apiUrl:"https://www.syosetu-libread.com"
 }),/F2P_RECOVERY_LOCAL_ONLY/);checks++;
 const f=fixture();
 assert.equal(typeof f.candidate.publish,"undefined");checks++;
}
console.log("PASS: F2-P "+checks+
 " NONPRODUCTION model assertions for exact PRIVATE digest, principal isolation"+
 ", stale rights, ambiguous claim/PUT, no automatic replay and CAS recovery");
console.log("LIMIT: fake ledger/Storage; no real byte immutability, S3 credential isolation,"+
 " signed-in UI, real crashed process or PUBLIC release.");
