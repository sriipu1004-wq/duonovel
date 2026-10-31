// Issue #137: NON-WIRED, disposable HTTP ingress and privileged Storage worker.
// DO NOT deploy as an application API: localhost-only security experiment.
import assert from "node:assert/strict";
import {createHash,randomUUID,timingSafeEqual} from "node:crypto";
import {createServer} from "node:http";
import {createClient} from "@supabase/supabase-js";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const api=new URL(process.env.B2_LOCAL_URL??"");
assert.ok(api.protocol==="http:"&&["127.0.0.1","localhost"].includes(api.hostname));
assert.ok(["54321","54331"].includes(api.port)&&api.pathname==="/"&&!api.search&&!api.hash);
const role=process.env.B2_HTTP_BOUNDARY_ROLE;
assert.ok(role==="ingress"||role==="worker");
const port=Number(process.env.B2_HTTP_BOUNDARY_PORT);
assert.ok(Number.isInteger(port)&&port>=39700&&port<=39999);
const anon=process.env.B2_ANON_KEY??"";
const service=process.env.B2_SERVICE_KEY;
const internal=process.env.B2_LOCAL_WORKER_INNER_TOKEN??"";
assert.ok(anon.length>15&&internal.length>=32);
assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY,undefined);
if(role==="ingress")assert.equal(service,undefined,"ingress must NOT have service role");
else assert.ok(service?.length>15&&service!==anon,"worker needs local-only service role");
const workerEndpoint=role==="ingress"?new URL(process.env.B2_HTTP_WORKER_URL??""):null;
if(workerEndpoint)assert.ok(workerEndpoint.hostname==="127.0.0.1"&&
 workerEndpoint.protocol==="http:"&&Number(workerEndpoint.port)>=39700&&
 Number(workerEndpoint.port)<=39999&&workerEndpoint.pathname==="/");
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=role==="worker"?createClient(api.origin,service,opts):null;
const bucket="f2p-http-privileged-worker-private",tickets=new Map();
const hash=b=>createHash("sha256").update(b).digest("hex");
const uid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const digest=/^[a-f0-9]{64}$/u;
function reply(res,status,payload){
 res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
 res.end(JSON.stringify(payload));
}
function secretOk(token){
 const a=Buffer.from(token??""),b=Buffer.from(internal);
 return a.length===b.length&&timingSafeEqual(a,b);
}
async function json(req){
 const parts=[];let size=0;
 for await(const chunk of req){
  size+=chunk.length;
  if(size>1500000)throw Error("PAYLOAD_LIMIT_HOLD");
  parts.push(chunk);
 }
 const result=JSON.parse(Buffer.concat(parts).toString("utf8"));
 if(!result||typeof result!=="object"||Array.isArray(result))
  throw Error("INVALID_BODY_HOLD");
 return result;
}
function shape(x,keys){
 return Object.keys(x).every(k=>keys.includes(k));
}
async function authority(jwt){
 if(typeof jwt!=="string"||jwt.length<30)return null;
 const client=createClient(api.origin,anon,{...opts,
  global:{headers:{Authorization:"Bearer "+jwt}}});
 const {data:{user},error:authError}=await client.auth.getUser(jwt);
 if(authError||!user||!uid.test(user.id))return null;
 // A *fresh* RLS read is used for every issue and stage.
 const c=await client.from("user_recording_consents")
  .select("consent_version").eq("user_id",user.id)
  .eq("consent_key","recording_studio_global").maybeSingle();
 if(c.error||c.data?.consent_version!=="2026-04-16")return null;
 return {user,client};
}
async function authorizedFor(jwt,seriesId,episodeId){
 const auth=await authority(jwt);
 if(!auth||!uid.test(seriesId??"")||!uid.test(episodeId??""))return null;
 const [series,episode]=await Promise.all([
  auth.client.from("series").select("id,publication_status,recording_permission_mode,content_rating,content_warnings")
   .eq("id",seriesId).maybeSingle(),
  auth.client.from("episodes").select("id,series_id,posting_status,is_published")
   .eq("id",episodeId).maybeSingle()
 ]);
 const s=series.data,e=episode.data;
 if(series.error||episode.error||!s||!e||e.series_id!==seriesId||
  s.recording_permission_mode!=="open"||s.publication_status!=="public"||
  s.content_rating==="r18"||s.content_warnings?.includes("sexual_r18")||
  e.posting_status!=="posted"||e.is_published!==true)return null;
 return auth.user.id;
}
async function worker(req,request){
 if(!secretOk(req.headers["x-b2-internal-token"]))return {code:403,data:{ok:false,reason:"INTERNAL_HOLD"}};
 if(req.url==="/issue"){
  if(!shape(request,["seriesId","episodeId","expectedSha256"])||
   !digest.test(request.expectedSha256??""))return {code:400,data:{ok:false,reason:"INPUT_HOLD"}};
  const jwt=req.headers.authorization?.replace(/^Bearer /u,"")??"";
  const userId=await authorizedFor(jwt,request.seriesId,request.episodeId);
  if(!userId)return {code:403,data:{ok:false,reason:"AUTHORITY_HOLD"}};
  const ticket=randomUUID();
  tickets.set(ticket,{userId,seriesId:request.seriesId,episodeId:request.episodeId,
   expectedSha256:request.expectedSha256,used:false,expires:Date.now()+60000,
   path:"owner/"+userId+"/"+ticket+".wav"});
  return {code:201,data:{ok:true,ticket}};
 }
 if(req.url==="/stage"){
  if(!shape(request,["ticket","bytesBase64"])||
   !uid.test(request.ticket??"")||
   typeof request.bytesBase64!=="string"||request.bytesBase64.length>1400000)
   return {code:400,data:{ok:false,reason:"INPUT_HOLD"}};
  const lease=tickets.get(request.ticket);
  if(!lease)return {code:404,data:{ok:false,reason:"UNKNOWN_TICKET_HOLD"}};
  if(lease.used||Date.now()>=lease.expires)
   return {code:409,data:{ok:false,reason:"EXPIRED_OR_USED_HOLD"}};
  const jwt=req.headers.authorization?.replace(/^Bearer /u,"")??"";
  const actor=await authorizedFor(jwt,lease.seriesId,lease.episodeId);
  if(actor!==lease.userId)return {code:403,data:{ok:false,reason:"AUTHORITY_HOLD"}};
  const bytes=Buffer.from(request.bytesBase64,"base64");
  if(bytes.length===0||bytes.length>1024*1024||
   bytes.toString("base64")!==request.bytesBase64||
   bytes.toString("ascii",0,4)!=="RIFF"||bytes.toString("ascii",8,12)!=="WAVE"||
   hash(bytes)!==lease.expectedSha256)
   return {code:422,data:{ok:false,reason:"BYTE_HOLD"}};
  // Exhaust the ticket synchronously before the first privileged network write.
  if(lease.used)return {code:409,data:{ok:false,reason:"USED_HOLD"}};
  lease.used=true;
  try{
   const {error}=await admin.storage.from(bucket).upload(lease.path,bytes,{
    contentType:"audio/wav",upsert:false});
   if(error)return {code:503,data:{ok:false,reason:"PRIVATE_WRITE_HOLD"}};
   return {code:201,data:{ok:true,status:"PRIVATE_STAGED_UNVERIFIED",ticket:request.ticket}};
  }catch{return {code:503,data:{ok:false,reason:"PRIVATE_WRITE_HOLD"}};}
 }
 return {code:404,data:{ok:false,reason:"OP_HOLD"}};
}
async function ingress(req,request){
 // An ingress process has only public anon credentials and test-only
 // internal relay capability. Neither the Storage secret nor destination is
 // supplied by the HTTP caller. Worker validates actual auth/rights again.
 if(!["/issue","/stage"].includes(req.url))
  return {code:404,data:{ok:false,reason:"OP_HOLD"}};
 if(!shape(request,req.url==="/issue"?
  ["seriesId","episodeId","expectedSha256"]:["ticket","bytesBase64"]))
  return {code:400,data:{ok:false,reason:"INPUT_HOLD"}};
 const jwt=req.headers.authorization??"";
 if(!jwt.startsWith("Bearer ")||jwt.length<37)
  return {code:401,data:{ok:false,reason:"JWT_REQUIRED_HOLD"}};
 try{
  const remote=await fetch(new URL(req.url,workerEndpoint),{
   method:"POST",headers:{"authorization":jwt,"x-b2-internal-token":internal,
    "content-type":"application/json"},
   body:JSON.stringify(request),redirect:"error",signal:AbortSignal.timeout(12000)});
  const data=await remote.json();
  return {code:remote.status,data};
 }catch{return {code:503,data:{ok:false,reason:"WORKER_UNAVAILABLE_HOLD"}};}
}
const server=createServer(async(req,res)=>{
 if(req.url==="/health"&&req.method==="GET"){
  return reply(res,200,{ok:true,role});
 }
 if(req.method!=="POST")return reply(res,405,{ok:false});
 try{
  const request=await json(req);
  const result=role==="worker"?await worker(req,request):await ingress(req,request);
  return reply(res,result.code,result.data);
 }catch{return reply(res,400,{ok:false,reason:"BAD_INPUT_HOLD"});}
});
server.listen(port,"127.0.0.1",()=>{
 console.log("PASS: F2-P local "+role+" HTTP ready; no production endpoints");
});
