import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// The Supabase admin client is replaced in-process with a small fake; no DB access.
// The expected source hash is computed from the real buildNemoChunks output, so this test
// pins the hashing recipe, not the chunk text itself (see "不具合の疑い" for nemoChunking).

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null };
const ok = (data: unknown): Result => ({ data, error: null });
const db = {
  episodes: ok([]) as Result,
  episodeById: ok(null) as Result,
  recordings: ok([]) as Result,
  queue: ok([]) as Result,
  upsertError: null as { message: string } | null,
  claimResults: [] as Result[],
  updateError: null as { message: string } | null,
  log: [] as unknown[][],
  upserts: [] as unknown[],
};

const supabase = {
  from(table: string) {
    const calls: unknown[] = [table];
    db.log.push(calls);
    let mode = "select";
    const builder: Record<string, unknown> = {};
    for (const method of ["eq", "in", "order", "limit"]) {
      builder[method] = (...args: unknown[]) => (calls.push([method, ...args]), builder);
    }
    builder.select = (...args: unknown[]) => (calls.push(["select", ...args]), builder);
    builder.update = (values: unknown) => ((mode = "update"), calls.push(["update", values]), builder);
    builder.upsert = async (payloads: unknown, options: unknown) => {
      db.upserts.push([payloads, options]);
      return { error: db.upsertError };
    };
    builder.maybeSingle = async () => (mode === "update" ? db.claimResults.shift() ?? ok(null) : db.episodeById);
    builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
      const result =
        mode === "update" ? { error: db.updateError }
        : table === "episodes" ? db.episodes
        : table === "recordings" ? db.recordings
        : db.queue;
      return Promise.resolve(result).then(resolve, reject);
    };
    return builder;
  },
};

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "@/lib/supabase/admin" || request.endsWith("/lib/supabase/admin")) return { createAdminClient: () => supabase };
  return originalLoad.call(this, request, parent, isMain);
};

function reset() {
  db.episodes = ok([]);
  db.episodeById = ok(null);
  db.recordings = ok([]);
  db.queue = ok([]);
  db.upsertError = null;
  db.claimResults = [];
  db.updateError = null;
  db.log = [];
  db.upserts = [];
}

const BODY = "吾輩は猫である。名前はまだ無い。";
const episode = (id: string, n: number, extra: Row = {}) => ({ id, series_id: "s-1", episode_number: n, body: BODY, posting_status: "posted", is_published: true, ...extra });

async function main() {
  try {
    const q = await import("../src/lib/recording/nemoGenerationQueue");
    const { buildNemoChunks } = await import("../src/lib/recording/nemoChunking");
    const { resolveNemoPronunciationDictionary } = await import("../src/lib/recording/nemoPronunciationDictionary");
    type Sb = Parameters<typeof q.syncNemoGenerationQueueForEpisodes>[0]["supabase"];
    const sb = supabase as unknown as Sb;
    const hashOf = (episodeId: string, body = BODY) => {
      const chunks = buildNemoChunks(body.trim(), { pronunciationDictionary: resolveNemoPronunciationDictionary({ seriesId: "s-1", episodeId }) });
      return createHash("sha256").update(JSON.stringify(chunks.map((c) => ({ text: c.text, pauseAfterMs: c.pauseAfterMs })))).digest("hex");
    };
    const sync = (extra: Partial<Parameters<typeof q.syncNemoGenerationQueueForEpisodes>[0]> = {}) =>
      q.syncNemoGenerationQueueForEpisodes({ supabase: sb, seriesId: "s-1", episodeIds: ["ep-1"], nemoReaderUserId: "nemo", requestSource: " viewer ", ...extra });
    const empty = { touchedEpisodeIds: [], queuedEpisodeIds: [], completedEpisodeIds: [] };
    const payloads = () => (db.upserts[0] as [Row[], unknown])[0];

    // No targets / no visible episodes: nothing written.
    reset();
    assert.deepEqual(await sync({ episodeIds: [" ", ""] }), empty);
    assert.deepEqual(db.log, []);
    db.episodes = ok([episode("ep-1", 1, { posting_status: "draft", is_published: false }), episode("ep-2", 2)]);
    assert.deepEqual(await sync(), empty);
    assert.deepEqual(db.upserts, []);

    // Missing recording: queued with priority; payload shape.
    reset();
    db.episodes = ok([episode("ep-2", 2), episode("ep-1", 1), episode("ep-3", 3, { body: "   " })]);
    const queued = await sync({ episodeIds: ["ep-2", "ep-1", "ep-3", "ep-1"], viewerCountSnapshot: 3.7, priorityBoost: 7.9, requestedByUserId: "u-1" });
    assert.deepEqual(queued, { touchedEpisodeIds: ["ep-1", "ep-2", "ep-3"], queuedEpisodeIds: ["ep-1", "ep-2"], completedEpisodeIds: [] });
    assert.deepEqual((db.upserts[0] as unknown[])[1], { onConflict: "episode_id" });
    const first = payloads()[0];
    assert.equal(first.created_at, first.updated_at);
    assert.equal(first.first_requested_at, first.last_requested_at);
    const { created_at: _c, updated_at: _u, first_requested_at: _f, last_requested_at: _l, ...rest } = first;
    assert.deepEqual(rest, {
      id: undefined,
      series_id: "s-1",
      episode_id: "ep-1",
      generation_status: "pending",
      generation_reason: "missing_recording",
      is_stale: false,
      source_text_hash: hashOf("ep-1"),
      // boost 7 + missing 300 + viewers (1000 + 3.7*20) + 1 request * 5
      priority_score: 7 + 300 + 1000 + 3.7 * 20 + 5,
      viewer_count_snapshot: 3,
      request_count: 1,
      last_request_source: "viewer",
      last_requested_by_user_id: "u-1",
      last_attempted_at: undefined,
      last_generated_at: null,
      last_error: undefined,
      attempt_count: 0,
      locked_at: null,
      locked_by: null,
    });
    assert.equal(payloads().length, 2);
    assert.deepEqual(((db.log as unknown[][]).find((c) => c[0] === "recordings") as unknown[]).slice(1), [["select", "*"], ["in", "episode_id", ["ep-1", "ep-2", "ep-3"]]]);

    // Existing public Nemo recording and same hash: completed (backfill), keeps generated time.
    reset();
    db.episodes = ok([episode("ep-1", 1)]);
    db.recordings = ok([
      { id: "r1", episode_id: "ep-1", reader_id: "nemo", created_at: "2026-01-01T00:00:00Z" },
      { id: "r2", episode_id: "ep-1", reader_id: "nemo", created_at: "2026-02-01T00:00:00Z", is_public: null },
      { id: "r3", episode_id: "ep-1", reader_id: "nemo", created_at: "2026-03-01T00:00:00Z", is_public: false },
      { id: "r4", episode_id: "ep-1", reader_id: "human", created_at: "2026-04-01T00:00:00Z" },
    ]);
    assert.deepEqual(await sync({ requestSource: "  " }), { touchedEpisodeIds: ["ep-1"], queuedEpisodeIds: [], completedEpisodeIds: ["ep-1"] });
    assert.deepEqual(
      [payloads()[0].generation_status, payloads()[0].generation_reason, payloads()[0].last_generated_at, payloads()[0].last_request_source, payloads()[0].last_error, payloads()[0].priority_score],
      ["completed", "backfill", "2026-02-01T00:00:00Z", "system", null, 5]
    );

    // Existing queue row with another hash: stale -> pending/source_changed even with a recording.
    const queueRow = (extra: Row = {}) => ({
      id: "q-1", series_id: "s-1", episode_id: "ep-1", generation_status: "completed", generation_reason: "manual_generate",
      source_text_hash: "old", request_count: 4, attempt_count: "2", first_requested_at: "2026-01-01T00:00:00Z",
      last_generated_at: "2026-01-02T00:00:00Z", last_error: "e", created_at: "2026-01-01T00:00:00Z", ...extra,
    });
    reset();
    db.episodes = ok([episode("ep-1", 1)]);
    db.recordings = ok([{ id: "r1", episode_id: "ep-1", reader_id: "nemo" }]);
    db.queue = ok([queueRow()]);
    assert.deepEqual((await sync()).queuedEpisodeIds, ["ep-1"]);
    const stale = payloads()[0];
    assert.deepEqual(
      [stale.id, stale.generation_status, stale.generation_reason, stale.is_stale, stale.request_count, stale.priority_score, stale.attempt_count, stale.first_requested_at, stale.last_generated_at, stale.last_error],
      ["q-1", "pending", "source_changed", true, 5, 200 + 25, 2, "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z", "e"]
    );
    // Same hash and already completed: keeps its reason.
    reset();
    db.episodes = ok([episode("ep-1", 1)]);
    db.recordings = ok([{ id: "r1", episode_id: "ep-1", reader_id: "nemo" }]);
    db.queue = ok([queueRow({ source_text_hash: hashOf("ep-1") })]);
    await sync();
    assert.deepEqual([payloads()[0].generation_status, payloads()[0].generation_reason], ["completed", "manual_generate"]);
    // A fresh processing lock is kept; an expired one is not.
    for (const [lockedAt, status] of [[new Date().toISOString(), "processing"], ["2020-01-01T00:00:00Z", "pending"], ["not a date", "pending"]] as const) {
      reset();
      db.episodes = ok([episode("ep-1", 1)]);
      db.queue = ok([queueRow({ generation_status: "processing", locked_at: lockedAt, locked_by: "w" })]);
      const res = await sync();
      assert.equal(payloads()[0].generation_status, status, lockedAt);
      assert.equal(payloads()[0].locked_by, status === "processing" ? "w" : null);
      assert.deepEqual(res.queuedEpisodeIds, status === "pending" ? ["ep-1"] : []);
      assert.deepEqual(res.completedEpisodeIds, []);
    }
    // Errors: queue lookup / upsert throw; recordings and episodes read errors are treated as empty.
    reset();
    db.episodes = ok([episode("ep-1", 1)]);
    db.queue = { data: null, error: { message: "q" } };
    await assert.rejects(sync(), /^Error: nemo_queue_lookup_failed:q$/);
    reset();
    db.episodes = ok([episode("ep-1", 1)]);
    db.upsertError = { message: "u" };
    await assert.rejects(sync(), /^Error: nemo_queue_upsert_failed:u$/);
    reset();
    db.episodes = { data: null, error: { message: "x" } };
    assert.deepEqual(await sync(), empty);

    // Claim: first row whose conditional update succeeds; fresh processing rows skipped.
    reset();
    db.queue = ok([
      { id: "busy", episode_id: "e0", generation_status: "processing", locked_at: new Date().toISOString() },
      { id: "stuck", episode_id: "e1", generation_status: "processing", locked_at: "2020-01-01T00:00:00Z", attempt_count: 1 },
      { id: "p", episode_id: "e2", generation_status: "pending", attempt_count: 0 },
    ]);
    db.claimResults = [ok(null), ok({ id: "p", episode_id: "e2", generation_status: "processing", locked_by: "w-1", attempt_count: 1 })];
    const claimed = await q.claimNextNemoGenerationQueueJob({ supabase: sb, workerId: "w-1", seriesId: "s-1", episodeIds: [" e1 ", "e2", "e2", ""] });
    assert.equal(claimed!.id, "p");
    assert.equal(claimed!.generationStatus, "processing");
    assert.equal(claimed!.attemptCount, 1);
    assert.equal(claimed!.lastRequestSource, "system");
    const [lookup, claimStuck, claimPending] = db.log as unknown[][];
    assert.deepEqual(lookup, [
      "nemo_generation_queue",
      ["select", "*"],
      ["in", "generation_status", ["pending", "failed", "processing"]],
      ["order", "priority_score", { ascending: false }],
      ["order", "viewer_count_snapshot", { ascending: false }],
      ["order", "last_requested_at", { ascending: false }],
      ["order", "first_requested_at", { ascending: true }],
      ["limit", 50],
      ["eq", "series_id", "s-1"],
      ["in", "episode_id", ["e1", "e2"]],
    ]);
    const update = (claimStuck[1] as [string, Row])[1];
    assert.deepEqual({ ...update, last_attempted_at: 0, locked_at: 0, updated_at: 0 }, {
      generation_status: "processing", last_attempted_at: 0, attempt_count: 2, locked_at: 0, locked_by: "w-1", last_error: null, updated_at: 0,
    });
    assert.deepEqual(claimStuck.slice(2), [["eq", "id", "stuck"], ["eq", "generation_status", "processing"], ["eq", "locked_at", "2020-01-01T00:00:00Z"], ["select", "*"]]);
    assert.deepEqual(claimPending.slice(2), [["eq", "id", "p"], ["in", "generation_status", ["pending", "failed"]], ["select", "*"]]);
    reset();
    assert.equal(await q.claimNextNemoGenerationQueueJob({ supabase: sb, workerId: "w" }), null);
    assert.equal(db.log.length, 1);
    db.queue = { data: null, error: { message: "c" } };
    await assert.rejects(q.claimNextNemoGenerationQueueJob({ supabase: sb, workerId: "w" }), /^Error: nemo_queue_claim_lookup_failed:c$/);

    // Completed / failed marks.
    reset();
    const job = { ...(claimed as object), sourceTextHash: "h-job" } as typeof claimed & object;
    await q.markNemoGenerationQueueJobCompleted({ supabase: sb, job: job! });
    const done = (db.log[0][1] as [string, Row])[1];
    assert.deepEqual([done.generation_status, done.is_stale, done.source_text_hash, done.last_error, done.locked_at, done.locked_by], ["completed", false, "h-job", null, null, null]);
    assert.deepEqual(db.log[0][2], ["eq", "id", "p"]);
    await q.markNemoGenerationQueueJobCompleted({ supabase: sb, job: job!, sourceTextHash: null });
    assert.equal(((db.log[1][1] as [string, Row])[1]).source_text_hash, null);
    await q.markNemoGenerationQueueJobFailed({ supabase: sb, jobId: "p", error: new Error("tts down") });
    await q.markNemoGenerationQueueJobFailed({ supabase: sb, jobId: "p", error: 42 });
    assert.deepEqual([((db.log[2][1] as [string, Row])[1]).last_error, ((db.log[3][1] as [string, Row])[1]).last_error], ["tts down", "42"]);
    db.updateError = { message: "w" };
    await assert.rejects(q.markNemoGenerationQueueJobCompleted({ supabase: sb, job: job! }), /^Error: nemo_queue_complete_failed:w$/);
    await assert.rejects(q.markNemoGenerationQueueJobFailed({ supabase: sb, jobId: "p", error: "x" }), /^Error: nemo_queue_fail_failed:w$/);

    // Manual generation mark.
    reset();
    db.episodeById = ok(episode("ep-1", 1));
    db.queue = ok([queueRow({ priority_score: 9, viewer_count_snapshot: 2, last_requested_at: "2026-01-03T00:00:00Z" })]);
    await q.markEpisodeGeneratedInNemoQueue({ supabase: sb, seriesId: "s-1", episodeId: "ep-1", requestedByUserId: "author" });
    const manual = (db.upserts[0] as [Row[], unknown])[0][0];
    assert.deepEqual(
      [manual.id, manual.generation_status, manual.generation_reason, manual.source_text_hash, manual.priority_score, manual.viewer_count_snapshot, manual.request_count, manual.last_request_source, manual.last_requested_by_user_id, manual.last_requested_at, manual.attempt_count],
      ["q-1", "completed", "manual_generate", hashOf("ep-1"), 9, 2, 4, "manual_generate", "author", "2026-01-03T00:00:00Z", 2]
    );
    for (const setup of [() => (db.episodeById = ok(null)), () => (db.episodeById = ok(episode("ep-1", 1, { series_id: "other" }))), () => (db.episodeById = ok(episode("ep-1", 1, { body: " " })))]) {
      reset();
      setup();
      await q.markEpisodeGeneratedInNemoQueue({ supabase: sb, seriesId: "s-1", episodeId: "ep-1" });
      assert.deepEqual(db.upserts, []);
    }

    console.log("nemoGenerationQueue characterization: PASS");
  } finally {
    moduleWithLoad._load = originalLoad;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
