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
import {
  buildHumanStagingPartPaths,
  closeHumanStagingLease,
  openHumanStagingLease,
  retireMaturedHumanStagingLeases,
} from "../src/lib/recording/humanStagingLease";
import { buildHumanMultipartUploadSession } from "../src/lib/recording/humanMultipartUploadShared";
import {
  cleanupReleasedHumanMedia,
  resolveHumanTakeArtifacts,
  retryPendingHumanMediaCleanup,
} from "../src/lib/recording/humanMediaCleanup";
import {
  H1_NON_HUMAN_PATH_LIKE_PATTERNS,
  H1_NON_HUMAN_PATH_POSTGREST_OR,
  isH1GuardedHumanRow,
} from "../src/lib/recording/humanRecordingState";

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
    ".or(H1_NON_HUMAN_PATH_POSTGREST_OR)",
    '.is("voice_model_id", null)',
    'args.admin.rpc("issue137_h1_human_rename"',
    "p_owner_id: args.userId",
    "await renameHumanRecordings(args)",
    "throwUnlessMissingColumn(error, `users",
    "throwUnlessMissingColumn(error, `recordings",
    "await syncDisplayNameEverywhere(",
  ]) {
    assert.equal(profile.includes(needle), true, `profile rename must use H1 and check errors: ${needle}`);
  }
  // A bare `await …update(…)` statement (result discarded) is forbidden.
  assert.equal(/^\s*(for \([^)]*\)\s*)?await args\.admin\.from\("(users|recordings)"\)\.update\(/mu.test(
    profile.slice(profile.indexOf("async function syncDisplayNameEverywhere("))), false,
  "display-name sync must not discard update errors");

  // The app-side guard predicate mirrors the trigger, and the PostgREST
  // filter keeps exactly the non-guarded paths (NULL path included).
  const likeToRegExp = (pattern: string) => new RegExp(
    `^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join(".*")}$`, "u");
  const keptByFilter = (path: string | null) => path === null ||
    H1_NON_HUMAN_PATH_LIKE_PATTERNS.every((pattern) => !likeToRegExp(pattern).test(path));
  for (const [path, guarded] of [
    ["human/s/e/u/1-x/playback-from-wav.m4a", true],
    ["human", true],
    ["a/human", true],
    ["https://x.supabase.co/storage/v1/object/public/recording-audio/human/a/b.m4a", true],
    ["nemo/s/e/a.m4a", false],
    ["aivis/s/e/a.m4a", false],
    ["humane/s/e/a.m4a", false],
    ["a/humans/b.m4a", false],
    ["a/xhuman/b.m4a", false],
    [null, false],
  ] as const) {
    assert.equal(isH1GuardedHumanRow({ voice_model_id: null, audio_storage_path: path }), guarded,
      `guard predicate for ${path}`);
    assert.equal(keptByFilter(path), !guarded, `profile filter for ${path}`);
    assert.equal(isH1GuardedHumanRow({ voice_model_id: "vm", audio_storage_path: path }), false,
      `voice-model rows are never guarded: ${path}`);
  }
  assert.equal(H1_NON_HUMAN_PATH_POSTGREST_OR,
    "audio_storage_path.is.null,and(audio_storage_path.not.like.human,audio_storage_path.not.like.human/*," +
    "audio_storage_path.not.like.*/human/*,audio_storage_path.not.like.*/human)");

  // AI/TTS writers never select a guarded Human row as update/delete target.
  for (const file of ["src/lib/recording/nemoGeneration.ts", "src/lib/recording/aivisGeneration.ts"]) {
    const text = source(file);
    assert.equal(text.includes(".filter((row) => !isH1GuardedHumanRow(row))"), true,
      `${file} must exclude Human rows from existing-row candidates`);
    assert.ok(text.indexOf("!isH1GuardedHumanRow(row)") < text.indexOf("async function writeRecording("),
      `${file} excludes Human rows in the lookup used by writeRecording`);
  }
  // The stale Aivis cleanup deletes only rows bound to a known voice model.
  const aivisAuto = source("src/lib/recording/aivisAutoGeneration.ts");
  const aivisDeleteAt = aivisAuto.search(/\.from\("recordings"\)\s*\.delete\(\)/u);
  assert.ok(aivisDeleteAt > 0 && aivisAuto.indexOf("if (!voiceModel) {") >= 0 &&
    aivisAuto.indexOf("if (!voiceModel) {") < aivisDeleteAt,
    "stale Aivis delete requires a voice model (never a Human row)");

  // The migration is standalone (no B2) and closes EXECUTE for end users.
  const migration = source("supabase/migrations/20261114120000_issue137_h1_human_atomic.sql");
  for (const needle of [
    "create schema if not exists libread_internal;",
    "create trigger issue137_h1_human_atomic_guard",
    "create or replace function public.issue137_h1_human_rename(",
    "revoke all on function public.issue137_h1_human_rename(uuid,text)",
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

// #137 H2: multipart temporary staging is bound to a server-side lease.
async function checkHumanStagingLeaseBoundary() {
  type RpcResult = { data: unknown; error: { message: string } | null };
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const removed: string[][] = [];
  const fake = (results: Record<string, RpcResult>, removeError: unknown = null) => ({
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return results[fn] ?? { data: null, error: { message: "Could not find the function" } };
    },
    storage: {
      from(bucket: string) {
        assert.equal(bucket, DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET);
        return {
          async remove(paths: string[]) {
            removed.push(paths);
            return { data: [], error: removeError };
          },
        };
      },
    },
  }) as never;
  const scope = {
    sessionId: "60000000-0000-0000-0000-000000000001",
    seriesId: "10000000-0000-0000-0000-000000000001",
    episodeId: "20000000-0000-0000-0000-000000000001",
    actorId: "00000000-0000-0000-0000-00000000000a",
    sourceExtension: "webm",
    totalSizeBytes: 9437184,
  };

  // Missing RPC / any error / non-true result: fail closed, no fallback.
  await assert.rejects(() => openHumanStagingLease(fake({}), scope, 2),
    /^Error: human_staging_open_unavailable$/u, "missing open RPC fails closed");
  for (const result of [
    { data: null, error: { message: "H2_STAGE_SESSION_REUSED" } },
    { data: false, error: null },
    { data: "true", error: null },
  ]) {
    await assert.rejects(() => openHumanStagingLease(fake({ issue137_h2_stage_open: result }), scope, 2),
      /human_staging_open_unavailable/u);
  }
  for (const message of [
    "H2_STAGE_NOT_FOUND_OR_NOT_OWNER", "H2_STAGE_ALREADY_CLOSED", "H2_STAGE_EXPIRED", "H2_STAGE_REVOKED",
  ]) {
    await assert.rejects(() => closeHumanStagingLease(fake({
      issue137_h2_stage_close: { data: null, error: { message } },
    }), scope, "seal"), /^Error: human_staging_seal_unavailable$/u,
    `seal must fail closed on ${message} without echoing SQL detail`);
  }
  await assert.rejects(() => closeHumanStagingLease(fake({}), scope, "abort"),
    /human_staging_abort_unavailable/u);
  calls.length = 0;
  await openHumanStagingLease(fake({ issue137_h2_stage_open: { data: true, error: null } }), scope, 2);
  await closeHumanStagingLease(fake({ issue137_h2_stage_close: { data: true, error: null } }), scope, "seal");
  assert.deepEqual(calls.map((c) => c.args), [
    { p_session: scope.sessionId, p_series: scope.seriesId, p_episode: scope.episodeId,
      p_actor: scope.actorId, p_extension: "webm", p_total_bytes: 9437184, p_part_count: 2 },
    { p_session: scope.sessionId, p_series: scope.seriesId, p_episode: scope.episodeId,
      p_actor: scope.actorId, p_extension: "webm", p_total_bytes: 9437184, p_mode: "seal" },
  ]);

  // Part paths match the multipart session exactly (what the trigger admits).
  const session = buildHumanMultipartUploadSession({
    seriesId: scope.seriesId, episodeId: scope.episodeId, userId: scope.actorId,
    sourceExtension: "webm", totalSizeBytes: scope.totalSizeBytes, uploadSessionId: scope.sessionId,
  });
  const paths = buildHumanStagingPartPaths({ ...scope, partCount: session.parts.length });
  assert.deepEqual(paths, session.parts.map((part) => part.objectPath));
  assert.match(paths[1], /^human-temp\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/part-0002\.webm$/u);

  // Retirement: claim -> exact remove -> finish; foreign rows and failures held.
  const candidate = (sessionId: string, actorId = scope.actorId) => ({
    session_id: sessionId, series_id: scope.seriesId, episode_id: scope.episodeId,
    actor_id: actorId, source_extension: "webm", part_count: 2,
  });
  removed.length = 0;
  calls.length = 0;
  const retired = await retireMaturedHumanStagingLeases(fake({
    issue137_h2_stage_retire_candidates: { data: [
      candidate(scope.sessionId),
      candidate("60000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-00000000000b"),
    ], error: null },
    issue137_h2_stage_claim_retirement: { data: true, error: null },
    issue137_h2_stage_finish_retirement: { data: true, error: null },
  }), { actorId: scope.actorId, bucketName: DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET });
  assert.deepEqual(retired, { retired: 1, held: 1 });
  assert.deepEqual(removed, [paths], "only the exact part paths of the actor's own lease");
  assert.deepEqual(calls[0].args, { p_actor: scope.actorId, p_limit: 5 });
  removed.length = 0;
  const failedRemove = await retireMaturedHumanStagingLeases(fake({
    issue137_h2_stage_retire_candidates: { data: [candidate(scope.sessionId)], error: null },
    issue137_h2_stage_claim_retirement: { data: true, error: null },
    issue137_h2_stage_finish_retirement: { data: true, error: null },
  }, { message: "remove failed" }), { actorId: scope.actorId, bucketName: DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET });
  assert.deepEqual(failedRemove, { retired: 0, held: 1 }, "no receipt after a failed remove");
  removed.length = 0;
  const refused = await retireMaturedHumanStagingLeases(fake({
    issue137_h2_stage_retire_candidates: { data: [candidate(scope.sessionId)], error: null },
    issue137_h2_stage_claim_retirement: { data: null, error: { message: "H2_STAGE_RECORDING_REFERENCE_HOLD" } },
  }), { actorId: scope.actorId, bucketName: DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET });
  assert.deepEqual(refused, { retired: 0, held: 1 });
  assert.deepEqual(removed, [], "nothing is removed when the claim is refused");
  await assert.rejects(() => retireMaturedHumanStagingLeases(fake({}),
    { actorId: scope.actorId, bucketName: DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET }),
  /human_staging_retire_unavailable/u);

  // Route ordering.
  const issued = source("src/app/api/recordings/human-upload-session/route.ts");
  const at = (needle: string) => {
    const index = issued.indexOf(needle);
    assert.ok(index >= 0, `upload-session must contain: ${needle}`);
    return index;
  };
  assert.ok(at("await assertApprovedPrivateHumanRecordingBucket(adminSupabase)") <
    at("await openHumanStagingLease(adminSupabase, lease"), "#181 bucket check before the lease");
  assert.ok(at("await openHumanStagingLease(adminSupabase, lease") < at(".createSignedUploadUrl("),
    "lease before any bearer token");
  assert.ok(at("consent?.consent_version !== RECORDING_GLOBAL_CONSENT_VERSION") <
    at("await openHumanStagingLease(adminSupabase, lease"), "consent checked before lease");
  assert.match(issued, /createSignedUploadUrl\(part\.objectPath, \{[\s\S]*?upsert: false/u);
  assert.doesNotMatch(issued, /upsert: true/u, "bearer must never overwrite a part");
  assert.ok(issued.includes('await closeHumanStagingLease(adminSupabase, lease, "abort")'),
    "partial token issuance aborts the lease");

  const finished = source("src/app/api/recordings/human-upload-finalize/route.ts");
  const seal = finished.indexOf('}, "seal");');
  assert.ok(seal > 0 && finished.indexOf("await closeHumanStagingLease(admin, {") < seal);
  assert.ok(finished.indexOf("await assertApprovedPrivateHumanRecordingBucket(admin)") <
    finished.indexOf("await closeHumanStagingLease(admin, {"), "bucket check before seal");
  assert.ok(seal < finished.indexOf(".download(part.objectPath)"), "seal before reading parts");
  assert.ok(seal < finished.indexOf("await publishHumanRecording("), "seal before publication");
  assert.ok(seal < finished.indexOf(".remove(tempObjectPaths)"), "parts removed only after the seal");
  assert.ok(finished.includes("!isUuid(uploadSessionId)"), "session id must be a UUID");

  const aborted = source("src/app/api/recordings/human-upload-abort/route.ts");
  assert.ok(aborted.indexOf("await supabase.auth.getUser()") < aborted.indexOf("closeHumanStagingLease(admin"),
    "abort authenticates first");
  assert.ok(aborted.includes("actorId: user.id"), "abort is scoped to the signed-in actor");
  assert.ok(aborted.indexOf('}, "abort");') < aborted.indexOf(".remove(paths)"),
    "abort removes parts only after the lease is closed");

  const studio = source("src/components/recording/RecordingStudioPage.tsx");
  assert.ok(studio.includes("await abortHumanMultipartLease(unfinishedMultipart)"),
    "studio aborts the lease after a failed multipart save");
  assert.ok(studio.includes("uploadSessionId: args.sessionId"));

  const migration = source("supabase/migrations/20261114130000_issue137_h2_human_staging_lease.sql");
  const migrationSql = migration.replace(/--[^\n]*/gu, "");
  assert.equal(/\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated|public)\b/iu.test(migrationSql), false,
    "H2 migration grants nothing to anon/authenticated/public");
  assert.equal(/\bgrant\b[^;]*\bon\s+schema\b/iu.test(migrationSql), false,
    "H2 migration does not change schema grants (no B2 dependency)");
  for (const needle of [
    "H2_REQUIRES_H1_LIBREAD_INTERNAL",
    "create trigger issue137_h2_stage_storage_guard",
    "before insert or update of bucket_id, name, metadata on storage.objects",
    "H2_STAGE_SESSION_REUSED",
    "H2_STAGE_EXPIRED",
    "H2_STAGE_PHYSICAL_OR_REFERENCE_REMAINS",
  ]) {
    assert.ok(migration.includes(needle), `H2 migration must contain: ${needle}`);
  }
}

// #137 S2-1: released Human media is removed only after the H1 commit,
// only within the owner's prefix, and failures are recorded, not surfaced.
async function checkHumanMediaCleanupBoundary() {
  const S = "10000000-0000-0000-0000-000000000001";
  const S2 = "10000000-0000-0000-0000-000000000002";
  const E = "20000000-0000-0000-0000-000000000001";
  const E2 = "20000000-0000-0000-0000-000000000002";
  const A = "00000000-0000-0000-0000-00000000000a";
  const B = "00000000-0000-0000-0000-00000000000b";
  const scope = { seriesId: S, episodeId: E, ownerId: A };
  const take = (owner = A, series = S, episode = E, dir = "1731500000000-abc") =>
    `human/${series}/${episode}/${owner}/${dir}/playback-from-webm.m4a`;

  // Path validation.
  assert.deepEqual(resolveHumanTakeArtifacts(take(), scope), {
    takeDirectory: `human/${S}/${E}/${A}/1731500000000-abc/`,
    paths: [
      take(),
      `human/${S}/${E}/${A}/1731500000000-abc/original.webm`,
      `${take()}.timing.json`,
    ],
  });
  assert.ok(resolveHumanTakeArtifacts(take(), { seriesId: S.toUpperCase(), episodeId: E, ownerId: A }),
    "scope IDs are compared case-insensitively");
  for (const [value, label] of [
    [take(B), "another owner"],
    [take(A, S2), "another series"],
    [take(A, S, E2), "another episode"],
    [`https://x.supabase.co/storage/v1/object/public/recording-audio/${take()}`, "URL form"],
    [`human/${S}/${E}/${A}/../${B}/x/playback-from-webm.m4a`, "traversal"],
    [`human/${S}/${E}/${A}/x/y/playback-from-webm.m4a`, "nested"],
    [`human/${S}/${E}/${A}/x/playback.webm`, "legacy shape"],
    [`human/${S}/${E}/${A}/x/original.webm`, "not a playback path"],
    [`human-temp/${S}/${E}/${A}/x/part-0001.webm`, "staging namespace"],
    ["", "empty"],
    [null, "null"],
  ] as const) {
    assert.equal(resolveHumanTakeArtifacts(value, scope), null, `must not resolve ${label}`);
  }
  assert.equal(resolveHumanTakeArtifacts(take(), { ...scope, ownerId: "not-a-uuid" }), null);

  type Events = string[];
  const makeAdmin = (opts: {
    events: Events;
    referenced?: (pattern: string) => boolean;
    referenceError?: boolean;
    referenceThrows?: boolean;
    removeError?: boolean;
    bucketPublic?: boolean;
    recordError?: boolean;
    pending?: unknown[];
    removed?: string[][];
    rpcArgs?: Array<{ fn: string; args: Record<string, unknown> }>;
  }) => ({
    async rpc(fn: string, args: Record<string, unknown>) {
      opts.events.push(`rpc:${fn}`);
      opts.rpcArgs?.push({ fn, args });
      if (fn === "issue137_human_media_cleanup_record") {
        return { data: opts.recordError ? null : "id", error: opts.recordError ? { message: "x" } : null };
      }
      if (fn === "issue137_human_media_cleanup_pending") return { data: opts.pending ?? [], error: null };
      if (fn === "issue137_human_media_cleanup_resolve") return { data: args.p_succeeded === true, error: null };
      return { data: null, error: { message: "unexpected" } };
    },
    from(table: string) {
      assert.equal(table, "recordings");
      return {
        select() {
          return {
            like(column: string, pattern: string) {
              assert.equal(column, "audio_storage_path");
              return {
                async limit() {
                  opts.events.push(`ref:${pattern}`);
                  if (opts.referenceThrows) throw new Error("network");
                  if (opts.referenceError) return { data: null, error: { message: "x" } };
                  return { data: opts.referenced?.(pattern) ? [{ id: "r" }] : [], error: null };
                },
              };
            },
          };
        },
      };
    },
    storage: {
      async getBucket(id: string) {
        opts.events.push("bucket");
        return { data: { id, name: id, public: opts.bucketPublic === true }, error: null };
      },
      from(bucket: string) {
        assert.equal(bucket, DEFAULT_HUMAN_RECORDING_AUDIO_BUCKET);
        return {
          async remove(paths: string[]) {
            opts.events.push("remove");
            opts.removed?.push(paths);
            return { data: [], error: opts.removeError ? { message: "x" } : null };
          },
        };
      },
    },
  }) as never;

  const warnings: unknown[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    // Success: reference check, then exact remove, no record.
    let events: Events = [];
    let removed: string[][] = [];
    const ok = await cleanupReleasedHumanMedia(makeAdmin({ events, removed }), {
      scope, releasedPaths: [take(), take(B), null], reason: "delete",
    });
    assert.deepEqual(ok, { released: 2, rejected: 1, stillReferenced: 0, referenceUnknown: 0, removedTakes: 1, failedTakes: 0, recorded: false });
    assert.deepEqual(removed, [resolveHumanTakeArtifacts(take(), scope)?.paths],
      "only the owner's exact take artifacts are removed (never another owner's)");
    assert.deepEqual(events, ["bucket", `ref:%human/${S}/${E}/${A}/1731500000000-abc/%`, "remove"],
      "PRIVATE bucket verified, then reference check, then remove");

    // Still referenced by any row: no remove, nothing recorded.
    events = []; removed = [];
    const held = await cleanupReleasedHumanMedia(makeAdmin({ events, removed, referenced: () => true }), {
      scope, releasedPaths: [take()], reason: "replace",
    });
    assert.equal(held.stillReferenced, 1);
    assert.equal(held.recorded, false);
    assert.deepEqual(removed, [], "a referenced take is never removed");
    assert.equal(events.some((e) => e.startsWith("rpc:issue137_human_media_cleanup_record")), false);

    // Reference check errors or THROWS: not removed now. It is recorded, but
    // every retry re-checks references before any removal (see below).
    for (const opts of [{ referenceError: true }, { referenceThrows: true }]) {
      events = []; removed = [];
      const unknown = await cleanupReleasedHumanMedia(makeAdmin({ events, removed, ...opts }), {
        scope, releasedPaths: [take()], reason: "delete",
      });
      assert.equal(unknown.referenceUnknown, 1);
      assert.equal(unknown.failedTakes, 0);
      assert.equal(unknown.stillReferenced, 0);
      assert.deepEqual(removed, [], "absence of references not established -> never removed");
    }

    // Storage failure: recorded for retry, outcome reported, never throws.
    events = [];
    const rpcArgs: Array<{ fn: string; args: Record<string, unknown> }> = [];
    warnings.length = 0;
    const failed = await cleanupReleasedHumanMedia(makeAdmin({ events, removeError: true, rpcArgs }), {
      scope, releasedPaths: [take()], reason: "replace",
    });
    assert.deepEqual(failed, { released: 1, rejected: 0, stillReferenced: 0, referenceUnknown: 0, removedTakes: 0, failedTakes: 1, recorded: true });
    assert.deepEqual(rpcArgs, [{ fn: "issue137_human_media_cleanup_record", args: {
      p_owner_id: A, p_series_id: S, p_episode_id: E,
      p_object_paths: resolveHumanTakeArtifacts(take(), scope)?.paths, p_reason: "replace",
    } }]);
    assert.ok(events.indexOf("remove") < events.indexOf("rpc:issue137_human_media_cleanup_record"));
    const logged = JSON.stringify(warnings);
    assert.ok(logged.includes("failedTakes") && !logged.includes("human/") && !logged.includes(A),
      "failure log carries categories/counts only, never paths or IDs");

    // Unverified bucket (PUBLIC): nothing removed, recorded.
    removed = [];
    const publicBucket = await cleanupReleasedHumanMedia(makeAdmin({ events: [], removed, bucketPublic: true }), {
      scope, releasedPaths: [take()], reason: "delete",
    });
    assert.deepEqual(removed, []);
    assert.equal(publicBucket.failedTakes, 1);
    // Record RPC missing too: still no throw.
    const unrecorded = await cleanupReleasedHumanMedia(makeAdmin({ events: [], removeError: true, recordError: true }), {
      scope, releasedPaths: [take()], reason: "delete",
    });
    assert.equal(unrecorded.recorded, false);

    // Retry: own pending row is reference-checked, removed and resolved;
    // a foreign path is not removed.
    removed = [];
    events = [];
    const retried = await retryPendingHumanMediaCleanup(makeAdmin({ events, removed, pending: [
      { id: "p1", series_id: S, episode_id: E, owner_id: A, object_paths: [take()] },
      { id: "p2", series_id: S, episode_id: E, owner_id: A, object_paths: [take(B)] },
    ] }), { ownerId: A });
    assert.deepEqual(retried, { resolved: 1, held: 1 });
    assert.deepEqual(removed, [[take()]]);
    assert.ok(events.indexOf(`ref:%human/${S}/${E}/${A}/1731500000000-abc/%`) >= 0 &&
      events.indexOf(`ref:%human/${S}/${E}/${A}/1731500000000-abc/%`) < events.indexOf("remove"),
      "retry checks references BEFORE removing");

    // Retry with a still-referenced take, a reference error, or a THROWING
    // check: nothing removed, the attempt is reported as not succeeded.
    const pendingRow = [{ id: "p1", series_id: S, episode_id: E, owner_id: A,
      object_paths: resolveHumanTakeArtifacts(take(), scope)?.paths }];
    for (const opts of [{ referenced: () => true }, { referenceError: true }, { referenceThrows: true }]) {
      removed = [];
      const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
      const blocked = await retryPendingHumanMediaCleanup(makeAdmin({
        events: [], removed, rpcArgs: rpcCalls, pending: pendingRow, ...opts,
      }), { ownerId: A });
      assert.deepEqual(blocked, { resolved: 0, held: 1 });
      assert.deepEqual(removed, [], "retry never removes without a confirmed-clear reference check");
      assert.deepEqual(rpcCalls.find((c) => c.fn === "issue137_human_media_cleanup_resolve")?.args,
        { p_id: "p1", p_succeeded: false }, "the attempt is counted as not succeeded");
    }
    // Retry with an unverified bucket: nothing removed.
    removed = [];
    const noBucket = await retryPendingHumanMediaCleanup(makeAdmin({
      events: [], removed, pending: pendingRow, bucketPublic: true,
    }), { ownerId: A });
    assert.deepEqual(noBucket, { resolved: 0, held: 1 });
    assert.deepEqual(removed, []);
  } finally {
    console.warn = originalWarn;
  }

  // Ordering in the callers: cleanup strictly after a successful H1 commit.
  const del = source("src/app/api/recordings/human-delete/route.ts");
  const delCommit = del.indexOf("await commitHumanAtomicMutation(");
  const delCleanup = del.indexOf("await cleanupReleasedHumanMedia(");
  assert.ok(delCommit > 0 && delCleanup > delCommit, "delete: cleanup only after the commit");
  assert.ok(delCleanup < del.indexOf("} catch (error) {", delCleanup), "delete: cleanup is not in the error path");
  assert.equal(/\.storage\.from\([^)]*\)\.remove\(/u.test(del), false, "delete: no direct Storage removal");
  const pub = source("src/lib/recording/humanRecordingPublish.ts");
  const pubWrite = pub.indexOf("await writeRecording(adminSupabase, {");
  const pubCleanup = pub.indexOf("await cleanupReleasedHumanMedia(");
  assert.ok(pubWrite > 0 && pubCleanup > pubWrite, "publish: cleanup only after the commit");
  assert.ok(pub.includes('reason: "replace"') && pub.includes("releasedAudioStoragePath: primary ? primary.audioStoragePath : null"),
    "publish: only the replaced row's prior path is released");
  assert.equal(/\.remove\(/u.test(pub), false, "publish: no direct Storage removal");

  const migration = source("supabase/migrations/20261114140000_issue137_human_media_cleanup_pending.sql");
  const migrationSql = migration.replace(/--[^\n]*/gu, "");
  assert.equal(/\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated|public)\b/iu.test(migrationSql), false,
    "S2-1 migration grants nothing to anon/authenticated/public");
  assert.ok(migration.includes("S21_PATH_OUTSIDE_OWNER_PREFIX"));
  assert.ok(migration.includes("(p.owner_id = p_owner_id and p.attempts < 5)"),
    "owner retry list stops at the attempt cap; the operator list keeps everything");
}

void checkHumanPrivateBucketBoundary()
  .then(checkHumanAtomicCommitBoundary)
  .then(checkHumanStagingLeaseBoundary)
  .then(checkHumanMediaCleanupBoundary)
  .then(() => {
  console.log(
    "PASS: Human identity, access, exact PRIVATE bucket, signed uploads, storage, search, Official, TTS, H1 atomic-commit, H2 staging-lease, and S2-1 media-cleanup boundaries"
  );
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
