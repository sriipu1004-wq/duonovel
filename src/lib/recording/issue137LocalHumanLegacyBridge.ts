import { createHash } from "node:crypto";
// Issue #137 TEST-ONLY adapter for the ACTUAL legacy Human session/finalize
// handlers. Guarded twice (here and target local route); NEVER a publisher.
// No privileged key or S3 token is used or returned from this adapter.
import {NextResponse} from "next/server";
import {POST as localMultipartPost} from "@/app/api/recordings/human-local-multipart/route";
import {isSupportedAudioFile} from "@/lib/recording/audioUploadPolicy";
import {decideHumanProcessingTrialCapacity} from "@/lib/recording/humanProcessingCapacityDraft";
import {createClient} from "@/lib/supabase/server";
import {isOfficialAccountEmail} from "@/lib/auth/officialAccount";
import {decideRecordingEntryAccess,normalizeRecordingPermissionMode} from "@/lib/recording/recordingEntry";
import {RECORDING_GLOBAL_CONSENT_KEY,isAcceptedRecordingConsentVersion} from "@/lib/recording/recordingConsent";

type JsonData = Record<string,unknown>;
export type LocalLegacyProbeOperation = "open"|"finish";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
function exact(input:JsonData,keys:string[]):boolean {
 return Object.keys(input).length===keys.length&&
  Object.keys(input).every(k=>keys.includes(k));
}
function active(request:Request):boolean {
 try{
  // Next may normalize Request.url internally. Bind to the explicit
  // loopback test-server origin AND the unmodified HTTP Host header.
  const site=new URL(process.env.NEXT_PUBLIC_SITE_URL??"");
  const api=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??"");
  return process.env.NODE_ENV==="development"&&
   process.env.DO_NOT_CONTACT_PRODUCTION==="true"&&
   process.env.B2_EPHEMERAL_CONFIRM==="local-only"&&
   process.env.B2_LOCAL_HUMAN_MULTIPART_MODE==="enabled"&&
   site.protocol==="http:"&&site.hostname==="127.0.0.1"&&
   Number(site.port)>=39675&&Number(site.port)<=39686&&
   site.pathname==="/"&&!site.search&&!site.hash&&
   request.headers.get("host")===site.host&&
   api.protocol==="http:"&&["127.0.0.1","localhost"].includes(api.hostname)&&
   ["54321","54331"].includes(api.port)&&api.pathname==="/"&&
   !api.search&&!api.hash;
 }catch{return false;}
}

/**
 * Exercise the NORMAL Human API request shapes without minting a signed
 * Storage bearer or enabling publication. This is NOT a release switch:
 * if someone accidentally enables the mode outside the dedicated loopback
 * fixture, the route returns HOLD instead of falling back to legacy signing.
 */
export function isIssue137LocalNormalHumanModeSelected():boolean {
 return process.env.B2_LOCAL_HUMAN_NORMAL_ROUTE_MODE==="enabled";
}
export async function handleIssue137LocalNormalHumanRoute(
 request:Request,payload:JsonData,op:LocalLegacyProbeOperation
):Promise<NextResponse>{
 const deny=(status:number)=>NextResponse.json(
  {ok:false,error:"ISSUE137_NORMAL_HUMAN_PUBLICATION_HOLD"},
  {status,headers:{"Cache-Control":"no-store"}});
 if(!isIssue137LocalNormalHumanModeSelected()||!active(request))
  return deny(404);
 // Evaluated only AFTER the already-active isolated loopback boundary.
 // This cap has no effect on Preview or Production and is not a release cap.
 const capacity=decideHumanProcessingTrialCapacity(
  Number(payload.totalSizeBytes),
  process.env.B2_LOCAL_HUMAN_PROCESSING_CAP_BYTES,true);
 if(capacity.status==="invalid")
  return NextResponse.json({ok:false,error:"LOCAL_DRAFT_PROCESSING_CAP_CONFIG_HOLD"},
   {status:503,headers:{"Cache-Control":"no-store"}});
 if(capacity.status==="exceeded")
  return NextResponse.json({ok:false,error:"LOCAL_DRAFT_PROCESSING_CAP_HOLD",
   maxTrialBytes:capacity.capBytes},
   {status:413,headers:{"Cache-Control":"no-store"}});
 if(op==="open"){
  // Same five fields that the current RecordingStudioPage sends today.
  if(!exact(payload,["seriesId","episodeId","fileName","mimeType",
   "totalSizeBytes"]))return deny(400);
  const result=await handleIssue137LocalLegacyProbe(request,
   {...payload,issue137LocalProbe:"open"},"open");
  if(!result.ok)return result;
  let reply:JsonData;
  try{reply=await result.json() as JsonData;}catch{return deny(503);}
  if(reply.ok!==true||!uuid.test(String(reply.sessionId??""))||
   !Number.isSafeInteger(reply.partCount)||Number(reply.partCount)<1||
   Number(reply.partCount)>128)return deny(503);
  return NextResponse.json({
   ok:true,uploadMode:"local-private-staging-only",
   uploadSessionId:reply.sessionId,partCount:reply.partCount,
   reason:"NO_SIGNED_URL_NO_PUBLICATION"
  },{status:201,headers:{"Cache-Control":"no-store"}});
 }
 // The current Studio sends these eight fields to the NORMAL finalize API.
 // Public request intent is NOT authorization to publish; always return HOLD.
 if(!exact(payload,["seriesId","episodeId","episodeNumber","isPublic",
  "fileName","mimeType","totalSizeBytes","uploadSessionId"])||
  !uuid.test(String(payload.seriesId??""))||
  !uuid.test(String(payload.episodeId??""))||
  !uuid.test(String(payload.uploadSessionId??""))||
  !Number.isSafeInteger(payload.episodeNumber)||
  Number(payload.episodeNumber)<1||payload.isPublic!==true||
  !Number.isSafeInteger(payload.totalSizeBytes)||
  Number(payload.totalSizeBytes)<=4*1024*1024||
  Number(payload.totalSizeBytes)>1024*1024*1024||
  typeof payload.fileName!=="string"||
  typeof payload.mimeType!=="string"||
  !isSupportedAudioFile({
   name:payload.fileName,size:Number(payload.totalSizeBytes),
   type:payload.mimeType
  }))return deny(400);
 // Unlike the original legacy marker, NORMAL finalize binds the client-sent
 // series, episode and total bytes to the existing worker's durable ticket.
 const command={action:"finish",sessionId:payload.uploadSessionId,
  seriesId:payload.seriesId,episodeId:payload.episodeId,
  totalBytes:payload.totalSizeBytes};
 const forwarded=new Request(request.url,{method:"POST",
  headers:{"content-type":"application/json"},
  body:JSON.stringify(command)});
 const result=await localMultipartPost(forwarded);
 if(!result.ok)return result;
 let reply:JsonData;
 try{reply=await result.json() as JsonData;}catch{return deny(503);}
 if(reply.ok!==true||reply.reason!=="PRIVATE_PARTS_SEALED_NOT_PUBLISHED"||
  reply.sessionId!==payload.uploadSessionId)return deny(503);
 return NextResponse.json({
  ok:false,error:"ISSUE137_NORMAL_HUMAN_PUBLICATION_HOLD",
  reason:"PRIVATE_PARTS_SEALED_NOT_PUBLISHED"
 },{status:409,headers:{"Cache-Control":"no-store"}});
}


// Existing Human finalize endpoint, LOCAL-ONLY G2 stage receipt observation.
// It CANNOT finalize a trusted G1 receipt or create a recordings row: a
// separate trusted independent byte attestor/CAS remains required.
// In particular: no service_role, S3 credential, signed bearer or PUBLIC PUT.
export async function handleIssue137LocalTusFinalizeRoute(
 request:Request,payload:JsonData
):Promise<NextResponse>{
 const hold=(status=409)=>NextResponse.json({
  ok:false,error:"ISSUE137_LOCAL_G2_PENDING_TRUSTED_COMMIT"
 },{status,headers:{"Cache-Control":"private, no-store"}});
 if(!isIssue137LocalTusIssuerModeSelected()||!active(request)||
    process.env.SUPABASE_SERVICE_ROLE_KEY!==undefined||
    process.env.B2_SERVICE_KEY!==undefined)return hold(404);
 let origin:URL;
 try{origin=new URL(process.env.NEXT_PUBLIC_SITE_URL??"");}
 catch{return hold(404);}
 if(request.headers.get("origin")&&request.headers.get("origin")!==origin.origin)
  return hold(403);
 if(!exact(payload,["seriesId","episodeId","episodeNumber","isPublic",
    "fileName","mimeType","totalSizeBytes","uploadSessionId"])||
   typeof payload.seriesId!=="string"||!uuid.test(payload.seriesId)||
   typeof payload.episodeId!=="string"||!uuid.test(payload.episodeId)||
   typeof payload.uploadSessionId!=="string"||!uuid.test(payload.uploadSessionId)||
   payload.isPublic!==false||
   !Number.isSafeInteger(payload.episodeNumber)||Number(payload.episodeNumber)<1||
   !Number.isSafeInteger(payload.totalSizeBytes)||
   Number(payload.totalSizeBytes)<44||Number(payload.totalSizeBytes)>16*1024*1024||
   typeof payload.fileName!=="string"||typeof payload.mimeType!=="string"||
   !isSupportedAudioFile({name:payload.fileName,
    size:Number(payload.totalSizeBytes),type:payload.mimeType}))return hold(400);
 const supabase=await createClient();
 const {data:{user},error:userError}=await supabase.auth.getUser();
 if(userError||!user)return hold(401);
 if(isOfficialAccountEmail(user.email))return hold(403);
 // Trusted SQL evaluates the live original session, rights, consent,
 // series/episode, R18 and physical provider object identity. It returns
 // only this actor's originally issued PRIVATE staging coordinates.
 type P={leaseId:string;actorId:string;seriesId:string;episodeId:string;
  sessionId:string;objectId:string;bucket:string;path:string;
  size:number;sha256:string;state:string};
 async function preflight():Promise<P|null>{
  const {data,error}=await supabase.rpc("issue137_g2_local_uploaded_preflight",{
   p_lease:payload.uploadSessionId
  });
  if(error||!data||typeof data!=="object"||Array.isArray(data))return null;
  const p=data as P;
  const expected="owner/"+user!.id+"/series/"+payload.seriesId+
   "/episode/"+payload.episodeId+"/"+payload.uploadSessionId+".wav";
  if(p.leaseId!==payload.uploadSessionId||p.actorId!==user!.id||
   p.seriesId!==payload.seriesId||p.episodeId!==payload.episodeId||
   p.bucket!=="f2p-tus-app-authority-local"||
   p.path!==expected||p.state!=="STAGED_NOT_SEALED"||
   !uuid.test(p.objectId)||!uuid.test(p.sessionId)||
   !Number.isSafeInteger(p.size)||p.size!==payload.totalSizeBytes||
   typeof p.sha256!=="string"||!/^[a-f0-9]{64}$/u.test(p.sha256))
   return null;
  return p;
 }
 const before=await preflight();
 if(!before)return hold();
 // User-JWT RLS physical byte read, NOT admin or S3 signer. Bounded to
 // 16 MiB in the verified synthetic LOCAL fixture; no size claim from client.
 let bytes:Uint8Array;
 try{
  const r=await supabase.storage.from(before.bucket).download(before.path);
  if(r.error||!r.data)return hold();
  bytes=new Uint8Array(await r.data.arrayBuffer());
 }catch{return hold();}
 if(bytes.length!==before.size||
  createHash("sha256").update(bytes).digest("hex")!==before.sha256)
  return hold();
 const after=await preflight();
 if(!after||JSON.stringify(after)!==JSON.stringify(before))return hold();
 // Observational proof only. No receipt claim, DB mutation, PUBLIC URL,
 // audio body, privileged cleanup or automatic conversion to publication.
 return NextResponse.json({
  ok:false,reason:"PRIVATE_BYTES_VERIFIED_PENDING_TRUSTED_COMMIT",
  leaseId:before.leaseId
 },{status:202,headers:{"Cache-Control":"private, no-store"}});
}

export function hasIssue137ProbeMarker(data:JsonData):boolean {
 return Object.prototype.hasOwnProperty.call(data,"issue137LocalProbe");
}
export async function handleIssue137LocalLegacyProbe(
 request:Request,payload:JsonData,op:LocalLegacyProbeOperation
):Promise<NextResponse>{
 const deny=(status:number)=>NextResponse.json(
  {ok:false,error:"ISSUE137_LOCAL_LEGACY_PROBE_HOLD"},
  {status,headers:{"Cache-Control":"no-store"}});
 if(!active(request))return deny(404);
 if(payload.issue137LocalProbe!==op)return deny(400);
 let command:JsonData;
 if(op==="open"){
  if(!exact(payload,["issue137LocalProbe","seriesId","episodeId","fileName",
   "mimeType","totalSizeBytes"])||
   !uuid.test(String(payload.seriesId??""))||
   !uuid.test(String(payload.episodeId??""))||
   !Number.isSafeInteger(payload.totalSizeBytes)||
   Number(payload.totalSizeBytes)<=4*1024*1024||
   Number(payload.totalSizeBytes)>1024*1024*1024||
   typeof payload.fileName!=="string"||
   typeof payload.mimeType!=="string"||
   !isSupportedAudioFile({
    name:payload.fileName,
    size:Number(payload.totalSizeBytes),
    type:payload.mimeType,
   }))return deny(400);
  command={action:"open",seriesId:payload.seriesId,
   episodeId:payload.episodeId,totalBytes:payload.totalSizeBytes};
 }else{
  if(!exact(payload,["issue137LocalProbe","sessionId"])||
   !uuid.test(String(payload.sessionId??"")))return deny(400);
  command={action:"finish",sessionId:payload.sessionId};
 }
 // Invoke original-session authenticated local gateway within this request.
 // It derives GoTrue identity from existing HttpOnly Supabase SSR cookies;
 // no shared service-role credential is passed to the Next.js process.
 const forward=new Request(request.url,{method:"POST",
  headers:{"content-type":"application/json"},
  body:JSON.stringify(command)});
 const result=await localMultipartPost(forward);
 const h=new Headers(result.headers);h.set("cache-control","no-store");
 return new NextResponse(result.body,{status:result.status,headers:h});
}


/**
 * Issue #137 NONPRODUCTION experiment: invoke the real Next cookie-session
 * read-side authorization before calling the disposable self-issued PRIVATE
 * JWT/TUS RPC. Not a publisher, normal Studio switch or hosted migration.
 * No signed Storage bearer or privileged key is minted or returned.
 */
export function isIssue137LocalTusIssuerModeSelected():boolean {
 return process.env.B2_LOCAL_HUMAN_TUS_ISSUER_MODE==="enabled";
}
export async function handleIssue137LocalTusIssuerRoute(
 request:Request,payload:JsonData
):Promise<NextResponse>{
 const deny=(status:number)=>NextResponse.json(
  {ok:false,error:"ISSUE137_LOCAL_TUS_ISSUER_HOLD"},
  {status,headers:{"Cache-Control":"no-store"}});
 // Enabling this env in Preview/Production must NEVER switch the live signer.
 if(!isIssue137LocalTusIssuerModeSelected()||!active(request)||
  process.env.SUPABASE_SERVICE_ROLE_KEY!==undefined||
  process.env.B2_SERVICE_KEY!==undefined)return deny(404);
 let site:URL;
 try{site=new URL(process.env.NEXT_PUBLIC_SITE_URL??"");}
 catch{return deny(404);}
 const origin=request.headers.get("origin");
 if(origin&&origin!==site.origin)return deny(403);
 if(!exact(payload,["seriesId","episodeId","fileName","mimeType",
  "totalSizeBytes","expectedSha256"]))return deny(400);
 const seriesId=payload.seriesId,episodeId=payload.episodeId;
 const bytes=payload.totalSizeBytes,hash=payload.expectedSha256;
 if(typeof seriesId!=="string"||!uuid.test(seriesId)||
  typeof episodeId!=="string"||!uuid.test(episodeId)||
  !Number.isSafeInteger(bytes)||Number(bytes)<=4*1024*1024||
  Number(bytes)>16*1024*1024||
  typeof hash!=="string"||!/^[a-f0-9]{64}$/u.test(hash)||
  typeof payload.fileName!=="string"||typeof payload.mimeType!=="string"||
  !isSupportedAudioFile({name:payload.fileName,size:Number(bytes),
   type:payload.mimeType}))return deny(400);
 try{
  // This uses the actual SSR HttpOnly-cookie session and public RLS SELECT
  // predicates. The disposable RPC separately checks GoTrue session_id,
  // current consent/ownership/R18/episode state and binds the ticket.
  const supabase=await createClient();
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)return deny(401);
  if(isOfficialAccountEmail(user.email))return deny(403);
  const {data:series,error:seriesError}=await supabase.from("series")
   .select("id,recording_permission_mode").eq("id",seriesId).maybeSingle();
  if(seriesError||!series||
   !decideRecordingEntryAccess({
    permissionMode:normalizeRecordingPermissionMode(series.recording_permission_mode),
    isLoggedIn:true,
   }).canEnter)return deny(403);
  const {data:episode,error:episodeError}=await supabase.from("episodes")
   .select("id,series_id").eq("id",episodeId).maybeSingle();
  if(episodeError||!episode||episode.series_id!==seriesId)return deny(404);
  const {data:consent,error:consentError}=await supabase
   .from("user_recording_consents").select("consent_version")
   .eq("user_id",user.id).eq("consent_key",RECORDING_GLOBAL_CONSENT_KEY)
   .maybeSingle();
  if(consentError)return deny(503);
  if(!isAcceptedRecordingConsentVersion(consent?.consent_version))return deny(403);
  const {data:lease,error:issueError}=await supabase.rpc(
   "issue137_tus_local_issue",{
    p_series_id:seriesId,p_episode_id:episodeId,
    p_expected_sha256:hash,p_size_bytes:Number(bytes),
   });
  if(issueError||!lease||typeof lease!=="object"||Array.isArray(lease))
   return deny(403);
  const l=lease as Record<string,unknown>;
  if(Object.keys(l).sort().join(",")!=="expiresAt,leaseId,mode,objectPath"||
   l.mode!=="PRIVATE_JWT_TUS_LOCAL_ONLY"||
   typeof l.leaseId!=="string"||!uuid.test(l.leaseId)||
   typeof l.objectPath!=="string"||
   !l.objectPath.startsWith(
    "owner/"+user.id+"/series/"+seriesId+"/episode/"+episodeId+"/")||
   !l.objectPath.endsWith("/"+l.leaseId+".wav")||
   typeof l.expiresAt!=="string"||!Number.isFinite(Date.parse(l.expiresAt)))
   return deny(503);
  return NextResponse.json({
   ok:true,uploadMode:"private-jwt-tus-local-only",
   leaseId:l.leaseId,objectPath:l.objectPath,expiresAt:l.expiresAt,
  },{status:201,headers:{"Cache-Control":"no-store"}});
 }catch{return deny(503);}
}
