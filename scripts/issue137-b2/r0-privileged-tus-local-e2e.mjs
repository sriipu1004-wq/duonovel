// #137: actual service_role TUS resumable upload to a disposable local
// Supabase Storage/GoTrue/Postgres. A successful PRIVATE upload is mandatory
// before considering any PUBLIC/R18 denial a security regression PASS.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION, "true");
assert.equal(process.env.R0_EPHEMERAL_CONFIRM, "local-only");
for (const key of ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_PASSWORD",
  "SUPABASE_ACCESS_TOKEN", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
  "S3_SECRET_ACCESS_KEY"]) {
  assert.equal(process.env[key], undefined, "hosted credentials forbidden");
}
const endpoint = new URL(process.env.R0_LOCAL_URL || "");
assert.equal(endpoint.href, "http://127.0.0.1:54321/");
const key = process.env.R0_SERVICE_KEY || "";
const anon = process.env.R0_ANON_KEY || "";
assert.ok(key.length > 30 && anon.length > 30 && key !== anon);
const service = createClient(endpoint.origin, key, {
  auth: {autoRefreshToken: false, persistSession: false, detectSessionInUrl: false}
});
const id = () => randomUUID();
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const wave = Buffer.alloc(64);
wave.write("RIFF", 0); wave.writeUInt32LE(56, 4); wave.write("WAVE", 8);
wave.write("fmt ", 12); wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(16000, 28);
wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
wave.write("data", 36); wave.writeUInt32LE(20, 40);
const changed = Buffer.from(wave);
changed.writeInt16LE(23, 44);
let positive = 0, negative = 0;
function yes(value, label) { assert.ok(value, label); positive++; }
function denied(value, label) { assert.ok(value, label); negative++; }
function good(result, label) { assert.equal(result.error, null, label); }

const tusHeaders = () => ({
  Authorization: "Bearer " + key,
  apikey: anon,
  "Tus-Resumable": "1.0.0",
});
const metadata = (bucket, object, mime) =>
  [["bucketName", bucket], ["objectName", object], ["contentType", mime]]
    .map(([name, value]) =>
      name + " " + Buffer.from(value, "utf8").toString("base64")).join(",");
async function openTus(bucket, object, data = wave, mime = "audio/wav", upsert = false) {
  assert.match(bucket, /^[a-z0-9-]+$/u);
  assert.match(object, /^(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(?:wav|webm|m4a|json)$/u);
  const response = await fetch(endpoint.origin + "/storage/v1/upload/resumable", {
    method: "POST", redirect: "error", cache: "no-store",
    headers: {
      ...tusHeaders(),
      "Upload-Length": String(data.length),
      "Upload-Metadata": metadata(bucket, object, mime),
      ...(upsert ? {"x-upsert":"true"} : {})
    },
    signal: AbortSignal.timeout(15000)
  });
  if (response.status >= 400) return {status: response.status, url: null};
  assert.equal(response.status, 201, "TUS creation must return 201");
  const rawLocation = response.headers.get("location");
  assert.ok(rawLocation, "authenticated TUS initiation must return Location");
  const url = new URL(rawLocation, endpoint.origin);
  assert.equal(url.origin, endpoint.origin, "never follow a nonlocal TUS Location");
  assert.ok(url.pathname.startsWith("/storage/v1/upload/resumable"),
    "only the expected local TUS path is permitted");
  return {status: response.status, url: url.href};
}
async function patchTus(url, bytes = wave) {
  assert.ok(url, "PATCH requires an authenticated TUS Location");
  const parsed = new URL(url);
  assert.equal(parsed.origin, endpoint.origin);
  assert.ok(parsed.pathname.startsWith("/storage/v1/upload/resumable"));
  const response = await fetch(parsed, {
    method: "PATCH", redirect: "error", cache: "no-store",
    headers: {...tusHeaders(), "Content-Type": "application/offset+octet-stream",
      "Upload-Offset": "0"},
    body: bytes, signal: AbortSignal.timeout(15000)
  });
  return response.status;
}
async function fullTus(bucket, object, bytes = wave, mime = "audio/wav", upsert = false) {
  const created = await openTus(bucket, object, bytes, mime, upsert);
  if (created.status >= 400) return created.status;
  return patchTus(created.url, bytes);
}
function isSuccessfulPatch(status) {return status === 204 || status === 200;}
async function bytesMatch(bucket, object, expected, label) {
  const result = await service.storage.from(bucket).download(object);
  good(result, label + " must be readable over REST");
  yes(sha(Buffer.from(await result.data.arrayBuffer())) === sha(expected), label);
}
async function notReadable(bucket, object, label) {
  const result = await service.storage.from(bucket).download(object);
  denied(Boolean(result.error), label);
}
const controlBucket = "r0-private-backup", controlPath = "tus-control/" + id() + ".wav";
const bucketInfo = await service.storage.getBucket(controlBucket);
good(bucketInfo, "private control bucket must exist");
yes(bucketInfo.data.public === false, "positive TUS control bucket must be PRIVATE");
const control = await fullTus(controlBucket, controlPath);
yes(isSuccessfulPatch(control), "authenticated local service_role TUS PRIVATE upload failed, status=" + control);
await bytesMatch(controlBucket, controlPath, wave, "TUS PRIVATE positive bytes SHA256");

const owner = await service.auth.admin.createUser({
  email: "issue137-tus-" + id() + "@example.invalid",
  password: "LOCAL-TUS-" + id() + "-Aa1!", email_confirm: true
});
good(owner, "disposable GoTrue owner");
async function createWork(rating) {
  const series = id(), episode = id();
  good(await service.from("series").insert({id: series,
    author_id: owner.data.user.id, publication_status: "public",
    recording_permission_mode: "open", content_rating: rating,
    content_warnings: rating === "r18" ? ["sexual_r18"] : []
  }), "seed local work");
  good(await service.from("episodes").insert({id: episode,
    series_id: series, episode_number: 1,
    posting_status: "posted", is_published: true
  }), "seed local episode");
  return {series, episode};
}
const restricted = await createWork("r18");
const r18 = "nemo/" + restricted.series + "/" + restricted.episode + "/tus-forbidden.wav";
denied((await fullTus("recording-audio", r18)) >= 400,
  "privileged resumable upload must deny new R18 PUBLIC audio");
await notReadable("recording-audio", r18, "denied R18 TUS PUBLIC object absent");
const privateR18 = "nemo/" + restricted.series + "/" + restricted.episode + "/tus-private.wav";
yes(isSuccessfulPatch(await fullTus("r18-recording-audio", privateR18)),
  "R18 PRIVATE TUS byte positive must succeed");
await bytesMatch("r18-recording-audio", privateR18, wave, "TUS PRIVATE R18 bytes intact");

const alt = "r0-tus-alternate-public";
good(await service.storage.createBucket(alt, {public: true}), "local alternate PUBLIC bucket");
const altPath = "misplaced/" + id() + ".wav";
denied((await fullTus(alt, altPath)) >= 400,
  "service_role TUS must not write audio to alternate PUBLIC bucket");
await notReadable(alt, altPath, "alternate PUBLIC TUS audio absent");

const general = await createWork("general");
const privateHuman = "human/" + general.series + "/" + general.episode +
  "/" + owner.data.user.id + "/session-tus/original.webm";
denied((await fullTus("recording-audio", privateHuman,
  wave, "audio/webm")) >= 400,
  "GENERAL published source does not allow PRIVATE Human origin on PUBLIC");
await notReadable("recording-audio", privateHuman, "PRIVATE Human TUS PUBLIC bytes absent");

const old = "nemo/" + general.series + "/" + general.episode + "/tus-original.wav";
yes(isSuccessfulPatch(await fullTus("recording-audio", old)),
  "GENERAL PUBLIC TUS audio positive required before revocation");
await bytesMatch("recording-audio", old, wave, "old PUBLIC TUS bytes intact");
const delayed = "nemo/" + general.series + "/" + general.episode + "/tus-delayed.wav";
const pending = await openTus("recording-audio", delayed, wave);
yes(pending.status === 201, "pre-withdrawal resumable upload can be initiated");
const overwriter = await openTus("recording-audio", old, changed, "audio/wav", true);
yes(overwriter.status === 201, "pre-withdrawal TUS overwrite can be initiated");
const withdrawn = await service.from("series").update({
  publication_status: "private", content_rating: "r18",
  content_warnings: ["sexual_r18"]
}).eq("id", general.series).select("id");
good(withdrawn, "emergency PRIVATE+R18 must remain available");
yes(withdrawn.data.length === 1, "emergency withdrawal committed");
denied((await patchTus(pending.url, wave)) >= 400,
  "TUS session minted while PUBLIC cannot finish new bytes after withdrawal");
denied((await patchTus(overwriter.url, changed)) >= 400,
  "TUS overwrite session minted before withdrawal cannot replace old bytes");
const late = "nemo/" + general.series + "/" + general.episode + "/tus-late.wav";
denied((await fullTus("recording-audio", late, changed)) >= 400,
  "no new TUS PUBLIC audio after withdrawal");
await notReadable("recording-audio", delayed, "preauthorized TUS bytes absent after withdrawal");
await notReadable("recording-audio", late, "post-withdrawal TUS bytes absent");
await bytesMatch("recording-audio", old, wave,
  "old PUBLIC bytes unchanged (still accessible; retirement remains HOLD)");
console.log("PASS: #137 REAL isolated service_role TUS " + positive +
  " positive / " + negative + " denied assertions; authenticated PRIVATE control, " +
  "R18/Public/Human refusal, session revocation and byte digests");
console.log("HOLD: backend orphaned bytes, hosted TUS parity, CDN/old PUBLIC origin, rights, restore unverified");
