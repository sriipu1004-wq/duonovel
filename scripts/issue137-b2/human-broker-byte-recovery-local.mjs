// Issue #137 F2-P NONPRODUCTION, NON-WIRED private byte/claim recovery proof.
// This is a local-only receipt guard, NOT a media publisher or provider security boundary.
import {createHash} from "node:crypto";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const sha=/^[a-f0-9]{64}$/u;
const hash=b=>createHash("sha256").update(b).digest("hex");
const PRIVATE="f2p-broker-private-stage";
function localOnly(apiUrl) {
 if(process.env.DO_NOT_CONTACT_PRODUCTION!=="true" ||
    process.env.B2_EPHEMERAL_CONFIRM!=="local-only" ||
    process.env.B2_LOCAL_URL!==apiUrl) throw Error("F2P_RECOVERY_LOCAL_ONLY");
 const u=new URL(apiUrl);
 if(u.protocol!=="http:" ||
    !["127.0.0.1","localhost","[::1]"].includes(u.hostname) ||
    !["54321","54331"].includes(u.port) ||
    u.pathname!=="/"||u.search||u.hash) throw Error("F2P_RECOVERY_LOCAL_ONLY");
}
export function createDisposablePrivateByteRecovery(config) {
 localOnly(config?.apiUrl);
 // No privileged provider credential or browser signed bearer may be passed
 // to the candidate as configuration.
 for(const forbidden of ["serviceRoleKey","s3Key","brokerJwt","signedUploadUrl"]) {
  if(forbidden in config) throw Error("F2P_RECOVERY_PRIVILEGED_INPUT_DENIED");
 }
 for(const fn of ["get","markAttempt","seal"]) {
  if(typeof config.ledger?.[fn]!=="function") throw Error("F2P_RECOVERY_LEDGER_REQUIRED");
 }
 for(const fn of ["putNew","readPrivate"]) {
  if(typeof config.storage?.[fn]!=="function") throw Error("F2P_RECOVERY_STORAGE_REQUIRED");
 }
 if(typeof config.freshAuthority!=="function"||
    typeof config.writerIsolated!=="function")
  throw Error("F2P_RECOVERY_TRUST_REQUIRED");
 // Every success is a PRIVATE-only point-in-time evidence receipt. Physical
 // objects can still change afterward through alternate privileged S3 writers.
 const hold=reason=>({status:reason});
 const accepted=r=>r&&uuid.test(r.id)&&uuid.test(r.actorId)&&
  uuid.test(r.objectId)&&uuid.test(r.sessionId)&&
  r.bucket===PRIVATE&&r.path===("owner/"+r.actorId+"/"+r.objectId+".wav")&&
  sha.test(r.expectedSha256)&&Number.isSafeInteger(r.version)&&r.version>=0;
 async function load(id) {
  if(!uuid.test(id))return null;
  try {const r=await config.ledger.get(id);return accepted(r)?r:null;}
  catch{return null;}
 }
 async function trusted(r) {
  try {
   if(await config.writerIsolated(r)!==true)return "WRITER_ISOLATION_HOLD";
   if(await config.freshAuthority(r)!==true)return "AUTHORITY_HOLD";
   return null;
  }catch{return "TRUST_CHECK_HOLD";}
 }
 async function reconcile(id) {
  const r=await load(id);
  if(!r)return hold("UNKNOWN_CLAIM_HOLD");
  if(r.state!=="CLAIMED"||r.attempted!==true)return hold("NOT_RECONCILABLE_HOLD");
  const before=await trusted(r);if(before)return hold(before);
  let found;
  try {found=await config.storage.readPrivate(r.bucket,r.path);}
  catch{return hold("PRIVATE_READ_HOLD");}
  if(!found)return hold("MISSING_BYTES_HOLD");
  if(found.objectId!==r.objectId||!(found.bytes instanceof Uint8Array)||
     found.bytes.length===0||found.bytes.length>1024*1024)
   return hold("OBJECT_IDENTITY_HOLD");
  if(hash(found.bytes)!==r.expectedSha256)return hold("BYTE_MISMATCH_HOLD");
  // Re-read ledger and authorities to bound the verify-to-commit race.
  const current=await load(id);
  if(!current||current.version!==r.version||current.state!=="CLAIMED"||
     current.attempted!==true)return hold("CLAIM_REVISION_HOLD");
  const after=await trusted(current);if(after)return hold(after);
  let settled=false;
  try {settled=await config.ledger.seal(id,current.version,r.expectedSha256);}
  catch{return hold("SEAL_ERROR_HOLD");}
  if(settled!==true)return hold("SEAL_CONFLICT_HOLD");
  // NOT PUBLIC_READY. No public URL, privilege grant or media bytes returned.
  return {status:"PRIVATE_SNAPSHOT_VERIFIED_ONLY"};
 }
 async function stage(id,bytes) {
  // Copy before the first await: a mutable caller-owned Uint8Array must not
  // be modified after digest validation but before the actual Storage write.
  const bounded=bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=1024*1024;
  const immutableSnapshot=bounded?Buffer.from(bytes):null;
  const r=await load(id);
  if(!r)return hold("UNKNOWN_CLAIM_HOLD");
  if(r.state!=="CLAIMED"||r.attempted!==false)return hold("ALREADY_ATTEMPTED_HOLD");
  if(!immutableSnapshot||hash(immutableSnapshot)!==r.expectedSha256)
   return hold("INPUT_BYTES_HOLD");
  const gate=await trusted(r);if(gate)return hold(gate);
  // Persist attempt BEFORE any network write. No automatic repeat even when
  // provider accepted the PUT but the response was lost.
  let marked=false;
  try {marked=await config.ledger.markAttempt(id,r.version);}
  catch{return hold("ATTEMPT_LEDGER_HOLD");}
  if(marked!==true)return hold("ATTEMPT_CONFLICT_HOLD");
  try {await config.storage.putNew(r.bucket,r.path,immutableSnapshot);}
  catch{return hold("AMBIGUOUS_PUT_HOLD");}
  return reconcile(id);
 }
 return {stage,reconcile};
}
