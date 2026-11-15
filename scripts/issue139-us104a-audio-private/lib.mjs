// Issue #139 (rights): pure helpers for moving the AI narration of the 8
// §104A works (made private by PR #210) out of the PUBLIC bucket
// `recording-audio` into the PRIVATE bucket `ai-narration-private`.
// No I/O here, so CI can test every rule without network or secrets.
import { createHash } from "node:crypto";

export const PROJECT_REF = "nyxbnccuvmlzffgtdadi";
export const PUBLIC_BUCKET = "recording-audio";
export const PRIVATE_BUCKET = "ai-narration-private";
export const PRIVATE_REFERENCE_PREFIX = `${PRIVATE_BUCKET}:`;
/**
 * Target sets. "us104a" (default) is the 8 series made private by PR #210
 * (scripts/issue139-us104a-unpublish). "kotou" is 孤島の鬼 (江戸川乱歩), which
 * is public only in the allow-listed countries (D030) but whose narration was
 * still in the public bucket. Pick a set with ISSUE139_AUDIO_SET.
 */
export const TARGET_SETS = Object.freeze({
  us104a: Object.freeze({
    series: Object.freeze([
      "8514e9da-7864-4dad-a397-de06abee8fdc",
      "d5cc7bf2-c76e-49e8-a078-150636fc0344",
      "4d328931-ca04-4843-bcb5-9ac080cfbbf1",
      "ac25272b-fc09-4f20-a94a-816791e750d0",
      "82309887-add7-4406-aa18-d8a435c3b967",
      "f7ba9cd3-0ede-48df-92d7-2ea297f33475",
      "833b0303-d034-4ebb-ae6f-e023dd765a64",
      "4f48c202-3ba1-47cb-b887-90880534c96e",
    ]),
    recordings: 330,
    objects: 660,
    sqlDir: ".",
    stateDir: ".issue139-audio-state",
  }),
  kotou: Object.freeze({
    series: Object.freeze(["d5e231b1-4f59-4d44-80a8-067cd49f8504"]),
    recordings: 120,
    objects: 240,
    sqlDir: "kotou",
    stateDir: ".issue139-audio-state-kotou",
  }),
});

export const TARGET_SET_NAME = process.env.ISSUE139_AUDIO_SET ?? "us104a";
if (!Object.prototype.hasOwnProperty.call(TARGET_SETS, TARGET_SET_NAME)) {
  throw new Error(`unknown ISSUE139_AUDIO_SET:${TARGET_SET_NAME}`);
}
const ACTIVE = TARGET_SETS[TARGET_SET_NAME];
export const EXPECTED_RECORDINGS = ACTIVE.recordings;
export const EXPECTED_OBJECTS = ACTIVE.objects;
export const DEFAULT_STATE_DIR = ACTIVE.stateDir;

/** The series of the active set (default: the 8 series made private by PR #210). */
export const TARGET_SERIES = ACTIVE.series;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// Same shape as PRIVATE_AI_OBJECT_PATH in src/lib/recording/privateAiNarrationStorage.ts.
const OBJECT_PATH = new RegExp(`^(?:nemo|aivis)/(${UUID})/(${UUID})/[A-Za-z0-9._-]+[.]wav$`, "u");
export const PUBLIC_URL_PREFIX =
  `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/${PUBLIC_BUCKET}/`;

/**
 * Object path (inside either bucket) of a recordings row, whether the row
 * still holds the public URL (before) or the private reference (after).
 * Throws unless the path belongs to exactly that row's series and episode.
 */
export function objectPathOfRow(row) {
  const stored = typeof row.audio_storage_path === "string" ? row.audio_storage_path.trim() : "";
  let path;
  let state;
  if (stored.startsWith(PUBLIC_URL_PREFIX)) {
    path = stored.slice(PUBLIC_URL_PREFIX.length);
    state = "public";
  } else if (stored.startsWith(PRIVATE_REFERENCE_PREFIX)) {
    path = stored.slice(PRIVATE_REFERENCE_PREFIX.length);
    state = "private";
  } else {
    throw new Error(`unexpected_audio_storage_path:${row.id}`);
  }
  const m = OBJECT_PATH.exec(path);
  if (!m || path.includes("..") || path.includes("//")) {
    throw new Error(`unexpected_object_path:${row.id}`);
  }
  if (m[1] !== row.series_id || m[2] !== row.episode_id) {
    throw new Error(`object_path_not_for_row:${row.id}`);
  }
  return { path, state };
}

/** Same rule as buildNemoTimingObjectPathFromAudioObjectPath (src/lib/recording/nemoTiming.ts). */
export function timingPathFor(wavPath) {
  return wavPath.replace(/\.wav$/i, ".timing.json");
}

export function privateReference(wavPath) {
  if (!OBJECT_PATH.test(wavPath)) throw new Error("invalid_object_path");
  return PRIVATE_REFERENCE_PREFIX + wavPath;
}

export function publicUrl(wavPath) {
  if (!OBJECT_PATH.test(wavPath)) throw new Error("invalid_object_path");
  return PUBLIC_URL_PREFIX + wavPath;
}

/**
 * The 660 objects to move: one wav + its timing.json per recording.
 * Refuses anything outside the 8 series or an unexpected count.
 */
export function buildManifest(rows, { expectedRecordings = EXPECTED_RECORDINGS } = {}) {
  const targets = new Set(TARGET_SERIES);
  const seen = new Set();
  const recordings = [];
  const objects = [];
  for (const row of rows) {
    if (!targets.has(row.series_id)) throw new Error(`non_target_series:${row.id}`);
    const { path, state } = objectPathOfRow(row);
    if (seen.has(path)) throw new Error(`duplicate_object_path:${row.id}`);
    seen.add(path);
    recordings.push({ id: row.id, series_id: row.series_id, episode_id: row.episode_id, path, state });
    objects.push({ path, kind: "wav", recordingId: row.id });
    objects.push({ path: timingPathFor(path), kind: "timing", recordingId: row.id });
  }
  if (recordings.length !== expectedRecordings) {
    throw new Error(`recording_count_mismatch:${recordings.length}`);
  }
  recordings.sort((a, b) => a.path.localeCompare(b.path));
  objects.sort((a, b) => a.path.localeCompare(b.path));
  return { recordings, objects };
}

/** Folder (series/episode directory) of an object path, for Storage list(). */
export function folderOf(path) {
  return path.slice(0, path.lastIndexOf("/"));
}

/**
 * The private bucket allows only audio/wav, audio/x-wav, application/json
 * (exact strings). Some timing files were stored as
 * "application/json; charset=utf-8", so the type is normalized on copy.
 */
export function uploadContentType(kind) {
  return kind === "wav" ? "audio/wav" : "application/json";
}

export function stripEtag(etag) {
  return typeof etag === "string" ? etag.trim().replace(/^W\//, "").replace(/^"|"$/g, "") : "";
}

const MiB = 1024 * 1024;
const PART_SIZES = [5, 6, 8, 10, 15, 16, 25, 32, 50, 64, 100].map((n) => n * MiB);

/**
 * True when `bytes` reproduce the S3 ETag: plain MD5, or a multipart ETag
 * "md5(md5(part1)..md5(partN))-N" for one of the usual part sizes.
 * Returns null when the ETag cannot be checked locally (unknown part size).
 */
export function etagMatchesBytes(bytes, etag) {
  const value = stripEtag(etag);
  if (/^[0-9a-f]{32}$/.test(value)) {
    return createHash("md5").update(bytes).digest("hex") === value;
  }
  const m = /^([0-9a-f]{32})-(\d+)$/.exec(value);
  if (!m) return null;
  const parts = Number(m[2]);
  for (const size of PART_SIZES) {
    if (Math.ceil(bytes.length / size) !== parts) continue;
    const outer = createHash("md5");
    for (let offset = 0; offset < bytes.length; offset += size) {
      outer.update(createHash("md5").update(bytes.subarray(offset, offset + size)).digest());
    }
    if (outer.digest("hex") === m[1]) return true;
  }
  return null;
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
