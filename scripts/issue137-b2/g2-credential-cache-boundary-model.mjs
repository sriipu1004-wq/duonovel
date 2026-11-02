// Issue #137 G2 NONPRODUCTION SOURCE+MODEL regression, no HTTP/keys.
// Discrete revocation/credential/CDN states are deliberately not a provider
// simulation. Actual CDN behavior requires separately authorized E2E.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=relative=>readFileSync(new URL("../../"+relative,import.meta.url),"utf8");
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
for(const key of ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_S3_ACCESS_KEY",
 "S3_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY","B2_SERVICE_KEY"])
 assert.equal(process.env[key],undefined,"never inherit hosted or local keys");
let count=0;
const equal=(got,want,why)=>{assert.equal(got,want,why);count++};
const route=read("src/app/api/recordings/human-audio/[recordingId]/route.ts");
const proxy=read("src/lib/recording/privateMediaProxy.ts");
const signer=read("src/app/api/recordings/human-upload-session/route.ts");
const admin=read("src/lib/supabase/admin.ts");
const nemo=read("src/lib/recording/nemoGeneration.ts");
const aivis=read("src/lib/recording/aivisGeneration.ts");
const pointer=read("scripts/issue137-b2/human-tus-private-pointer-local.sql");
const scanner=read("scripts/issue137-b2/s3-public-writer-inventory.mjs");
const graph=read("scripts/issue137-b2/recording-credential-route-dependencies.mjs");
for(const [name,source,fragment] of [
 ["current Reader private/public branches",route,"row.is_public === true"],
 ["current Reader proxy delegation",route,"streamAuthorizedPrivateRecording"],
 ["server proxy service bypass credential",proxy,"SUPABASE_SERVICE_ROLE_KEY"],
 ["server proxy direct Storage stream",proxy,"/storage/v1/object/authenticated/"],
 ["existing multipart signed upload bearer",signer,"createSignedUploadUrl"],
 ["admin client bypass key",admin,"SUPABASE_SERVICE_ROLE_KEY"],
 ["Nemo direct Storage writer",nemo,".upload(audioObjectPath"],
 ["Nemo original legacy public URL",nemo,"getPublicUrl"],
 ["Aivis direct Storage writer",aivis,".upload(audioObjectPath"],
 ["Aivis original legacy public URL",aivis,"getPublicUrl"],
 ["G1 stage path is private",pointer,"PRIVATE_POINTER_ONLY"],
 ["existing whole-repo candidate scan",scanner,"git"],
 ["existing credential import graph",graph,"transitivePrivilege"],
 ])equal(source.includes(fragment),true,name);
equal(route.includes("issue137_tus_private_read"),false,
 "G1 receipt not part of deployed Reader");
equal(proxy.includes("verified_sha256"),false,
 "direct proxy does not verify bytes against G1");
equal(signer.includes("SUPABASE_SERVICE_ROLE_KEY"),false,
 "multipart route relies on privileged admin import, not inline literal");
// Abstract capability model, NOT claims of actual CDN TTL/availability.
const base={
  identityCurrent:true,consent:true,permissionOpen:true,
  bucketPrivate:true,objectExists:true,objectVersion:1,
  expectedVersion:1,expectedDigest:"A",actualDigest:"A",
  signedUrlUnexpired:false,previouslyCached:false,
  browserCopy:false,cdnCopy:false,
  privilegedWriter:false,publicObject:false,
  serverRevalidated:true,
};
const authorized=s=>s.identityCurrent&&s.consent&&s.permissionOpen;
const sourceHealthy=s=>s.objectExists&&s.objectVersion===s.expectedVersion&&
 s.actualDigest===s.expectedDigest;
const strictProxy=s=>authorized(s)&&s.bucketPrivate&&sourceHealthy(s)&&
 s.serverRevalidated;
const oldBearerOrigin=s=>s.signedUrlUnexpired&&s.objectExists;
const oldCachedReply=s=>s.previouslyCached&&(s.cdnCopy||s.browserCopy);
const oldPublicOrigin=s=>s.publicObject&&s.objectExists;
const privilegedReplace=s=>s.privilegedWriter&&s.objectExists;
equal(strictProxy(base),true,"ideal full-byte checked proxy eligible");
equal(strictProxy({...base,consent:false}),false,"revoked DB reader denied");
equal(oldBearerOrigin({...base,signedUrlUnexpired:true,consent:false}),true,
 "signed bearer can be independent of current consent");
equal(oldBearerOrigin({...base,signedUrlUnexpired:false,consent:false}),false,
 "short TTL limits new origin access after expiration");
equal(oldCachedReply({...base,previouslyCached:true,cdnCopy:true,
 signedUrlUnexpired:false,consent:false}),true,
 "expired bearer does not imply CDN cache eviction");
equal(oldCachedReply({...base,previouslyCached:true,browserCopy:true,
 cdnCopy:false,consent:false}),true,"browser copy not cleared by CDN purge");
equal(oldCachedReply({...base,previouslyCached:false,cdnCopy:true}),false,
 "cache must have held previous response");
equal(oldPublicOrigin({...base,publicObject:true,consent:false}),true,
 "legacy public-bucket URL is not private authorization");
equal(oldPublicOrigin({...base,publicObject:false,consent:false}),false,
 "new private bucket is not an automatic old public path");
equal(privilegedReplace({...base,privilegedWriter:true}),true,
 "privileged writer remains outside ordinary RLS");
equal(strictProxy({...base,privilegedWriter:true,actualDigest:"B"}),false,
 "digest gate denies changed bytes on a subsequent full read");
equal(strictProxy({...base,objectVersion:2}),false,
 "different provider object identity/version denies stale pointer");
equal(strictProxy({...base,serverRevalidated:false}),false,
 "preflight without postfetch authority cannot establish current view");
equal(strictProxy({...base,identityCurrent:false}),false,"stale session rejected");
equal(strictProxy({...base,permissionOpen:false}),false,"permission revoked");
equal(strictProxy({...base,objectExists:false}),false,"deleted snapshot absent");
// Even rotating the signing key cannot remove already downloaded byte copies.
equal(oldCachedReply({...base,previouslyCached:true,browserCopy:true,
 signedUrlUnexpired:false}),true,"signed-key rotation not a browser purge");
// Immutable or append-only destination is a *hypothesis* until access to ALL
// privileged writers, old tokens, restore and CDN is measured and eliminated.
const custody={
  allWritersInventoried:false,existingSignedTokensRevoked:false,
  oldPublicObjectsMigrated:false,providerPreventsOverwrite:false,
  restoreRaceProven:false,
};
const releasable=s=>Object.values(s).every(v=>v===true);
equal(releasable(custody),false,"unknown custody -> default release HOLD");
equal(releasable({...custody,providerPreventsOverwrite:true}),false,
 "WORM alone does not revoke old signed/CDN/public paths");
equal(releasable({...custody,existingSignedTokensRevoked:true}),false,
 "token retirement alone does not enforce append-only bytes");
equal(releasable(Object.fromEntries(Object.keys(custody).map(k=>[k,true]))),
 true,"all preconditions would be required, not currently observed");
console.log("PASS: #137 G2 SOURCE+MODEL "+count+
 " assertions; source-bound privileged writers, separate signed bearer, CDN/browser, "+
 " old public URLs, mutability and fail-closed custody");
console.log("LIMIT: modeled CDN/browser states are not real provider/cache E2E; "+
 " G2 privilege exclusion, signed URL invalidation and legacy purge NOT proven");
