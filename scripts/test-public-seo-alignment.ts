import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const home = read("src/i18n/dictionaries/home.ts");
const help = read("src/i18n/dictionaries/help.ts");
const faq = read("src/app/faq/page.tsx");
const guide = read("src/app/guide/page.tsx");
const jaSeo = read("src/lib/seo/jaSearchDiscovery.ts");
const currentSeo = read("src/lib/seo/currentSearchDiscovery.ts");
const legacySeo = read("src/lib/seo/searchDiscovery.ts");
const subscription = read("src/i18n/dictionaries/subscription.ts");
const credits = read("src/app/credits/page.tsx");
const readme = read("README.md");
const robots = read("src/app/robots.ts");
const sitemap = read("src/app/sitemap.ts");

for (const source of [home, help, faq, guide, jaSeo, currentSeo]) {
  assert.ok(source.includes("Human translation"), "public product copy must distinguish Human translation");
}

assert.equal(jaSeo.includes("read_language"), false, "retired read_language must not return in Japanese SEO links");
assert.equal(currentSeo.includes("read_language"), false, "retired read_language must not return in localized SEO wrapper");
assert.equal(legacySeo.includes("read_language"), false, "retired read_language must not return in SEO source definitions");

assert.ok(jaSeo.includes("/search?source_language=en"));
assert.ok(jaSeo.includes("翻訳先言語はReaderで選"));
assert.ok(help.includes("Search filters the source language"));
assert.ok(help.includes("검색에서는 공개 작품의 원문 언어"));

assert.ok(home.includes("AI翻訳とHuman translationを分離"));
assert.ok(home.includes("AI and Human translation stay separate"));
assert.ok(home.includes("AI 번역과 Human translation 분리"));

assert.ok(faq.includes("Zero Data Retention"));
assert.ok(faq.includes("Modified Abuse Monitoring"));
assert.ok(faq.includes("最大30日"));
assert.ok(faq.includes("Officialであること自体はPublic Domainの根拠ではありません"));

assert.ok(guide.includes("Original・Bilingual・Translation only"));
assert.ok(guide.includes("Human translationは無料で読め"));
assert.ok(guide.includes("5クレジット=300円"));
assert.ok(guide.includes("8クレジット=450円"));
assert.ok(guide.includes("12クレジット=600円"));
assert.ok(guide.includes("150日"));

assert.ok(subscription.includes("公開作品のAI翻訳解放"));
assert.ok(subscription.includes("Public AI translation unlocks"));
assert.ok(subscription.includes("공개 작품 AI 번역 잠금 해제"));
assert.ok(credits.includes("Human translationにはクレジットを使いません"));
assert.ok(credits.includes("Human translation does not use credits"));

assert.ok(readme.startsWith("# LIB read"));
assert.equal(readme.includes("create-next-app"), false);
assert.ok(readme.includes("First-party AI novel/story generation is retired"));
assert.ok(readme.includes("Human translation does not call OpenAI"));

assert.ok(robots.includes('userAgent: "*"'));
assert.equal(/GPTBot|ClaudeBot|Google-Extended|CCBot/.test(robots), false, "Child81 must not introduce crawler-specific policy changes");
assert.ok(sitemap.includes('pushLocalizedEntries(entries, "/"'));
assert.ok(sitemap.includes('pushPdfReaderEntries(entries)'));

console.log("PASS: Child81 public copy, SEO model, AI/Human provenance, pricing, README, and crawler-policy contracts");
