// Issue #137: PRIVATE Reader G1 -> delivery handoff CONTRACT/MODEL ONLY.
// No Next.js API route, network, credentials, production storage or playback.
// Real G2 privileged overwrite/URL replay remains a separate release blocker.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import * as ratingModule from "../../src/lib/contentRating.ts";
import * as writingModule from "../../src/features/write/writeShared.ts";
import * as consentModule from "../../src/lib/recording/recordingConsent.ts";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true",
 "offline contract must be explicitly isolated");
for(const name of ["SUPABASE_SERVICE_ROLE_KEY","B2_SERVICE_KEY",
 "AWS_SECRET_ACCESS_KEY","SUPABASE_S3_ACCESS_KEY"]) {
 assert.equal(process.env[name],undefined,"must not inherit secrets: "+name);
}
const rating=ratingModule.default??ratingModule;
const writing=writingModule.default??writingModule;
const consent=consentModule.default??consentModule;
const {getSeriesContentRating}=rating;
const {getSeriesPublicationStatus,isEpisodePubliclyVisible}=writing;
const {isAcceptedRecordingConsentVersion}=consent;
for(const fn of [getSeriesContentRating,getSeriesPublicationStatus,
 isEpisodePubliclyVisible,isAcceptedRecordingConsentVersion])
 assert.equal(typeof fn,"function","use real app authorization predicate");
const readSource=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");
const route=readSource("src/app/api/recordings/human-audio/[recordingId]/route.ts");
const proxy=readSource("src/lib/recording/privateMediaProxy.ts");
const pointer=readSource("scripts/issue137-b2/human-tus-private-pointer-local.sql");
const sha=b=>createHash("sha256").update(b).digest("hex");
const sample=Buffer.from("RIFF-private-fixture-not-a-real-recording");
const narrator="narrator-actor",author="distinct-work-author";
function base(){
 return {
  lease:"lease-1", actor:narrator, narrator, author,
  session:"go-true-1", issuedSession:"go-true-1", activeSession:true,
  consentVersion:"2026-04-16", permission:"open",
  seriesStatus:"public", episodeStatus:"posted",episodePublished:true,
  rating:"general",warnings:[],showR18:false,ageConfirmed:false,
  leaseState:"active",receiptState:"SEALED_PRIVATE_SNAPSHOT",
  pointerState:"PRIVATE_POINTER_ONLY",revision:7,expectedRevision:7,
  bucket:"f2p-tus-app-authority-local",path:"owner/private-fixture.wav",
  objectId:"provider-object-1",sha:sha(sample),size:sample.length,
  expiresAt:200, now:100,
  recordingPublic:false,
 };
}
const ownerPermitted=s=>{
 if(!s.lease||s.actor!==s.narrator||
  s.session!==s.issuedSession||!s.activeSession||
  !isAcceptedRecordingConsentVersion(s.consentVersion)||
  s.permission!=="open"||
  getSeriesPublicationStatus({publication_status:s.seriesStatus})!=="public"||
  !isEpisodePubliclyVisible({posting_status:s.episodeStatus,
    is_published:s.episodePublished})||
  s.leaseState!=="active"||s.expiresAt<=s.now||
  s.receiptState!=="SEALED_PRIVATE_SNAPSHOT"||
  s.pointerState!=="PRIVATE_POINTER_ONLY"||s.recordingPublic||
  s.revision!==s.expectedRevision||
  s.bucket!=="f2p-tus-app-authority-local"||!s.path||
  !s.objectId||!/^[a-f0-9]{64}$/.test(s.sha)||s.size<=0) return false;
 const adult=getSeriesContentRating({
  content_rating:s.rating,content_warnings:s.warnings,
 })==="r18";
 return !adult||(s.showR18&&s.ageConfirmed);
};
// This represents a *bounded complete-read experiment* only: neither an HTTP
// response nor an acceptable memory strategy for 1GiB audio/Range.
async function candidatePrivateHandoff(ctx,storage,afterRead=async()=>{}){
 let received=0;
 const denied=reason=>({allowed:false,reason,bytes:null,links:[]});
 if(ctx.method!=="GET"||ctx.range!==null||
  ctx.wantPublic||ctx.wantSignedUrl||ctx.wantTimingArtifact)
  return denied("UNSUPPORTED_MEDIA_REQUEST_HOLD");
 const initial=ctx.live();
 if(!ownerPermitted(initial))return denied("AUTHORITY_HOLD");
 // In production use a trusted READ of the exact private object and a
 // measured bounded algorithm; this pure mock is not a provider abstraction.
 let result;
 try{result=await storage.readPrivate(initial.bucket,initial.path);}
 catch{return denied("STORAGE_READ_HOLD");}
 received++;
 if(!result||!Buffer.isBuffer(result.bytes)||
  result.id!==initial.objectId||result.bytes.length!==initial.size||
  sha(result.bytes)!==initial.sha)
  return denied("PHYSICAL_BYTES_HOLD");
 await afterRead();
 const current=ctx.live();
 if(!ownerPermitted(current)||
  current.lease!==initial.lease||
  current.bucket!==initial.bucket||current.path!==initial.path||
  current.objectId!==initial.objectId||current.sha!==initial.sha||
  current.size!==initial.size||current.issuedSession!==initial.issuedSession||
  current.revision!==initial.revision)
  return denied("POST_READ_AUTHORITY_HOLD");
 return {allowed:true,reason:"PRIVATE_OWNER_BOUNDED_MODEL",bytes:result.bytes,
  links:[],readCount:received};
}
let assertions=0;
function eq(a,b,message){assert.equal(a,b,message);assertions++;}
let state=base(),readCount=0,remoteBytes=Buffer.from(sample);
const ctx=(o={})=>({method:"GET",range:null,wantPublic:false,
 wantSignedUrl:false,wantTimingArtifact:false,live:()=>state,...o});
const storage={
 async readPrivate(bucket,path){readCount++;
  return {id:state.objectId,bytes:Buffer.from(remoteBytes)};
 },
};
async function expect(want,why,alter=null,request={}){
 state=base();readCount=0;
 if(alter)alter(state);
 const r=await candidatePrivateHandoff(ctx(request),storage);
 eq(r.allowed,want,why);
 eq(r.links.length,0,why+": no signed or PUBLIC URL escape");
 if(!want)eq(r.bytes,null,why+": zero bytes released");
 else eq(sha(r.bytes),sha(sample),why+": verified full fixture");
 return r;
}
await expect(true,"distinct narrator != work author PRIVATE owner succeeds");
await expect(false,"foreign author does not own narrator stage",s=>s.actor=author);
await expect(false,"anonymous does not own stage",s=>s.actor=null);
await expect(false,"stale GoTrue session",s=>s.activeSession=false);
await expect(false,"different sign-in session",s=>s.session="other-session");
await expect(false,"consent revoked",s=>s.consentVersion=null);
await expect(false,"stale consent version",s=>s.consentVersion="2026-04-15");
await expect(false,"work permission CLOSED",s=>s.permission="closed");
await expect(false,"unpublished series",s=>s.seriesStatus="private");
await expect(false,"scheduled episode",s=>s.episodeStatus="scheduled");
await expect(false,"unpublished episode",s=>s.episodePublished=false);
await expect(false,"lease revoked",s=>s.leaseState="revoked");
await expect(false,"expired lease",s=>s.now=200);
await expect(false,"unsealed receipt",s=>s.receiptState="STAGED");
await expect(false,"public recording flag cannot inherit PRIVATE authority",
 s=>s.recordingPublic=true);
await expect(false,"pointer is not PRIVATE",s=>s.pointerState="PUBLIC");
await expect(false,"ABA pointer revision mismatch",s=>s.revision=8);
await expect(false,"foreign bucket",s=>s.bucket="recording-audio");
await expect(false,"R18 rating with preference OFF",s=>s.rating="r18");
await expect(false,"sexual warning with preference OFF",
 s=>s.warnings=["sexual_r18"]);
await expect(false,"R18 preference ON without age",
 s=>{s.warnings=["sexual_r18"];s.showR18=true;});
await expect(true,"R18 preference ON and age confirmed",
 s=>{s.warnings=["sexual_r18"];s.showR18=true;s.ageConfirmed=true;});
await expect(false,"only full GET is modeled",null,{range:"bytes=0-3"});
await expect(false,"no HTTP POST support",null,{method:"POST"});
await expect(false,"no PUBLIC promotion support",null,{wantPublic:true});
await expect(false,"never mint a download bearer",null,{wantSignedUrl:true});
await expect(false,"timing sidecar requires separate integrity evidence",
 null,{wantTimingArtifact:true});
eq(readCount,0,"unsupported timing request did not hit Storage");
for(const [reason,makeStorage] of [
 ["missing object",async()=>null],
 ["different object identity",async()=>({id:"forged",bytes:Buffer.from(sample)})],
 ["changed same-size audio bytes",async()=>{
  const b=Buffer.from(sample);b[10]^=1;
  return {id:"provider-object-1",bytes:b};
 }],
 ["truncated bytes",async()=>({id:"provider-object-1",bytes:Buffer.from("R")})],
 ]) {
 state=base();readCount=0;
 const r=await candidatePrivateHandoff(ctx(),{readPrivate:makeStorage});
 eq(r.reason,"PHYSICAL_BYTES_HOLD",reason);
 eq(r.bytes,null,reason+": no bytes returned");
}
state=base();
let broke=await candidatePrivateHandoff(ctx(),{readPrivate:async()=>{throw Error("offline");}});
eq(broke.reason,"STORAGE_READ_HOLD","read fault fails closed");
for(const [name,alter] of [
 ["permission revoked during full read",s=>s.permission="closed"],
 ["consent deleted during full read",s=>s.consentVersion=null],
 ["R18 preference OFF during full read",s=>{s.rating="r18";s.showR18=false;}],
 ["series made private during full read",s=>s.seriesStatus="private"],
 ["episode draft during full read",s=>s.episodePublished=false],
 ["lease revoked during full read",s=>s.leaseState="revoked"],
 ["different session during full read",s=>s.activeSession=false],
 ["object changed without digest update",s=>s.objectId="other-object"],
 ["pointer revision changed during full read",s=>s.revision=8],
 ["receipt SHA changed during full read",s=>s.sha=sha(Buffer.from("other"))],
 ]) {
 state=base();
 const r=await candidatePrivateHandoff(ctx(),storage,async()=>alter(state));
 eq(r.reason,"POST_READ_AUTHORITY_HOLD",name);
 eq(r.bytes,null,name+": no stale audio bytes escaped");
}
state=base();
const afterFetchOverwrite=await candidatePrivateHandoff(ctx(),storage,
 async()=>{remoteBytes[10]^=1;});
eq(afterFetchOverwrite.allowed,true,
 "LIMIT: external physical overwrite AFTER snapshot read is unprevented here");
eq(sha(afterFetchOverwrite.bytes),sha(sample),
 "LIMIT: prior readback can return the original exact snapshot");
eq(sha(remoteBytes)===sha(sample),false,
 "LIMIT: later privileged provider object now has different bytes");

// Current deployed route is unchanged; the modeled handoff is NOT wired.
eq(route.includes("issue137_tus_private_read"),false,
 "current Reader does not call local PRIVATE preflight");
eq(route.includes("getCurrentR18ViewerPreference"),true,
 "existing public Reader has R18 viewer gate");
eq(route.includes("user.id !== readerId"),true,
 "existing legacy private branch checks narrator ID");
eq(route.includes("row.is_public === true"),true,
 "existing public/private recording dispatch");
eq(proxy.includes("SUPABASE_SERVICE_ROLE_KEY"),true,
 "existing proxy reads with bypass key");
eq(proxy.includes("verified_sha256"),false,
 "existing proxy has no G1 full-byte digest attestation");
eq(pointer.includes("p.pointer_state='PRIVATE_POINTER_ONLY'"),true,
 "local pointer cannot be promoted to public implicitly");
eq(pointer.includes("p.issued_session_id=p_session"),true,
 "local G1 pointer binds issued session");
eq(pointer.includes("s.author_id=l.actor_id"),false,
 "third-party narrator must remain permitted when OPEN");
console.log("PASS: #137 Reader G1 PRIVATE bounded-handoff SOURCE+MODEL "+
 assertions+" checks: actor/session/consent/rights/R18, two authority fences,"+
 " actual fixture byte SHA and object ID, no URL/range/public escape");
console.log("HOLD: MODEL ONLY, not app HTTP; full buffering is not a 1GiB strategy,"+
 " no atomic provider immutability, stream-after-auth race or old bearer/CDN revoke");
