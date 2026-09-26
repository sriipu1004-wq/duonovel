import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const generic = read("src/lib/translation/openAITranslation.ts");
assert.ok((generic.match(/store:\s*false/g) ?? []).length >= 2);
assert.equal(generic.includes("responseBody.error?.message"), false);

const publicTranslation = read("src/lib/translation/publicEpisodeTranslation.ts");
assert.ok(publicTranslation.includes("store: false"));
assert.equal(publicTranslation.includes("body.error?.message"), false);
assert.ok(publicTranslation.includes("PUBLIC_TRANSLATION_MAX_BATCH_SOURCE_CHARS = 3_000"));
assert.ok(publicTranslation.includes("PUBLIC_TRANSLATION_MAX_BATCH_SEGMENTS = 60"));

const payload = read("src/lib/translation/translationPayload.ts");
assert.ok(payload.includes("TRANSLATION_SEGMENT_VERSION = 3"));

const word = read("src/app/api/word-explanations/route.ts");
assert.ok(word.includes("isSeriesTranslationEligible(access.series)"));
assert.ok(word.includes('"translation_permission_closed"'));
const cacheIndex = word.indexOf("if (cached.data)");
const permissionIndex = word.indexOf("if (!resolved.aiGenerationAllowed)");
const reserveIndex = word.indexOf("const requestId = randomUUID()");
assert.ok(cacheIndex >= 0 && permissionIndex > cacheIndex && reserveIndex > permissionIndex);


const workspace = read("src/features/write/TranslationPermissionWorkspaceBridge.tsx");
for (const text of [
  "AI翻訳を許可",
  "Allow AI translation",
  "AI 번역 허용",
  "OpenAI API",
]) assert.ok(workspace.includes(text), "missing workspace copy: " + text);

const privacy = read("src/app/privacy/page.tsx");
assert.ok(privacy.includes("投稿作品のAI翻訳・単語解説"));
assert.ok(privacy.includes("store=false"));
assert.ok(privacy.includes("https://platform.openai.com/docs/guides/your-data"));

const faq = read("src/app/faq/page.tsx");
assert.ok(faq.includes("投稿作品はLIB readのAI学習に使われる？"));
assert.ok(faq.includes("公開Webページを外部クローラーが巡回することは別経路"));

const robots = read("src/app/robots.ts");
assert.ok(robots.includes('userAgent: "*"'));
for (const crawler of ["GPTBot", "Google-Extended", "ClaudeBot", "Bytespider"]) {
  assert.equal(robots.includes(crawler), false, "Child79 must not silently change crawler policy");
}

const audit = read("docs/ai-data-flow.md");
for (const text of [
  "Reviewed at: **2026-09-26**",
  "OpenAI Responses API",
  "account-specific status",
  "unverified",
  "Public Web crawlers are separate",
  "Human translation",
  "does not call OpenAI",
  "AI novel/story generation, AI story continuation",
]) assert.ok(audit.includes(text), "audit doc missing: " + text);

console.log("PASS: Child79 AI data-flow, retention minimization, permission boundary and transparency contracts");
