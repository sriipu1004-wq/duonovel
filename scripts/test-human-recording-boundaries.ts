import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildHumanRecordingPlaybackHref,
  getHumanRecordingStorageObjectPath,
} from "../src/lib/recording/humanRecordingStorage";

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

const audio = source(
  "src/app/api/recordings/human-audio/[recordingId]/route.ts"
);
for (const required of [
  "isHumanRecordingRow(recordingData)",
  'getSeriesPublicationStatus(series) !== "public"',
  "!isEpisodePubliclyVisible(episode)",
  "isR18Series(series)",
  "createSignedUrl(objectPath, 60)",
]) {
  assert.equal(
    audio.includes(required),
    true,
    `Human audio proxy must keep access boundary: ${required}`
  );
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
  publicRead.includes("buildHumanRecordingPlaybackHref(recording.id)"),
  true,
  "Reader payload must expose authorization-proxy URLs instead of storage paths"
);

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
