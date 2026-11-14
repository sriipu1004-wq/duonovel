import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertApprovedPrivateHumanRecordingBucket,
  buildHumanRecordingPlaybackHref,
  DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET,
  getHumanRecordingAudioBucketName,
  getHumanRecordingStorageObjectPath,
} from "../src/lib/recording/humanRecordingStorage";
import {
  commitHumanAtomicMutation,
  readHumanAtomicRevision,
} from "../src/lib/recording/humanRecordingAtomic";
import { checkNonproductionMediaWriterBoundary } from "../src/lib/recording/publicMediaWriterBoundary";

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

// #137 H1: every Human recording row mutation goes through the transactional
// service-role RPC; a missing RPC fails closed and never falls back.
async function checkHumanAtomicCommitBoundary() {
  type RpcResult = { data: unknown; error: { message: string } | null };
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  // No `.from` at all: any direct table write attempt would throw TypeError
  // and fail the message assertions below.
  const fakeClient = (result: RpcResult) => ({
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return result;
    },
  }) as never;
  const scope = { seriesId: "s", episodeId: "e", ownerId: "u" };
  const missing = { data: null, error: { message: "Could not find the function public.issue137_h1_human_commit" } };

  await assert.rejects(() => readHumanAtomicRevision(fakeClient(missing), scope),
    /^Error: human_atomic_revision_unavailable:/u, "absent revision RPC fails closed");
  await assert.rejects(() => commitHumanAtomicMutation(fakeClient(missing), {
    ...scope, expectedRevision: "0", action: "delete_all",
  }), /^Error: human_atomic_commit_failed:/u, "absent commit RPC fails closed");
  await assert.rejects(() => commitHumanAtomicMutation(fakeClient({
    data: null, error: { message: "H1_STALE_REVISION" },
  }), { ...scope, expectedRevision: "3", action: "visibility", recordingId: "r", isPublic: false }),
  /H1_STALE_REVISION/u, "DB revision conflict is surfaced, not retried directly");
  await assert.rejects(() => readHumanAtomicRevision(fakeClient({ data: -1, error: null }), scope),
    /human_atomic_invalid_revision/u);
  await assert.rejects(() => commitHumanAtomicMutation(fakeClient({ data: null, error: null }), {
    ...scope, expectedRevision: "0", action: "delete_all",
  }), /human_atomic_empty_result/u);

  calls.length = 0;
  assert.equal(await readHumanAtomicRevision(fakeClient({ data: 7, error: null }), scope), "7");
  const committed = await commitHumanAtomicMutation(fakeClient({
    data: { recording_id: "r", deleted_count: 1, revision: 8 }, error: null,
  }), { ...scope, expectedRevision: "7", action: "replace", recordingId: "r",
    readerName: "N", audioStoragePath: "human/s/e/u/1-x/playback-from-wav.m4a",
    isPublic: true, priorAudioStoragePath: "human/s/e/u/0-x/playback-from-wav.m4a", priorIsPublic: true });
  assert.deepEqual(committed, { recordingId: "r", deletedCount: 1, revision: "8" });
  assert.deepEqual(calls.map((c) => c.fn), ["issue137_h1_human_revision", "issue137_h1_human_commit"]);
  assert.deepEqual(calls[1].args, {
    p_series_id: "s", p_episode_id: "e", p_owner_id: "u", p_expected_revision: "7",
    p_action: "replace", p_recording_id: "r", p_reader_name: "N",
    p_audio_storage_path: "human/s/e/u/1-x/playback-from-wav.m4a", p_is_public: true,
    p_prior_audio_storage_path: "human/s/e/u/0-x/playback-from-wav.m4a", p_prior_is_public: true,
  });

  // Owner identity is the authenticated user, never request input.
  const humanPublish = source("src/lib/recording/humanRecordingPublish.ts");
  const humanDelete = source("src/app/api/recordings/human-delete/route.ts");
  const humanVisibility = source("src/app/api/recordings/human-visibility/route.ts");
  for (const [label, text, required] of [
    ["publish", humanPublish, ['action: primary ? "replace" : "insert"', "ownerId: input.readerId", "readerId: userId"]],
    ["delete", humanDelete, ['action: "delete_all"', "ownerId: user.id", "await supabase.auth.getUser()"]],
    ["visibility", humanVisibility, ['action: "visibility"', "ownerId: user.id", "await supabase.auth.getUser()"]],
  ] as const) {
    for (const needle of ["commitHumanAtomicMutation(", "readHumanAtomicRevision(", ...required]) {
      assert.equal(text.includes(needle), true, `Human ${label} must use the H1 RPC: ${needle}`);
    }
  }
  // Revision is read BEFORE media bytes are uploaded (stale upload cannot win).
  assert.ok(humanPublish.indexOf("const preUploadRevision = await readHumanAtomicRevision(") <
    humanPublish.indexOf(".upload(originalObjectPath, fileBytes"),
  "publish captures the H1 revision before the first media byte");
  // H2 (staging lease) is not part of this change.
  for (const text of [humanPublish, humanDelete, humanVisibility]) {
    assert.equal(/humanStagingLease|issue137_h2_/u.test(text), false, "H1 must not depend on H2");
  }

  // Repository-wide: list every direct write chained on .from("recordings").
  // Human writers must not appear; the remaining writers are AI/TTS-only or
  // explicitly exclude Human storage paths.
  const { readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/u.test(name)) files.push(full.replace(/\\/gu, "/"));
    }
  };
  walk("src");
  const writers = new Set<string>();
  for (const file of files) {
    const text = source(file);
    const re = /\.from\(\s*["']recordings["']\s*\)([\s\S]{0,120})/gu;
    for (const match of text.matchAll(re)) {
      if (/^\s*\.(insert|update|upsert|delete)\(/u.test(match[1])) writers.add(file);
    }
  }
  assert.deepEqual([...writers].sort(), [
    "src/app/api/account/profile/route.ts",
    "src/lib/recording/aivisAutoGeneration.ts",
    "src/lib/recording/aivisGeneration.ts",
    "src/lib/recording/nemoGeneration.ts",
  ], "direct recordings writers must be exactly the reviewed AI/TTS/legacy set");
  const profile = source("src/app/api/account/profile/route.ts");
  for (const needle of [
    '.not("audio_storage_path", "like", "human/%")',
    '.not("audio_storage_path", "like", "%/human/%")',
  ]) {
    assert.equal(profile.includes(needle), true, `profile rename must skip Human rows: ${needle}`);
  }

  // The migration is standalone (no B2) and closes EXECUTE for end users.
  const migration = source("supabase/migrations/20261114120000_issue137_h1_human_atomic.sql");
  for (const needle of [
    "create schema if not exists libread_internal;",
    "create trigger issue137_h1_human_atomic_guard",
    "before insert or update or delete on public.recordings",
    "H1_ATOMIC_RPC_REQUIRED",
    "H1_STALE_REVISION",
    "from public, anon, authenticated;",
  ]) {
    assert.equal(migration.includes(needle), true, `H1 migration must contain: ${needle}`);
  }
  const migrationSql = migration.replace(/--[^\n]*/gu, "");
  assert.equal(/\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated|public)\b/iu.test(migrationSql), false,
    "H1 migration must not grant anything to anon/authenticated");

  // F2-P pure writer guard (ported with H1): default unchanged, fail closed otherwise.
  assert.deepEqual(checkNonproductionMediaWriterBoundary({
    kind: "human-recording", isPublicCandidate: true, env: {},
  }), { status: "LEGACY_UNCHANGED_NOT_APPROVED" });
  assert.throws(() => checkNonproductionMediaWriterBoundary({
    kind: "human-recording", isPublicCandidate: false,
    env: { LIBREAD_F2P_MEDIA_WRITER_MODE: "preview-hold", VERCEL_ENV: "production" },
  }), /F2P_PREVIEW_GUARD_WRONG_ENVIRONMENT/u);
  assert.throws(() => checkNonproductionMediaWriterBoundary({
    kind: "human-recording", isPublicCandidate: true,
    env: { LIBREAD_F2P_MEDIA_WRITER_MODE: "preview-hold", VERCEL_ENV: "preview" },
  }), /F2P_PREVIEW_PUBLIC_MEDIA_HOLD/u);
  assert.throws(() => checkNonproductionMediaWriterBoundary({
    kind: "human-recording", isPublicCandidate: false, env: { LIBREAD_F2P_MEDIA_WRITER_MODE: "on" },
  }), /F2P_MEDIA_WRITER_MODE_UNVERIFIED/u);
}

void checkHumanPrivateBucketBoundary().then(checkHumanAtomicCommitBoundary).then(() => {
  console.log(
    "PASS: Human identity, access, exact PRIVATE bucket, signed uploads, storage, search, Official, TTS, and H1 atomic-commit boundaries"
  );
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
