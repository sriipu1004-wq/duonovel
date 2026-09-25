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

const aiUsage = source("src/app/api/ai-usage/route.ts");
assert.equal(
  aiUsage.includes('console.error("[ai-usage-snapshot]", error)'),
  true,
  "AI usage failures should retain server-side diagnostics"
);
assert.equal(
  aiUsage.includes("message: error instanceof Error ? error.message"),
  false,
  "AI usage must not reflect provider/database error messages to the client"
);
assert.equal(
  aiUsage.includes('message: "利用回数を取得できませんでした。"'),
  true,
  "AI usage should return a stable generic client failure message"
);

console.log(
  "PASS: Child 65 follow-up authorization, privacy, input, ownership, and error-minimization guards are present"
);
