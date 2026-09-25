import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const removedPaths = [
  "src/app/generate/page.tsx",
  "src/app/generate/TimeFitStoryGeneratorClient.tsx",
  "src/app/api/time-fit-stories/generate/route.ts",
  "src/app/api/time-fit-stories/continue/route.ts",
  "src/app/api/time-fit-stories/publish/route.ts",
  "src/app/api/time-fit-stories/save-private/route.ts",
  "src/app/api/generated-story-translations/generate/route.ts",
  "src/app/read/generated/[storyId]/page.tsx",
  "src/features/generation/ContinueStoryAction.tsx",
  "src/features/generation/PromptTagSuggestions.tsx",
  "src/features/playback/GeneratedStoryReaderShell.tsx",
];
for (const path of removedPaths) {
  assert.equal(existsSync(path), false, path + " must stay removed");
}

const activeCopyFiles = [
  "src/components/layout/AppHeader.tsx",
  "src/app/PublicTopPageLegacy.tsx",
  "src/app/sitemap.ts",
  "src/app/subscription/page.tsx",
  "src/i18n/dictionaries/common.ts",
  "src/i18n/dictionaries/home.ts",
  "src/i18n/dictionaries/subscription.ts",
  "src/app/guide/page.tsx",
  "src/app/faq/page.tsx",
  "src/app/status/page.tsx",
  "src/app/terms/page.tsx",
];
for (const path of activeCopyFiles) {
  const source = read(path);
  for (const marker of ["/generate", "AI物語生成", "AI story generation", "AI 이야기 생성"]) {
    assert.equal(source.includes(marker), false, path + " still exposes " + marker);
  }
}

const reader = read("src/app/read/[seriesId]/[episodeNumber]/page.tsx");
assert.ok(reader.includes('settings?.source === "time_fit_ai_story"'));
assert.ok(reader.includes("aiGeneratedAttribution"));
assert.equal(reader.includes("ContinueStoryAction"), false);

const workspace = read("src/app/write/series/[seriesId]/page.tsx");
assert.ok(workspace.includes('settings?.source === "time_fit_ai_story"'));
assert.equal(workspace.includes("ContinueStoryAction"), false);

assert.ok(existsSync("src/app/api/episode-translations/generate/route.ts"));
assert.ok(existsSync("src/app/api/library/translations/generate/route.ts"));
assert.ok(existsSync("src/app/api/word-explanations/route.ts"));

console.log("PASS: AI story generation surfaces removed while historical provenance and reading-support AI remain");
