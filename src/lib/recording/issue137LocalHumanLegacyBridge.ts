// Issue #137 TEST-ONLY adapter for the ACTUAL legacy Human session/finalize
// handlers. Guarded twice (here and target local route); NEVER a publisher.
// No privileged key or S3 token is used or returned from this adapter.
import {NextResponse} from "next/server";
import {POST as localMultipartPost} from "@/app/api/recordings/human-local-multipart/route";
import {isSupportedAudioFile} from "@/lib/recording/audioUploadPolicy";

type JsonData = Record<string,unknown>;
export type LocalLegacyProbeOperation = "open"|"finish";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
function exact(input:JsonData,keys:string[]):boolean {
 return Object.keys(input).length===keys.length&&
  Object.keys(input).every(k=>keys.includes(k));
}
function active(request:Request):boolean {
 try{
  const url=new URL(request.url);
  const api=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??"");
  return process.env.NODE_ENV==="development"&&
   process.env.DO_NOT_CONTACT_PRODUCTION==="true"&&
   process.env.B2_EPHEMERAL_CONFIRM==="local-only"&&
   process.env.B2_LOCAL_HUMAN_MULTIPART_MODE==="enabled"&&
   url.protocol==="http:"&&url.hostname==="127.0.0.1"&&
   Number(url.port)>=39675&&Number(url.port)<=39686&&
   api.protocol==="http:"&&["127.0.0.1","localhost"].includes(api.hostname)&&
   ["54321","54331"].includes(api.port);
 }catch{return false;}
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
