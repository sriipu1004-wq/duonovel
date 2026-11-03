import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildHumanRecordingPlaybackHref,
  getHumanRecordingStorageObjectPath,
} from "../src/lib/recording/humanRecordingStorage";
import { canServeHumanRecordingAudio } from "../src/lib/recording/humanRecordingState";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

assert.equal(
  getHumanRecordingStorageObjectPath(
    "human/series/episode/user/playback-from-webm.m4a"
  ),
  "human/series/episode/user/playback-from-webm.m4a",
  "private Human narration object paths must retain canonical human provenance"
);

assert.equal(
  getHumanRecordingStorageObjectPath(
    "https://example.supabase.co/storage/v1/object/public/recording-audio/human/series/episode/user/playback-from-webm.m4a"
  ),
  "human/series/episode/user/playback-from-webm.m4a",
  "legacy public human URLs must remain parseable for cleanup/migration compatibility"
);

assert.equal(
  buildHumanRecordingPlaybackHref("recording-id"),
  "/api/recordings/human-audio/recording-id",
  "Human narration clients must use the authorization proxy"
);

const publish = source("src/app/api/recordings/human-publish/route.ts");
const publishAuth = publish.indexOf("await supabase.auth.getUser()");
const publishMultipart = publish.indexOf("await request.formData()");
assert.ok(
  publishAuth >= 0 && publishMultipart >= 0 && publishAuth < publishMultipart,
  "Human publish must authenticate before multipart parsing"
);
for (const required of [
  "isOfficialAccountEmail(user.email)",
  'getSeriesPublicationStatus(accessibleSeries as SeriesRow) !== "public"',
  "!isEpisodePubliclyVisible(accessibleEpisode as EpisodeRow)",
  '.select("display_name")',
]) {
  assert.equal(
    publish.includes(required),
    true,
    `human-publish must keep boundary: ${required}`
  );
}
for (const forbidden of [
  'email.split("@")[0]',
  '"ユーザー朗読"',
]) {
  assert.equal(
    publish.includes(forbidden),
    false,
    `human-publish must not invent narrator identity: ${forbidden}`
  );
}

const uploadSession = source(
  "src/app/api/recordings/human-upload-session/route.ts"
);
assert.equal(
  uploadSession.includes("isOfficialAccountEmail(user.email)"),
  true,
  "Official must not receive Human narration signed upload sessions"
);

const uploadFinalize = source(
  "src/app/api/recordings/human-upload-finalize/route.ts"
);
for (const required of [
  "isOfficialAccountEmail(user.email)",
  'getSeriesPublicationStatus(series as SeriesRow) !== "public"',
  "!isEpisodePubliclyVisible(episode as EpisodeRow)",
  "RECORDING_GLOBAL_CONSENT_VERSION",
]) {
  assert.equal(
    uploadFinalize.includes(required),
    true,
    `multipart finalize must keep Human narration boundary: ${required}`
  );
}

const visibility = source(
  "src/app/api/recordings/human-visibility/route.ts"
);
assert.equal(
  visibility.includes("isHumanRecordingRow(row)"),
  true,
  "visibility API must reject synthetic recording rows"
);

const deletion = source("src/app/api/recordings/human-delete/route.ts");
assert.equal(
  deletion.includes("isHumanRecordingRow(row)"),
  true,
  "delete API must reject synthetic recording rows"
);

const audio = source("src/app/api/recordings/human-audio/[recordingId]/route.ts");
for (const required of [
  "isHumanRecordingRow(recordingData)",
  "canServeHumanRecordingAudio({",
  "sourceVisible,",
  "sourcePublic,",
  "currentPermissionOpen:",
  "currentConsent: isAcceptedRecordingConsentVersion(",
  "isR18Series(series)",
  "getCurrentR18ViewerPreference()",
  "streamAuthorizedPrivateRecording(",
  "playback-from-[a-z0-9]+[.]m4a",
]) {
  assert.equal(audio.includes(required), true,
    `Human playback must fail closed on active source/narrator/consent/R18: ${required}`);
}
for (const forbidden of ["createSignedUrl(", "NextResponse.redirect(", "B2_G1_HTTP_GET_MODE"]) {
  assert.equal(audio.includes(forbidden), false,
    `Human playback must never mint a bearer URL or enable local test-mode bypass: ${forbidden}`);
}
const aiAudio = source("src/app/api/recordings/ai-audio/[recordingId]/route.ts");
for (const required of ["isUuid(recording.series_id)",
  "getCurrentR18ViewerPreference()", "streamAuthorizedPrivateRecording(", "exactPath.test(objectPath)"]) {
  assert.equal(aiAudio.includes(required), true,
    `AI private audio must verify source/provenance/R18: ${required}`);
}
// Actual pure authorization gate negatives, not only source-string checks.
const publicBase = {
  isPublic: true, narratorIsViewer: false, sourceVisible: true,
  sourcePublic: true, currentPermissionOpen: true, currentConsent: true,
  isR18: false, currentR18Permission: false,
};
assert.equal(canServeHumanRecordingAudio(publicBase), true,
  "public, currently open, consenting, published Human narration remains accessible");
for (const [override,label] of [
  [{ sourceVisible: false }, "not visible"],
  [{ sourcePublic: false }, "source unpublished"],
  [{ currentPermissionOpen: false }, "recording permission withdrawn"],
  [{ currentConsent: false }, "narrator consent withdrawn"],
  [{ isR18: true }, "R18 not opted in"],
] as const) {
  assert.equal(canServeHumanRecordingAudio({ ...publicBase, ...override }), false,
    `Human public streaming must reject ${label}`);
}
assert.equal(canServeHumanRecordingAudio({
  ...publicBase, isR18: true, currentR18Permission: true,
}), true, "verified R18 viewer may access a currently public consenting Human row");
const privateBase = {
  ...publicBase, isPublic: false, narratorIsViewer: true, sourcePublic: false,
};
assert.equal(canServeHumanRecordingAudio(privateBase), true,
  "private narrator may access a source that is actually visible under their RLS");
for (const [override,label] of [
  [{ narratorIsViewer: false }, "not narrator"],
  [{ sourceVisible: false }, "private source denied under current RLS"],
  [{ currentPermissionOpen: false }, "owner revoked recording permission"],
  [{ currentConsent: false }, "narrator withdrew consent"],
] as const) {
  assert.equal(canServeHumanRecordingAudio({ ...privateBase, ...override }), false,
    `Human private streaming must reject ${label}`);
}

const workPage = source("src/app/works/[seriesId]/page.tsx");
assert.equal(
  workPage.includes("isPublishedHumanRecording"),
  true,
  "work page narrator cards must be built only from published Human narration"
);
assert.equal(
  workPage.includes("getSyntheticReaderTags"),
  false,
  "Human narrator cards must not carry synthetic voice semantics"
);

const publicRead = source("src/lib/publicRead.ts");
assert.equal(
  publicRead.includes("projectReaderEpisodeRecordings("),
  true,
  "Reader payload must run the server-side Human/AI projection before any client props"
);

const recordingProjection = source("src/lib/recording/readerEpisodeRecordingProjection.ts");
for (const required of [
  "isPublishedHumanRecording(row)",
  "buildHumanRecordingPlaybackHref(row.id)",
  "listProtectedAiRecordings(rows",
]) {
  assert.equal(recordingProjection.includes(required), true,
    `Recording projection must keep AI and Human provenance distinct: ${required}`);
}
const readerPage = source("src/app/read/[seriesId]/[episodeNumber]/page.tsx");
assert.equal(readerPage.includes("recording.audio_storage_path === buildHumanRecordingPlaybackHref(recording.id)"), true,
  "Reader must not filter projected Human proxy URLs through the raw Storage path predicate");

const recordSearch = source("src/app/record/page.tsx");
for (const required of [
  "humanNarrationCount > 0",
  "humanNarratorNames.join",
  "parsePublicSearchSourceLanguages",
  "isPublishedHumanRecording",
]) {
  assert.equal(
    recordSearch.includes(required),
    true,
    `narration search must stay Human-scoped: ${required}`
  );
}

console.log(
  "PASS: Human narration identity, access, storage, search, Official, and TTS separation boundaries are present"
);
