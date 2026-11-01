// Issue #137: disposable LOCAL worker for logical 8MiB parts up to 1GiB.
// NOT a deployed upload service; Storage receives separately sealed PRIVATE parts.
// This is not TUS: TUS's provider transport chunk is separately 6MiB.
import assert from "node:assert/strict";
import {createHash,randomUUID,timingSafeEqual} from "node:crypto";
import {createServer} from "node:http";
import {createClient} from "@supabase/supabase-js";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const api=new URL(process.env.B2_LOCAL_URL??"");
assert.ok(api.protocol==="http:"&&["localhost","127.0.0.1"].includes(api.hostname)&&
 ["54321","54331"].includes(api.port)&&api.pathname==="/"&&!api.search&&!api.hash);
const port=Number(process.env.B2_HTTP_BOUNDARY_PORT);
assert.ok(Number.isInteger(port)&&port>=39700&&port<=39999);
assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY,undefined);
const anon=process.env.B2_ANON_KEY??"",service=process.env.B2_SERVICE_KEY??"",
 secret=process.env.B2_LOCAL_WORKER_INNER_TOKEN??"";
assert.ok(anon.length>15&&service.length>15&&service!==anon&&secret.length>=32);
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(api.origin,service,opts);
const bucket="f2p-local-multipart-private";
const sessionTable="issue137_http_local_multipart_sessions";
const partTable="issue137_http_local_multipart_parts";
const max=1024*1024*1024,partSize=8*1024*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const sha=/^[a-f0-9]{64}$/u;
const hash=b=>createHash("sha256").update(b).digest("hex");
const safe=(req)=>{const a=Buffer.from(req.headers["x-b2-internal-token"]??"");
 const b=Buffer.from(secret);return a.length===b.length&&timingSafeEqual(a,b);};
function reply(res,code,reason,extras={}){
 res.writeHead(code,{"content-type":"application/json","cache-control":"no-store"});
 res.end(JSON.stringify({ok:code<300,reason,...extras}));
}
async function readJson(req){
 if(req.headers["content-type"]?.split(";")[0]!=="application/json")return null;
 const parts=[];let size=0;
 for await(const p of req){size+=p.length;if(size>4096)return null;parts.push(p);}
 try{
  const x=JSON.parse(Buffer.concat(parts).toString("utf8"));
  return x&&typeof x==="object"&&!Array.isArray(x)?x:null;
 }catch{return null;}
}
const shape=(x,keys)=>x&&Object.keys(x).length===keys.length&&
 Object.keys(x).every(k=>keys.includes(k));
async function actor(jwt,seriesId,episodeId){
 if(!jwt||!uuid.test(seriesId??"")||!uuid.test(episodeId??""))return null;
 const client=createClient(api.origin,anon,{...opts,
  global:{headers:{Authorization:"Bearer "+jwt}}});
 const {data:{user},error}=await client.auth.getUser(jwt);
 if(error||!user||!uuid.test(user.id))return null;
 let claims;
 try{claims=JSON.parse(Buffer.from(jwt.split(".")[1],"base64url").toString());}
 catch{return null;}
 if(!uuid.test(claims?.session_id??"")||claims.sub!==user.id)return null;
 const alive=await admin.rpc("issue137_http_local_session_live",{
  p_user_id:user.id,p_session_id:claims.session_id});
 if(alive.error||alive.data!==true)return null;
 const [consent,s,e]=await Promise.all([
  client.from("user_recording_consents").select("consent_version")
   .eq("user_id",user.id).eq("consent_key","recording_studio_global").maybeSingle(),
  client.from("series").select("id,publication_status,recording_permission_mode,content_rating,content_warnings")
   .eq("id",seriesId).maybeSingle(),
  client.from("episodes").select("id,series_id,posting_status,is_published")
   .eq("id",episodeId).maybeSingle()
 ]);
 if(consent.error||s.error||e.error||
  consent.data?.consent_version!=="2026-04-16"||
  s.data?.publication_status!=="public"||
  s.data?.recording_permission_mode!=="open"||
  s.data?.content_rating==="r18"||
  s.data?.content_warnings?.includes("sexual_r18")||
  e.data?.series_id!==seriesId||e.data?.posting_status!=="posted"||
  e.data?.is_published!==true)return null;
 return {userId:user.id,authSessionId:claims.session_id};
}
async function sessionFor(jwt,id){
 if(!uuid.test(id??""))return null;
 const {data,error}=await admin.from(sessionTable).select("*").eq("id",id).maybeSingle();
 if(error||!data)return null;
 const who=await actor(jwt,data.series_id,data.episode_id);
 if(!who||who.userId!==data.user_id||who.authSessionId!==data.auth_session_id)return null;
 if(Date.now()>=Date.parse(data.expires_at))return null;
 return {session:data,who};
}
async function partFor(jwt,id){
 if(!uuid.test(id??""))return null;
 const {data,error}=await admin.from(partTable).select("*").eq("id",id).maybeSingle();
 if(error||!data)return null;
 const session=await sessionFor(jwt,data.multipart_id);
 return session?{...session,part:data}:null;
}
async function seal(part){
 const fromStorage=await admin.storage.from(bucket).download(part.object_path);
 if(fromStorage.error)return {status:"CLAIMED_NO_BYTES",code:409};
 const bytes=Buffer.from(await fromStorage.data.arrayBuffer());
 const observed=hash(bytes);
 if(bytes.length!==part.byte_count||observed!==part.expected_sha256){
  await admin.from(partTable).update({state:"INTEGRITY_HOLD",
   observed_sha256:observed}).eq("id",part.id)
   .in("state",["CLAIMED","SEALED"]);
  return {status:"INTEGRITY_HOLD",code:409};
 }
 if(part.state==="CLAIMED"){
  const {data,error}=await admin.from(partTable).update({
   state:"SEALED",sealed_at:new Date().toISOString(),observed_sha256:observed
  }).eq("id",part.id).eq("state","CLAIMED").select("id").maybeSingle();
  if(error||!data)return {status:"RECEIPT_CAS_HOLD",code:409};
 }
 return {status:"SEALED",code:200};
}
async function command(req,res,jwt){
 const x=await readJson(req);
 if(!x)return reply(res,400,"INVALID_JSON_HOLD");
 if(req.url==="/multipart/open"){
  if(!shape(x,["seriesId","episodeId","totalBytes"])||
   !Number.isSafeInteger(x.totalBytes)||
   x.totalBytes<=4*1024*1024||x.totalBytes>max)
   return reply(res,400,"SIZE_OR_SHAPE_HOLD");
  const who=await actor(jwt,x.seriesId,x.episodeId);
  if(!who)return reply(res,403,"AUTHORITY_HOLD");
  const id=randomUUID(),parts=Math.ceil(x.totalBytes/partSize);
  const {error}=await admin.from(sessionTable).insert({
   id,user_id:who.userId,auth_session_id:who.authSessionId,
   series_id:x.seriesId,episode_id:x.episodeId,
   total_bytes:x.totalBytes,part_count:parts,
   expires_at:new Date(Date.now()+30*60*1000).toISOString()});
  if(error)return reply(res,503,"SESSION_DB_HOLD");
  return reply(res,201,"MULTIPART_OPEN",{sessionId:id,partCount:parts,partSizeBytes:partSize});
 }
 if(req.url==="/multipart/part"){
  if(!shape(x,["sessionId","index","expectedSha256"])||
   !uuid.test(x.sessionId??"")||!Number.isInteger(x.index)||
   !sha.test(x.expectedSha256??""))return reply(res,400,"PART_SHAPE_HOLD");
  const got=await sessionFor(jwt,x.sessionId);
  if(!got)return reply(res,403,"AUTHORITY_HOLD");
  const {session,who}=got;
  if(session.state!=="OPEN"||x.index<0||x.index>=session.part_count)
   return reply(res,409,"INDEX_OR_STATE_HOLD");
  const count=Math.min(partSize,session.total_bytes-x.index*partSize);
  const {data:existing,error:readError}=await admin.from(partTable)
   .select("*").eq("multipart_id",session.id).eq("part_index",x.index).maybeSingle();
  if(readError)return reply(res,503,"PART_READ_HOLD");
  if(existing){
   if(existing.expected_sha256!==x.expectedSha256||
      existing.byte_count!==count)return reply(res,409,"PART_DIGEST_CONFLICT_HOLD");
   return reply(res,200,"PART_REUSED",{partId:existing.id,state:existing.state,
    byteCount:count});
  }
  const id=randomUUID(),objectPath="owner/"+who.userId+"/"+session.id+
   "/part-"+String(x.index+1).padStart(4,"0")+".bin";
  const {error}=await admin.from(partTable).insert({
   id,multipart_id:session.id,part_index:x.index,byte_count:count,
   expected_sha256:x.expectedSha256,object_path:objectPath});
  if(error)return reply(res,409,"PART_ALLOCATE_RACE_HOLD");
  return reply(res,201,"PART_ALLOCATED",{partId:id,state:"ISSUED",byteCount:count});
 }
 if(req.url==="/multipart/status"){
  if(!shape(x,["partId"])||!uuid.test(x.partId??""))
   return reply(res,400,"STATUS_SHAPE_HOLD");
  const got=await partFor(jwt,x.partId);
  if(!got)return reply(res,403,"AUTHORITY_HOLD");
  let state=got.part.state;
  if(state==="CLAIMED"||state==="SEALED"){
   const result=await seal(got.part);
   if(result.code!==200)return reply(res,result.code,result.status);
   state="SEALED";
  }
  if(state==="INTEGRITY_HOLD")return reply(res,409,"INTEGRITY_HOLD");
  return reply(res,200,"STATUS",{state,byteCount:got.part.byte_count});
 }
 if(req.url==="/multipart/finish"){
  if(!shape(x,["sessionId"])||!uuid.test(x.sessionId??""))
   return reply(res,400,"FINISH_SHAPE_HOLD");
  const got=await sessionFor(jwt,x.sessionId);
  if(!got)return reply(res,403,"AUTHORITY_HOLD");
  const {session}=got;
  if(session.state!=="OPEN")return reply(res,409,"SESSION_STATE_HOLD");
  const {data:parts,error}=await admin.from(partTable).select(
   "part_index,byte_count,state").eq("multipart_id",session.id);
  if(error)return reply(res,503,"PART_LIST_HOLD");
  if(parts.length!==session.part_count||
   parts.some(p=>p.state!=="SEALED")||
   parts.reduce((n,p)=>n+p.byte_count,0)!==session.total_bytes||
   new Set(parts.map(p=>p.part_index)).size!==session.part_count)
   return reply(res,409,"PARTS_INCOMPLETE_HOLD");
  const {data:sealed,error:writeError}=await admin.from(sessionTable)
   .update({state:"SEALED_PARTS"}).eq("id",session.id).eq("state","OPEN")
   .select("id").maybeSingle();
  if(writeError||!sealed)return reply(res,409,"FINISH_CAS_HOLD");
  return reply(res,200,"PRIVATE_PARTS_SEALED_NOT_PUBLISHED",{
   sessionId:session.id,partCount:session.part_count});
 }
 return reply(res,404,"UNKNOWN_OP_HOLD");
}
async function rawPut(req,res,jwt){
 const ticket=req.url.slice("/multipart/upload/".length);
 if(!uuid.test(ticket))return reply(res,400,"PART_ID_HOLD");
 const got=await partFor(jwt,ticket);
 if(!got)return reply(res,403,"AUTHORITY_HOLD");
 const {part,who,session}=got;
 const length=req.headers["content-length"];
 if(!/^[1-9]\d*$/u.test(length??"")||Number(length)!==part.byte_count)
  return reply(res,413,"WRONG_PART_LENGTH_HOLD");
 if(part.state!=="ISSUED"||session.state!=="OPEN")
  return reply(res,409,"PART_ALREADY_USED_HOLD");
 const chunks=[];let received=0;const h=createHash("sha256");
 try{
  for await(const chunk of req){
   received+=chunk.length;
   if(received>part.byte_count||received>partSize)
    return reply(res,413,"PART_STREAM_LIMIT_HOLD");
   h.update(chunk);chunks.push(chunk);
  }
 }catch{return reply(res,400,"PART_STREAM_INTERRUPTED_HOLD");}
 if(received!==part.byte_count||h.digest("hex")!==part.expected_sha256)
  return reply(res,422,"PART_HASH_OR_LENGTH_HOLD");
 const claimed=await admin.rpc("issue137_http_local_multipart_claim",{
  p_part:part.id,p_user:who.userId,p_auth_session:who.authSessionId});
 if(claimed.error)return reply(res,503,"PART_CLAIM_DB_HOLD");
 if(claimed.data!==true)return reply(res,409,"PART_CLAIM_RACE_OR_REVOKED_HOLD");
 const bytes=Buffer.concat(chunks,received); // <=8MiB, NEVER whole 1GiB.
 const uploaded=await admin.storage.from(bucket).upload(part.object_path,bytes,{
  contentType:"application/octet-stream",upsert:false});
 if(uploaded.error)return reply(res,503,"PRIVATE_PART_WRITE_HOLD");
 if(process.env.B2_MULTIPART_EXIT_AFTER_PUT_ONCE==="true")process.exit(86);
 const result=await seal({...part,state:"CLAIMED"});
 if(result.code!==200)return reply(res,409,result.status);
 return reply(res,201,"PRIVATE_PART_SEALED",{partId:part.id,byteCount:received});
}
createServer(async(req,res)=>{
 if(req.url==="/health"&&req.method==="GET")return reply(res,200,"HEALTH");
 if(!safe(req))return reply(res,403,"INTERNAL_HOLD");
 const jwt=req.headers.authorization?.replace(/^Bearer /u,"")??"";
 if(jwt.length<30)return reply(res,401,"JWT_REQUIRED_HOLD");
 try{
  if(req.method==="PUT"&&req.url?.startsWith("/multipart/upload/"))
   return await rawPut(req,res,jwt);
  if(req.method==="POST")return await command(req,res,jwt);
  return reply(res,405,"METHOD_HOLD");
 }catch{return reply(res,503,"WORKER_EXCEPTION_HOLD");}
}).listen(port,"127.0.0.1",()=>{
 console.log("PASS: F2-P disposable multipart worker ready; 8MiB max part, 1GiB session cap");
});
