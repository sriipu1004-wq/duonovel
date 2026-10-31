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
const bucket="f2p-http-privileged-worker-private",table="issue137_http_local_tickets";
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
 // JWT signature/GetUser alone can outlive a logout. Independently check
 // PostgreSQL auth.sessions using a LOCAL service-role-only SQL function.
 let claims;
 try{claims=JSON.parse(Buffer.from(jwt.split(".")[1],"base64url").toString());}
 catch{return null;}
 if(!uid.test(claims?.session_id??"")||claims.sub!==user.id)return null;
 const alive=await admin.rpc("issue137_http_local_session_live",{
  p_user_id:user.id,p_session_id:claims.session_id});
 if(alive.error||alive.data!==true)return null;
 // A *fresh* session-bound RLS read is used for every issue and stage.
 const c=await client.from("user_recording_consents")
  .select("consent_version").eq("user_id",user.id)
  .eq("consent_key","recording_studio_global").maybeSingle();
 if(c.error||c.data?.consent_version!=="2026-04-16")return null;
 return {user,client,sessionId:claims.session_id};
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
 return {userId:auth.user.id,sessionId:auth.sessionId};
}
async function worker(req,request){
 if(!secretOk(req.headers["x-b2-internal-token"]))
  return {code:403,data:{ok:false,reason:"INTERNAL_HOLD"}};
 const jwt=req.headers.authorization?.replace(/^Bearer /u,"")??"";
 if(req.url==="/issue"){
  if(!shape(request,["seriesId","episodeId","expectedSha256"])||
   !digest.test(request.expectedSha256??""))
   return {code:400,data:{ok:false,reason:"INPUT_HOLD"}};
  const actor=await authorizedFor(jwt,request.seriesId,request.episodeId);
  if(!actor)return {code:403,data:{ok:false,reason:"AUTHORITY_HOLD"}};
  const ticket=randomUUID(),objectPath="owner/"+actor.userId+"/"+ticket+".wav";
  const {error}=await admin.from(table).insert({
   ticket,user_id:actor.userId,session_id:actor.sessionId,
   series_id:request.seriesId,episode_id:request.episodeId,
   expected_sha256:request.expectedSha256,object_path:objectPath,
   expires_at:new Date(Date.now()+60000).toISOString(),state:"ISSUED"});
  if(error)return {code:503,data:{ok:false,reason:"LEDGER_WRITE_HOLD",pgCode:error.code}};
  return {code:201,data:{ok:true,ticket}};
 }
 if(!["/stage","/recover","/audit"].includes(req.url))
  return {code:404,data:{ok:false,reason:"OP_HOLD"}};
 if(!shape(request,req.url==="/stage"?["ticket","bytesBase64"]:["ticket"])||
  !uid.test(request.ticket??"")||
  (req.url==="/stage"&&(typeof request.bytesBase64!=="string"||
   request.bytesBase64.length>1400000)))
  return {code:400,data:{ok:false,reason:"INPUT_HOLD"}};
 const {data:lease,error:readError}=await admin.from(table)
  .select("*").eq("ticket",request.ticket).maybeSingle();
 if(readError)return {code:503,data:{ok:false,reason:"LEDGER_READ_HOLD"}};
 if(!lease)return {code:404,data:{ok:false,reason:"UNKNOWN_TICKET_HOLD"}};
 const actor=await authorizedFor(jwt,lease.series_id,lease.episode_id);
 if(!actor||actor.userId!==lease.user_id||actor.sessionId!==lease.session_id)
  return {code:403,data:{ok:false,reason:"AUTHORITY_HOLD"}};
 if(req.url==="/stage"){
  if(lease.state!=="ISSUED"||Date.now()>=Date.parse(lease.expires_at))
   return {code:409,data:{ok:false,reason:"EXPIRED_OR_USED_HOLD"}};
  const bytes=Buffer.from(request.bytesBase64,"base64");
  if(bytes.length===0||bytes.length>1024*1024||
   bytes.toString("base64")!==request.bytesBase64||
   bytes.toString("ascii",0,4)!=="RIFF"||
   bytes.toString("ascii",8,12)!=="WAVE"||
   hash(bytes)!==lease.expected_sha256)
   return {code:422,data:{ok:false,reason:"BYTE_HOLD"}};
  // Real PostgreSQL CAS also checks auth.sessions, consent and permissions
  // in the SAME UPDATE. Concurrent workers cannot claim twice.
  const claim=await admin.rpc("issue137_http_local_claim",{
   p_ticket:lease.ticket,p_user_id:actor.userId,
   p_session_id:actor.sessionId});
  if(claim.error)return {code:503,data:{ok:false,reason:"LEDGER_CLAIM_HOLD"}};
  if(claim.data!==true)return {code:409,data:{ok:false,reason:"NOT_CLAIMABLE_HOLD"}};
  try{
   const {error}=await admin.storage.from(bucket).upload(lease.object_path,bytes,{
    contentType:"audio/wav",upsert:false});
   if(error)return {code:503,data:{ok:false,reason:"PRIVATE_WRITE_HOLD"}};
   // Simulate provider-accepted PUT but process gone before ACK/readback.
   // The durable PostgreSQL row must survive a different worker process.
   if(process.env.B2_HTTP_FAIL_AFTER_PUT_ONCE==="true")process.exit(86);
  }catch{return {code:503,data:{ok:false,reason:"PRIVATE_WRITE_HOLD"}};}
 }
 // Fresh provider readback for initial stage, recovery, or sealed audit.
 if(!["CLAIMED","SEALED_PRIVATE_SNAPSHOT"].includes(
  req.url==="/stage"?"CLAIMED":lease.state))
  return {code:409,data:{ok:false,reason:"RECEIPT_STATE_HOLD"}};
 const read=await admin.storage.from(bucket).download(lease.object_path);
 if(read.error)return {code:409,data:{ok:false,reason:"NO_PRIVATE_BYTES_HOLD"}};
 const observed=hash(Buffer.from(await read.data.arrayBuffer()));
 if(observed!==lease.expected_sha256){
  await admin.from(table).update({state:"INTEGRITY_HOLD",
   observed_sha256:observed}).eq("ticket",lease.ticket)
   .in("state",["CLAIMED","SEALED_PRIVATE_SNAPSHOT"]);
  return {code:409,data:{ok:false,reason:"PHYSICAL_SHA_MISMATCH_HOLD"}};
 }
 if(lease.state!=="SEALED_PRIVATE_SNAPSHOT"){
  const {data:sealed,error}=await admin.from(table).update({
   state:"SEALED_PRIVATE_SNAPSHOT",observed_sha256:observed,
   sealed_at:new Date().toISOString()
  }).eq("ticket",lease.ticket).eq("state","CLAIMED")
   .select("ticket").maybeSingle();
  if(error||!sealed)return {code:409,data:{ok:false,reason:"SEAL_CAS_HOLD"}};
 }
 return {code:req.url==="/stage"?201:200,data:{ok:true,
  status:"PRIVATE_SEALED_SNAPSHOT",ticket:lease.ticket}};
}
async function ingress(req,request){
 // An ingress process has only public anon credentials and test-only
 // internal relay capability. Neither the Storage secret nor destination is
 // supplied by the HTTP caller. Worker validates actual auth/rights again.
 if(!["/issue","/stage","/recover","/audit"].includes(req.url))
  return {code:404,data:{ok:false,reason:"OP_HOLD"}};
 if(!shape(request,req.url==="/issue"?
  ["seriesId","episodeId","expectedSha256"]:
  req.url==="/stage"?["ticket","bytesBase64"]:["ticket"]))
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
