// Issue #137 F2-P: strictly disposable LOCAL user-JWT TUS ingress process.
// This is neither a credential broker nor an independently secured deployment.
// No service_role, S3 secret, hosted URL, DB connection or final publisher API.
import {createHash} from "node:crypto";
const allowedUrl=()=>{
 try{
  const u=new URL(process.env.B2_LOCAL_URL??"");
  return u.protocol==="http:"&&["localhost","127.0.0.1"].includes(u.hostname)&&
   ["54321","54331"].includes(u.port)&&u.pathname==="/"&&
   u.search===""&&u.hash===""?u:null;
 }catch{return null;}
};
const u=allowedUrl();
const secretKeys=Object.keys(process.env).filter(k=>
 /SERVICE|SECRET|S3_|DATABASE_URL|AWS_|NEXT_PUBLIC_SUPABASE|SUPABASE_SERVICE|SUPABASE_DB/i.test(k));
if(!u||process.env.DO_NOT_CONTACT_PRODUCTION!=="true"||
 process.env.B2_EPHEMERAL_CONFIRM!=="local-only"||secretKeys.length>0||
 !process.env.B2_ANON_KEY||typeof process.send!=="function")process.exit(2);
const origin=u.origin,anon=process.env.B2_ANON_KEY;
const bucket="f2p-tus-app-authority-local";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hex=/^[a-f0-9]{64}$/;
const sha=b=>createHash("sha256").update(b).digest("hex");
const size=6*1024*1024+96,chunk=6*1024*1024;
let config=null,used=false,serial=Promise.resolve();
function reply(seq,status){
 if(process.connected)process.send({kind:"reply",seq,status});
}
function safeJwtRole(token){
 try{const parts=token.split(".");if(parts.length!==3)return false;
  const claim=JSON.parse(Buffer.from(parts[1],"base64url").toString());
  return claim.role==="authenticated"&&uuid.test(claim.sub??"");
 }catch{return false;}
}
async function bootstrap(msg){
 if(config!==null||!msg||typeof msg!=="object")return "BOOTSTRAP_HOLD";
 const keys=Object.keys(msg);
 if(keys.length!==7||keys.some(k=>![
 "jwt","actorId","seriesId","episodeId","leaseId","expectedSha256","sizeBytes"].includes(k)))
  return "INVALID_BOOTSTRAP_HOLD";
 const {jwt,actorId,seriesId,episodeId,leaseId,expectedSha256,sizeBytes}=msg;
 if(!uuid.test(actorId??"")||!uuid.test(seriesId??"")||
  !uuid.test(episodeId??"")||!uuid.test(leaseId??"")||
  !hex.test(expectedSha256??"")||sizeBytes!==size||
  typeof jwt!=="string"||!safeJwtRole(jwt))return "IDENTITY_HOLD";
 try{
  const res=await fetch(origin+"/auth/v1/user",{
   headers:{apikey:anon,authorization:"Bearer "+jwt},
   cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000)
  });
  if(res.status!==200)return "IDENTITY_HOLD";
  const user=await res.json();
  if(user.id!==actorId)return "IDENTITY_HOLD";
 }catch{return "IDENTITY_HOLD";}
 config={jwt,expectedSha256,sizeBytes,path:"owner/"+actorId+
  "/series/"+seriesId+"/episode/"+episodeId+"/"+leaseId+".wav"};
 return "READY_USER_ONLY";
}
function metadata(path){
 return ["bucketName "+Buffer.from(bucket).toString("base64"),
 "objectName "+Buffer.from(path).toString("base64"),
 "contentType "+Buffer.from("audio/wav").toString("base64")].join(",");
}
async function provider(uri,method,headers={},body){
 const res=await fetch(uri,{
  method,headers:{apikey:anon,authorization:"Bearer "+config.jwt,
   "tus-resumable":"1.0.0",...headers},
  ...(body===undefined?{}:{body}),redirect:"error",cache:"no-store",
  signal:AbortSignal.timeout(20000)
 });
 const data={status:res.status,offset:Number(res.headers.get("upload-offset")??"-1"),
  location:res.headers.get("location")};
 await res.arrayBuffer();
 return data;
}
async function stage(m){
 if(!config)return "NOT_READY_HOLD";
 if(used)return "ONE_ATTEMPT_HOLD";
 if(!m||typeof m!=="object"||Object.keys(m).length!==1||
  typeof m.bytesBase64!=="string"||m.bytesBase64.length>8400000)
  return "INVALID_REQUEST_HOLD";
 const bytes=Buffer.from(m.bytesBase64,"base64");
 if(bytes.length!==size||bytes.toString("base64")!==m.bytesBase64||
  bytes.toString("ascii",0,4)!=="RIFF"||bytes.toString("ascii",8,12)!=="WAVE"||
  sha(bytes)!==config.expectedSha256)return "BYTE_MISMATCH_HOLD";
 used=true;
 try{
  const root=origin+"/storage/v1/upload/resumable";
  const init=await provider(root,"POST",{
   "upload-length":String(size),"upload-metadata":metadata(config.path)});
  if(init.status!==201||!init.location)return "STORAGE_DENIED_HOLD";
  const location=new URL(init.location,root);
  if(location.origin!==origin||
   !location.pathname.startsWith("/storage/v1/upload/resumable/"))
   return "LOCATION_HOLD";
  const uri=location.toString();
  const first=await provider(uri,"PATCH",{
   "upload-offset":"0","content-type":"application/offset+octet-stream"},
   bytes.subarray(0,chunk));
  if(first.status!==204||first.offset!==chunk)return "STORAGE_DENIED_HOLD";
  const second=await provider(uri,"PATCH",{
   "upload-offset":String(chunk),"content-type":"application/offset+octet-stream"},
   bytes.subarray(chunk));
  return second.status===204&&second.offset===size?
   "PRIVATE_TUS_STAGED_UNVERIFIED":"STORAGE_DENIED_HOLD";
 }catch{return "TRANSPORT_AMBIGUOUS_HOLD";}
}
process.on("message",m=>{
 serial=serial.then(async()=>{
  if(m?.kind==="bootstrap")reply(m.seq,await bootstrap(m.config));
  else if(m?.kind==="stage")reply(m.seq,await stage(m.data));
  else if(m?.kind==="stop"){
   if(process.connected)process.send({kind:"reply",seq:m.seq,status:"STOPPED"},()=>process.exit(0));
   else process.exit(0);
  }else reply(m?.seq,"INVALID_MESSAGE_HOLD");
 }).catch(()=>reply(m?.seq,"INTERNAL_HOLD"));
});
