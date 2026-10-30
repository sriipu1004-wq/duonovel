// Issue #137 F2-P: disposable/local-only RLS-scoped PRIVATE upload adapter.
// Upload NEVER receives or imports a service-role credential or S3 access key.
// AUTH JWT must be verified by GoTrue and must have role "authenticated".
// All protection in this candidate assumes the paired disposable Storage RLS
// fixture is installed and its bucket is PRIVATE; NOT a runtime release gate.
import { createHash } from "node:crypto";
import { publicMediaDeclarationMatches } from "./publicMediaReleasePreflight";

const bucket = "f2p-rls-user-stage";
type Config = Readonly<{
  apiUrl: string; anonKey: string; fetchImpl?: typeof fetch;
}>;
type UploadResult = Readonly<{
  status: "RLS_PRIVATE_BYTES_ONLY"; bucket: string; path: string;
  sha256: string; actorId: string;
}>;
const uuid = (id:string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(id);
const sha = (bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
function claims(token:string):Record<string,unknown> {
  if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token))
    throw Error("F2P_USER_JWT_REQUIRED");
  try {
    const value: unknown = JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString());
    if(value && typeof value==="object" && !Array.isArray(value))
      return value as Record<string,unknown>;
  } catch { /* fall through to rejection */ }
  throw Error("F2P_USER_JWT_REQUIRED");
}
function endpointForLocalOnly(url:string): URL {
  if(process.env.B2_EPHEMERAL_CONFIRM!=="local-only" ||
     process.env.DO_NOT_CONTACT_PRODUCTION!=="true" ||
     url!==process.env.B2_LOCAL_URL)throw Error("F2P_RLS_LOCAL_ONLY");
  const endpoint=new URL(url);
  if(endpoint.protocol!=="http:" ||
     !["127.0.0.1","localhost","[::1]"].includes(endpoint.hostname) ||
     !["54321","54331"].includes(endpoint.port) ||
     endpoint.pathname!=="/" || endpoint.search!=="" || endpoint.hash!=="")
    throw Error("F2P_RLS_LOCAL_ONLY");
  return endpoint;
}
export function createDisposableRlsScopedPrivateWriter(config:Config) {
  const endpoint=endpointForLocalOnly(config.apiUrl);
  // The API key is a LOCAL legacy anon JWT; reject a service-role JWT even if
  // someone accidentally passes it as anonKey. No key value is ever logged.
  if(claims(config.anonKey).role!=="anon")throw Error("F2P_NONPRIVILEGED_API_KEY_REQUIRED");
  const transport=config.fetchImpl??fetch;
  async function http(relativePath:string,token:string,method="GET",bytes?:Uint8Array) {
    const headers:Record<string,string>={
      apikey:config.anonKey,Authorization:"Bearer "+token,
    };
    if(bytes)headers["Content-Type"]="audio/wav";
    return transport(new URL(relativePath,endpoint),{
      method,headers,body:bytes?Buffer.from(bytes):undefined,
      cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000),
    });
  }
  async function verifiedActor(userJwt:string):Promise<string> {
    const parsed=claims(userJwt);
    // Defence in depth against accidentally supplied privileged local JWT.
    // Verified identity STILL depends on /auth/v1/user and real Storage RLS.
    if(parsed.role!=="authenticated" || typeof parsed.sub!=="string" ||
       !uuid(parsed.sub))throw Error("F2P_USER_JWT_REQUIRED");
    const result=await http("/auth/v1/user",userJwt);
    if(result.status!==200)throw Error("F2P_USER_AUTH_INVALID");
    const value:unknown=await result.json();
    const actor=(value as {id?:unknown}|null)?.id;
    if(actor!==parsed.sub)throw Error("F2P_USER_AUTH_INVALID");
    return parsed.sub;
  }
  async function stageAsUser(args:{
    userJwt:string; actorId:string; objectId:string; bytes:Uint8Array;
  }):Promise<UploadResult> {
    const {userJwt,actorId,objectId,bytes}=args;
    if(!uuid(actorId)||!uuid(objectId)||bytes.length===0 ||
       bytes.length>1024*1024)throw Error("F2P_RLS_BAD_STAGE");
    const path="owner/"+actorId+"/"+objectId+".wav";
    if(!publicMediaDeclarationMatches(bytes,path,"audio/wav"))
      throw Error("F2P_RLS_CONTENT_HOLD");
    const verified=await verifiedActor(userJwt);
    if(verified!==actorId)throw Error("F2P_RLS_OWNER_HOLD");
    // Explicitly not a signed S3 PutObject, not service JWT, not a PUBLIC key.
    // No upsert, copy, delete or issuance of a signed-upload token.
    const write=await http("/storage/v1/object/"+bucket+"/"+path,userJwt,"POST",bytes);
    if(write.status!==200 && write.status!==201)
      throw Error("F2P_RLS_UPLOAD_DENIED");
    const read=await http("/storage/v1/object/authenticated/"+bucket+"/"+path,userJwt);
    if(read.status!==200)throw Error("F2P_RLS_VERIFY_FAILED");
    const copied=new Uint8Array(await read.arrayBuffer());
    if(copied.length!==bytes.length || sha(copied)!==sha(bytes))
      throw Error("F2P_RLS_VERIFY_FAILED");
    return {status:"RLS_PRIVATE_BYTES_ONLY",bucket,path,sha256:sha(bytes),actorId};
  }
  return {stageAsUser};
}
