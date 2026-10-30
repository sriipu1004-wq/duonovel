// Issue #137 / PR #153 — real disposable Supabase Human signed multipart.
// Test only: NO application route calls, no hosted keys, no published media.
// The token is a BEARER CAPABILITY. Re-check it after logout and cleanup.
// Never write tokens, signed URLs, account credentials or local keys to logs.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import * as sessionModule from "../../src/lib/recording/humanMultipartUploadShared.ts";
const {buildHumanMultipartUploadSession,HUMAN_MULTIPART_PART_SIZE_BYTES}=sessionModule.default??sessionModule;
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const url=new URL(process.env.B2_LOCAL_URL??"");
assert.equal(url.protocol,"http:");
assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));
assert.ok(["54321","54331"].includes(url.port));
assert.equal(url.pathname,"/");assert.equal(url.search,"");assert.equal(url.hash,"");
const net=process.env.B2_NETWORK??"",db=process.env.B2_DB_CONTAINER??"";
assert.match(net,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(db,/^[a-f0-9]{12,64}$/);
assert.ok(execFileSync("docker",["ps","-q","--filter","network="+net],
 {encoding:"utf8",timeout:10000}).trim().split(/\s+/).includes(db));
const anon=process.env.B2_ANON_KEY??"",service=process.env.B2_SERVICE_KEY??"";
assert.ok(anon.length>15&&service.length>15&&anon!==service);
const bucket="f2p-human-signed-temp",id=()=>randomUUID();
assert.equal(process.env.SUPABASE_HUMAN_RECORDING_BUCKET,bucket);
const transport={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(url.origin,service,transport);
const guest=createClient(url.origin,anon,transport);
const sha=b=>createHash("sha256").update(b).digest("hex");
let checks=0;
function passed(value,label){assert.ok(value,label);checks++}
function failedResult(x,label){
 assert.ok(x.error,label+" unexpectedly succeeded");
 checks++;
}
async function downloaded(path,label){
 const r=await admin.storage.from(bucket).download(path);
 assert.equal(r.error,null,label+" admin private read failed");
 assert.ok(r.data,label+" missing private bytes");
 checks++;
 return Buffer.from(await r.data.arrayBuffer());
}
async function missing(path,label){
 const r=await admin.storage.from(bucket).download(path);
 assert.ok(r.error,label+" expected missing private object");
 checks++;
}
const created=await admin.storage.createBucket(bucket,{public:false,fileSizeLimit:16*1024*1024});
assert.equal(created.error,null,"create isolated PRIVATE bucket");checks++;
const meta=await admin.storage.getBucket(bucket);
assert.equal(meta.error,null);assert.equal(meta.data?.public,false);checks+=2;
const email="f2p-human-"+id()+"@example.invalid",password="F2P-"+id()+"-A1!";
const user=await admin.auth.admin.createUser({email,password,email_confirm:true});
assert.equal(user.error,null,"create disposable GoTrue user");checks++;
const owner=createClient(url.origin,anon,transport);
const signIn=await owner.auth.signInWithPassword({email,password});
assert.equal(signIn.error,null,"real local owner login");
assert.ok(signIn.data.session?.access_token,"GoTrue login token required");checks+=2;
const who=user.data.user.id,series=id(),episode=id();
const session=buildHumanMultipartUploadSession({
 seriesId:series,episodeId:episode,userId:who,sourceExtension:"wav",
 totalSizeBytes:HUMAN_MULTIPART_PART_SIZE_BYTES+96,
});
assert.equal(session.bucketName,bucket);
assert.equal(session.parts.length,2);
assert.equal(session.parts[0].expectedSizeBytes,HUMAN_MULTIPART_PART_SIZE_BYTES);
assert.equal(session.parts[1].expectedSizeBytes,96);
passed(session.parts.every(p=>p.objectPath.startsWith("human-temp/")&&
 p.objectPath.includes("/"+who+"/")&&p.objectPath.includes("/"+session.uploadSessionId+"/")),
 "actual Human multipart path must bind owner and upload session");
const [p1,p2]=session.parts;
const first=Buffer.alloc(p1.expectedSizeBytes,0x42);
first.set(Buffer.from("RIFF"),0);first.set(Buffer.from("WAVE"),8);
const last=Buffer.alloc(p2.expectedSizeBytes,0x26);
const replacement=Buffer.alloc(p1.expectedSizeBytes,0x19);
replacement.set(Buffer.from("RIFF"),0);replacement.set(Buffer.from("WAVE"),8);
passed(first.length===replacement.length&&sha(first)!==sha(replacement),
 "test must simulate equal-length byte tampering");
const adminStore=admin.storage.from(bucket);
const guestStore=guest.storage.from(bucket);
const signed1=await adminStore.createSignedUploadUrl(p1.objectPath,{upsert:true});
const signed2=await adminStore.createSignedUploadUrl(p2.objectPath,{upsert:true});
assert.equal(signed1.error,null,"privileged temp signing part 1");
assert.equal(signed2.error,null,"privileged temp signing part 2");
assert.ok(signed1.data?.token&&signed2.data?.token,"real signed upload tokens not returned");
checks+=3;
const noGrant=await guestStore.createSignedUploadUrl("human-temp/outsider/"+id()+"/part-0001.wav");
failedResult(noGrant,"anonymous should not mint arbitrary signed upload tokens");
const wrongPath="human-temp/"+id()+"/part-0001.wav";
const cross=await guestStore.uploadToSignedUrl(wrongPath,signed1.data.token,
 Buffer.from("unauthorized"),{contentType:"audio/wav"});
failedResult(cross,"signed token should not authorize a different object path");
await missing(wrongPath,"failed cross-path upload");
const invalid=await guestStore.uploadToSignedUrl(p1.objectPath,
 signed1.data.token+"x",Buffer.from("wrong"),{contentType:"audio/wav"});
failedResult(invalid,"tampered signed upload token must fail");
await missing(p1.objectPath,"failed invalid-token upload");
const uploaded=await guestStore.uploadToSignedUrl(p1.objectPath,signed1.data.token,
 first,{contentType:"audio/wav"});
assert.equal(uploaded.error,null,"anonymous holder should exercise bearer token (risk)");
checks++;
const got1=await downloaded(p1.objectPath,"signed part 1");
passed(got1.length===first.length&&sha(got1)===sha(first),
 "signed upload original byte digest");
const publicGet=await fetch(url.origin+"/storage/v1/object/public/"+bucket+"/"+
 p1.objectPath,{headers:{apikey:anon},redirect:"error",signal:AbortSignal.timeout(12000)});
passed(publicGet.status>=400&&publicGet.status<500,
 "private signed part must not be anonymously downloadable by public URL");
// End the real GoTrue session used to create this synthetic actor UUID.
// Issuer service-role signing is independent of that JWT by design; logout is
// a security negative, NOT proof that the actual API performed consent checks.
const logout=await owner.auth.signOut({scope:"global"});
assert.equal(logout.error,null,"GoTrue global logout");checks++;
const afterSignOut=await owner.auth.getSession();
passed(afterSignOut.data.session===null,"local owner client session must clear");
// A pre-issued signed capability for part2 was NOT created using this user JWT.
// A guest can upload after the user session has been ended.
const afterLogout=await guestStore.uploadToSignedUrl(p2.objectPath,signed2.data.token,
 last,{contentType:"audio/wav"});
if(afterLogout.error){
 console.log("OBSERVED: LOCAL signed token rejected post-signout part2; investigate provider expiry/binding");
 await missing(p2.objectPath,"post-signout rejected part");
}else{
 const bytes=await downloaded(p2.objectPath,"post-signout signed part2");
 passed(sha(bytes)===sha(last),"post-signout signed token retained upload authority");
 console.log("RISK: LOCAL pre-issued Human signed part token accepted AFTER GoTrue global logout");
}
// Replay with same signed token and same length, mutate stored bytes
const up=await guestStore.uploadToSignedUrl(p1.objectPath,signed1.data.token,
 replacement,{contentType:"audio/wav"});
if(up.error){
 const original=await downloaded(p1.objectPath,"replay rejected");
 passed(sha(original)===sha(first),"replay failure preserved first bytes");
 console.log("OBSERVED: LOCAL signed upload token rejected same-key replay");
}else{
 const changed=await downloaded(p1.objectPath,"signed upsert replay");
 passed(changed.length===first.length&&sha(changed)===sha(replacement),
  "signed upsert must be observed as equal-size byte replacement");
 console.log("RISK: LOCAL Human signed upload upsert REPLAY changed exact bytes without new session check");
}
const paths=session.parts.map(x=>x.objectPath);
const cleanup=await adminStore.remove(paths);
assert.equal(cleanup.error,null,"service-role finalize cleanup should remove temporary parts");
checks++;
for(const path of paths)await missing(path,"admin cleanup must remove temp "+path.slice(-13));
// A still-valid bearer upload token can potentially recreate a cleaned object.
const resurrect=await guestStore.uploadToSignedUrl(p1.objectPath,signed1.data.token,
 first,{contentType:"audio/wav"});
if(resurrect.error){
 await missing(p1.objectPath,"token after cleanup rejected");
 console.log("OBSERVED: LOCAL bearer token rejected following object cleanup");
}else{
 const bytes=await downloaded(p1.objectPath,"recreated after cleanup");
 passed(sha(bytes)===sha(first),"recreated part should match token-upload bytes");
 console.log("RISK: LOCAL signed upload token recreated deleted PRIVATE temp part AFTER cleanup");
 const again=await adminStore.remove(paths);
 assert.equal(again.error,null,"repeat test-only cleanup");checks++;
 for(const path of paths)await missing(path,"repeat cleanup removed "+path.slice(-13));
}
for(const path of paths){
 const response=await fetch(url.origin+"/storage/v1/object/public/"+bucket+"/"+path,{
 headers:{apikey:anon},redirect:"error",signal:AbortSignal.timeout(12000),
 });
 passed(response.status>=400&&response.status<500,
  "cleaned temp part must not be public");
}
console.log("PASS: F2-P "+checks+
 " REAL LOCAL Human multipart signed bearer and wrong-token/path, logout, "+
 "equal-length replay, cleanup/recreation controls; PRIVATE bucket retained");
console.log("HOLD: signed URLs are bearer capability; no real Human API, R18, consent "+
 "revocation, storage gateway fencing or Production executed");
