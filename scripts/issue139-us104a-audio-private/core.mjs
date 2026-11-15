// Issue #139 (rights): stages for moving the 660 narration objects (330 wav +
// 330 timing.json) of the 8 §104A works from the PUBLIC bucket
// `recording-audio` to the PRIVATE bucket `ai-narration-private`.
//
// All I/O goes through injected adapters (cli.ts wires the real Supabase
// ones; the CI test wires in-memory fakes), so every stage is testable.
//
// Stages (in order; DB SQL runs between copy and delete-public):
//   plan            read-only. Lists DB rows and both buckets, writes manifest.
//   copy            public -> private. Idempotent and resumable: an object that
//                   already exists at the destination is checked, never
//                   overwritten. Without --execute it only prints the plan.
//   verify          read-only. 660 objects at the destination, same size, and
//                   content proven equal (ETag recomputed from the source
//                   bytes, or SHA-256 of both). Plus a proxy-shaped Range probe.
//   delete-public   removes the 660 originals from the PUBLIC bucket. Refused
//                   unless every DB row already points at the private bucket,
//                   verify passes, and the operator confirms playback.
//   restore-public  rollback helper: private -> public copy (same checks).
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  EXPECTED_OBJECTS,
  PRIVATE_BUCKET,
  PUBLIC_BUCKET,
  buildManifest,
  etagMatchesBytes,
  folderOf,
  publicUrl,
  sha256,
  uploadContentType,
} from "./lib.mjs";

export const DIRECTIONS = Object.freeze({
  forward: { from: PUBLIC_BUCKET, to: PRIVATE_BUCKET },
  restore: { from: PRIVATE_BUCKET, to: PUBLIC_BUCKET },
});

function stateFiles(stateDir) {
  mkdirSync(stateDir, { recursive: true });
  return {
    manifest: join(stateDir, "manifest.json"),
    verified: join(stateDir, "verified.jsonl"),
  };
}

/** Records of objects whose destination bytes were proven equal to the source. */
function readVerified(stateDir) {
  const { verified } = stateFiles(stateDir);
  const map = new Map();
  if (!existsSync(verified)) return map;
  for (const line of readFileSync(verified, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line);
    map.set(`${rec.to}:${rec.path}`, rec);
  }
  return map;
}

function recordVerified(stateDir, rec) {
  appendFileSync(stateFiles(stateDir).verified, JSON.stringify(rec) + "\n");
}

async function listBucket(storage, bucket, objects) {
  const metas = new Map();
  const folders = [...new Set(objects.map((o) => folderOf(o.path)))];
  for (const folder of folders) {
    for (const item of await storage.listFolder(bucket, folder)) metas.set(item.path, item);
  }
  return metas;
}

async function loadManifest(db) {
  const rows = await db.listTargetRecordings();
  return { rows, ...buildManifest(rows) };
}

function summarize(objects, src, dst) {
  let srcPresent = 0, dstPresent = 0, sizeEqual = 0, srcBytes = 0;
  for (const o of objects) {
    const s = src.get(o.path);
    const d = dst.get(o.path);
    if (s) { srcPresent += 1; srcBytes += s.size; }
    if (d) dstPresent += 1;
    if (s && d && s.size === d.size) sizeEqual += 1;
  }
  return { objects: objects.length, srcPresent, dstPresent, sizeEqual, srcBytes };
}

// --------------------------------------------------------------------------
/** @param {any} options */
export async function plan({ db, storage, stateDir, log }) {
  const { recordings, objects } = await loadManifest(db);
  const pub = await listBucket(storage, PUBLIC_BUCKET, objects);
  const priv = await listBucket(storage, PRIVATE_BUCKET, objects);
  const dbState = {
    public: recordings.filter((r) => r.state === "public").length,
    private: recordings.filter((r) => r.state === "private").length,
  };
  const forward = summarize(objects, pub, priv);
  const manifest = {
    generatedAt: new Date().toISOString(),
    recordings: recordings.length,
    dbState,
    objects: objects.map((o) => ({
      ...o,
      publicMeta: pub.get(o.path) ?? null,
      privateMeta: priv.get(o.path) ?? null,
    })),
  };
  // Keep the first manifest: it holds the original public metadata
  // (content types) that restore-public reuses.
  const files = stateFiles(stateDir);
  const target = existsSync(files.manifest) ? join(stateDir, "manifest.latest.json") : files.manifest;
  writeFileSync(target, JSON.stringify(manifest, null, 2));
  const result = { recordings: recordings.length, dbState, ...forward };
  log(`plan ${JSON.stringify(result)}`);
  return result;
}

// --------------------------------------------------------------------------
async function proveEqual({ storage, from, to, path, srcBytes, dstMeta }) {
  const quick = etagMatchesBytes(srcBytes, dstMeta.etag);
  if (quick === true) return { method: "etag", sha256: sha256(srcBytes) };
  if (quick === false) return null;
  const dstBytes = await storage.download(to, path);
  const a = sha256(srcBytes);
  return a === sha256(dstBytes) ? { method: "sha256", sha256: a } : null;
}

/** @param {any} options */
export async function copy({ db, storage, stateDir, log, execute = false, direction = "forward", concurrency = 4 }) {
  const { from, to } = DIRECTIONS[direction];
  const { objects } = await loadManifest(db);
  const src = await listBucket(storage, from, objects);
  const dst = await listBucket(storage, to, objects);
  const verified = readVerified(stateDir);
  const original = readOriginalTypes(stateDir);

  const todo = [];
  const problems = [];
  let already = 0;
  for (const o of objects) {
    const s = src.get(o.path);
    const d = dst.get(o.path);
    if (d && verified.has(`${to}:${o.path}`) && s && d.size === s.size) { already += 1; continue; }
    if (d && !s) { already += 1; continue; } // source already gone (after delete); verify covers it
    if (!s) { problems.push(`missing_source:${o.path}`); continue; }
    if (d && d.size !== s.size) { problems.push(`destination_size_mismatch:${o.path}`); continue; }
    todo.push({ ...o, srcMeta: s, dstMeta: d ?? null });
  }
  log(`copy ${direction} ${from} -> ${to}: objects=${objects.length} already=${already} todo=${todo.length} problems=${problems.length}`);
  if (problems.length) {
    for (const p of problems.slice(0, 20)) log(`  problem ${p}`);
    throw new Error(`copy_refused:${problems.length}`);
  }
  if (!execute) {
    log(`dry-run: would copy ${todo.filter((t) => !t.dstMeta).length}, verify existing ${todo.filter((t) => t.dstMeta).length}`);
    return { already, todo: todo.length, copied: 0, executed: false };
  }

  let copied = 0;
  let index = 0;
  const failures = [];
  async function worker() {
    while (index < todo.length) {
      const item = todo[index++];
      try {
        const bytes = await storage.download(from, item.path);
        if (bytes.length !== item.srcMeta.size) throw new Error("source_download_size_mismatch");
        if (etagMatchesBytes(bytes, item.srcMeta.etag) === false) throw new Error("source_download_etag_mismatch");
        let dstMeta = item.dstMeta;
        if (!dstMeta) {
          const contentType =
            direction === "restore" ? original.get(item.path) ?? uploadContentType(item.kind) : uploadContentType(item.kind);
          await storage.upload(to, item.path, bytes, contentType);
          dstMeta = (await storage.listFolder(to, folderOf(item.path))).find((m) => m.path === item.path);
          if (!dstMeta) throw new Error("destination_missing_after_upload");
          copied += 1;
        }
        if (dstMeta.size !== bytes.length) throw new Error("destination_size_mismatch");
        const proof = await proveEqual({ storage, from, to, path: item.path, srcBytes: bytes, dstMeta });
        if (!proof) throw new Error("destination_content_mismatch");
        recordVerified(stateDir, { to, path: item.path, size: bytes.length, ...proof, at: new Date().toISOString() });
      } catch (error) {
        failures.push(`${item.path}:${error.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  log(`copy done: copied=${copied} failures=${failures.length}`);
  if (failures.length) {
    for (const f of failures.slice(0, 20)) log(`  failure ${f}`);
    throw new Error(`copy_incomplete:${failures.length} (rerun copy to resume)`);
  }
  return { already, todo: todo.length, copied, executed: true };
}

function readOriginalTypes(stateDir) {
  const map = new Map();
  const file = stateFiles(stateDir).manifest;
  if (!existsSync(file)) return map;
  for (const o of JSON.parse(readFileSync(file, "utf8")).objects ?? []) {
    if (o.publicMeta?.mimetype) map.set(o.path, o.publicMeta.mimetype);
  }
  return map;
}

// --------------------------------------------------------------------------
/**
 * Every object is at the destination with the recorded size and proven-equal
 * content. `deep` re-downloads both sides (SHA-256) for objects not yet
 * proven in this state directory and still present at the source.
 */
/** @param {any} options */
export async function verify({ db, storage, stateDir, log, direction = "forward", deep = false, probe = undefined, probeSamples = 3 }) {
  const { from, to } = DIRECTIONS[direction];
  const { recordings, objects } = await loadManifest(db);
  const src = await listBucket(storage, from, objects);
  const dst = await listBucket(storage, to, objects);
  const verified = readVerified(stateDir);
  const failures = [];
  let proven = 0;
  let bytes = 0;
  for (const o of objects) {
    const d = dst.get(o.path);
    const s = src.get(o.path);
    const rec = verified.get(`${to}:${o.path}`);
    if (!d) { failures.push(`missing_destination:${o.path}`); continue; }
    bytes += d.size;
    if (s && s.size !== d.size) { failures.push(`size_mismatch:${o.path}`); continue; }
    if (rec && rec.size === d.size) { proven += 1; continue; }
    if (deep && s) {
      const a = sha256(await storage.download(from, o.path));
      const b = sha256(await storage.download(to, o.path));
      if (a === b) {
        recordVerified(stateDir, { to, path: o.path, size: d.size, method: "sha256", sha256: a, at: new Date().toISOString() });
        proven += 1;
        continue;
      }
      failures.push(`content_mismatch:${o.path}`);
      continue;
    }
    failures.push(`not_proven:${o.path}`);
  }
  const probes = [];
  if (probe && direction === "forward") {
    const wavs = recordings.slice(0, probeSamples);
    for (const r of wavs) {
      const result = await probe(r);
      probes.push(result);
      if (!result.ok) failures.push(`probe_failed:${r.id}:${result.detail}`);
    }
  }
  const result = { direction, objects: objects.length, destinationPresent: objects.filter((o) => dst.has(o.path)).length, proven, bytes, probes: probes.length, failures: failures.length };
  log(`verify ${JSON.stringify(result)}`);
  for (const f of failures.slice(0, 20)) log(`  failure ${f}`);
  if (objects.length !== EXPECTED_OBJECTS) failures.push(`object_count:${objects.length}`);
  return { ...result, ok: failures.length === 0, failureList: failures };
}

// --------------------------------------------------------------------------
/** @param {any} options */
export async function deletePublic({ db, storage, stateDir, log, execute = false, confirmPlayback = false, anonymousStatus = undefined, probe = undefined }) {
  const { recordings, objects } = await loadManifest(db);
  const notMoved = recordings.filter((r) => r.state !== "private");
  if (notMoved.length) throw new Error(`delete_refused_db_not_switched:${notMoved.length}`);
  const check = await verify({ db, storage, stateDir, log, probe });
  if (!check.ok) throw new Error(`delete_refused_verify_failed:${check.failures}`);
  if (!confirmPlayback) throw new Error("delete_refused_playback_not_confirmed");
  const present = await listBucket(storage, PUBLIC_BUCKET, objects);
  const paths = objects.map((o) => o.path).filter((p) => present.has(p));
  log(`delete-public: ${paths.length} of ${objects.length} originals still in ${PUBLIC_BUCKET}`);
  if (!execute) { log("dry-run: nothing deleted"); return { toDelete: paths.length, deleted: 0, executed: false }; }
  for (let i = 0; i < paths.length; i += 50) {
    await storage.remove(PUBLIC_BUCKET, paths.slice(i, i + 50));
  }
  const after = await listBucket(storage, PUBLIC_BUCKET, objects);
  const left = objects.filter((o) => after.has(o.path)).length;
  if (left) throw new Error(`delete_incomplete:${left} (rerun delete-public)`);
  let anonymous = null;
  if (anonymousStatus) {
    anonymous = await anonymousStatus(publicUrl(recordings[0].path));
    // The objects were stored with Cache-Control max-age=3600, so a CDN edge
    // may keep answering 200 for up to an hour. Report it; recheck later.
    if (anonymous === 200) log("WARNING public URL still answered 200 (CDN cache); recheck after 1 h");
  }
  log(`delete-public done: deleted=${paths.length} anonymousStatus=${anonymous}`);
  return { toDelete: paths.length, deleted: paths.length, executed: true, anonymous };
}
