import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// Supabase admin (DB + Storage), the media writer boundary, audio normalization, transcription,
// alignment, the H1 atomic RPCs, media cleanup and the bucket check are replaced in-process.
// No DB, Storage, ffmpeg, transcription service or network access. Synthetic ids only.

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null };
const ok = (data: unknown): Result => ({ data, error: null });
const state = {
  series: ok({ id: "s-1", recording_permission_mode: "open" }) as Result,
  episodeById: ok({ id: "ep-1", series_id: "s-1" }) as Result,
  episodeByNumber: ok(null) as Result,
  episodeBody: ok({ id: "ep-1", body: "吾輩は猫である。" }) as Result,
  recordings: ok([]) as Result,
  userExists: ok({ id: "user-1" }) as Result,
  userUpsertErrors: [] as Array<string | null>,
  uploadErrors: {} as Record<string, string>,
  commitId: null as string | null,
  boundaryThrows: false,
  normalizeThrows: null as unknown,
  log: [] as unknown[][],
  uploads: [] as unknown[][],
  upserts: [] as Row[],
  commits: [] as Row[],
  revisions: [] as Row[],
  cleanups: [] as unknown[],
  retries: [] as unknown[],
  boundary: [] as unknown[],
};

function query(table: string) {
  const calls: unknown[] = [table];
  state.log.push(calls);
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order"]) {
    builder[method] = (...args: unknown[]) => (calls.push([method, ...args]), builder);
  }
  const eqs = () => calls.filter((c) => Array.isArray(c) && c[0] === "eq").map((c) => (c as unknown[])[1]);
  builder.maybeSingle = async () => {
    if (table === "series") return state.series;
    if (table === "users") return state.userExists;
    const select = (calls[1] as unknown[])[1];
    if (select === "*") return state.episodeBody;
    return eqs().includes("episode_number") ? state.episodeByNumber : state.episodeById;
  };
  builder.upsert = async (payload: Row, options: unknown) => {
    state.upserts.push({ payload, options });
    const error = state.userUpsertErrors.shift() ?? null;
    return { error: error ? { message: error } : null };
  };
  builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve(state.recordings).then(resolve, reject);
  return builder;
}

const admin = {
  from: query,
  storage: {
    from: (bucket: string) => ({
      upload: async (path: string, bytes: Uint8Array, options: unknown) => {
        state.uploads.push([bucket, path, bytes, options]);
        const kind = path.endsWith(".timing.json") ? "timing" : path.includes("/original.") ? "original" : "playback";
        const message = state.uploadErrors[kind];
        return { error: message ? { message } : null };
      },
    }),
  },
};

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
const is = (request: string, name: string) => request === `@/lib/${name}` || request.endsWith(`/lib/${name}`);
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "next/headers") return { headers: async () => new Headers() };
  if (request === "next/navigation") return { redirect: () => { throw new Error("redirect"); }, notFound: () => { throw new Error("notFound"); } };
  if (is(request, "supabase/server")) return { createClient: async () => ({}) };
  if (is(request, "supabase/admin")) return { createAdminClient: () => admin };
  if (is(request, "recording/publicMediaWriterBoundary")) {
    return {
      checkNonproductionMediaWriterBoundary: (args: unknown) => {
        state.boundary.push(args);
        if (state.boundaryThrows) throw new Error("writer_boundary_hold");
        return { allowed: true };
      },
    };
  }
  if (is(request, "recording/audioPlaybackNormalization")) {
    return {
      PLAYBACK_AUDIO_EXTENSION: "m4a",
      PLAYBACK_AUDIO_CONTENT_TYPE: "audio/mp4",
      normalizeAudioForPlayback: async (args: Row) => {
        if (state.normalizeThrows !== null) throw state.normalizeThrows;
        return { bytes: new Uint8Array([7, 7]), extension: "m4a", contentType: "audio/mp4", args };
      },
    };
  }
  if (is(request, "recording/humanRecordingTranscription")) {
    return { transcribeHumanPlaybackAudio: async (args: Row) => ({ transcript: "t", args }) };
  }
  if (is(request, "recording/humanRecordingAlignment")) {
    return { alignHumanRecordingToBodyOrThrow: (args: Row) => ({ manifest: { aligned: true, body: args.body } }) };
  }
  if (is(request, "recording/humanRecordingAtomic")) {
    return {
      readHumanAtomicRevision: async (_admin: unknown, scope: Row) => (state.revisions.push(scope), "rev-1"),
      commitHumanAtomicMutation: async (_admin: unknown, args: Row) => {
        state.commits.push(args);
        return { recordingId: state.commitId ?? args.recordingId };
      },
    };
  }
  if (is(request, "recording/humanMediaCleanup")) {
    return {
      cleanupReleasedHumanMedia: async (_admin: unknown, args: unknown) => void state.cleanups.push(args),
      retryPendingHumanMediaCleanup: async (_admin: unknown, args: unknown) => void state.retries.push(args),
    };
  }
  if (is(request, "recording/humanRecordingStorage")) {
    return {
      assertApprovedPrivateHumanRecordingBucket: async () => "private-human",
      buildHumanRecordingPlaybackHref: (id: string) => `/api/recordings/human-audio?recordingId=${id}`,
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function reset() {
  state.series = ok({ id: "s-1", recording_permission_mode: "open" });
  state.episodeById = ok({ id: "ep-1", series_id: "s-1" });
  state.episodeByNumber = ok(null);
  state.episodeBody = ok({ id: "ep-1", body: "吾輩は猫である。" });
  state.recordings = ok([]);
  state.userExists = ok({ id: "user-1" });
  state.userUpsertErrors = [];
  state.uploadErrors = {};
  state.commitId = null;
  state.boundaryThrows = false;
  state.normalizeThrows = null;
  for (const key of ["log", "uploads", "upserts", "commits", "revisions", "cleanups", "retries", "boundary"] as const) state[key] = [];
}

const OLD_PATH = "human/s-1/ep-1/user-1/1700000000000-abc/playback-from-wav.m4a";
const humanRow = (overrides: Row = {}) => ({
  id: "r-old",
  series_id: "s-1",
  episode_id: "ep-1",
  reader_id: "user-1",
  reader_name: "旧名",
  audio_storage_path: OLD_PATH,
  voice_model_id: null,
  is_public: true,
  ...overrides,
});

async function main() {
  try {
    const { publishHumanRecording: publish } = await import("../src/lib/recording/humanRecordingPublish");
    const file = (bytes: number[], name = "take.wav", type = "audio/wav") => new File([new Uint8Array(bytes)], name, { type });
    const input = (overrides: Record<string, unknown> = {}) => ({
      userId: "user-1",
      seriesId: "s-1",
      episodeId: "ep-1",
      readerName: "読み手",
      sourceFile: file([1, 2, 3]),
      ...overrides,
    });

    // New public take: three uploads, insert through the H1 RPC.
    reset();
    const result = await publish(input());
    const [original, playback, timing] = state.uploads as Array<[string, string, Uint8Array, Row]>;
    assert.match(original[1], /^human\/s-1\/ep-1\/user-1\/\d+-[0-9a-f-]{36}\/original\.wav$/);
    const base = original[1].slice(0, -"original.wav".length);
    assert.deepEqual(original.slice(0, 1).concat([original[3]]), ["private-human", { contentType: "audio/wav", upsert: false }]);
    assert.deepEqual([...original[2]], [1, 2, 3]);
    assert.deepEqual([playback[0], playback[1], [...playback[2]], playback[3]], ["private-human", `${base}playback-from-wav.m4a`, [7, 7], { contentType: "audio/mp4", upsert: false }]);
    assert.equal(timing[1], `${base}playback-from-wav.m4a.timing.json`);
    assert.deepEqual(timing[3], { contentType: "application/json", upsert: false });
    assert.deepEqual(JSON.parse(new TextDecoder().decode(timing[2])), { aligned: true, body: "吾輩は猫である。" });
    assert.equal(state.commits.length, 1);
    const commit = state.commits[0];
    assert.match(String(commit.recordingId), /^[0-9a-f-]{36}$/);
    assert.deepEqual(commit, {
      seriesId: "s-1",
      episodeId: "ep-1",
      ownerId: "user-1",
      expectedRevision: "rev-1",
      action: "insert",
      recordingId: commit.recordingId,
      readerName: "読み手",
      audioStoragePath: `${base}playback-from-wav.m4a`,
      isPublic: true,
      priorAudioStoragePath: null,
      priorIsPublic: null,
    });
    assert.deepEqual(state.revisions, [{ seriesId: "s-1", episodeId: "ep-1", ownerId: "user-1" }]);
    assert.deepEqual(state.boundary, [{ kind: "human-recording", isPublicCandidate: true, env: { LIBREAD_F2P_MEDIA_WRITER_MODE: process.env.LIBREAD_F2P_MEDIA_WRITER_MODE, VERCEL_ENV: process.env.VERCEL_ENV } }]);
    assert.deepEqual(state.cleanups, []);
    assert.deepEqual(state.retries, [{ ownerId: "user-1" }]);
    assert.deepEqual(state.upserts, []);
    assert.deepEqual(result, {
      recordingId: commit.recordingId,
      audioStoragePath: `/api/recordings/human-audio?recordingId=${commit.recordingId}`,
      originalStorageObjectPath: original[1],
      playbackStorageObjectPath: `${base}playback-from-wav.m4a`,
      readerName: "読み手",
    });

    // Re-take by the same public narrator (renamed): replace the old row, then clean its media.
    reset();
    state.recordings = ok([humanRow(), { id: "ai", episode_id: "ep-1", voice_model_id: "v", audio_storage_path: "ai/x.wav", is_public: true }]);
    await publish(input());
    assert.equal(state.commits[0].action, "replace");
    assert.equal(state.commits[0].recordingId, "r-old");
    assert.equal(state.commits[0].priorAudioStoragePath, OLD_PATH);
    assert.equal(state.commits[0].priorIsPublic, true);
    assert.deepEqual(state.cleanups, [{ scope: { seriesId: "s-1", episodeId: "ep-1", ownerId: "user-1" }, releasedPaths: [OLD_PATH], reason: "replace" }]);
    // A row outside this owner's canonical path is not replaced (new insert, no cleanup).
    reset();
    state.recordings = ok([humanRow({ audio_storage_path: "human/legacy/take.mp3" })]);
    await publish(input());
    assert.equal(state.commits[0].action, "insert");
    assert.deepEqual(state.cleanups, []);

    // Public upload over a private / unknown / alias-conflicting own row: rejected before any media work.
    for (const row of [humanRow({ is_public: false }), humanRow({ is_public: null }), humanRow({ reader_user_id: "other" })]) {
      reset();
      state.recordings = ok([row]);
      await assert.rejects(publish(input()), /^Error: human_recording_republish_requires_explicit_consent$/);
      assert.deepEqual(state.boundary, []);
      assert.deepEqual(state.uploads, []);
    }
    // A private upload over the own private row replaces it.
    reset();
    state.recordings = ok([humanRow({ is_public: false })]);
    await publish(input({ isPublic: false }));
    assert.deepEqual([state.commits[0].action, state.commits[0].isPublic, state.commits[0].priorIsPublic], ["replace", false, false]);
    assert.equal((state.boundary[0] as Row).isPublicCandidate, false);

    // Series / episode checks.
    reset();
    state.series = ok(null);
    await assert.rejects(publish(input()), /^Error: series_not_found$/);
    reset();
    state.series = ok({ id: "s-1", recording_permission_mode: "closed" });
    await assert.rejects(publish(input()), /^Error: entry_denied:closed$/);
    reset();
    state.episodeById = ok({ id: "ep-1", series_id: "other" });
    await assert.rejects(publish(input()), /^Error: episode_not_found$/);
    reset();
    state.episodeById = ok({ id: "ep-1", series_id: "other" });
    state.episodeByNumber = ok({ id: "ep-9" });
    state.episodeBody = ok({ id: "ep-9", body: "本文" });
    await publish(input({ episodeNumber: 9 }));
    assert.equal(state.commits[0].episodeId, "ep-9");
    reset();
    await assert.rejects(publish(input({ episodeId: "", episodeNumber: 1.5 })), /^Error: episode_not_found$/);
    reset();
    state.episodeBody = ok({ id: "ep-1", body: "  " });
    await assert.rejects(publish(input()), /^Error: episode_body_empty$/);
    reset();
    state.episodeBody = ok(null);
    await assert.rejects(publish(input()), /^Error: episode_not_found$/);
    reset();
    state.recordings = { data: null, error: { message: "down" } };
    await assert.rejects(publish(input()), /^Error: recording_lookup_failed:down$/);

    // Writer boundary and empty files stop before uploads.
    reset();
    state.boundaryThrows = true;
    await assert.rejects(publish(input()), /writer_boundary_hold/);
    assert.deepEqual(state.uploads, []);
    reset();
    await assert.rejects(publish(input({ sourceFile: file([]) })), /^Error: empty_file$/);
    assert.deepEqual(state.uploads, []);

    // Extension / content type when the name has no audio extension.
    reset();
    await publish(input({ sourceFile: file([1], "blob", "audio/mpeg") }));
    assert.match((state.uploads[0] as string[])[1], /\/original\.mp3$/);
    reset();
    await publish(input({ sourceFile: file([1], "take.flac", "") }));
    assert.deepEqual((state.uploads[0] as Row[])[3], { contentType: "audio/flac", upsert: false });
    reset();
    await publish(input({ sourceFile: file([1], "blob", "") }));
    assert.deepEqual((state.uploads[0] as Row[])[3], { contentType: "application/octet-stream", upsert: false });
    assert.match((state.uploads[1] as string[])[1], /\/playback-from-bin\.m4a$/);

    // Upload failures (no cleanup of objects already uploaded).
    for (const [kind, pattern, count] of [
      ["original", /^Error: storage_upload_failed:o$/, 1],
      ["playback", /^Error: storage_upload_failed:p$/, 2],
      ["timing", /^Error: human_timing_upload_failed:t$/, 3],
    ] as const) {
      reset();
      state.uploadErrors = { [kind]: kind[0] };
      await assert.rejects(publish(input()), pattern);
      assert.equal(state.uploads.length, count);
      assert.deepEqual(state.commits, []);
      assert.deepEqual(state.cleanups, []);
    }
    // A non-Error failure becomes human_recording_publish_failed.
    reset();
    state.normalizeThrows = "ffmpeg missing";
    await assert.rejects(publish(input()), /^Error: human_recording_publish_failed$/);

    // Reader user row: created with the first payload shape that the DB accepts.
    reset();
    state.userExists = ok(null);
    state.userUpsertErrors = ["no display_name", "no name", null];
    await publish(input({ userId: "ab-cd-1234567890123" , readerName: " 読み手 " }));
    assert.deepEqual((state.upserts as Row[]).map((u) => u.payload), [
      { id: "ab-cd-1234567890123", display_name: "読み手", username: "reader-abcd12345678" },
      { id: "ab-cd-1234567890123", name: "読み手", username: "reader-abcd12345678" },
      { id: "ab-cd-1234567890123", pen_name: "読み手", username: "reader-abcd12345678" },
    ]);
    assert.deepEqual((state.upserts as Row[])[0].options, { onConflict: "id" });
    reset();
    state.userExists = ok(null);
    state.userUpsertErrors = Array(7).fill("nope");
    await assert.rejects(publish(input()), (error: unknown) => {
      const message = (error as Error).message;
      return message.startsWith("reader_user_upsert_failed:id, display_name, username => nope | ") && message.endsWith(" | id => nope");
    });
    assert.deepEqual(state.commits, []);
    reset();
    state.userExists = ok(null);
    await assert.rejects(publish(input({ readerName: "  " })), /^Error: reader_name_required$/);

    // RPC returned another id.
    reset();
    state.commitId = "unexpected";
    await assert.rejects(publish(input()), /^Error: human_atomic_recording_id_mismatch$/);
    assert.deepEqual(state.retries, []);

    console.log("humanRecordingPublish characterization: PASS");
  } finally {
    moduleWithLoad._load = originalLoad;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
