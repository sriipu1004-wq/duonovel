import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertApprovedPrivateHumanRecordingBucket,
  buildHumanRecordingPlaybackHref,
  DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET,
  getHumanRecordingAudioBucketName,
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

// #137: the exact PRIVATE bucket is verified before any byte write or
// signed upload token is issued.
async function checkHumanPrivateBucketBoundary() {
  const prior = process.env.SUPABASE_HUMAN_RECORDING_BUCKET;
  let providerCalls = 0;
  const client = (publicity: boolean | null, id = DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET) => ({
    storage: {
      async getBucket(requested: string) {
        assert.equal(requested, DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET);
        providerCalls++;
        return {
          data: publicity === null ? null : { id, name: id, public: publicity },
          error: null,
        };
      },
    },
  });
  try {
    delete process.env.SUPABASE_HUMAN_RECORDING_BUCKET;
    assert.equal(getHumanRecordingAudioBucketName(), DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET);
    assert.equal(
      await assertApprovedPrivateHumanRecordingBucket(client(false)),
      DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET,
      "canonical PRIVATE provider bucket remains allowed"
    );
    process.env.SUPABASE_HUMAN_RECORDING_BUCKET = "human-recording-audio";
    assert.equal(
      await assertApprovedPrivateHumanRecordingBucket(client(false)),
      DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET
    );
    const before = providerCalls;
    for (const disallowed of ["recording-audio", "alt-public", "alt-private"]) {
      process.env.SUPABASE_HUMAN_RECORDING_BUCKET = disallowed;
      assert.throws(() => getHumanRecordingAudioBucketName(), /human_private_bucket_name_unapproved/);
      await assert.rejects(
        () => assertApprovedPrivateHumanRecordingBucket(client(false)),
        /human_private_bucket_name_unapproved/
      );
      assert.equal(providerCalls, before, "reject unapproved bucket before querying provider");
    }
    delete process.env.SUPABASE_HUMAN_RECORDING_BUCKET;
    await assert.rejects(
      () => assertApprovedPrivateHumanRecordingBucket(client(true)),
      /human_private_bucket_not_verified/,
      "canonical bucket unexpectedly PUBLIC must fail before writes"
    );
    await assert.rejects(
      () => assertApprovedPrivateHumanRecordingBucket(client(null)),
      /human_private_bucket_not_verified/,
      "missing provider bucket must fail before writes"
    );
    await assert.rejects(
      () => assertApprovedPrivateHumanRecordingBucket(client(false, "unexpected-alias")),
      /human_private_bucket_not_verified/,
      "provider bucket ID/name must match the exact expected destination"
    );
    const guard = "await assertApprovedPrivateHumanRecordingBucket(";
    const publish = source("src/lib/recording/humanRecordingPublish.ts");
    assert.ok(
      publish.indexOf(guard + "adminSupabase)") >= 0 &&
        publish.indexOf(guard + "adminSupabase)") < publish.indexOf(".upload(originalObjectPath, fileBytes"),
      "single upload checks provider PRIVATE bucket before the first byte"
    );
    const session = source("src/app/api/recordings/human-upload-session/route.ts");
    assert.ok(
      session.indexOf(guard + "adminSupabase)") >= 0 &&
        session.indexOf(guard + "adminSupabase)") < session.indexOf(".createSignedUploadUrl("),
      "multipart session verifies PRIVATE bucket before any signed upload token"
    );
    const finalize = source("src/app/api/recordings/human-upload-finalize/route.ts");
    assert.ok(
      finalize.indexOf(guard + "admin)") >= 0 &&
        finalize.indexOf(guard + "admin)") < finalize.indexOf(".download(part.objectPath)") &&
        finalize.indexOf(guard + "admin)") < finalize.indexOf("await publishHumanRecording("),
      "multipart finalize rechecks PRIVATE bucket before reading parts or publication"
    );
  } finally {
    if (prior === undefined) delete process.env.SUPABASE_HUMAN_RECORDING_BUCKET;
    else process.env.SUPABASE_HUMAN_RECORDING_BUCKET = prior;
  }
}

void checkHumanPrivateBucketBoundary().then(() => {
  console.log(
    "PASS: Human identity, access, exact PRIVATE bucket, signed uploads, storage, search, Official, and TTS boundaries"
  );
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
