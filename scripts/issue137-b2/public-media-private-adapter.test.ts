// F2-P NONPRODUCTION: fake DB + fake private Storage only.
// No credentials, network, hosted API, PUBLIC writer, or live route.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  evaluatePrivateMediaReleaseCandidate,
  type LockedPrivateReleaseState,
  type PrivateReleaseIntent,
  type TrustedPrivateReleasePorts,
} from "../../src/lib/recording/publicMediaPrivateReleaseCore";
import type { PublicMediaKind, FreshPublicMediaEvidence } from "../../src/lib/recording/publicMediaReleasePreflight";

const sha=(b: Uint8Array)=>createHash("sha256").update(b).digest("hex");
const audio=Buffer.alloc(48);
audio.write("RIFF",0);audio.writeUInt32LE(40,4);audio.write("WAVEfmt ",8);
audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);
audio.writeUInt32LE(8000,24);audio.writeUInt32LE(16000,28);
audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);
audio.write("data",36);audio.writeUInt32LE(4,40);
audio.writeInt16LE(3,44);audio.writeInt16LE(-3,46);
const noop=()=>{};
function make(kind:PublicMediaKind="ai-recording") {
  const fresh:FreshPublicMediaEvidence={
    kind,immutableVersion:"fixed-v1",rightsApproved:true,rightsWithdrawn:false,
    publicationStatus:"public",episodeStatus:"posted",episodePublished:true,
    seriesMatchesEpisode:true,rating:"general",contentWarnings:[],
    ownerVerified:true,humanConsentCurrent:true,aiProvenanceVerified:true,
    siteManagedCatalogEntry:true,
  };
  const actor={actorId:"owner-1",sessionId:"session-1",sessionActive:true};
  const stage={
    bucket:"synthetic-private",objectPath:"stage/immutable-a.wav",bucketIsPrivate:true,
    immutableVersion:"fixed-v1",storedSha256:sha(audio),bytes:Buffer.from(audio),
    claimedMime:"audio/wav",claimedFileName:"immutable-a.wav",
    immutabilityVerified:true,bucketVisibilityVerified:true,
    expectedPointerRevision:"5",releaseNonce:"synthetic-once-1",
  };
  const locked:LockedPrivateReleaseState={
    actorId:actor.actorId,sessionId:actor.sessionId,sessionActive:true,
    permissionCurrent:true,effectiveR18:false,rightsApproved:true,rightsWithdrawn:false,
    evidence:fresh,
    stageBucket:stage.bucket,stagePath:stage.objectPath,stageVersion:stage.immutableVersion,
    stageDigest:stage.storedSha256,stageImmutable:true,stageBucketPrivate:true,
    destinationBucketPrivate:true,destinationProxyGated:true,
    pointerRevision:"5",releaseNonceAvailable:true,
    requestAlreadyCommitted:false,
  };
  const state={
    kind,actor,stage,fresh,locked,pointerRevision:5,publicCopies:new Map<string,Buffer>(),
    storageReads:0,publicWrites:0,commitAttempts:0,decodeCalls:0,
    preflightReads:0,gateCalls:0,lastGate:"",
    failAt:"" as ""|"auth"|"stage"|"fresh"|"decode"|"commit"|"throw-commit"|"fake-commit"|"double-gate",
    beforeCommit:noop as ()=>void,
  };
  return state;
}
type Fixture=ReturnType<typeof make>;
function ports(s:Fixture):TrustedPrivateReleasePorts{
 return {
  authenticate:async()=>{
    if(s.failAt==="auth") throw Error("local synthetic auth unavailable");
    return s.actor;
  },
  readVerifiedPrivateStage:async()=>{
    s.storageReads++;
    if(s.failAt==="stage")throw Error("local synthetic bucket unavailable");
    return s.stage;
  },
  readCurrentEvidence:async()=>{
    s.preflightReads++;
    if(s.failAt==="fresh")throw Error("local synthetic DB down");
    return s.fresh;
  },
  decodeFully:async()=>{
    s.decodeCalls++;
    if(s.failAt==="decode")throw Error("local synthetic decoder failure");
    return true;
  },
  atomicCommitPrivatePointer:async({evaluateLocked,stage})=>{
    s.commitAttempts++;
    if(s.failAt==="throw-commit") throw Error("local transaction rollback");
    if(s.failAt==="fake-commit") return {status:"committed",revision:"6"};
    s.beforeCommit(); // simulate rights/session/version changes AFTER preflight.
    const checked=evaluateLocked(s.locked);
    s.gateCalls++;
    s.lastGate=checked.allowed?"OK":checked.reason;
    if(s.failAt==="double-gate"){
      const second=evaluateLocked(s.locked);
      if(!second.allowed) return {status:"rejected"};
    }
    if(!checked.allowed || s.failAt==="commit") return {status:"rejected"};
    // Private pointer only; never upload/copy to a PUBLIC bucket.
    assert.equal(stage.bucket,s.stage.bucket);
    s.pointerRevision++;
    return {status:"committed",revision:String(s.pointerRevision)};
  },
 };
}
let assertions=0;
async function success(kind:PublicMediaKind) {
 const s=make(kind);
 const v=await evaluatePrivateMediaReleaseCandidate({kind,candidateId:"synthetic-1"},ports(s));
 assert.deepEqual(v,{status:"PRIVATE_POINTER_CANDIDATE_ONLY",revision:"6"});
 assert.equal(s.pointerRevision,6);assert.equal(s.publicWrites,0);
 assert.equal(s.publicCopies.size,0);assert.equal(s.preflightReads,1);
 assert.equal(s.commitAttempts,1);assert.equal(s.decodeCalls,1);
 assertions++;
}
async function hold(reason:string,mutate:(s:Fixture)=>void,phase:"pre"|"locked"="locked",kind:PublicMediaKind="ai-recording"){
 const s=make(kind);mutate(s);
 const v=await evaluatePrivateMediaReleaseCandidate({kind,candidateId:"synthetic-1"},ports(s));
 assert.deepEqual(v,{status:"HOLD",reason}, "expected "+reason);
 assert.equal(s.pointerRevision,5);assert.equal(s.publicWrites,0);
 assert.equal(s.publicCopies.size,0);
 if(phase==="pre") assert.equal(s.commitAttempts,0);
 assertions++;
}
async function expectBadId(){
 const s=make(),p=ports(s);
 assert.deepEqual(await evaluatePrivateMediaReleaseCandidate({kind:"ai-recording",candidateId:"../escape"},p),
 {status:"HOLD",reason:"INVALID_INTENT"});
 assert.equal(s.storageReads,0);assertions++;
}
async function run(){
 for(const kind of ["ai-recording","human-recording","site-bgm"] as PublicMediaKind[])await success(kind);
 await expectBadId();
 await hold("AUTH_HOLD",s=>{s.actor.sessionActive=false;},"pre");
 await hold("AUTH_HOLD",s=>{s.failAt="auth";},"pre");
 await hold("STAGE_HOLD",s=>{s.stage.bucketVisibilityVerified=false;},"pre");
 await hold("STAGE_HOLD",s=>{s.stage.immutabilityVerified=false;},"pre");
 await hold("STAGE_HOLD",s=>{s.stage.bucketIsPrivate=false;},"pre");
 await hold("STAGE_HOLD",s=>{s.stage.expectedPointerRevision="-1";},"pre");
 await hold("STAGE_HOLD",s=>{s.stage.releaseNonce="../bad";},"pre");
 await hold("STAGE_HOLD",s=>{s.failAt="stage";},"pre");
 await hold("PRECHECK_HOLD",s=>{s.stage.bytes=Buffer.from("text-but-wav-mimetype");},"pre");
 await hold("PRECHECK_HOLD",s=>{s.stage.claimedMime="text/plain";},"pre");
 await hold("PRECHECK_HOLD",s=>{s.failAt="fresh";},"pre");
 await hold("PRECHECK_HOLD",s=>{s.failAt="decode";},"pre");
 await hold("PRECHECK_HOLD",s=>{s.fresh.rightsWithdrawn=true;},"pre");
 await hold("PRECHECK_HOLD",s=>{s.fresh.contentWarnings=["sexual_r18"];},"pre");
 await hold("REVOKED_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,sessionActive:false};};});
 await hold("REVOKED_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,permissionCurrent:false};};});
 await hold("REVOKED_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,sessionId:"revoked-session"};};});
 await hold("REVOKED_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,actorId:"other-actor"};};});
 await hold("RIGHTS_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,rightsWithdrawn:true};};});
 await hold("RIGHTS_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,evidence:{...s.fresh,rightsApproved:false}};};});
 await hold("R18_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,effectiveR18:true};};});
 await hold("R18_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,evidence:{...s.fresh,contentWarnings:["sexual_r18"]}};};});
 await hold("STAGE_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,stageVersion:"swapped-v2"};};});
 await hold("STAGE_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,stageDigest:sha(Buffer.from("swapped"))};};});
 await hold("STAGE_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,stageBucket:"public-unsafe"};};});
 await hold("STAGE_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,stagePath:"stage/replaced.wav"};};});
 await hold("STAGE_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,stageImmutable:false};};});
 await hold("STAGE_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,evidence:{...s.fresh,immutableVersion:"swapped-v2"}};};});
 await hold("CONTENT_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,evidence:{...s.fresh,episodePublished:false}};};});
 await hold("CONTENT_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,evidence:{...s.fresh,ownerVerified:false}};};});
 await hold("CONSENT_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,evidence:{...s.fresh,humanConsentCurrent:false}};};},"locked","human-recording");
 await hold("PROVENANCE_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,evidence:{...s.fresh,aiProvenanceVerified:false}};};});
 await hold("BGM_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,evidence:{...s.fresh,siteManagedCatalogEntry:false}};};},"locked","site-bgm");
 await hold("PRIVATE_DESTINATION_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,destinationBucketPrivate:false};};});
 await hold("PRIVATE_DESTINATION_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,destinationProxyGated:false};};});
 await hold("CAS_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,pointerRevision:"6"};};});
 await hold("REPLAY_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,releaseNonceAvailable:false};};});
 await hold("REPLAY_HOLD",s=>{s.beforeCommit=()=>{s.locked={...s.locked,requestAlreadyCommitted:true};};});
 await hold("COMMIT_HOLD",s=>{s.failAt="throw-commit";});
 await hold("COMMIT_HOLD",s=>{s.failAt="commit";});
 await hold("COMMIT_HOLD",s=>{s.failAt="fake-commit";});
 await hold("COMMIT_HOLD",s=>{s.failAt="double-gate";});
 {
  // A privileged direct S3 request DOES NOT pass through this adapter.
  // The existing real localhost SigV4 E2E demonstrates that vulnerability.
  const s=make(); s.publicCopies.set("unrestricted-public/opaque.txt",Buffer.from(audio));
  assert.equal(s.publicCopies.size,1);
  assertions++;
 }
 console.log("PASS: F2-P "+assertions+
  " synthetic candidate adapter assertions; AI/Human/BGM/private-only; mock DB & Storage");
 console.log("RELEASE HOLD: privileged S3 direct PUBLIC writes bypass this unwired adapter");
}
void run().catch((e:unknown)=>{console.error(e);process.exitCode=1;});
