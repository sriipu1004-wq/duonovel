// Issue #137 F2-P NON-WIRED, disposable LOCAL worker process.
// Trusted fixture bootstrap supplies ONE signed, restricted GoTrue principal
// over process IPC. Runtime 'stage' calls contain ONLY synthetic WAV bytes.
// This does NOT prevent an attacker from calling Storage with a stolen JWT.
import {createHash} from "node:crypto";

const uu=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const hex=/^[a-f0-9]{64}$/u;
const bucket="f2p-broker-private-stage";
const hash=b=>createHash("sha256").update(b).digest("hex");
const local=()=>{
 const url=process.env.B2_LOCAL_URL??"";
 if(process.env.DO_NOT_CONTACT_PRODUCTION!=="true"||
    process.env.B2_EPHEMERAL_CONFIRM!=="local-only"||
    process.env.B2_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY)
  return null;
 try{
  const u=new URL(url);
  return u.protocol==="http:" &&
   ["127.0.0.1","localhost","[::1]"].includes(u.hostname) &&
   ["54321","54331"].includes(u.port) &&
   u.pathname==="/"&&!u.search&&!u.hash ?u:null;
 }catch{return null;}
};
const url=local();
if(!url||typeof process.send!=="function")process.exit(2);
let conf=null,used=false,serial=Promise.resolve();
const reply=(kind,status,seq)=>{
 if(process.connected)process.send({kind,status,seq});
};
async function bootstrap(c){
 if(conf||!c||typeof c!=="object")return "BOOTSTRAP_HOLD";
 const {anonKey,brokerJwt,actorId,objectId,expectedSha256}=c;
 if(!uu.test(actorId??"")||!uu.test(objectId??"")||
    !hex.test(expectedSha256??"")||
    typeof anonKey!=="string"||typeof brokerJwt!=="string"||
    !anonKey||!brokerJwt||anonKey===brokerJwt)return "BOOTSTRAP_HOLD";
 // A signed app_metadata flag is validated at GoTrue; user_metadata is never
 // trusted to authorize this dedicated storage writer.
 try{
  const r=await fetch(new URL("/auth/v1/user",url),{
   headers:{apikey:anonKey,Authorization:"Bearer "+brokerJwt},
   cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000)
  });
  if(r.status!==200)return "IDENTITY_HOLD";
  const user=await r.json();
  if(user?.app_metadata?.libread_local_broker!==true||
     !uu.test(user.id??""))return "IDENTITY_HOLD";
 }catch{return "IDENTITY_HOLD";}
 conf={anonKey,brokerJwt,expectedSha256,
  path:"owner/"+actorId+"/"+objectId+".wav"};
 return "READY_PRIVATE_ONLY";
}
async function stage(m){
 if(!conf)return "NOT_INITIALIZED_HOLD";
 if(used)return "ONE_ATTEMPT_HOLD";
 // Caller cannot provide path, bucket, JWT, digest, MIME or override.
 if(!m||typeof m!=="object"||
   Object.keys(m).some(k=>!["kind","seq","bytesBase64"].includes(k))||
   typeof m.bytesBase64!=="string"||
   m.bytesBase64.length>1400000)return "INVALID_REQUEST_HOLD";
 const bytes=Buffer.from(m.bytesBase64,"base64");
 if(bytes.length===0||bytes.length>1024*1024||
    bytes.toString("base64")!==m.bytesBase64||
    hash(bytes)!==conf.expectedSha256)return "BYTE_MISMATCH_HOLD";
 used=true; // prohibit retry EVEN after lost ACK, network failure or RLS deny
 try{
  const r=await fetch(new URL("/storage/v1/object/"+bucket+"/"+conf.path,url),{
   method:"POST",headers:{apikey:conf.anonKey,
     Authorization:"Bearer "+conf.brokerJwt,
     "Content-Type":"audio/wav"},
   body:bytes,cache:"no-store",redirect:"error",
   signal:AbortSignal.timeout(12000)
  });
  return [200,201].includes(r.status)?"PRIVATE_PUT_ACCEPTED_UNVERIFIED":"PROVIDER_DENIED_HOLD";
 }catch{return "AMBIGUOUS_PUT_HOLD";}
}
process.on("message",m=>{
 serial=serial.then(async()=>{
  if(m?.kind==="bootstrap"){
   reply("bootstrap",await bootstrap(m.config),m.seq);
  }else if(m?.kind==="stage"){
   reply("stage",await stage(m),m.seq);
  }else if(m?.kind==="stop"){
   if(process.connected)process.send({kind:"stop",status:"STOPPED",seq:m.seq},()=>process.exit(0));
   else process.exit(0);
  }else reply("invalid","INVALID_REQUEST_HOLD",m?.seq);
 }).catch(()=>reply("error","INTERNAL_HOLD",m?.seq));
});
