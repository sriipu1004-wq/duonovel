import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const wordExplanations = source("src/app/api/word-explanations/route.ts");
assert.equal(
  wordExplanations.includes("getPublicTranslationEntitlementState"),
  true,
  "word explanations must resolve the public translation entitlement before reading cached episode translation text"
);
assert.equal(
  wordExplanations.includes('entitlement.status !== "unlocked"'),
  true,
  "word explanations must reject public episode translation access until the target-language entitlement is unlocked"
);
const entitlementCheck = wordExplanations.indexOf(
  "getPublicTranslationEntitlementState({"
);
const episodeTranslationRead = wordExplanations.indexOf(
  '.from("episode_translations")'
);
assert.ok(
  entitlementCheck >= 0 &&
    episodeTranslationRead >= 0 &&
    entitlementCheck < episodeTranslationRead,
  "the entitlement check must happen before service-role reads episode translation segments"
);

for (const path of [
  "src/app/authors/[authorId]/page.tsx",
  "src/app/search/author/[authorId]/page.tsx",
]) {
  const value = source(path);
  assert.equal(
    value.includes('getSeriesPublicationStatus(item) === "public"'),
    true,
    `${path} must filter service-role author series reads to canonically public works`
  );
}

const authorPage = source("src/app/authors/[authorId]/page.tsx");
assert.equal(
  authorPage.includes('getSeriesPublicationStatus(row) === "public"'),
  true,
  "author narration metadata must not surface a nonpublic series fetched with service-role access"
);

const readerSearch = source("src/app/search/reader/[readerId]/page.tsx");
for (const required of [
  'getSeriesPublicationStatus(row) !== "public"',
  "!preference.showR18Content && isR18Series(row)",
  "!isEpisodePubliclyVisible(episode, new Date())",
  "!visibleEpisodeIds.has(recordingEpisodeId)",
]) {
  assert.equal(
    readerSearch.includes(required),
    true,
    `reader search must retain public/R18/episode isolation guard: ${required}`
  );
}

const humanPublish = source("src/app/api/recordings/human-publish/route.ts");
const humanPublishAuth = humanPublish.indexOf("await supabase.auth.getUser()");
const humanPublishMultipart = humanPublish.indexOf("await request.formData()");
assert.ok(
  humanPublishAuth >= 0 &&
    humanPublishMultipart >= 0 &&
    humanPublishAuth < humanPublishMultipart,
  "human-publish must authenticate before parsing multipart input"
);

const readPage = source("src/app/read/[seriesId]/[episodeNumber]/page.tsx");
assert.equal(
  readPage.includes("if (payload.r18Blocked) return null;"),
  true,
  "blocked R18 reader pages must not build or serialize the child reader payload"
);
const r18MetadataGuard = readPage.indexOf("if (payload.r18Blocked) {");
const metadataSeriesRead = readPage.indexOf("const { series, episode } = payload;");
assert.ok(
  r18MetadataGuard >= 0 &&
    metadataSeriesRead >= 0 &&
    r18MetadataGuard < metadataSeriesRead,
  "R18 metadata must be reduced to generic noindex metadata before title/summary/author fields are read"
);

const savePrivate = source("src/app/api/time-fit-stories/save-private/route.ts");
const savePrivateAuth = savePrivate.indexOf("const user = await requireSignedInUser()");
const savePrivateJson = savePrivate.indexOf("await request.json()");
assert.ok(
  savePrivateAuth >= 0 &&
    savePrivateJson >= 0 &&
    savePrivateAuth < savePrivateJson,
  "time-fit private save must authenticate before parsing the JSON body"
);
assert.equal(
  savePrivate.includes("payload.editorName"),
  false,
  "time-fit private save must not trust a client-supplied editor display name"
);
assert.equal(
  savePrivate.includes("readText(args.userEmail)"),
  false,
  "time-fit private save must not copy the account email into the public display-name fallback"
);
for (const required of [
  "MAX_REQUEST_BYTES",
  "STORY_ID_MAX_LENGTH",
  "TITLE_MAX_LENGTH",
  "SYNOPSIS_MAX_LENGTH",
  "BODY_MAX_LENGTH",
]) {
  assert.equal(
    savePrivate.includes(required),
    true,
    `time-fit private save must keep server-side input bound: ${required}`
  );
}
for (const forbidden of [
  "saveCountResult.error.message },",
  "error: lastSeriesError",
  "error: episodeResult.error?.message",
  "error: bookmarkResult.error.message",
]) {
  assert.equal(
    savePrivate.includes(forbidden),
    false,
    `time-fit private save must not return raw database errors: ${forbidden}`
  );
}

const timeFitPublish = source("src/app/api/time-fit-stories/publish/route.ts");
const timeFitPublishAuth = timeFitPublish.indexOf(
  "const user = await requireSignedInUser()"
);
const timeFitPublishJson = timeFitPublish.indexOf("await request.json()");
assert.ok(
  timeFitPublishAuth >= 0 &&
    timeFitPublishJson >= 0 &&
    timeFitPublishAuth < timeFitPublishJson,
  "time-fit publish must authenticate before parsing the JSON body"
);
for (const required of [
  "MAX_REQUEST_BYTES",
  "isUuid(seriesId)",
  '.eq("author_id", user.id)',
  '.eq("series_id", seriesId)',
]) {
  assert.equal(
    timeFitPublish.includes(required),
    true,
    `time-fit publish must retain server-side request/ownership guard: ${required}`
  );
}
for (const forbidden of [
  "seriesResult.error?.message",
  "episodeResult.error?.message",
  "aiSeriesResult.error.message",
  "publishCountResult.error.message",
  "seriesUpdate.error.message",
  "episodeUpdate.error.message",
]) {
  assert.equal(
    timeFitPublish.includes(forbidden),
    false,
    `time-fit publish must not return raw database errors: ${forbidden}`
  );
}

const translationStatus = source(
  "src/app/api/episode-translations/[episodeId]/route.ts"
);
assert.equal(
  translationStatus.includes("isUuid(episodeId)"),
  true,
  "translation status must reject malformed episode identifiers before database access"
);
assert.equal(
  translationStatus.includes("message: currentResult.error.message"),
  false,
  "translation status must not return the current-row storage error verbatim"
);
assert.equal(
  translationStatus.includes("message: olderReadyResult.error.message"),
  false,
  "translation status must not return stale-row storage errors verbatim"
);
assert.equal(
  translationStatus.includes('message: "対訳の状態を確認できません。"'),
  true,
  "translation status should return a stable generic storage failure message"
);

const generatedTranslation = source(
  "src/app/api/generated-story-translations/generate/route.ts"
);
const generatedRequestLimit = generatedTranslation.indexOf("requestTooLarge(request)");
const generatedJsonParse = generatedTranslation.indexOf("await request.json()");
assert.ok(
  generatedRequestLimit >= 0 &&
    generatedJsonParse >= 0 &&
    generatedRequestLimit < generatedJsonParse,
  "generated-story translation must reject oversized declared requests before JSON parsing"
);
for (const required of [
  "MAX_REQUEST_BYTES",
  "TITLE_MAX_LENGTH",
  'message: "対訳の状態を更新できません。"',
  'message: "対訳の準備に失敗しました。"',
  "message: clientMessage",
]) {
  assert.equal(
    generatedTranslation.includes(required),
    true,
    `generated-story translation must retain input/error-minimization guard: ${required}`
  );
}
for (const forbidden of [
  "message: staleUpdate.error.message",
  "message: reservationResult.error.message",
  "translationUpdate.error.message",
]) {
  assert.equal(
    generatedTranslation.includes(forbidden),
    false,
    `generated-story translation must not return raw provider/database errors: ${forbidden}`
  );
}

console.log(
  "PASS: Child 65 follow-up authorization, privacy, input, ownership, and error-minimization guards are present"
);
