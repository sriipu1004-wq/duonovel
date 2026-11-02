// Issue #137 G1: SOURCE + pure MODEL only, nonproduction.
 // This script DOES NOT provide audio, a token, an API, or release clearance.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getSeriesContentRating} from "../../src/lib/contentRating.ts";
import {getSeriesPublicationStatus,isEpisodePubliclyVisible}
 from "../../src/features/write/writeShared.ts";
import {isAcceptedRecordingConsentVersion}
 from "../../src/lib/recording/recordingConsent.ts";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
const load=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");
const route=load("src/app/api/recordings/human-audio/[recordingId]/route.ts");
const proxy=load("src/lib/recording/privateMediaProxy.ts");
const pointer=load("scripts/issue137-b2/human-tus-private-pointer-local.sql");
const issuer=load("scripts/issue137-b2/human-tus-session-issuer-local.sql");
let checks=0;
function check(actual,expected,message){assert.equal(actual,expected,message);checks++;}
const author="author-id",narrator="narrator-id",reader="reader-id";
const base={
 actor:narrator,narrator,author,viewer:narrator,
 currentSession:true,consent:"2026-04-16",permission:"open",
 publication:"public",episodeStatus:"posted",episodePublished:true,
 rating:"general",warnings:[],showR18:false,ageConfirmed:false,
 leaseState:"active",receiptState:"SEALED_PRIVATE_SNAPSHOT",
 pointerOwner:narrator,bytesMatch:true,objectIdMatches:true,
 recordingPublic:false,rightsProvenance:"unverified",
};
function currentR18Allowed(s){
 const isR18=getSeriesContentRating({
  content_rating:s.rating,content_warnings:s.warnings,
 })==="r18";
 return !isR18||(s.showR18&&s.ageConfirmed);
}
function stageEligible(s){
 return !!s.actor&&s.actor===s.narrator&&s.currentSession&&
  isAcceptedRecordingConsentVersion(s.consent)&&s.permission==="open"&&
  getSeriesPublicationStatus({publication_status:s.publication})==="public"&&
  isEpisodePubliclyVisible({
   posting_status:s.episodeStatus,is_published:s.episodePublished,
  })&&currentR18Allowed(s);
}
// Model of the PRIVATE staging receipt, intentionally not a PUBLIC recording.
function privatePreviewEligible(s){
 return stageEligible(s)&&s.viewer===s.narrator&&
  s.pointerOwner===s.narrator&&s.leaseState==="active"&&
  s.receiptState==="SEALED_PRIVATE_SNAPSHOT"&&
  s.bytesMatch&&s.objectIdMatches&&!s.recordingPublic;
}
// A possible future PUBLIC reader gate. This cannot be rolled out until a
// trusted exact-source/edition rights attestation exists and has been audited.
function futurePublicEligible(s){
 return s.recordingPublic&&s.permission==="open"&&
  s.rightsProvenance==="verified-exact-edition"&&
  getSeriesPublicationStatus({publication_status:s.publication})==="public"&&
  isEpisodePubliclyVisible({
   posting_status:s.episodeStatus,is_published:s.episodePublished,
  })&&currentR18Allowed(s)&&
  s.receiptState==="SEALED_PRIVATE_SNAPSHOT"&&
  s.bytesMatch&&s.objectIdMatches;
}
check(stageEligible(base),true,"author!=narrator must remain eligible in OPEN public work");
check(privatePreviewEligible(base),true,"narrator owns private preview despite different author");
check(futurePublicEligible(base),false,"OPEN is not proof of legal rights");
check(privatePreviewEligible({...base,viewer:author}),false,
 "author has no access to different narrator's PRIVATE recording");
check(privatePreviewEligible({...base,viewer:reader}),false,
 "ordinary reader has no access to PRIVATE preview");
check(privatePreviewEligible({...base,actor:author}),false,
 "work author cannot claim narrator's private stage");
check(privatePreviewEligible({...base,currentSession:false}),false,"stale GoTrue session");
check(privatePreviewEligible({...base,consent:null}),false,"missing global consent");
check(privatePreviewEligible({...base,consent:"2026-04-15"}),false,"old consent");
check(privatePreviewEligible({...base,permission:"closed"}),false,"author withdraws narration OPEN");
check(privatePreviewEligible({...base,publication:"private"}),false,"private work");
check(privatePreviewEligible({...base,episodeStatus:"scheduled"}),false,"scheduled episode");
check(privatePreviewEligible({...base,episodePublished:false}),false,"unpublished episode");
check(privatePreviewEligible({...base,rating:"r18"}),false,"rating-only R18 no confirmation");
check(privatePreviewEligible({...base,warnings:["sexual_r18"]}),false,"warning-only R18");
check(privatePreviewEligible({...base,warnings:["sexual_r18"],
 showR18:true,ageConfirmed:false}),false,"R18 ON without age");
check(privatePreviewEligible({...base,warnings:["sexual_r18"],
 showR18:true,ageConfirmed:true}),true,"R18 age and preference both valid");
check(privatePreviewEligible({...base,leaseState:"revoked"}),false,"revoked lease");
check(privatePreviewEligible({...base,receiptState:"STAGED"}),false,"unsealed bytes");
check(privatePreviewEligible({...base,bytesMatch:false}),false,"physical SHA drift");
check(privatePreviewEligible({...base,objectIdMatches:false}),false,"Storage object identity drift");
check(privatePreviewEligible({...base,pointerOwner:author}),false,"pointer misbound to author");
check(privatePreviewEligible({...base,recordingPublic:true}),false,
 "private-stage gate must not be used as public serving permission");
check(futurePublicEligible({...base,recordingPublic:true,
 rightsProvenance:"unverified"}),false,"public publish without exact edition proof");
check(futurePublicEligible({...base,recordingPublic:true,
 rightsProvenance:"verified-exact-edition"}),true,
 "model only: published, exact rights, normal public visitor");
check(futurePublicEligible({...base,recordingPublic:true,
 rightsProvenance:"verified-exact-edition",rating:"r18"}),false,
 "future public reader R18 OFF");
check(futurePublicEligible({...base,recordingPublic:true,
 rightsProvenance:"verified-exact-edition",rating:"r18",
 showR18:true,ageConfirmed:true}),true,"future public reader R18 ON+age");
check(futurePublicEligible({...base,recordingPublic:true,
 rightsProvenance:"verified-exact-edition",permission:"closed"}),false,
 "future permission withdrawal must block PUBLIC access");
check(futurePublicEligible({...base,recordingPublic:true,
 rightsProvenance:"verified-exact-edition",publication:"private"}),false,
 "future work withdrawal must block PUBLIC access");

// Independent SOURCE checks of existing app boundaries. These establish
// observed code relationships, NOT that the conceptual model is integrated.
check(pointer.includes("l.actor_id=p_actor"),true,"existing pointer binds actor");
check(pointer.includes("l.issued_session_id=p_session"),true,"existing pointer binds session");
check(pointer.includes("s.recording_permission_mode='open'"),true,"pointer requires permission");
check(pointer.includes("s.publication_status='public'"),true,"pointer requires public series");
check(pointer.includes("e.posting_status='posted'"),true,"pointer requires posted episode");
check(pointer.includes("u.show_r18_content is true"),true,"pointer checks R18 preference");
check(pointer.includes("u.r18_confirmed_at is not null"),true,"pointer checks age");
check(pointer.includes("s.author_id=l.actor_id"),false,"not author-only narration");
check(issuer.includes("issue137_tus_app_can_insert"),true,
 "issuer requires established private authority");
check(route.includes('row.is_public === true'),true,"current route distinguishes PUBLIC flag");
check(route.includes("user.id !== readerId"),true,"current PRIVATE path checks narrator ID");
check(route.includes("getCurrentR18ViewerPreference"),true,"current PUBLIC path checks R18");
check(route.includes("streamAuthorizedPrivateRecording"),true,"current route delegates bytes");
check(proxy.includes("SUPABASE_SERVICE_ROLE_KEY"),true,"current proxy uses bypass credential");
check(proxy.includes('cache:"no-store"'),true,"current proxy disables fetch cache");
check(route.includes("issue137_tus_private_read"),false,
 "current Reader route NOT connected to local receipt authority");
check(route.includes("issue137_tus_private_pointers"),false,
 "current Reader route NOT connected to G1 stage pointers");
check(proxy.includes("verified_sha256"),false,
 "current proxy cannot attest G1 full-byte SHA integrity");
console.log("PASS: #137 G1 private Reader boundary SOURCE+MODEL "+checks+
 " checks; 3 distinct actors, OPEN third-party positive, private/public/R18/rights negatives");
console.log("HOLD: SOURCE+MODEL only; current HTTP Reader not connected to G1, no live rights/edition attestation, no exclusive provider writer or real private playback E2E");
