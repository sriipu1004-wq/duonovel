// Issue #137: Human multipart token issuance consent fence, no network or credentials.
// SOURCE ordering plus the actual pure consent-version decision. Not a Next.js route E2E.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  isAcceptedRecordingConsentVersion,
  RECORDING_GLOBAL_CONSENT_VERSION,
} from "../../src/lib/recording/recordingConsent";

let count=0;
for (const invalid of [null,undefined,"","2026-04-15","2026-04-17",false,0,{},[]]) {
  assert.equal(isAcceptedRecordingConsentVersion(invalid),false,"incorrect consent must deny");
  count++;
}
assert.equal(isAcceptedRecordingConsentVersion(RECORDING_GLOBAL_CONSENT_VERSION),true);
count++;
const route=readFileSync(new URL("../../src/app/api/recordings/human-upload-session/route.ts",import.meta.url),"utf8");
const at=(needle:string)=>{const n=route.indexOf(needle);assert.ok(n>=0,"missing source guard: "+needle);count++;return n;};
const auth=at("supabase.auth.getUser()");
const check=at('.from("user_recording_consents")');
at('.eq("user_id", user.id)');
at('.eq("consent_key", RECORDING_GLOBAL_CONSENT_KEY)');
const error=at('throw new Error("recording_consent_check_failed")');
const denied=at('if (!isAcceptedRecordingConsentVersion(consentRow?.consent_version))');
const fail=at('throw new Error("recording_consent_required")');
const session=at("const session = buildHumanMultipartUploadSession({");
const admin=at("const adminSupabase = createAdminClient()");
const minted=at(".createSignedUploadUrl(part.objectPath, {");
assert.ok(auth<check && check<error && error<denied && denied<fail &&
  fail<session && session<admin && admin<minted,
  "authenticated user consent must be confirmed before generating any signed token");count++;
assert.ok(route.includes('message === "recording_consent_required"'));count++;
assert.ok(route.includes('message === "recording_consent_check_failed"'));count++;
assert.ok(route.includes('.select("consent_version")'));count++;
console.log("PASS: "+count+" Human signed multipart consent-version and SOURCE-before-token negatives (no API E2E)");
