// Issue #137 PR-E: private media playback proxy (Human + PRIVATE AI narration).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canServeHumanRecordingAudio,
  canServePrivateAiNarration,
  canViewReaderSource,
  type ReaderSourceSnapshot,
} from "../src/lib/recording/privateMediaAccess";
import {
  isPrivateMediaProxyBucket,
  isSafePrivateMediaObjectPath,
  isValidSingleByteRange,
  PRIVATE_MEDIA_NO_STORE,
  streamPrivateMediaObject,
} from "../src/lib/recording/privateMediaStream";
import {
  buildPrivateAiNarrationPlaybackHref,
  isPrivateAiNarrationPathForEpisode,
  makePrivateAiNarrationReference,
  parsePrivateAiNarrationReference,
  PRIVATE_AI_NARRATION_BUCKET,
} from "../src/lib/recording/privateAiNarrationStorage";
import { recordingAudioPlaybackHref } from "../src/lib/recording/recordingAudioPlaybackHref";
import {
  listProjectedAiNarrationOptions,
  listProtectedAiRecordings,
} from "../src/lib/recording/protectedAiRecordingOptions";
import { projectReaderEpisodeRecordings } from "../src/lib/recording/readerEpisodeRecordingProjection";
import { buildHumanRecordingPlaybackHref } from "../src/lib/recording/humanRecordingStorage";
import {
  isAcceptedRecordingConsentVersion,
  RECORDING_GLOBAL_CONSENT_VERSION,
} from "../src/lib/recording/recordingConsent";

const SERIES = "11111111-1111-4111-8111-111111111111";
const EPISODE = "22222222-2222-4222-8222-222222222222";
const OTHER_EPISODE = "33333333-3333-4333-8333-333333333333";
const NARRATOR = "44444444-4444-4444-8444-444444444444";
const REC_AI = "55555555-5555-4555-8555-555555555555";
const REC_HUMAN = "66666666-6666-4666-8666-666666666666";
const REC_PUBLIC_AI = "77777777-7777-4777-8777-777777777777";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

// ---------------------------------------------------------------------------
// 1. Source visibility = Reader rules (publication, episode, owner, R18)
// ---------------------------------------------------------------------------
const publicSource: ReaderSourceSnapshot = {
  seriesPublic: true,
  episodePublic: true,
  episodeBelongsToSeries: true,
  viewerIsSeriesOwner: false,
  isR18: false,
  viewerShowsR18: false,
};
// Anonymous viewer (no owner, no R18 preference) on a public, non-R18 source.
assert.equal(canViewReaderSource(publicSource), true, "anonymous viewer may read a public source");
for (const [override, label] of [
  [{ seriesPublic: false }, "non-public series, not owner"],
  [{ episodePublic: false }, "non-public episode, not owner"],
  [{ episodeBelongsToSeries: false }, "episode of another series"],
  [{ isR18: true }, "R18 without confirmed preference (anonymous or not opted in)"],
] as const) {
  assert.equal(canViewReaderSource({ ...publicSource, ...override }), false, `reject ${label}`);
}
assert.equal(
  canViewReaderSource({ ...publicSource, seriesPublic: false, episodePublic: false, viewerIsSeriesOwner: true }),
  true,
  "series owner may read own private/draft source (as in the Reader)"
);
assert.equal(
  canViewReaderSource({ ...publicSource, viewerIsSeriesOwner: true, isR18: true, viewerShowsR18: false }),
  false,
  "owner is R18-gated too (Reader returns r18Blocked for owners)"
);
assert.equal(
  canViewReaderSource({ ...publicSource, isR18: true, viewerShowsR18: true }),
  true,
  "R18 opted-in viewer may read a public R18 source"
);

// ---------------------------------------------------------------------------
// 2. PRIVATE AI narration gate
// ---------------------------------------------------------------------------
const aiBase = { ...publicSource, recordingPublic: true };
assert.equal(canServePrivateAiNarration(aiBase), true, "published AI row, public source");
assert.equal(canServePrivateAiNarration({ ...aiBase, recordingPublic: false }), false,
  "unpublished AI row is never served, even to the owner");
assert.equal(canServePrivateAiNarration({ ...aiBase, recordingPublic: false, viewerIsSeriesOwner: true }), false,
  "unpublished AI row is not served to the owner either");
assert.equal(canServePrivateAiNarration({ ...aiBase, episodePublic: false }), false,
  "AI row on an unpublished episode: other viewer rejected");
assert.equal(canServePrivateAiNarration({ ...aiBase, episodePublic: false, viewerIsSeriesOwner: true }), true,
  "AI row on an unpublished episode: series owner allowed (Reader parity)");
assert.equal(canServePrivateAiNarration({ ...aiBase, isR18: true }), false, "AI R18 without preference");
assert.equal(canServePrivateAiNarration({ ...aiBase, isR18: true, viewerShowsR18: true }), true, "AI R18 opted-in");

// ---------------------------------------------------------------------------
// 3. Human narration gate (public + private rows)
// ---------------------------------------------------------------------------
const humanPublic = {
  ...publicSource,
  recordingPublic: true,
  viewerIsNarrator: false,
  currentPermissionOpen: true,
  currentConsent: true,
};
assert.equal(canServeHumanRecordingAudio(humanPublic), true, "public Human row, public source, anonymous");
for (const [override, label] of [
  [{ seriesPublic: false }, "series not public, viewer not owner"],
  [{ episodePublic: false }, "episode not public, viewer not owner"],
  [{ isR18: true }, "R18 without preference"],
  [{ currentPermissionOpen: false }, "recording permission closed"],
  [{ currentConsent: false }, "narrator consent not current"],
  [{ episodeBelongsToSeries: false }, "episode mismatch"],
] as const) {
  assert.equal(canServeHumanRecordingAudio({ ...humanPublic, ...override }), false, `Human public: reject ${label}`);
}
const humanPrivate = { ...humanPublic, recordingPublic: false, viewerIsNarrator: true };
assert.equal(canServeHumanRecordingAudio(humanPrivate), true, "private Human row: narrator allowed");
assert.equal(canServeHumanRecordingAudio({ ...humanPrivate, viewerIsNarrator: false }), false,
  "private Human row: other user (or anonymous) rejected");
assert.equal(canServeHumanRecordingAudio({ ...humanPrivate, viewerIsNarrator: false, viewerIsSeriesOwner: true }), false,
  "private Human row: series owner who is not the narrator rejected");
assert.equal(canServeHumanRecordingAudio({ ...humanPrivate, episodePublic: false }), false,
  "private Human row: narrator rejected once the source is unreadable for them");
assert.equal(canServeHumanRecordingAudio({ ...humanPrivate, isR18: true }), false,
  "private Human row: narrator R18-gated by own preference");
assert.equal(isAcceptedRecordingConsentVersion(RECORDING_GLOBAL_CONSENT_VERSION), true);
assert.equal(RECORDING_GLOBAL_CONSENT_VERSION, "2026-04-16");
for (const value of [null, undefined, "", "2026-04-15", "2027-01-01"]) {
  assert.equal(isAcceptedRecordingConsentVersion(value), false, `consent ${String(value)} rejected`);
}

// ---------------------------------------------------------------------------
// 4. Private AI references and path validation
// ---------------------------------------------------------------------------
const aiObject = `nemo/${SERIES}/${EPISODE}/take-1.wav`;
const aiRef = makePrivateAiNarrationReference(aiObject);
assert.equal(aiRef, `ai-narration-private:${aiObject}`);
assert.equal(PRIVATE_AI_NARRATION_BUCKET, "ai-narration-private");
assert.equal(parsePrivateAiNarrationReference(aiRef), aiObject);
assert.equal(parsePrivateAiNarrationReference(`ai-narration-private:aivis/${SERIES}/${EPISODE}/a.part2.wav`),
  `aivis/${SERIES}/${EPISODE}/a.part2.wav`);
for (const bad of [
  `r18-private:${aiObject}`, // #160 marker for the non-existent r18-recording-audio bucket
  aiObject,
  `ai-narration-private:human/${SERIES}/${EPISODE}/x.wav`,
  `ai-narration-private:nemo/${SERIES}/${EPISODE}/../x.wav`,
  `ai-narration-private:nemo/${SERIES}/${EPISODE}/x.wav?token=1`,
  `ai-narration-private:nemo/${SERIES}/${EPISODE}/x%2F.wav`,
  `ai-narration-private:nemo/${SERIES}/${EPISODE}/sub/x.wav`,
  `ai-narration-private:nemo/not-a-uuid/${EPISODE}/x.wav`,
  `ai-narration-private:nemo/${SERIES}/${EPISODE}/x.mp3`,
  "https://example.supabase.co/storage/v1/object/public/recording-audio/nemo/a/b/c.wav",
  null,
  42,
]) {
  assert.equal(parsePrivateAiNarrationReference(bad), null, `reject reference ${String(bad)}`);
}
assert.throws(() => makePrivateAiNarrationReference("nemo/../x.wav"), /invalid_private_ai_narration_object_path/);
assert.equal(isPrivateAiNarrationPathForEpisode(aiObject, SERIES, EPISODE), true);
assert.equal(isPrivateAiNarrationPathForEpisode(aiObject, SERIES.toUpperCase(), EPISODE), true);
assert.equal(isPrivateAiNarrationPathForEpisode(aiObject, SERIES, OTHER_EPISODE), false,
  "a row may not alias another episode's private bytes");

for (const good of [aiObject, `human/${SERIES}/${EPISODE}/${NARRATOR}/1-abc/playback-from-wav.m4a`]) {
  assert.equal(isSafePrivateMediaObjectPath(good), true, `safe path ${good}`);
}
for (const bad of ["", "/abs.wav", "a//b.wav", "a/../b.wav", "a/./b.wav", "a\\b.wav", "a/b.wav?x", "a/b.wav#x", "a/%2e%2e/b", "a b.wav", "dir/"]) {
  assert.equal(isSafePrivateMediaObjectPath(bad), false, `unsafe path ${JSON.stringify(bad)}`);
}
assert.equal(isPrivateMediaProxyBucket("ai-narration-private"), true);
assert.equal(isPrivateMediaProxyBucket("human-recording-audio"), true);
for (const bucket of ["recording-audio", "bgm-library", "illustrations", "r18-recording-audio", ""]) {
  assert.equal(isPrivateMediaProxyBucket(bucket), false, `proxy must refuse bucket ${bucket}`);
}
for (const range of [null, "bytes=0-", "bytes=0-99", "bytes=-500"]) {
  assert.equal(isValidSingleByteRange(range), true, `valid range ${range}`);
}
for (const range of ["bytes=0-1,5-9", "items=0-1", "bytes=a-b", "bytes="]) {
  assert.equal(isValidSingleByteRange(range), false, `invalid range ${range}`);
}

// ---------------------------------------------------------------------------
// 5. Existing PUBLIC recordings keep their URL; private ones become proxy hrefs
// ---------------------------------------------------------------------------
const publicUrl =
  "https://abc.supabase.co/storage/v1/object/public/recording-audio/nemo/s/e/take.wav";
assert.equal(recordingAudioPlaybackHref(REC_PUBLIC_AI, publicUrl), publicUrl,
  "public recording-audio URL is returned unchanged");
assert.equal(recordingAudioPlaybackHref(REC_PUBLIC_AI, `  ${publicUrl}  `), publicUrl);
assert.equal(recordingAudioPlaybackHref(REC_AI, aiRef), `/api/recordings/ai-audio/${REC_AI}`);
assert.equal(buildPrivateAiNarrationPlaybackHref(REC_AI), `/api/recordings/ai-audio/${REC_AI}`);
assert.equal(recordingAudioPlaybackHref("not-a-uuid", aiRef), "", "private ref without valid id is dropped");
assert.equal(recordingAudioPlaybackHref(REC_AI, "ai-narration-private:../x.wav"), "",
  "malformed private ref never leaks as a raw path");
assert.equal(recordingAudioPlaybackHref(REC_AI, null), "");

// ---------------------------------------------------------------------------
// 6. Reader projection: Human + PRIVATE AI only, no raw private path
// ---------------------------------------------------------------------------
const humanPath = `human/${SERIES}/${EPISODE}/${NARRATOR}/1-abc/playback-from-wav.m4a`;
const rows = [
  { id: REC_HUMAN, episode_id: EPISODE, reader_id: NARRATOR, reader_name: "N", is_public: true, voice_model_id: null, audio_storage_path: humanPath },
  { id: REC_AI, episode_id: EPISODE, reader_id: null, reader_name: "AI声", is_public: true, voice_model_id: null, audio_storage_path: aiRef },
  { id: REC_PUBLIC_AI, episode_id: EPISODE, reader_id: null, reader_name: "公開AI", is_public: true, voice_model_id: "vm", audio_storage_path: publicUrl },
  { id: "88888888-8888-4888-8888-888888888888", episode_id: EPISODE, reader_id: null, reader_name: "非公開AI", is_public: false, voice_model_id: null, audio_storage_path: makePrivateAiNarrationReference(`aivis/${SERIES}/${EPISODE}/b.wav`) },
  { id: "99999999-9999-4999-8999-999999999999", episode_id: OTHER_EPISODE, reader_id: null, reader_name: "他話", is_public: true, voice_model_id: null, audio_storage_path: makePrivateAiNarrationReference(`aivis/${SERIES}/${OTHER_EPISODE}/b.wav`) },
];
const projected = projectReaderEpisodeRecordings(rows, EPISODE);
assert.deepEqual(projected.map((r) => r.id), [REC_HUMAN, REC_AI],
  "projection keeps published Human + published PRIVATE AI of this episode only (public AI rows were never in the Reader payload)");
assert.equal(projected[0].audio_storage_path, buildHumanRecordingPlaybackHref(REC_HUMAN));
assert.equal(projected[1].audio_storage_path, `/api/recordings/ai-audio/${REC_AI}`);
assert.equal(JSON.stringify(projected).includes("ai-narration-private:"), false,
  "no raw private AI reference reaches the Reader payload");
assert.equal(JSON.stringify(projected).includes("human/"), false,
  "no raw Human storage path reaches the Reader payload");
const readerAi = listProjectedAiNarrationOptions(projected, EPISODE);
assert.deepEqual(readerAi.map((o) => [o.recordingId, o.audioUrl, o.name]),
  [[REC_AI, `/api/recordings/ai-audio/${REC_AI}`, "AI声"]]);
assert.equal(listProjectedAiNarrationOptions([{ ...projected[1], audio_storage_path: publicUrl }], EPISODE).length, 0,
  "Reader AI player accepts only the exact proxy href");
assert.equal(listProtectedAiRecordings(rows, new Set([EPISODE])).length, 1,
  "raw-row lister keeps only the published private AI row of the episode");

// ---------------------------------------------------------------------------
// 7. Byte proxy behavior (fake upstream; no network)
// ---------------------------------------------------------------------------
type Call = { url: string; init: RequestInit };
function fakeFetch(response: () => Response, calls: Call[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response();
  }) as typeof fetch;
}
const ENV = { endpoint: "https://proj.supabase.co/", serviceKey: "service-key-for-test" };

async function checkStream() {
  const calls: Call[] = [];
  // plain GET -> 200
  let res = await streamPrivateMediaObject({
    request: new Request("https://app.test/api/recordings/ai-audio/x"),
    bucket: "ai-narration-private",
    objectPath: aiObject,
    ...ENV,
    fetchImpl: fakeFetch(() => new Response("RIFF", { status: 200, headers: { "content-type": "audio/wav", "content-length": "4" } }), calls),
  });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "RIFF");
  assert.equal(res.headers.get("cache-control"), PRIVATE_MEDIA_NO_STORE);
  assert.equal(res.headers.get("content-type"), "audio/wav");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("location"), null, "never a redirect to a bearer URL");
  assert.equal(calls[0].url,
    `https://proj.supabase.co/storage/v1/object/authenticated/ai-narration-private/${aiObject}`);
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.cache, "no-store");
  const sentHeaders = calls[0].init.headers as Record<string, string>;
  assert.equal(sentHeaders.Authorization, "Bearer service-key-for-test");
  assert.equal("Range" in sentHeaders, false);
  for (const [name, value] of res.headers) {
    assert.equal(value.includes("service-key-for-test"), false, `credential leaked in ${name}`);
  }

  // Range -> 206 pass-through
  calls.length = 0;
  res = await streamPrivateMediaObject({
    request: new Request("https://app.test/x", { headers: { range: "bytes=0-1" } }),
    bucket: "human-recording-audio",
    objectPath: humanPath,
    ...ENV,
    fetchImpl: fakeFetch(() => new Response("RI", { status: 206, headers: { "content-range": "bytes 0-1/4" } }), calls),
  });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get("content-range"), "bytes 0-1/4");
  assert.equal((calls[0].init.headers as Record<string, string>).Range, "bytes=0-1");

  // Range answered with a full 200 -> 502 (no silent full download)
  res = await streamPrivateMediaObject({
    request: new Request("https://app.test/x", { headers: { range: "bytes=0-1" } }),
    bucket: "ai-narration-private", objectPath: aiObject, ...ENV,
    fetchImpl: fakeFetch(() => new Response("RIFF", { status: 200 }), []),
  });
  assert.equal(res.status, 502);
  // Unsolicited 206 -> 502
  res = await streamPrivateMediaObject({
    request: new Request("https://app.test/x"),
    bucket: "ai-narration-private", objectPath: aiObject, ...ENV,
    fetchImpl: fakeFetch(() => new Response("RI", { status: 206, headers: { "content-range": "bytes 0-1/4" } }), []),
  });
  assert.equal(res.status, 502);
  // Upstream missing -> 404; upstream 416 -> 416; network error -> 503
  res = await streamPrivateMediaObject({
    request: new Request("https://app.test/x"),
    bucket: "ai-narration-private", objectPath: aiObject, ...ENV,
    fetchImpl: fakeFetch(() => new Response("{}", { status: 400 }), []),
  });
  assert.equal(res.status, 404);
  res = await streamPrivateMediaObject({
    request: new Request("https://app.test/x", { headers: { range: "bytes=999-" } }),
    bucket: "ai-narration-private", objectPath: aiObject, ...ENV,
    fetchImpl: fakeFetch(() => new Response(null, { status: 416 }), []),
  });
  assert.equal(res.status, 416);
  res = await streamPrivateMediaObject({
    request: new Request("https://app.test/x"),
    bucket: "ai-narration-private", objectPath: aiObject, ...ENV,
    fetchImpl: (async () => { throw new TypeError("redirect"); }) as typeof fetch,
  });
  assert.equal(res.status, 503);

  // Refusals before any upstream call
  const never: Call[] = [];
  const neverFetch = fakeFetch(() => new Response("x"), never);
  for (const [bucket, objectPath, headers, status] of [
    ["recording-audio", aiObject, {}, 404],
    ["r18-recording-audio", aiObject, {}, 404],
    ["ai-narration-private", "nemo/../secret.wav", {}, 404],
    ["ai-narration-private", "/nemo/x.wav", {}, 404],
    ["ai-narration-private", aiObject, { range: "bytes=0-1,4-5" }, 416],
  ] as const) {
    res = await streamPrivateMediaObject({
      request: new Request("https://app.test/x", { headers }),
      bucket, objectPath, ...ENV, fetchImpl: neverFetch,
    });
    assert.equal(res.status, status, `refuse ${bucket} ${objectPath}`);
  }
  res = await streamPrivateMediaObject({
    request: new Request("https://app.test/x"),
    bucket: "ai-narration-private", objectPath: aiObject,
    endpoint: undefined, serviceKey: undefined, fetchImpl: neverFetch,
  });
  assert.equal(res.status, 503, "missing server credentials fail closed");
  assert.equal(never.length, 0, "refused requests never reach Storage");
}

// ---------------------------------------------------------------------------
// 8. Route wiring (source-level): routes call the gates before streaming and
//    never mint signed URLs / redirects.
// ---------------------------------------------------------------------------
function checkRouteWiring() {
  const human = source("src/app/api/recordings/human-audio/[recordingId]/route.ts");
  const ai = source("src/app/api/recordings/ai-audio/[recordingId]/route.ts");
  for (const [label, text, required] of [
    ["human", human, [
      "isHumanRecordingRow(recordingData)",
      "loadPrivateMediaSourceContext(",
      "canServeHumanRecordingAudio({",
      "isAcceptedRecordingConsentVersion(",
      "playback-from-[a-z0-9]+[.]m4a$",
      "streamAuthorizedPrivateRecording(",
    ]],
    ["ai", ai, [
      "parsePrivateAiNarrationReference(",
      "isPrivateAiNarrationPathForEpisode(objectPath, seriesId, episodeId)",
      "loadPrivateMediaSourceContext(",
      "canServePrivateAiNarration({",
      "PRIVATE_AI_NARRATION_BUCKET",
      "streamAuthorizedPrivateRecording(",
    ]],
  ] as const) {
    for (const needle of required) {
      assert.equal(text.includes(needle), true, `${label} route must contain ${needle}`);
    }
    for (const forbidden of ["createSignedUrl", "NextResponse.redirect", "r18-recording-audio", "r18-private:"]) {
      assert.equal(text.includes(forbidden), false, `${label} route must not contain ${forbidden}`);
    }
    assert.ok(text.indexOf("canServe") < text.lastIndexOf("streamAuthorizedPrivateRecording("),
      `${label} route authorizes before streaming`);
  }
  const access = source("src/lib/recording/privateMediaSourceAccess.ts");
  for (const needle of [
    'getSeriesPublicationStatus(series) === "public"',
    "isEpisodePubliclyVisible(episode)",
    "isR18Series(series)",
    "getCurrentR18ViewerPreference()",
    "series.author_id",
  ]) {
    assert.equal(access.includes(needle), true, `source access must reuse Reader predicate ${needle}`);
  }
  const reader = source("src/lib/publicRead.ts");
  for (const needle of ['getSeriesPublicationStatus(series) === "public"', "isEpisodePubliclyVisible(episode)", "series.author_id"]) {
    assert.equal(reader.includes(needle), true, `Reader still uses ${needle} (parity anchor)`);
  }
  const proxy = source("src/lib/recording/privateMediaProxy.ts");
  assert.equal(proxy.startsWith('import "server-only";'), true, "credential wrapper is server-only");
}

async function main() {
  await checkStream();
  checkRouteWiring();
  console.log("PASS: private media playback proxy (Reader-parity gates, Human/AI paths, public URL passthrough, byte proxy)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
