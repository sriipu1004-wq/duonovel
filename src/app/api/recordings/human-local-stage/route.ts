// Issue #137: disposable, development-only HTTP integration proof.
// Never activate this endpoint on Preview or Production: not a publish route.
// A real app session cookie is required; independent local worker enforces
// auth.sessions, consent, rights, DB ticket CAS and PRIVATE-only first-write.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const digest=/^[a-f0-9]{64}$/u;
const maxRequestBytes=1_500_000;
const deny=(status:number)=>NextResponse.json(
 {ok:false,error:"LOCAL_PRIVATE_STAGE_HOLD"},{status,headers:{"Cache-Control":"no-store"}}
);
function localWorker():{endpoint:URL;internal:string}|null {
 if(process.env.NODE_ENV!=="development"||
    process.env.DO_NOT_CONTACT_PRODUCTION!=="true"||
    process.env.B2_EPHEMERAL_CONFIRM!=="local-only"||
    process.env.B2_LOCAL_HUMAN_WORKER_MODE!=="enabled")return null;
 const supabase=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const worker=process.env.B2_LOCAL_HUMAN_WORKER_URL;
 const internal=process.env.B2_LOCAL_WORKER_INNER_TOKEN;
 if(!supabase||!worker||!internal||internal.length<32)return null;
 try{
  const a=new URL(supabase),w=new URL(worker);
  if(a.protocol!=="http:"||
     !["127.0.0.1","localhost"].includes(a.hostname)||
     !["54321","54331"].includes(a.port)||a.pathname!=="/"||
     a.search||a.hash||
     w.protocol!=="http:"||w.hostname!=="127.0.0.1"||
     !Number.isInteger(Number(w.port))||Number(w.port)<39700||
     Number(w.port)>39999||w.pathname!=="/"||w.search||w.hash)
   return null;
  return {endpoint:w,internal};
 }catch{return null;}
}
async function readBoundedJson(request:Request):Promise<Record<string,unknown>|null>{
 const length=request.headers.get("content-length");
 if(length&&(!/^\d+$/u.test(length)||Number(length)>maxRequestBytes))return null;
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
  return null;
 const reader=request.body?.getReader();if(!reader)return null;
 const chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){
   const {value,done}=await reader.read();if(done)break;
   if(!value)continue;
   size+=value.byteLength;
   if(size>maxRequestBytes){await reader.cancel();return null;}
   chunks.push(value);
  }
  const joined=new Uint8Array(size);let offset=0;
  for(const part of chunks){joined.set(part,offset);offset+=part.byteLength;}
  const data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(joined));
  return data&&typeof data==="object"&&!Array.isArray(data)?data:null;
 }catch{return null;}finally{reader.releaseLock();}
}
function fields(body:Record<string,unknown>):{
 action:"issue"|"stage"|"recover"|"audit";payload:Record<string,string>
}|null{
 const action=body.action;
 if(!["issue","stage","recover","audit"].includes(String(action)))return null;
 const keys=action==="issue"?["action","seriesId","episodeId","expectedSha256"]:
  action==="stage"?["action","ticket","bytesBase64"]:["action","ticket"];
 if(Object.keys(body).length!==keys.length||
  Object.keys(body).some(k=>!keys.includes(k)))return null;
 if(action==="issue"){
  if(!uuid.test(String(body.seriesId??""))||
   !uuid.test(String(body.episodeId??""))||
   !digest.test(String(body.expectedSha256??"")))return null;
  return {action:"issue",payload:{
   seriesId:String(body.seriesId),episodeId:String(body.episodeId),
   expectedSha256:String(body.expectedSha256)}};
 }
 if(!uuid.test(String(body.ticket??"")))return null;
 if(action==="stage"){
  if(typeof body.bytesBase64!=="string"||
   body.bytesBase64.length===0||body.bytesBase64.length>1_400_000||
   !/^[A-Za-z0-9+/]+={0,2}$/u.test(body.bytesBase64))return null;
  return {action:"stage",payload:{ticket:String(body.ticket),
   bytesBase64:body.bytesBase64}};
 }
 return {action:action as "recover"|"audit",
  payload:{ticket:String(body.ticket)}};
}
export async function POST(request:Request){
 const worker=localWorker();
 if(!worker)return deny(404);
 const body=await readBoundedJson(request);
 if(!body)return deny(413);
 const parsed=fields(body);
 if(!parsed)return deny(400);
 let jwt:string;
 try{
  const supabase=await createClient();
  const who=await supabase.auth.getUser();
  if(who.error||!who.data.user)return deny(401);
  const session=await supabase.auth.getSession();
  if(session.error||!session.data.session?.access_token||
     session.data.session.user.id!==who.data.user.id)return deny(401);
  jwt=session.data.session.access_token;
 }catch{return deny(503);}
 try{
  const upstream=await fetch(new URL("/"+parsed.action,worker.endpoint),{
   method:"POST",headers:{"content-type":"application/json",
    Authorization:"Bearer "+jwt,"x-b2-internal-token":worker.internal},
   body:JSON.stringify(parsed.payload),cache:"no-store",redirect:"error",
   signal:AbortSignal.timeout(12000)
  });
  if(![200,201,400,401,403,404,409,422,503].includes(upstream.status))
   return deny(503);
  const data:unknown=await upstream.json();
  if(!data||typeof data!=="object")return deny(503);
  const response=data as Record<string,unknown>;
  if(upstream.ok&&response.ok===true){
   if(!uuid.test(String(response.ticket??"")))return deny(503);
   return NextResponse.json({ok:true,ticket:response.ticket,
    ...(typeof response.status==="string"?
      {status:response.status}:{}),
   },{status:upstream.status,headers:{"Cache-Control":"no-store"}});
  }
  return deny(upstream.status);
 }catch{return deny(503);}
}
