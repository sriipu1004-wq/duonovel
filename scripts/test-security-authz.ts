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
  authorPage.includes('row.publication_status === "public"'),
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

console.log(
  "PASS: Child 65 follow-up authorization and request-cost guards are present"
);
