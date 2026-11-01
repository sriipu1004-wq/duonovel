// Issue #137 B2: development-only Human logical 8MiB part streaming.
// NOT a deployed Studio route or public media publisher; localhost disposable only.
// TUS provider transport's 6MiB chunks are separate from these logical parts.
import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {isOfficialAccountEmail} from "@/lib/auth/officialAccount";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const partSize=8*1024*1024,maxTotal=1024*1024*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const digest=/^[0-9a-f]{64}$/u;
const deny=(status:number)=>NextResponse.json({ok:false,error:"LOCAL_MULTIPART_HOLD"},
 {status,headers:{"Cache-Control":"no-store"}});
function worker():{url:URL;secret:string}|null{
 if(process.env.NODE_ENV!=="development"||
  process.env.DO_NOT_CONTACT_PRODUCTION!=="true"||
  process.env.B2_EPHEMERAL_CONFIRM!=="local-only"||
  process.env.B2_LOCAL_HUMAN_MULTIPART_MODE!=="enabled")return null;
 try{
  const api=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??"");
  const url=new URL(process.env.B2_LOCAL_HUMAN_MULTIPART_URL??"");
  const secret=process.env.B2_LOCAL_WORKER_INNER_TOKEN??"";
  if(api.protocol!=="http:"||!["127.0.0.1","localhost"].includes(api.hostname)||
   !["54321","54331"].includes(api.port)||api.pathname!=="/"||api.search||api.hash||
   url.protocol!=="http:"||url.hostname!=="127.0.0.1"||
   !Number.isInteger(Number(url.port))||Number(url.port)<39700||
   Number(url.port)>39999||url.pathname!=="/"||url.search||url.hash||
   secret.length<32)return null;
  return {url,secret};
 }catch{return null;}
}
async function actorJwt():Promise<string|null>{
 try{
  const client=await createClient();
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user||isOfficialAccountEmail(user.email))return null;
  const {data,error:sessionError}=await client.auth.getSession();
  if(sessionError||!data.session?.access_token||
   data.session.user.id!==user.id)return null;
  return data.session.access_token;
 }catch{return null;}
}
async function payload(request:Request):Promise<Record<string,unknown>|null>{
 if(request.headers.get("content-type")?.split(";")[0]!=="application/json")
  return null;
 const declared=request.headers.get("content-length");
 if(declared&&(!/^\d+$/u.test(declared)||Number(declared)>4096))return null;
 if(!request.body)return null;
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   if(!value)continue;
   size+=value.byteLength;if(size>4096){await reader.cancel();return null;}
   chunks.push(value);
  }
  const buf=new Uint8Array(size);let offset=0;
  for(const item of chunks){buf.set(item,offset);offset+=item.length;}
  const x:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(buf));
  return x&&typeof x==="object"&&!Array.isArray(x)?
   x as Record<string,unknown>:null;
 }catch{return null;}finally{reader.releaseLock();}
}
function params(x:Record<string,unknown>):{
 path:string;data:Record<string,number|string>
}|null{
 const action=x.action;
 const shape=(keys:string[])=>Object.keys(x).length===keys.length&&
  Object.keys(x).every(k=>keys.includes(k));
 if(action==="open"&&shape(["action","seriesId","episodeId","totalBytes"])&&
  uuid.test(String(x.seriesId??""))&&uuid.test(String(x.episodeId??""))&&
  Number.isSafeInteger(x.totalBytes)&&Number(x.totalBytes)>4*1024*1024&&
  Number(x.totalBytes)<=maxTotal)
  return {path:"open",data:{seriesId:String(x.seriesId),
   episodeId:String(x.episodeId),totalBytes:Number(x.totalBytes)}};
 if(action==="part"&&shape(["action","sessionId","index","expectedSha256"])&&
  uuid.test(String(x.sessionId??""))&&Number.isInteger(x.index)&&
  Number(x.index)>=0&&Number(x.index)<128&&
  digest.test(String(x.expectedSha256??"")))
  return {path:"part",data:{sessionId:String(x.sessionId),
   index:Number(x.index),expectedSha256:String(x.expectedSha256)}};
 if(action==="status"&&shape(["action","partId"])&&uuid.test(String(x.partId??"")))
  return {path:"status",data:{partId:String(x.partId)}};
 if(action==="finish"&&shape(["action","sessionId"])&&uuid.test(String(x.sessionId??"")))
  return {path:"finish",data:{sessionId:String(x.sessionId)}};
 if(action==="abort"&&shape(["action","sessionId"])&&uuid.test(String(x.sessionId??"")))
  return {path:"abort",data:{sessionId:String(x.sessionId)}};
 return null;
}
const allow=[200,201,400,401,403,404,409,413,422,503];
async function relay(endpoint:URL,secret:string,jwt:string,path:string,
 body:BodyInit,method:"POST"|"PUT",size?:number){
 try{
  const headers:Record<string,string>={
   Authorization:"Bearer "+jwt,"x-b2-internal-token":secret,
   "content-type":method==="POST"?"application/json":"application/octet-stream"};
  if(size!==undefined)headers["content-length"]=String(size);
  const init:RequestInit&{duplex?:"half"}={
   method,headers,body,redirect:"error",cache:"no-store",
   signal:AbortSignal.timeout(30000)};
  if(method==="PUT")init.duplex="half";
  const res=await fetch(new URL("/multipart/"+path,endpoint),init);
  if(!allow.includes(res.status))return deny(503);
  const raw=await res.text();
  if(raw.length>4096)return deny(503);
  let data:unknown;try{data=JSON.parse(raw);}catch{return deny(503);}
  if(!data||typeof data!=="object")return deny(503);
  const value=data as Record<string,unknown>;
  if(!res.ok||value.ok!==true)return deny(res.status);
  const reply:Record<string,unknown>={ok:true};
  for(const k of ["sessionId","partId","partCount","partSizeBytes",
   "byteCount","state","reason","deletedParts"]){
   if(typeof value[k]==="string"||typeof value[k]==="number")
    reply[k]=value[k];
  }
  return NextResponse.json(reply,{status:res.status,
   headers:{"Cache-Control":"no-store"}});
 }catch{return deny(503);}
}
export async function POST(request:Request){
 const target=worker();if(!target)return deny(404);
 const data=await payload(request);if(!data)return deny(400);
 const valid=params(data);if(!valid)return deny(400);
 const jwt=await actorJwt();if(!jwt)return deny(401);
 return relay(target.url,target.secret,jwt,valid.path,
  JSON.stringify(valid.data),"POST");
}
export async function PUT(request:Request){
 const target=worker();if(!target)return deny(404);
 const id=request.headers.get("x-part-id");
 const length=request.headers.get("content-length");
 if(!id||!uuid.test(id)||request.headers.get("content-type")!=="application/octet-stream")
  return deny(400);
 if(!length||!/^[1-9]\d*$/u.test(length))return deny(411);
 const size=Number(length);
 if(!Number.isSafeInteger(size)||size>partSize)return deny(413);
 const jwt=await actorJwt();if(!jwt)return deny(401);
 if(!request.body)return deny(400);
 // Raw ReadableStream is forwarded with backpressure, not request.arrayBuffer().
 // Worker enforces expected count + SHA + DB CAS before any Storage PUT.
 let observed=0;
 const guard=new TransformStream<Uint8Array,Uint8Array>({
  transform(chunk,controller){
   observed+=chunk.byteLength;
   if(observed>size||observed>partSize)
    throw new Error("LOCAL_PART_BYTES_OVER_LIMIT");
   controller.enqueue(chunk);
  },
  flush(){if(observed!==size)throw new Error("LOCAL_PART_SHORT_STREAM");}
 },undefined,{highWaterMark:1});
 return relay(target.url,target.secret,jwt,"upload/"+id,
  request.body.pipeThrough(guard),"PUT",size);
}
