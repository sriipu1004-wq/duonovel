// Issue #139 (rights): narration of the 8 §104A works moves from the PUBLIC
// bucket recording-audio to the PRIVATE bucket ai-narration-private.
// Proves, without network or secrets:
//  1. the rewritten reference is exactly what the app's ai-audio proxy accepts
//     (wav and timing.json), and the rows are never treated as Human;
//  2. playback rules: private work -> anonymous 404, owner OK; after PR #210
//     rollback.sql (work public again) -> anonymous playback through the proxy;
//  3. the migration stages (plan / copy / verify / delete-public / restore)
//     are idempotent, resumable, verify content, and refuse unsafe deletes.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isPrivateAiNarrationPathForEpisode,
  parsePrivateAiNarrationReference,
  PRIVATE_AI_NARRATION_BUCKET,
} from "../src/lib/recording/privateAiNarrationStorage";
import { buildNemoTimingObjectPathFromAudioObjectPath } from "../src/lib/recording/nemoTiming";
import { canServePrivateAiNarration, type ReaderSourceSnapshot } from "../src/lib/recording/privateMediaAccess";
import { projectReaderEpisodeRecordings } from "../src/lib/recording/readerEpisodeRecordingProjection";
import { listProjectedAiNarrationOptions } from "../src/lib/recording/protectedAiRecordingOptions";
import { recordingAudioPlaybackHref } from "../src/lib/recording/recordingAudioPlaybackHref";
import { isHumanRecordingRow, isH1GuardedHumanRow } from "../src/lib/recording/humanRecordingState";
import { safePrivateMediaContentType, streamPrivateMediaObject } from "../src/lib/recording/privateMediaStream";
import * as lib from "./issue139-us104a-audio-private/lib.mjs";
import * as core from "./issue139-us104a-audio-private/core.mjs";

const SERIES = lib.TARGET_SERIES[0];
const EPISODE = "0b6f3a52-6a54-4b7a-9d8e-2a1d5f0c9e11";
const OWNER = "11111111-1111-4111-8111-111111111111";
const REC = "5d2c1a3e-1f4b-4c6d-8e9f-0a1b2c3d4e5f";
const PATH = `aivis/${SERIES}/${EPISODE}/clip_01.wav`;
const BEFORE = lib.PUBLIC_URL_PREFIX + PATH;

async function main() {
// --------------------------------------------------------------------------
// 1. Reference shape = app's parser
// --------------------------------------------------------------------------
assert.equal(lib.PRIVATE_BUCKET, PRIVATE_AI_NARRATION_BUCKET);
const reference = lib.privateReference(PATH);
assert.equal(reference, `ai-narration-private:${PATH}`);
assert.equal(parsePrivateAiNarrationReference(reference), PATH);
assert.ok(isPrivateAiNarrationPathForEpisode(PATH, SERIES, EPISODE));
assert.equal(lib.timingPathFor(PATH), buildNemoTimingObjectPathFromAudioObjectPath(PATH));
assert.equal(lib.objectPathOfRow({ id: REC, series_id: SERIES, episode_id: EPISODE, audio_storage_path: BEFORE }).path, PATH);
assert.equal(lib.objectPathOfRow({ id: REC, series_id: SERIES, episode_id: EPISODE, audio_storage_path: reference }).state, "private");
assert.throws(() => lib.objectPathOfRow({ id: REC, series_id: SERIES, episode_id: randomUUID(), audio_storage_path: BEFORE }), /object_path_not_for_row/);
assert.throws(() => lib.objectPathOfRow({ id: REC, series_id: SERIES, episode_id: EPISODE, audio_storage_path: "https://evil.example/x.wav" }), /unexpected_audio_storage_path/);
// Production rows carry reader_id + reader_name and sometimes no voice model:
// with either path they are not Human rows and the H1 trigger ignores them.
for (const audio_storage_path of [BEFORE, reference]) {
  const row = { audio_storage_path, voice_model_id: null, reader_id: OWNER, reader_name: "AI" };
  assert.equal(isHumanRecordingRow(row), false);
  assert.equal(isH1GuardedHumanRow(row), false);
}
// The proxy serves the timing file as application/json; Production stores
// some as "application/json; charset=utf-8", the copy normalizes it.
assert.equal(safePrivateMediaContentType("application/json; charset=utf-8"), "application/json");
assert.equal(lib.uploadContentType("timing"), "application/json");
assert.equal(lib.uploadContentType("wav"), "audio/wav");

// The route really uses these helpers and serves ?timing=1 from the same bucket.
const route = readFileSync("src/app/api/recordings/ai-audio/[recordingId]/route.ts", "utf8");
for (const needle of [
  "parsePrivateAiNarrationReference(",
  "isPrivateAiNarrationPathForEpisode(objectPath, seriesId, episodeId)",
  "buildNemoTimingObjectPathFromAudioObjectPath(objectPath)",
  "recordingPublic: row.is_public === true",
  "PRIVATE_AI_NARRATION_BUCKET,",
]) assert.ok(route.includes(needle), `ai-audio route: ${needle}`);

// --------------------------------------------------------------------------
// 2. Playback rules before / after PR #210 rollback.sql
// --------------------------------------------------------------------------
const privateWork: ReaderSourceSnapshot = {
  seriesPublic: false, episodePublic: true, episodeBelongsToSeries: true,
  viewerIsSeriesOwner: false, isR18: false, viewerShowsR18: false,
};
assert.equal(canServePrivateAiNarration({ ...privateWork, recordingPublic: true }), false, "anonymous: private work");
assert.equal(canServePrivateAiNarration({ ...privateWork, viewerIsSeriesOwner: true, recordingPublic: true }), true, "owner");
const publicAgain = { ...privateWork, seriesPublic: true };
assert.equal(canServePrivateAiNarration({ ...publicAgain, recordingPublic: true }), true, "after #210 rollback");

const rowAfter = { id: REC, episode_id: EPISODE, audio_storage_path: reference, is_public: true, voice_model_id: null, reader_id: OWNER, reader_name: "AI" };
const projected = projectReaderEpisodeRecordings([rowAfter], EPISODE, new Set());
assert.equal(projected.length, 1);
assert.equal(projected[0].audio_storage_path, `/api/recordings/ai-audio/${REC}`);
assert.ok(!JSON.stringify(projected).includes("ai-narration-private:"), "raw reference never serialized");
assert.deepEqual(listProjectedAiNarrationOptions(projected, EPISODE).map((o) => o.audioUrl), [`/api/recordings/ai-audio/${REC}`]);
assert.equal(recordingAudioPlaybackHref(REC, reference), `/api/recordings/ai-audio/${REC}`);
// Before the move these rows were never in the Reader payload (public AI rows
// are dropped); after the move + #210 rollback they appear as AI narration.
assert.equal(projectReaderEpisodeRecordings([{ ...rowAfter, audio_storage_path: BEFORE }], EPISODE, new Set()).length, 0);

// Storage request of the proxy for the moved objects (wav Range + timing).
{
  const seen: string[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen.push(url);
    const headers = new Headers(init.headers);
    if (url.endsWith(".wav")) {
      assert.equal(headers.get("range"), "bytes=0-1023");
      return new Response(new Uint8Array(1024), { status: 206, headers: { "content-type": "audio/wav", "content-range": "bytes 0-1023/5000" } });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
  }) as unknown as typeof fetch;
  const base = { bucket: PRIVATE_AI_NARRATION_BUCKET, endpoint: "https://x.supabase.co", serviceKey: "k", fetchImpl };
  const wav = await streamPrivateMediaObject({ ...base, objectPath: PATH, request: new Request("https://a/", { headers: { Range: "bytes=0-1023" } }) });
  assert.equal(wav.status, 206);
  const timing = await streamPrivateMediaObject({ ...base, objectPath: lib.timingPathFor(PATH), request: new Request("https://a/") });
  assert.equal(timing.status, 200);
  assert.equal(timing.headers.get("content-type"), "application/json");
  assert.deepEqual(seen, [
    `https://x.supabase.co/storage/v1/object/authenticated/ai-narration-private/${PATH}`,
    `https://x.supabase.co/storage/v1/object/authenticated/ai-narration-private/${lib.timingPathFor(PATH)}`,
  ]);
}

// --------------------------------------------------------------------------
// 3. ETag proof
// --------------------------------------------------------------------------
const md5 = (b: Uint8Array) => createHash("md5").update(b).digest();
function multipartEtag(bytes: Uint8Array, part: number) {
  const outer = createHash("md5");
  let n = 0;
  for (let o = 0; o < bytes.length; o += part, n += 1) outer.update(md5(bytes.subarray(o, o + part)));
  return `"${outer.digest("hex")}-${n}"`;
}
{
  const big = new Uint8Array(11 * 1024 * 1024).map((_, i) => i % 251);
  assert.equal(lib.etagMatchesBytes(big, multipartEtag(big, 5 * 1024 * 1024)), true);
  const changed = big.slice(); changed[7] ^= 1;
  assert.equal(lib.etagMatchesBytes(changed, multipartEtag(big, 5 * 1024 * 1024)), null, "unknown -> fall back to SHA-256");
  const small = new TextEncoder().encode("{}");
  assert.equal(lib.etagMatchesBytes(small, `"${md5(small).toString("hex")}"`), true);
  assert.equal(lib.etagMatchesBytes(new TextEncoder().encode("{ }"), `"${md5(small).toString("hex")}"`), false);
}

// --------------------------------------------------------------------------
// 4. Manifest scope
// --------------------------------------------------------------------------
function makeRows(n = 330) {
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const series = lib.TARGET_SERIES[i % 8];
    const episode = randomUUID();
    const prefix = i % 3 ? "aivis" : "nemo";
    rows.push({
      id: randomUUID(), series_id: series, episode_id: episode, is_public: true,
      audio_storage_path: `${lib.PUBLIC_URL_PREFIX}${prefix}/${series}/${episode}/seg_${i}.wav`,
    });
  }
  return rows;
}
{
  const rows = makeRows();
  const m = lib.buildManifest(rows);
  assert.equal(m.recordings.length, 330);
  assert.equal(m.objects.length, 660);
  assert.throws(() => lib.buildManifest(rows.slice(1)), /recording_count_mismatch/);
  assert.throws(() => lib.buildManifest([...rows.slice(1), { ...rows[0], series_id: randomUUID() }]), /non_target_series/);
  assert.throws(() => lib.buildManifest([...rows.slice(1), { ...rows[1], id: randomUUID() }]), /duplicate_object_path/);
}

// --------------------------------------------------------------------------
// 5. Stages against in-memory Storage / DB
// --------------------------------------------------------------------------
type Obj = { bytes: Uint8Array; etag: string; mimetype: string };
function fakeWorld() {
  const rows = makeRows();
  const buckets = new Map<string, Map<string, Obj>>([[lib.PUBLIC_BUCKET, new Map()], [lib.PRIVATE_BUCKET, new Map()]]);
  const allowedPrivate = new Set(["audio/wav", "audio/x-wav", "application/json"]);
  for (const r of rows) {
    const p = lib.objectPathOfRow(r).path;
    const wav = new Uint8Array(2000 + (r.id.charCodeAt(0) % 50)).map((_, i) => (i * 7 + r.id.charCodeAt(1)) % 256);
    buckets.get(lib.PUBLIC_BUCKET)!.set(p, { bytes: wav, etag: multipartEtag(wav, 5 * 1024 * 1024), mimetype: "audio/wav" });
    const json = new TextEncoder().encode(JSON.stringify({ version: 2, id: r.id }));
    buckets.get(lib.PUBLIC_BUCKET)!.set(lib.timingPathFor(p), { bytes: json, etag: `"${md5(json).toString("hex")}"`, mimetype: "application/json; charset=utf-8" });
  }
  let failUploadsAfter = Infinity;
  let uploads = 0;
  const calls = { download: 0, upload: 0, remove: 0 };
  const storage = {
    async listFolder(bucket: string, folder: string) {
      return [...buckets.get(bucket)!.entries()]
        .filter(([p]) => p.startsWith(folder + "/") && !p.slice(folder.length + 1).includes("/"))
        .map(([p, o]) => ({ path: p, size: o.bytes.length, etag: o.etag, mimetype: o.mimetype }));
    },
    async download(bucket: string, path: string) {
      calls.download += 1;
      const o = buckets.get(bucket)!.get(path);
      if (!o) throw new Error("not_found");
      return o.bytes.slice();
    },
    async upload(bucket: string, path: string, bytes: Uint8Array, contentType: string) {
      calls.upload += 1;
      if (uploads >= failUploadsAfter) throw new Error("network");
      uploads += 1;
      const b = buckets.get(bucket)!;
      if (b.has(path)) throw new Error("exists");
      if (bucket === lib.PRIVATE_BUCKET && !allowedPrivate.has(contentType)) throw new Error("mime_rejected");
      // Storage stores big objects as multipart and small ones as single PUT.
      b.set(path, { bytes: bytes.slice(), etag: bytes.length > 1500 ? multipartEtag(bytes, 5 * 1024 * 1024) : `"${md5(bytes).toString("hex")}"`, mimetype: contentType });
    },
    async remove(bucket: string, paths: string[]) {
      calls.remove += 1;
      for (const p of paths) buckets.get(bucket)!.delete(p);
    },
  };
  const db = { async listTargetRecordings() { return rows.map((r) => ({ ...r })); } };
  return { rows, buckets, storage, db, calls, setFailAfter(n: number) { failUploadsAfter = n; uploads = 0; } };
}

const logs: string[] = [];
const log = (l: string) => logs.push(l);
{
  const w = fakeWorld();
  const stateDir = mkdtempSync(join(tmpdir(), "issue139-audio-"));
  const ctx = { db: w.db, storage: w.storage, stateDir, log };
  const probe = async () => ({ ok: true, detail: "fake" });

  const planned = await core.plan(ctx);
  assert.equal(planned.recordings, 330);
  assert.equal(planned.srcPresent, 660);
  assert.equal(planned.dstPresent, 0);

  // Dry-run copies nothing.
  const dry = await core.copy(ctx);
  assert.equal(dry.executed, false);
  assert.equal(w.buckets.get(lib.PRIVATE_BUCKET)!.size, 0);
  assert.equal(w.calls.upload, 0);

  // Interrupted copy, then resumed: no object uploaded twice.
  w.setFailAfter(100);
  await assert.rejects(core.copy({ ...ctx, execute: true, concurrency: 1 }), /copy_incomplete/);
  assert.equal(w.buckets.get(lib.PRIVATE_BUCKET)!.size, 100);
  w.setFailAfter(Infinity);
  const uploadsBefore = w.calls.upload;
  const resumed = await core.copy({ ...ctx, execute: true });
  assert.equal(resumed.copied, 560);
  assert.equal(w.calls.upload - uploadsBefore, 560);
  // Timing files were normalized to the type the private bucket allows.
  assert.ok([...w.buckets.get(lib.PRIVATE_BUCKET)!.values()].every((o) => o.mimetype === "audio/wav" || o.mimetype === "application/json"));
  const again = await core.copy({ ...ctx, execute: true });
  assert.equal(again.copied, 0);
  assert.equal(again.already, 660);

  // Verify passes; a corrupted copy is caught.
  assert.equal((await core.verify({ ...ctx, probe })).ok, true);
  // Delete is refused while DB rows still point at the public bucket.
  await assert.rejects(core.deletePublic({ ...ctx, execute: true, confirmPlayback: true, probe }), /delete_refused_db_not_switched/);

  // Simulate db-apply.sql.
  for (const r of w.rows) r.audio_storage_path = lib.privateReference(lib.objectPathOfRow(r).path);
  await assert.rejects(core.deletePublic({ ...ctx, execute: true, probe }), /delete_refused_playback_not_confirmed/);
  // Fresh state dir (no proof) -> verify cannot prove -> delete refused.
  await assert.rejects(
    core.deletePublic({ ...ctx, stateDir: mkdtempSync(join(tmpdir(), "issue139-audio-")), execute: true, confirmPlayback: true, probe }),
    /delete_refused_verify_failed/
  );
  // ...unless --deep re-proves by SHA-256.
  const fresh = mkdtempSync(join(tmpdir(), "issue139-audio-"));
  assert.equal((await core.verify({ ...ctx, stateDir: fresh, deep: true })).proven, 660);
  // A failed probe also blocks deletion.
  await assert.rejects(
    core.deletePublic({ ...ctx, execute: true, confirmPlayback: true, probe: async () => ({ ok: false, detail: "404" }) }),
    /delete_refused_verify_failed/
  );
  const delDry = await core.deletePublic({ ...ctx, confirmPlayback: true, probe });
  assert.equal(delDry.executed, false);
  assert.equal(w.buckets.get(lib.PUBLIC_BUCKET)!.size, 660);
  const statuses: string[] = [];
  const del = await core.deletePublic({
    ...ctx, execute: true, confirmPlayback: true, probe,
    anonymousStatus: async (url: string) => { statuses.push(url); return 400; },
  });
  assert.equal(del.deleted, 660);
  assert.equal(w.buckets.get(lib.PUBLIC_BUCKET)!.size, 0);
  assert.ok(statuses[0].startsWith(lib.PUBLIC_URL_PREFIX));
  // Verify still passes from the recorded proof after the originals are gone.
  assert.equal((await core.verify({ ...ctx, probe })).ok, true);

  // Rollback helper: copy back with the original content types.
  const restored = await core.copy({ ...ctx, execute: true, direction: "restore" });
  assert.equal(restored.copied, 660);
  const back = w.buckets.get(lib.PUBLIC_BUCKET)!;
  assert.equal(back.size, 660);
  assert.ok([...back.entries()].some(([p, o]) => p.endsWith(".timing.json") && o.mimetype === "application/json; charset=utf-8"));
  assert.equal((await core.verify({ ...ctx, direction: "restore" })).ok, true);

  // A destination object of the wrong size is never overwritten.
  const w2 = fakeWorld();
  const firstPath = lib.objectPathOfRow(w2.rows[0]).path;
  w2.buckets.get(lib.PRIVATE_BUCKET)!.set(firstPath, { bytes: new Uint8Array(3), etag: '"x"', mimetype: "audio/wav" });
  await assert.rejects(
    core.copy({ db: w2.db, storage: w2.storage, stateDir: mkdtempSync(join(tmpdir(), "issue139-audio-")), log, execute: true }),
    /copy_refused/
  );
  // A destination of the right size but different bytes is not accepted.
  const w3 = fakeWorld();
  const p3 = lib.objectPathOfRow(w3.rows[0]).path;
  const orig = w3.buckets.get(lib.PUBLIC_BUCKET)!.get(p3)!;
  const bad = orig.bytes.slice(); bad[0] ^= 1;
  w3.buckets.get(lib.PRIVATE_BUCKET)!.set(p3, { bytes: bad, etag: multipartEtag(bad, 5 * 1024 * 1024), mimetype: "audio/wav" });
  await assert.rejects(
    core.copy({ db: w3.db, storage: w3.storage, stateDir: mkdtempSync(join(tmpdir(), "issue139-audio-")), log, execute: true }),
    /copy_incomplete:1/
  );
}

// The CLI never prints the key and refuses any other project.
{
  const cli = readFileSync("scripts/issue139-us104a-audio-private/cli.ts", "utf8");
  assert.ok(cli.includes('split(key).join("[redacted]")'));
  assert.ok(cli.includes("refused: Supabase URL must be"));
  assert.ok(!/console\.log\([^)]*key\b/.test(cli.replace('split(key).join("[redacted]")', "")));
}

console.log("issue139 audio-private tests OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
