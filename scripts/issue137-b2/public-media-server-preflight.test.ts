// Issue #137 F2-P: synthetic server preflight candidate tests.
// No Supabase keys, networks, Production DB, real media, public URL or writes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  checkPublicMediaReleaseCandidate,
  detectPublicMediaContainer,
  publicMediaDeclarationMatches,
  type FreshPublicMediaEvidence,
  type PublicMediaStage,
  type PublicMediaKind,
} from "../../src/lib/recording/publicMediaReleasePreflight";

const sha256=(x:Uint8Array)=>createHash("sha256").update(x).digest("hex");
const wav=Buffer.alloc(48);
wav.write("RIFF",0);wav.writeUInt32LE(40,4);wav.write("WAVEfmt ",8);
wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);
wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
wav.write("data",36);wav.writeUInt32LE(4,40);
wav.writeInt16LE(14,44);wav.writeInt16LE(-14,46);
const mp3=Buffer.concat([Buffer.from("ID3"),Buffer.alloc(48)]);
const text=Buffer.from("not audio bytes");
const stage: PublicMediaStage={
 bucket:"synthetic-private-quarantine",objectPath:"quarantine/synthetic-v1",
 bucketIsPrivate:true,immutableVersion:"synthetic-etag-1",
 storedSha256:sha256(wav),bytes:wav,claimedMime:"audio/wav",claimedFileName:"synthetic.wav",
};
const valid:FreshPublicMediaEvidence={
 kind:"ai-recording",immutableVersion:"synthetic-etag-1",
 rightsApproved:true,rightsWithdrawn:false,
 publicationStatus:"public",episodeStatus:"posted",episodePublished:true,
 seriesMatchesEpisode:true,rating:"general",contentWarnings:[],
 ownerVerified:true,humanConsentCurrent:false,aiProvenanceVerified:true,
 siteManagedCatalogEntry:false,
};
type Patch={kind?:PublicMediaKind;stage?:Partial<PublicMediaStage>;
 fresh?:Partial<FreshPublicMediaEvidence>|null;decodeResult?:boolean;
 failLoader?:boolean;failDecoder?:boolean};
let tested=0;
async function evaluate(p:Patch={}){
 const kind=p.kind??"ai-recording";
 const updatedStage={...stage,...p.stage};
 const updatedFresh=p.fresh===null?null:({...valid,...p.fresh,kind:p.fresh?.kind??kind});
 let loaded=0,decoded=0;
 const output=await checkPublicMediaReleaseCandidate({
   kind,stage:updatedStage,
   loadFreshEvidence:async()=>{
     loaded++;
     if(p.failLoader)throw Error("synthetic-query-failure");
     return updatedFresh;
   },
   decodeFully:async()=>{
     decoded++;
     if(p.failDecoder)throw Error("synthetic-decoder-failure");
     return p.decodeResult??true;
   },
 });
 return {output,loaded,decoded};
}
async function expectHold(reason:string,p:Patch,phase?:{load?:number;decode?:number}){
 const x=await evaluate(p);
 assert.deepEqual(x.output,{status:"HOLD",reason});
 if(phase?.load!==undefined)assert.equal(x.loaded,phase.load);
 if(phase?.decode!==undefined)assert.equal(x.decoded,phase.decode);
 tested++;
}
async function expectCandidate(p:Patch){
 const x=await evaluate(p);
 assert.deepEqual(x.output,{status:"PRECHECK_ONLY_NOT_AUTHORIZED",
   digestSha256:sha256(p.stage?.bytes??wav),
   immutableVersion:p.stage?.immutableVersion??"synthetic-etag-1"});
 assert.equal(x.loaded,1);assert.equal(x.decoded,1);tested++;
}
async function runTests():Promise<void> {
await expectCandidate({});
await expectHold("BAD_STAGING",{stage:{bucketIsPrivate:false}},{load:0,decode:0});
await expectHold("BAD_STAGING",{stage:{bucket:""}},{load:0});
await expectHold("BAD_STAGING",{stage:{objectPath:"../escape"}},{load:0});
await expectHold("BAD_STAGING",{stage:{immutableVersion:""}},{load:0});
await expectHold("BAD_OBJECT",{stage:{storedSha256:"spoofed-digest"}},{load:0});
await expectHold("DIGEST_MISMATCH",{stage:{storedSha256:sha256(text)}},{load:0});
await expectHold("INVALID_FORMAT",{stage:{claimedMime:"text/plain",claimedFileName:"hidden.txt"}},{load:0});
await expectHold("INVALID_FORMAT",{stage:{claimedMime:"audio/wav",claimedFileName:"hidden.txt"}},{load:0});
await expectHold("INVALID_FORMAT",{stage:{claimedMime:"text/plain",claimedFileName:"s.wav"}},{load:0});
await expectHold("INVALID_FORMAT",{stage:{bytes:text,storedSha256:sha256(text)}} ,{load:0});
await expectHold("UNVERIFIED_CURRENT_STATE",{fresh:null},{decode:0});
await expectHold("UNVERIFIED_CURRENT_STATE",{failLoader:true},{decode:0});
await expectHold("UNVERIFIED_CURRENT_STATE",{fresh:{kind:"site-bgm"}},{decode:0});
await expectHold("UNVERIFIED_CURRENT_STATE",{fresh:{immutableVersion:"stale"}} ,{decode:0});
await expectHold("RIGHTS_HOLD",{fresh:{rightsApproved:false}},{decode:0});
await expectHold("RIGHTS_HOLD",{fresh:{rightsWithdrawn:true}},{decode:0});
await expectHold("RESTRICTED_R18",{fresh:{rating:"r18"}},{decode:0});
await expectHold("RESTRICTED_R18",{fresh:{contentWarnings:["sexual_r18"]}},{decode:0});
await expectHold("PUBLICATION_HOLD",{fresh:{publicationStatus:"private"}},{decode:0});
await expectHold("PUBLICATION_HOLD",{fresh:{episodeStatus:"scheduled"}},{decode:0});
await expectHold("PUBLICATION_HOLD",{fresh:{episodePublished:false}},{decode:0});
await expectHold("PUBLICATION_HOLD",{fresh:{seriesMatchesEpisode:false}},{decode:0});
await expectHold("OWNERSHIP_HOLD",{fresh:{ownerVerified:false}},{decode:0});
await expectHold("PROVENANCE_HOLD",{fresh:{aiProvenanceVerified:false}},{decode:0});
await expectHold("CONSENT_HOLD",{kind:"human-recording",fresh:{humanConsentCurrent:false}},{decode:0});
await expectCandidate({kind:"human-recording",fresh:{humanConsentCurrent:true,aiProvenanceVerified:false}});
await expectHold("BGM_CATALOG_HOLD",{kind:"site-bgm",fresh:{siteManagedCatalogEntry:false}},{decode:0});
await expectCandidate({kind:"site-bgm",fresh:{
 siteManagedCatalogEntry:true,ownerVerified:false,aiProvenanceVerified:false,
 episodePublished:false,episodeStatus:"none",seriesMatchesEpisode:false,
 publicationStatus:"unknown",humanConsentCurrent:false}});
await expectHold("RIGHTS_HOLD",{kind:"site-bgm",fresh:{siteManagedCatalogEntry:true,rightsWithdrawn:true}},{decode:0});
await expectHold("DECODER_HOLD",{decodeResult:false},{decode:1});
await expectHold("DECODER_HOLD",{failDecoder:true},{decode:1});
await expectCandidate({stage:{bytes:mp3,storedSha256:sha256(mp3),
 claimedMime:"audio/mpeg",claimedFileName:"synthetic.mp3"}});
assert.equal(detectPublicMediaContainer(wav),"wav");tested++;
assert.equal(detectPublicMediaContainer(mp3),"mp3");tested++;
assert.equal(publicMediaDeclarationMatches(wav,"synthetic.wav","audio/wav; codecs=pcm"),true);tested++;
assert.equal(publicMediaDeclarationMatches(wav,"synthetic.txt","audio/wav"),false);tested++;
assert.equal(publicMediaDeclarationMatches(text,"synthetic.wav","audio/wav"),false);tested++;
console.log("PASS: F2-P "+tested+
 " synthetic SERVER preflight regressions; BGM AI Human distinct; NON-WIRED, no PUBLIC authorization");
}
void runTests().catch((error:unknown)=>{ console.error(error); process.exitCode=1; });
