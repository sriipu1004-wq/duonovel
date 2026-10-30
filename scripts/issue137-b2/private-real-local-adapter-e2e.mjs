// Issue #137 F2-P: REAL disposable localhost Supabase Storage/PostgREST/PG.
// This adapter is a TEST-ONLY server harness; no application route imports it.
// Hosted URLs/keys/media are forbidden. No PUBLIC Storage writes.
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {createDisposablePrivateMediaPipeline} from "../../src/lib/recording/privateMediaLocalPipeline.ts";

assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
const endpoint=new URL(process.env.B2_LOCAL_URL||"");
assert.equal(endpoint.protocol,"http:");
assert.ok(["127.0.0.1","localhost","[::1]"].includes(endpoint.hostname));
assert.ok(["54321","54331"].includes(endpoint.port));
const net=process.env.B2_NETWORK||"",dbid=process.env.B2_DB_CONTAINER||"";
assert.match(net,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(dbid,/^[a-f0-9]{12,64}$/);
const members=execFileSync("docker",["ps","-q","--filter","network="+net],
 {encoding:"utf8",timeout:12000}).trim().split(/\s+/);
assert.ok(members.includes(dbid),"local DB must belong to dedicated Docker bridge");
const service=process.env.B2_SERVICE_KEY,anon=process.env.B2_ANON_KEY;
assert.ok(service&&anon&&service!==anon);
const sha=x=>createHash("sha256").update(x).digest("hex"),uuid=()=>randomUUID();
function sql(query){
 return execFileSync("docker",["exec",dbid,"psql","-X","-U","postgres","-d","postgres",
 "-v","ON_ERROR_STOP=1","-At","-c",query],{encoding:"utf8",timeout:15000,
 stdio:["ignore","pipe","pipe"]}).trim();
}
function quote(s){assert.match(s,/^[a-zA-Z0-9_./:-]+$/);return "'"+s+"'";}
function val(x){return typeof x==="boolean"?(x?"true":"false"):typeof x==="number"?
 String(x):quote(x);}
async function http(method,path,body,token=service,contentType="application/json",moreHeaders={}){
 const headers={apikey:token,Authorization:"Bearer "+token,...moreHeaders};
 if(body!==undefined)headers["content-type"]=contentType;
 const response=await fetch(endpoint.origin+path,{method,headers,
  body:body===undefined?undefined:contentType==="application/json"?JSON.stringify(body):body,
  signal:AbortSignal.timeout(16000)});
 const bytes=Buffer.from(await response.arrayBuffer());
 let json;try{json=JSON.parse(bytes.toString("utf8"));}catch{json=null;}
 return {status:response.status,bytes,json};
}
let checks=0;
function isOk(r,label){assert.ok([200,201,204].includes(r.status),
 label+" HTTP "+r.status+" "+String(r.json?.message??""));checks++;return r.json;}
function mustDeny(r,label,reason){
 assert.ok(r.status>=400&&r.status<500,label+" must reject HTTP "+r.status);
 if(reason)assert.equal(r.json?.message,reason,label);
 checks++;
}
function wave(){
 const b=Buffer.alloc(48);b.write("RIFF",0);b.writeUInt32LE(40,4);b.write("WAVEfmt ",8);
 b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
 b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write("data",36);b.writeUInt32LE(4,40);
 b.writeInt16LE(50,44);b.writeInt16LE(-50,46);return b;
}
const audio=wave(),bucket="f2p-local-private-stage";
const appPipeline=createDisposablePrivateMediaPipeline({
 apiUrl:process.env.B2_LOCAL_URL,serviceKey:service,anonKey:anon,
});
isOk(await http("POST","/storage/v1/bucket",{id:bucket,name:bucket,public:false}),
 "create exclusively local PRIVATE staging bucket");
const password="F2P-local-"+uuid()+"-Aa1!";
const email="f2p-"+uuid()+"@example.invalid";
const user=isOk(await http("POST","/auth/v1/admin/users",
 {email,password,email_confirm:true}),"local GoTrue synthetic actor");
const login=isOk(await http("POST","/auth/v1/token?grant_type=password",
 {email,password},anon),"local real GoTrue sign-in");
assert.ok(login.access_token && login.user?.id===user.id);checks++;
const verified=isOk(await http("GET","/auth/v1/user",undefined,login.access_token),
 "real local GoTrue user verification");
assert.equal(verified.id,user.id);checks++;
const payload=JSON.parse(Buffer.from(login.access_token.split(".")[1],"base64url").toString());
const actor=user.id,session=payload.session_id;
assert.match(actor,/^[0-9a-f-]{36}$/);
assert.match(session,/^[0-9a-f-]{36}$/);checks++;
function state(candidate){
 const raw=sql("select pointer_revision::text ||'|'||coalesce(private_audio_path,'')||'|'"+
  "||(select count(*) from libread_internal.issue137_f2p_consumed_nonces n where n.candidate_id=c.id)::text "+
  "from libread_internal.issue137_f2p_private_candidates c where id="+quote(candidate.id)+"::uuid");
 const [revision,path,nonces]=raw.split("|");
 return {revision:Number(revision),path,nonces:Number(nonces)};
}
async function candidate(kind,useAppPipeline=false){
 const id=uuid(),path="stage/"+uuid()+".wav";
 if(useAppPipeline) {
  const staged=await appPipeline.privateStage(path,audio);
  assert.equal(staged.sha256,sha(audio));checks++;
 }else{
  const upload=await http("POST","/storage/v1/object/"+bucket+"/"+path,audio,service,"audio/wav");
  isOk(upload,"PRIVATE Storage real upload "+kind);
 }
 const object=sql("select id::text from storage.objects where bucket_id="+quote(bucket)+
  " and name="+quote(path));
 assert.match(object,/^[0-9a-f-]{36}$/);checks++;
 sql("insert into libread_internal.issue137_f2p_private_candidates "+
 "(id,actor_id,session_id,kind,stage_bucket,stage_path,stage_object_id,stage_sha256) values ("+
 [id,actor,session,kind,bucket,path,object,sha(audio)].map(quote).join(",")+")");
 return {id,path,object,kind,revision:0,sha:sha(audio)};
}
async function readStage(c){
 const res=await http("GET","/storage/v1/object/authenticated/"+bucket+"/"+c.path);
 isOk(res,"real PRIVATE Storage byte-read "+c.kind);
 assert.ok(res.bytes.equals(audio),"exact staged bytes");checks++;
 const publicGet=await http("GET","/storage/v1/object/public/"+bucket+"/"+c.path,
 undefined,anon);
 mustDeny(publicGet,"PRIVATE object must not be anonymous");
 return sha(res.bytes);
}
async function rpc(c,nonce=uuid(),rev=c.revision,opts={}){
 const digest=await readStage(c);
 assert.equal(digest,c.sha,"trusted server pinned staged digest");checks++;
 return http("POST","/rest/v1/rpc/issue137_f2p_local_private_commit",{
  p_id:c.id,p_actor_id:opts.actor??actor,p_session_id:opts.session??session,
  p_expected_revision:rev,p_nonce:nonce,p_stage_bucket:bucket,
  p_stage_path:c.path,p_stage_object_id:c.object,p_sha256:digest,
  p_fail_after_update:opts.failAfterUpdate??false,
 },opts.token??service);
}
function mutate(c,column,value){
 assert.ok(["session_active","writer_permission","rights_approved","rights_withdrawn",
 "r18_effective","owner_verified","human_consent_current","ai_provenance_verified",
 "bgm_catalog_verified","episode_published","episode_matches","publication",
 "stage_sha256"].includes(column));
 sql("update libread_internal.issue137_f2p_private_candidates set "+column+"="+val(value)+
  " where id="+quote(c.id)+"::uuid");
}
async function blockedMutation(c,column,off,on,reason){
 const before=state(c);mutate(c,column,off);
 mustDeny(await rpc(c),column+" revoked after private stage verified",reason);
 assert.deepEqual(state(c),before,"failed commit must preserve CAS pointer/nonce");checks++;
 mutate(c,column,on);
}
const ai=await candidate("ai-recording");
const human=await candidate("human-recording");
const bgm=await candidate("site-bgm");
for(const c of [ai,human,bgm]){
 const result=isOk(await rpc(c),"actual LOCAL PostgREST locked CAS "+c.kind);
 assert.equal(Number(result),1);c.revision=1;
 assert.deepEqual(state(c),{revision:1,path:c.path,nonces:1});checks++;
}
const firstNonce=uuid();
let r=isOk(await rpc(ai,firstNonce),"nonce first use");ai.revision=2;
assert.equal(Number(r),2);checks++;
mustDeny(await rpc(ai,firstNonce,ai.revision),"nonce replay","F2P_REPLAY");
assert.deepEqual(state(ai),{revision:2,path:ai.path,nonces:2});checks++;
mustDeny(await rpc(ai,uuid(),0),"stale CAS revision","F2P_STALE_REVISION");
checks++;
// True concurrent HTTP transactions hit the same PostgreSQL locked row.
const concurrent=await Promise.all([rpc(ai,uuid()),rpc(ai,uuid())]);
assert.equal(concurrent.filter(x=>x.status===200).length,1,"exactly one CAS winner");
assert.equal(concurrent.filter(x=>x.json?.message==="F2P_STALE_REVISION").length,1);
ai.revision=3;assert.deepEqual(state(ai),{revision:3,path:ai.path,nonces:3});checks+=3;
const rollbackNonce=uuid();
mustDeny(await rpc(ai,rollbackNonce,ai.revision,{failAfterUpdate:true}),
 "injected SQL rollback","F2P_LOCAL_INJECTED_ROLLBACK");
assert.deepEqual(state(ai),{revision:3,path:ai.path,nonces:3});checks++;
r=isOk(await rpc(ai,rollbackNonce),"same nonce usable after transaction rollback");
ai.revision=4;assert.equal(Number(r),4);
assert.deepEqual(state(ai),{revision:4,path:ai.path,nonces:4});checks+=2;
await blockedMutation(ai,"session_active",false,true,"F2P_REVOKED");
await blockedMutation(ai,"writer_permission",false,true,"F2P_REVOKED");
await blockedMutation(ai,"rights_withdrawn",true,false,"F2P_RIGHTS");
await blockedMutation(ai,"rights_approved",false,true,"F2P_RIGHTS");
await blockedMutation(ai,"r18_effective",true,false,"F2P_R18");
await blockedMutation(ai,"owner_verified",false,true,"F2P_OWNER");
await blockedMutation(ai,"episode_published",false,true,"F2P_PUBLICATION");
await blockedMutation(ai,"episode_matches",false,true,"F2P_PUBLICATION");
await blockedMutation(ai,"publication","private","public","F2P_PUBLICATION");
await blockedMutation(ai,"ai_provenance_verified",false,true,"F2P_PROVENANCE");
await blockedMutation(human,"human_consent_current",false,true,"F2P_CONSENT");
await blockedMutation(bgm,"bgm_catalog_verified",false,true,"F2P_BGM");
await blockedMutation(ai,"stage_sha256",sha(Buffer.from("changed")),
 sha(audio),"F2P_STAGE_CHANGED");
mustDeny(await rpc(ai,uuid(),ai.revision,{actor:uuid()}),"wrong actor","F2P_REVOKED");
mustDeny(await rpc(ai,uuid(),ai.revision,{session:uuid()}),"wrong session","F2P_REVOKED");
const beforeAnon=state(ai);
mustDeny(await rpc(ai,uuid(),ai.revision,{token:anon}),
 "anonymous caller cannot invoke SERVICE_ROLE-only DB commit");
assert.deepEqual(state(ai),beforeAnon);checks++;
// Actual same-key Storage overwrite must be rejected by the disposable trigger.
const rewrite=await http("POST","/storage/v1/object/"+bucket+"/"+ai.path,
 Buffer.from("REPLACED BY UNSAFE WRITER"),service,"text/plain",{"x-upsert":"true"});
mustDeny(rewrite,"same-key private stage overwrite");
assert.equal(await readStage(ai),ai.sha);checks++;
const publicity=await http("PUT","/storage/v1/bucket/"+bucket,
 {public:true,name:bucket});
mustDeny(publicity,"non-empty private staging bucket publicity flip");
const bucketFlag=sql("select public::text from storage.buckets where id="+quote(bucket));
assert.equal(bucketFlag,"false");checks++;
for(const c of [ai,human,bgm]) assert.ok(state(c).path===c.path,"no public pointer");
checks++;
const beforeAppChecks=checks;
// REAL app-library orchestration: stage -> DB CAS + unique nonce ->
// GoTrue + per-request DB-authorized PRIVATE playback, no hosted services.
const app=await candidate("human-recording",true);
const appNonce=uuid();
const appArgs={candidateId:app.id,stagePath:app.path,stageObjectId:app.object,
 stageSha256:app.sha,expectedRevision:"0",nonce:appNonce};
const appCommit=await appPipeline.privateCommit(appArgs,login.access_token);
assert.deepEqual(appCommit,{status:"PRIVATE_POINTER_ONLY",revision:"1"});
assert.deepEqual(state(app),{revision:1,path:app.path,nonces:1});checks+=2;
const served=await appPipeline.authorizedPrivateBytes(app.id,login.access_token);
assert.equal(served.status,200);checks++;
assert.equal(served.headers.get("cache-control"),"private, no-store, max-age=0");checks++;
assert.ok(Buffer.from(await served.arrayBuffer()).equals(audio));checks++;
assert.equal((await appPipeline.authorizedPrivateBytes(app.id,anon)).status,404);checks++;
const failedBefore=state(app);
await assert.rejects(appPipeline.privateCommit(appArgs,login.access_token),
 /F2P_PRIVATE_DB_HOLD/);
assert.deepEqual(state(app),failedBefore);checks+=2;
mutate(app,"rights_withdrawn",true);
assert.equal((await appPipeline.authorizedPrivateBytes(app.id,login.access_token)).status,404);
assert.deepEqual(state(app),failedBefore);checks+=2;
mutate(app,"rights_withdrawn",false);
mutate(app,"r18_effective",true);
assert.equal((await appPipeline.authorizedPrivateBytes(app.id,login.access_token)).status,404);checks++;
mutate(app,"r18_effective",false);
mutate(app,"session_active",false);
assert.equal((await appPipeline.authorizedPrivateBytes(app.id,login.access_token)).status,404);checks++;
mutate(app,"session_active",true);
assert.equal((await appPipeline.authorizedPrivateBytes(uuid(),login.access_token)).status,404);checks++;
await assert.rejects(appPipeline.privateStage("stage/"+uuid()+".wav",Buffer.from("not-audio")),
 /F2P_PRIVATE_STAGE_HOLD/);checks++;
assert.throws(()=>createDisposablePrivateMediaPipeline({
 apiUrl:"https://www.syosetu-libread.com",serviceKey:service,anonKey:anon,
}),/F2P_LOCAL_ONLY_REQUIRED/);checks++;
const reissued=await appPipeline.authorizedPrivateBytes(app.id,login.access_token);
assert.equal(reissued.status,200);checks++;
console.log("PASS: F2-P "+(checks-beforeAppChecks)+" app-library local PRIVATE stage/CAS/authenticated playback controls");
console.log("PASS: F2-P "+checks+
 " real DISPOSABLE local GoTrue/PRIVATE Storage/PostgREST/PostgreSQL CAS+nonce checks");
console.log("RELEASE HOLD: no production schema, no runtime wiring, privileged S3 public bypass persists");
