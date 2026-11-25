import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deletePlayLogBySeries,
  getPlayLogBySeries,
  savePlayLog,
  toPlayLogResumeState,
  type PlayLogRow,
} from "../src/lib/playLogs";

// Characterization test: pins current behavior only (LT-002). Mocked Supabase, synthetic ids.

type Call = [string, ...unknown[]];
type Result = { data?: unknown; error: unknown };

function createSupabaseMock(result: Result) {
  const queries: Array<{ table: string; calls: Call[] }> = [];
  const client = {
    from(table: string) {
      const calls: Call[] = [];
      queries.push({ table, calls });
      const builder = {
        select: (...args: unknown[]) => (calls.push(["select", ...args]), builder),
        eq: (...args: unknown[]) => (calls.push(["eq", ...args]), builder),
        upsert: (...args: unknown[]) => (calls.push(["upsert", ...args]), builder),
        delete: () => (calls.push(["delete"]), builder),
        maybeSingle: () => (calls.push(["maybeSingle"]), Promise.resolve(result)),
        single: () => (calls.push(["single"]), Promise.resolve(result)),
        then: (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, queries };
}

const row: PlayLogRow = {
  id: "log-1",
  user_id: "user-1",
  series_id: "series-1",
  episode_id: "episode-1",
  episode_number: 3,
  recording_id: null,
  position_seconds: 12.5,
  marker_index: 2,
  progress_percent: 40,
  is_following: true,
  last_played_at: "2026-11-25T00:00:00.000Z",
  created_at: "2026-11-25T00:00:00.000Z",
  updated_at: "2026-11-25T00:00:00.000Z",
};

assert.equal(toPlayLogResumeState(null), null);
assert.deepEqual(toPlayLogResumeState(row), {
  episodeId: "episode-1",
  episodeNumber: 3,
  recordingId: null,
  positionSeconds: 12.5,
  markerIndex: 2,
  progressPercent: 40,
  isFollowing: true,
  lastPlayedAt: "2026-11-25T00:00:00.000Z",
});

const compact = (value: unknown) => String(value).replace(/\s+/g, "");

async function main() {
  // Signed-out users are skipped without a query.
  const idle = createSupabaseMock({ data: null, error: null });
  assert.deepEqual(await getPlayLogBySeries(idle.client, { userId: null, seriesId: "s" }), { data: null, error: null, skipped: true });
  assert.deepEqual(
    await savePlayLog(idle.client, { userId: "", seriesId: "s", episodeId: "e", episodeNumber: 1, positionSeconds: 0 }),
    { data: null, error: null, skipped: true }
  );
  assert.deepEqual(await deletePlayLogBySeries(idle.client, { userId: undefined, seriesId: "s" }), { error: null, skipped: true });
  assert.equal(idle.queries.length, 0);

  // Missing ids are reported as errors (not skipped).
  const missingSeries = await getPlayLogBySeries(idle.client, { userId: "u", seriesId: "" });
  assert.equal((missingSeries.error as Error).message, "seriesId is required");
  assert.equal(missingSeries.skipped, false);
  const missingEpisode = await savePlayLog(idle.client, { userId: "u", seriesId: "s", episodeId: "", episodeNumber: 1, positionSeconds: 0 });
  assert.equal((missingEpisode.error as Error).message, "episodeId is required");
  assert.equal(((await deletePlayLogBySeries(idle.client, { userId: "u", seriesId: "" })).error as Error).message, "seriesId is required");
  assert.equal(idle.queries.length, 0);

  // Read.
  const read = createSupabaseMock({ data: row, error: null });
  assert.deepEqual(await getPlayLogBySeries(read.client, { userId: "user-1", seriesId: "series-1" }), { data: row, error: null, skipped: false });
  const readCalls = read.queries[0]!.calls;
  assert.equal(read.queries[0]!.table, "play_logs");
  assert.equal(
    compact(readCalls[0]![1]),
    "id,user_id,series_id,episode_id,episode_number,recording_id,position_seconds,marker_index,progress_percent,is_following,last_played_at,created_at,updated_at"
  );
  assert.deepEqual(readCalls.slice(1), [
    ["eq", "user_id", "user-1"],
    ["eq", "series_id", "series-1"],
    ["maybeSingle"],
  ]);

  // Save: values are normalized before upsert.
  const save = createSupabaseMock({ data: row, error: null });
  const saved = await savePlayLog(save.client, {
    userId: "user-1",
    seriesId: "series-1",
    episodeId: "episode-1",
    episodeNumber: 3,
    positionSeconds: 12.34567,
    markerIndex: 2.9,
    progressPercent: 150,
  });
  assert.deepEqual(saved, { data: row, error: null, skipped: false });
  const upsert = save.queries[0]!.calls[0]!;
  assert.equal(upsert[0], "upsert");
  const payload = upsert[1] as Record<string, unknown>;
  assert.equal(typeof payload.last_played_at, "string");
  delete payload.last_played_at;
  assert.deepEqual(payload, {
    user_id: "user-1",
    series_id: "series-1",
    episode_id: "episode-1",
    episode_number: 3,
    recording_id: null,
    position_seconds: 12.346,
    marker_index: 2,
    progress_percent: 100,
    is_following: true,
  });
  assert.deepEqual(upsert[2], { onConflict: "user_id,series_id" });
  assert.deepEqual(save.queries[0]!.calls.slice(-1), [["single"]]);

  const negatives = createSupabaseMock({ data: null, error: null });
  await savePlayLog(negatives.client, {
    userId: "u",
    seriesId: "s",
    episodeId: "e",
    episodeNumber: 1,
    recordingId: "r",
    positionSeconds: -5,
    markerIndex: Number.NaN,
    progressPercent: 33.335,
    isFollowing: false,
  });
  const negativePayload = negatives.queries[0]!.calls[0]![1] as Record<string, unknown>;
  assert.equal(negativePayload.position_seconds, 0);
  assert.equal(negativePayload.marker_index, 0);
  assert.equal(negativePayload.progress_percent, 33.34);
  assert.equal(negativePayload.recording_id, "r");
  assert.equal(negativePayload.is_following, false);

  // Invalid episode numbers throw.
  await assert.rejects(
    savePlayLog(idle.client, { userId: "u", seriesId: "s", episodeId: "e", episodeNumber: 0, positionSeconds: 0 }),
    /episodeNumber must be a positive integer/
  );
  await assert.rejects(
    savePlayLog(idle.client, { userId: "u", seriesId: "s", episodeId: "e", episodeNumber: 1.5, positionSeconds: 0 }),
    /episodeNumber must be a positive integer/
  );

  // Delete passes through the database error.
  const dbError = { message: "denied" };
  const remove = createSupabaseMock({ error: dbError });
  assert.deepEqual(await deletePlayLogBySeries(remove.client, { userId: "u", seriesId: "s" }), { error: dbError, skipped: false });
  assert.deepEqual(remove.queries[0]!.calls, [["delete"], ["eq", "user_id", "u"], ["eq", "series_id", "s"]]);

  console.log("PASS: play logs (skip when signed out, required ids, normalization, upsert/read/delete queries)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
