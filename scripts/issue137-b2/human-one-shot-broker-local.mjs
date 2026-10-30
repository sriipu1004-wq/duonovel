// Issue #137: NON-WIRED disposable Human upload capability broker candidate.
// Never returns a Supabase signed upload URL. NEVER receives a service-role or
// static S3 key. Owner+session+consent authority MUST be checked by trusted DB
// adapter at BOTH issue and consume, not by JWT claims alone.
// This is NOT a production authorization, not an application API route.
import {createHash,randomBytes,randomUUID} from "node:crypto";

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const hex64=/^[a-f0-9]{64}$/u;
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
function readClaims(jwt) {
 if(typeof jwt!=="string"||jwt.split(".").length!==3)
  throw Error("HUMAN_BROKER_IDENTITY_REQUIRED");
 try {
  const c=JSON.parse(Buffer.from(jwt.split(".")[1],"base64url").toString());
  if(c.role==="authenticated"&&uuid.test(c.sub)&&uuid.test(c.session_id))
   return {actorId:c.sub,sessionId:c.session_id};
 }catch {/* fail closed */}
 throw Error("HUMAN_BROKER_IDENTITY_REQUIRED");
}
export function createDisposableHumanOneShotBroker(config) {
 if(process.env.DO_NOT_CONTACT_PRODUCTION!=="true" ||
    process.env.B2_EPHEMERAL_CONFIRM!=="local-only" ||
    config?.apiUrl!==process.env.B2_LOCAL_URL)
  throw Error("HUMAN_BROKER_LOCAL_ONLY");
 const url=new URL(config.apiUrl);
 if(url.protocol!=="http:" ||
    !["localhost","127.0.0.1","[::1]"].includes(url.hostname) ||
    !["54321","54331"].includes(url.port) ||
    url.pathname!=="/"||url.search||url.hash)
  throw Error("HUMAN_BROKER_LOCAL_ONLY");
 if(typeof config.anonKey!=="string"||
    JSON.parse(Buffer.from(config.anonKey.split(".")[1]??"","base64url").toString()).role!=="anon")
  throw Error("HUMAN_BROKER_ANON_KEY_REQUIRED");
 for(const name of ["issueAtomic","claimAtomic"]){
  if(typeof config.store?.[name]!=="function")throw Error("HUMAN_BROKER_STORE_REQUIRED");
 }
 if(typeof config.stagePrivate!=="function")throw Error("HUMAN_BROKER_PRIVATE_STAGE_REQUIRED");
 const transport=config.fetchImpl??fetch;
 async function identity(userJwt) {
  const claim=readClaims(userJwt);
  const r=await transport(new URL("/auth/v1/user",url),{
   headers:{apikey:config.anonKey,Authorization:"Bearer "+userJwt},
   cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000)
  });
  if(r.status!==200)throw Error("HUMAN_BROKER_IDENTITY_DENIED");
  const user=await r.json();
  if(user?.id!==claim.actorId)throw Error("HUMAN_BROKER_IDENTITY_DENIED");
  return claim;
 }
 async function issue({userJwt,actorId,objectId,expectedSha256}){
  if(!uuid.test(actorId)||!uuid.test(objectId)||!hex64.test(expectedSha256))
   throw Error("HUMAN_BROKER_INVALID_REQUEST");
  const claim=await identity(userJwt);
  if(claim.actorId!==actorId)throw Error("HUMAN_BROKER_OWNER_DENIED");
  const permitId=randomUUID(),secret=randomBytes(32).toString("hex");
  const stored=await config.store.issueAtomic({
   permitId,tokenHash:digest(Buffer.from(secret,"hex")),
   actorId,sessionId:claim.sessionId,objectId,expectedSha256,
   expiresAt:new Date(Date.now()+30_000).toISOString()
  });
  if(!stored)throw Error("HUMAN_BROKER_ISSUE_DENIED");
  // Bearer alone is never enough to upload. Caller must supply a FRESH user
  // session JWT AND the DB must still recognize its live auth.sessions row.
  return {capability:permitId+"."+secret};
 }
 async function stage({userJwt,capability,bytes}){
  if(!(bytes instanceof Uint8Array)||bytes.length===0||bytes.length>1024*1024)
   throw Error("HUMAN_BROKER_BYTES_DENIED");
  if(typeof capability!=="string"||
     !/^[a-f0-9-]{36}\.[a-f0-9]{64}$/u.test(capability))
   throw Error("HUMAN_BROKER_CAPABILITY_INVALID");
  const [permitId,secret]=capability.split(".");
  if(!uuid.test(permitId))throw Error("HUMAN_BROKER_CAPABILITY_INVALID");
  const actor=await identity(userJwt);
  const grant=await config.store.claimAtomic({
   permitId,tokenHash:digest(Buffer.from(secret,"hex")),
   actorId:actor.actorId,sessionId:actor.sessionId,bytesHash:digest(bytes)
  });
  // Atomic claim occurs BEFORE any Storage PUT. If Storage subsequently
  // fails, capability remains consumed: fail-closed, with no retry.
  if(!grant||!uuid.test(grant.objectId))
   throw Error("HUMAN_BROKER_CLAIM_DENIED");
  return config.stagePrivate({
   userJwt,actorId:actor.actorId,objectId:grant.objectId,bytes
  });
 }
 return {issue,stage};
}
