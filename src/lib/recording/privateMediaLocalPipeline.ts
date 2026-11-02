// Issue #137 F2-P — IN-APP, LOCAL-ONLY PRIVATE media pipeline candidate.
// No production adapter, no route import, no public bucket write or signed URL.
// ONLY for the disposable Supabase fixture installed by run-local.sh.
import { createHash } from "node:crypto";
import { publicMediaDeclarationMatches } from "./publicMediaReleasePreflight";

type LocalPrivateConfig = Readonly<{
  apiUrl: string;
  serviceKey: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
}>;
export type PrivateLocalCandidate = Readonly<{
  candidateId: string;
  stagePath: string;
  stageObjectId: string;
  stageSha256: string;
  expectedRevision: string;
  nonce: string;
}>;
const bucket = "f2p-local-private-stage";
const uuid = (s: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(s);
const digest = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
function pinnedLocal(apiUrl: string): URL {
  if (process.env.DO_NOT_CONTACT_PRODUCTION !== "true" ||
      process.env.B2_EPHEMERAL_CONFIRM !== "local-only" ||
      apiUrl !== process.env.B2_LOCAL_URL)
    throw Error("F2P_LOCAL_ONLY_REQUIRED");
  const url = new URL(apiUrl);
  if (url.protocol !== "http:" || !["127.0.0.1","localhost","[::1]"].includes(url.hostname) ||
      !["54321","54331"].includes(url.port) || url.pathname !== "/")
    throw Error("F2P_LOCAL_ONLY_REQUIRED");
  return url;
}
function pathValid(path: string): boolean {
  return /^stage\/[a-f0-9-]{36}\.wav$/iu.test(path) &&
    uuid(path.slice(6,-4));
}
type PrivatePointer = Readonly<{
  bucket: string; path: string; sha256: string; objectId: string; revision: number;
}>;
export function createDisposablePrivateMediaPipeline(config: LocalPrivateConfig) {
  const endpoint = pinnedLocal(config.apiUrl);
  if (!config.serviceKey || !config.anonKey || config.serviceKey === config.anonKey)
    throw Error("F2P_LOCAL_KEYS_REQUIRED");
  const request: typeof fetch = config.fetchImpl ?? fetch;
  async function perform(
    path: string, options: { method?: string; body?: BodyInit; token?: string;
      contentType?: string } = {},
  ): Promise<Response> {
    const headers: Record<string,string> = {
      apikey: config.serviceKey,
      Authorization: "Bearer " + (options.token ?? config.serviceKey),
    };
    if (options.contentType) headers["content-type"] = options.contentType;
    return request(new URL(path,endpoint),{
      method: options.method ?? "GET",headers,body:options.body,
      cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000),
    });
  }
  async function privateBucket(): Promise<boolean> {
    const r = await perform("/storage/v1/bucket/"+bucket);
    if (!r.ok) return false;
    const value: unknown = await r.json();
    if (!value || typeof value !== "object") return false;
    const b=value as Record<string,unknown>;
    return b.id === bucket && b.public === false;
  }
  async function authenticated(accessToken: string) {
    if (!accessToken || !/^[A-Za-z0-9_.-]+$/u.test(accessToken))
      throw Error("F2P_PRIVATE_AUTH_HOLD");
    const res = await perform("/auth/v1/user",{token:accessToken});
    if (!res.ok) throw Error("F2P_PRIVATE_AUTH_HOLD");
    const profile: unknown = await res.json();
    const actor=(profile as {id?:unknown}|null)?.id;
    if (typeof actor !== "string" || !uuid(actor))
      throw Error("F2P_PRIVATE_AUTH_HOLD");
    // getUser validates signature/expiry, and the DB RPC rechecks the synthetic
    // session_id. This is NOT evidence of real auth.sessions revocation.
    const tokenPart=accessToken.split(".")[1] ?? "";
    let claims:unknown;
    try { claims=JSON.parse(Buffer.from(tokenPart,"base64url").toString()); }
    catch { throw Error("F2P_PRIVATE_SESSION_HOLD"); }
    const sessionId=(claims as {session_id?:unknown}|null)?.session_id;
    const sub=(claims as {sub?:unknown}|null)?.sub;
    if(typeof sessionId!=="string" || !uuid(sessionId) || sub!==actor)
      throw Error("F2P_PRIVATE_SESSION_HOLD");
    return {actor,sessionId};
  }
  async function getBytes(path:string): Promise<Uint8Array> {
    if (!pathValid(path) || !(await privateBucket()))
      throw Error("F2P_PRIVATE_BUCKET_HOLD");
    const res=await perform("/storage/v1/object/authenticated/"+bucket+"/"+path);
    if (!res.ok || res.status!==200) throw Error("F2P_PRIVATE_READ_HOLD");
    const n=Number(res.headers.get("content-length") ?? "0");
    if(n>1024*1024) throw Error("F2P_PRIVATE_BYTE_LIMIT");
    const bytes=new Uint8Array(await res.arrayBuffer());
    if(bytes.byteLength===0 || bytes.byteLength>1024*1024)
      throw Error("F2P_PRIVATE_BYTE_LIMIT");
    if(!publicMediaDeclarationMatches(bytes,path,"audio/wav"))
      throw Error("F2P_PRIVATE_CONTENT_HOLD");
    return bytes;
  }
  async function privateStage(path:string,bytes:Uint8Array) {
    if(!pathValid(path)||bytes.length===0||bytes.length>1024*1024 ||
       !publicMediaDeclarationMatches(bytes,path,"audio/wav") ||
       !(await privateBucket())) throw Error("F2P_PRIVATE_STAGE_HOLD");
    // IMPORTANT: stage is a new key in a non-public bucket only. No delete on
    // ambiguous result, no PUBLIC copy, and no metadata-derived authorization.
    const r=await perform("/storage/v1/object/"+bucket+"/"+path,{
      method:"POST",body:Buffer.from(bytes),contentType:"audio/wav",
    });
    if(!r.ok) throw Error("F2P_PRIVATE_STAGE_HOLD");
    const readback=await getBytes(path);
    if(digest(readback)!==digest(bytes)) throw Error("F2P_PRIVATE_DIGEST_HOLD");
    return {bucket,path,sha256:digest(bytes)};
  }
  async function rpc(name:string,payload:Record<string,unknown>):Promise<unknown> {
    const res=await perform("/rest/v1/rpc/"+name,{
      method:"POST",body:JSON.stringify(payload),contentType:"application/json",
    });
    if(!res.ok) throw Error("F2P_PRIVATE_DB_HOLD");
    return res.json() as Promise<unknown>;
  }
  async function privateCommit(candidate:PrivateLocalCandidate,token:string) {
    if(!uuid(candidate.candidateId)||!uuid(candidate.stageObjectId) ||
       !uuid(candidate.nonce)||!pathValid(candidate.stagePath) ||
       !/^[a-f0-9]{64}$/u.test(candidate.stageSha256) ||
       !/^(0|[1-9][0-9]{0,17})$/u.test(candidate.expectedRevision))
      throw Error("F2P_PRIVATE_CANDIDATE_HOLD");
    const identity=await authenticated(token);
    const bytes=await getBytes(candidate.stagePath);
    if(digest(bytes)!==candidate.stageSha256)
      throw Error("F2P_PRIVATE_DIGEST_HOLD");
    // Live SQL uses SELECT ... FOR UPDATE, checks storage.objects/buckets,
    // verifies current actor/rights/R18, CAS revision and inserts the nonce
    // atomically. The SQL fixture is *not* a production migration.
    const reply=await rpc("issue137_f2p_local_private_commit",{
      p_id:candidate.candidateId,p_actor_id:identity.actor,
      p_session_id:identity.sessionId,
      p_expected_revision:Number(candidate.expectedRevision),
      p_nonce:candidate.nonce,p_stage_bucket:bucket,
      p_stage_path:candidate.stagePath,
      p_stage_object_id:candidate.stageObjectId,
      p_sha256:digest(bytes),p_fail_after_update:false,
    });
    const revision=String(reply);
    if (!/^[1-9][0-9]{0,17}$/u.test(revision) ||
        BigInt(revision)<=BigInt(candidate.expectedRevision))
      throw Error("F2P_PRIVATE_COMMIT_HOLD");
    return {status:"PRIVATE_POINTER_ONLY" as const,revision};
  }
  async function authorizedPrivateBytes(candidateId:string,token:string):
    Promise<Response> {
    const withheld=()=>new Response(null,{status:404,headers:{
      "Cache-Control":"private, no-store, max-age=0",
      "X-Content-Type-Options":"nosniff","Vary":"Cookie",
    }});
    if(!uuid(candidateId))return withheld();
    try {
      const identity=await authenticated(token);
      const params={p_id:candidateId,p_viewer_id:identity.actor,
        p_session_id:identity.sessionId};
      const lookup=async():Promise<PrivatePointer>=>{
        const r=await rpc("issue137_f2p_local_private_playback",params);
        if(!r||typeof r!=="object")throw Error("F2P_PRIVATE_GATE_HOLD");
        return r as PrivatePointer;
      };
      const before=await lookup();
      if(before.bucket!==bucket || !pathValid(before.path) ||
         !uuid(before.objectId)|| !/^[a-f0-9]{64}$/u.test(before.sha256))
        return withheld();
      const bytes=await getBytes(before.path);
      if(digest(bytes)!==before.sha256)return withheld();
      // A second authorization query after I/O reduces the stale-check gap.
      // Provider byte immutability and a full transaction-spanning stream
      // are NOT proved; keep this local-only, buffered, and without Range.
      const after=await lookup();
      if(JSON.stringify(before)!==JSON.stringify(after) ||
         (await authenticated(token)).actor!==identity.actor)
        return withheld();
      return new Response(Buffer.from(bytes),{status:200,headers:{
        "Content-Type":"audio/wav","Content-Length":String(bytes.length),
        "Cache-Control":"private, no-store, max-age=0",
        "X-Content-Type-Options":"nosniff","Vary":"Cookie",
      }});
    } catch {
      return withheld();
    }
  }
  return {privateStage,privateCommit,authorizedPrivateBytes};
}
