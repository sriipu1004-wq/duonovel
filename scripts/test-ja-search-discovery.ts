import assert from "node:assert/strict";
import {
  buildJaSearchDiscoveryStructuredData,
  getJaSearchDiscoveryDefinition,
  type JaSearchDiscoverySlug,
} from "../src/lib/seo/jaSearchDiscovery";

// Characterization test: pins current behavior only (LT-002).

const slugs: JaSearchDiscoverySlug[] = [
  "english-novel-reader",
  "web-novel-language-learning",
  "pdf-bilingual-reader",
];

const facts = getJaSearchDiscoveryDefinition("english-novel-reader").config.facts ?? [];
assert.ok(facts.length > 0);

for (const slug of slugs) {
  const definition = getJaSearchDiscoveryDefinition(slug);
  assert.ok(definition, slug);
  assert.ok(definition.title.endsWith(" | LIB read"), slug);
  assert.ok(definition.description.length > 0, slug);

  const { config } = definition;
  // All pages share the same pricing/credit facts object.
  assert.equal(config.facts, facts, slug);
  assert.ok(config.faq.length >= 4, slug);
  assert.ok(config.steps.length >= 4, slug);

  // Internal links only.
  const hrefs = [
    config.primaryCta.href,
    config.secondaryCta?.href,
    ...config.related.map((item) => item.href),
  ].filter((href): href is string => typeof href === "string");
  for (const href of hrefs) {
    assert.ok(href.startsWith("/") && !href.startsWith("//"), `${slug} ${href}`);
  }

  // Related discovery pages point at the other two slugs, never at itself.
  const relatedSlugs = config.related
    .map((item) => item.href.slice(1))
    .filter((href) => (slugs as string[]).includes(href));
  assert.deepEqual(
    [...relatedSlugs].sort(),
    slugs.filter((other) => other !== slug).sort(),
    slug
  );

  assert.deepEqual(buildJaSearchDiscoveryStructuredData(slug), {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: definition.title,
    description: definition.description,
    url: `https://www.syosetu-libread.com/${slug}`,
    inLanguage: "ja",
    isPartOf: {
      "@type": "WebSite",
      name: "LIB read",
      url: "https://www.syosetu-libread.com/",
    },
  });
}

// Pricing facts as currently worded.
assert.deepEqual(
  facts.map((fact) => fact.label),
  ["Free", "Premium", "公開作品のAI翻訳解放", "クレジット", "Human translation"]
);
assert.ok(facts[1].value.includes("月額680円"));
assert.ok(facts[3].value.includes("5クレジット=300円"));
assert.ok(facts[3].value.includes("有効期間は150日"));

assert.equal(
  getJaSearchDiscoveryDefinition("english-novel-reader").config.primaryCta.href,
  "/search?source_language=en"
);

console.log("PASS: ja search discovery pages (definitions, internal links, related slugs, JSON-LD, pricing facts)");
