// Issue #137 — real, disposable LOCAL GoTrue + PRIVATE Storage RLS writer proof.
// The writer UNDER TEST receives only the local anon API key and user JWT.
// service-role key is used by this TEST HARNESS solely for synthetic setup.
import assert from "node:assert/strict";
import { randomUUID,createHash } from "node:crypto";
import {execFileSync} from "node:child_process";
import * as writerModule from "../../src/lib/recording/rlsScopedPrivateWriterLocal.ts";
const {createDisposableRlsScopedPrivateWriter}=writerModule.default??writerModule;
const base=process.env.B2_LOCAL_URL||"",anon=process.env.B2_ANON_KEY||"",
 service=process.env.B2_SERVICE_KEY||"",net=process.env.B2_NETWORK||"",
 dbid=process.env.B2_DB_CONTAINER||"";
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
const u=new URL(base);
assert.equal(u.protocol,"http:");
assert.ok(["localhost","127.0.0.1","[::1]"].includes(u.hostname));
assert.ok(["54321","54331"].includes(u.port));
assert.match(net,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(dbid,/^[a-f0-9]{12,64}$/);
assert.ok(execFileSync("docker",["ps","-q","--filter","network="+net],
 {encoding:"utf8",timeout:12000}).trim().split(/\s+/).includes(dbid));
assert.ok(service&&anon&&service!==anon);
const bucket="f2p-rls-user-stage",id=()=>randomUUID(),hash=x=>createHash("sha256").update(x).digest("hex");
let checks=0;
async function http(method,path,body,token=anon,extra={}) {
 const headers={apikey:anon,Authorization:"Bearer "+token,...extra};
 if(body!==undefined)headers["Content-Type"]=
   typeof body==="string"?"application/json":"audio/wav";
 const resp=await fetch(u.origin+path,{method,headers,body,
  cache:"no-store",redirect:"error",signal:AbortSignal.timeout(16000)});
 const bytes=Buffer.from(await resp.arrayBuffer());
 let json;try{json=JSON.parse(bytes.toString())}catch{json=null}
 return {status:resp.status,bytes,json};
}
function ok(response,label) {
 assert.ok([200,201,204].includes(response.status),
  label+" expected 2xx received "+response.status);
 checks++;
 return response.json;
}
function denied(response,label) {
 assert.ok(response.status>=400&&response.status<500,
  label+" failed closed HTTP "+response.status);
 checks++;
}
async function createPerson() {
 const email="f2p-rls-"+id()+"@example.invalid";
 const password="F2P-"+id()+"-Aa1!";
 const created=await http("POST","/auth/v1/admin/users",
  JSON.stringify({email,password,email_confirm:true}),service);
 const user=ok(created,"synthetic GoTrue user");
 const login=ok(await http("POST","/auth/v1/token?grant_type=password",
   JSON.stringify({email,password})), "GoTrue signed-in token");
 assert.equal(login.user?.id,user.id);checks++;
 const verified=ok(await http("GET","/auth/v1/user",undefined,login.access_token),
   "GoTrue validates JWT");
 assert.equal(verified.id,user.id);checks++;
 return {id:user.id,token:login.access_token};
}
function wave(){
 const b=Buffer.alloc(48);b.write("RIFF",0);b.writeUInt32LE(40,4);
 b.write("WAVEfmt ",8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);
 b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);
 b.writeUInt16LE(16,34);b.write("data",36);
 b.writeUInt32LE(4,40);b.writeInt16LE(50,44);b.writeInt16LE(-50,46);
 return b;
}
const bytes=wave(),owner=await createPerson(),stranger=await createPerson();
const writer=createDisposableRlsScopedPrivateWriter({apiUrl:base,anonKey:anon});
const objectId=id(),path="owner/"+owner.id+"/"+objectId+".wav";
const staged=await writer.stageAsUser({userJwt:owner.token,actorId:owner.id,
 objectId,bytes});
assert.deepEqual(staged,{status:"RLS_PRIVATE_BYTES_ONLY",bucket,path,
 sha256:hash(bytes),actorId:owner.id});checks++;
const ownerRead=ok(await http("GET","/storage/v1/object/authenticated/"+
 bucket+"/"+path,undefined,owner.token),"owner reads own PRIVATE bytes");
assert.ok(ownerRead===null||typeof ownerRead==="object"); // content is WAV
// http().bytes must be used to avoid JSON parsing a valid WAV body.
const exact=await http("GET","/storage/v1/object/authenticated/"+
 bucket+"/"+path,undefined,owner.token);
assert.equal(exact.status,200);assert.ok(exact.bytes.equals(bytes));checks+=2;
denied(await http("GET","/storage/v1/object/public/"+bucket+"/"+path,
 undefined,anon),"anonymous PUBLIC URL");
denied(await http("GET","/storage/v1/object/authenticated/"+bucket+"/"+path,
 undefined,stranger.token),"stranger reads owner PRIVATE byte");
denied(await http("GET","/storage/v1/object/authenticated/"+bucket+"/"+path,
 undefined,anon),"anon reads owner PRIVATE byte");
denied(await http("POST","/storage/v1/object/"+bucket+"/owner/"+
 owner.id+"/"+id()+".wav",bytes,stranger.token),"stranger writes owner prefix");
denied(await http("POST","/storage/v1/object/"+bucket+"/unknown/"+
 stranger.id+"/"+id()+".wav",bytes,stranger.token),"stranger arbitrary prefix");
denied(await http("POST","/storage/v1/object/"+bucket+"/owner/"+
 stranger.id+"/"+id()+".wav",bytes,anon),"anonymous user private write");
denied(await http("POST","/storage/v1/object/"+bucket+"/"+path,bytes,
 owner.token,{"x-upsert":"true"}),"same-key user JWT upsert blocked");
const after=await http("GET","/storage/v1/object/authenticated/"+
 bucket+"/"+path,undefined,owner.token);
assert.equal(after.status,200);assert.ok(after.bytes.equals(bytes));checks+=2;
denied(await http("DELETE","/storage/v1/object/"+bucket+"/"+path,
 undefined,owner.token),"owner DELETE denied");
denied(await http("POST","/storage/v1/object/f2p-s3-public/misc/"+
 id()+"/bypass.bin",bytes,owner.token),"ordinary JWT PUBLIC write denied");
await assert.rejects(writer.stageAsUser({userJwt:stranger.token,actorId:owner.id,
 objectId:id(),bytes}),/F2P_RLS_OWNER_HOLD/);checks++;
await assert.rejects(writer.stageAsUser({userJwt:service,actorId:owner.id,
 objectId:id(),bytes}),/F2P_USER_JWT_REQUIRED/);checks++;
assert.throws(()=>createDisposableRlsScopedPrivateWriter({
 apiUrl:base,anonKey:service}),/F2P_NONPRIVILEGED_API_KEY_REQUIRED/);checks++;
await assert.rejects(writer.stageAsUser({userJwt:owner.token,
 actorId:owner.id,objectId:id(),bytes:Buffer.from("fake-audio")}),
 /F2P_RLS_CONTENT_HOLD/);checks++;
assert.throws(()=>createDisposableRlsScopedPrivateWriter({
 apiUrl:"https://www.syosetu-libread.com",anonKey:anon}),
 /F2P_RLS_LOCAL_ONLY/);checks++;
// The test fixture includes a deliberate local-only protected PUBLIC flag.
const attempted=await http("PUT","/storage/v1/bucket/"+bucket,
 JSON.stringify({public:true,name:bucket}),service);
denied(attempted,"local PRIVATE bucket cannot be flipped to PUBLIC");
const privateRead=await http("GET","/storage/v1/object/public/"+bucket+
 "/"+path,undefined,anon);
denied(privateRead,"still not anonymously available after flip attempt");
console.log("PASS: F2-P "+checks+
 " LOCAL real user-scoped RLS private writer / cross-user, anon, replay, PUBLIC negatives");
console.log("NO GLOBAL CONTAINMENT: other privileged service-role/S3 credentials still bypass RLS");
