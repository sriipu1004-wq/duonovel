import assert from "node:assert/strict";
import {
  buildSearchDiscoveryMetadata,
  buildSearchDiscoveryStructuredData,
  getSearchDiscoveryDefinition,
} from "../src/lib/seo/currentSearchDiscovery";
import {
  getSearchDiscoveryDefinition as getLegacyDefinition,
  type SearchDiscoverySlug,
} from "../src/lib/seo/searchDiscovery";

// Characterization test: pins current behavior only (LT-002).

const slugs: SearchDiscoverySlug[] = [
  "japanese-novel-reader",
  "learn-japanese-with-web-novels",
  "pdf-epub-bilingual-reader",
];
const locales = ["en", "ko"] as const;

for (const slug of slugs) {
  for (const locale of locales) {
    const label = `${slug}/${locale}`;
    const definition = getSearchDiscoveryDefinition(slug, locale);
    const legacy = getLegacyDefinition(slug, locale);
    const serialized = JSON.stringify(definition);

    // Retired "bilingual generation" wording is replaced everywhere.
    assert.equal(/bilingual generation/i.test(serialized), false, label);
    assert.equal(/대역 생성/.test(serialized), false, label);

    // Current facts replace legacy facts; current features are appended to legacy ones.
    assert.equal(definition.config.facts?.length, 7, label);
    assert.equal(definition.config.features.length, legacy.config.features.length + 4, label);

    const path = `/${locale}/${slug}`;
    const metadata = buildSearchDiscoveryMetadata(slug, locale);
    assert.equal(metadata.title, definition.title, label);
    assert.equal(metadata.description, definition.description, label);
    assert.equal(metadata.alternates?.canonical, path, label);
    assert.deepEqual(metadata.robots, { index: true, follow: true }, label);
    assert.deepEqual(
      metadata.openGraph,
      {
        type: "website",
        locale: locale === "en" ? "en_US" : "ko_KR",
        siteName: "LIB read",
        url: path,
        title: definition.title,
        description: definition.description,
        images: ["/opengraph-image"],
      },
      label
    );

    assert.deepEqual(
      buildSearchDiscoveryStructuredData(slug, locale),
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: definition.title,
        description: definition.description,
        url: `https://www.syosetu-libread.com${path}`,
        inLanguage: locale,
        isPartOf: {
          "@type": "WebSite",
          name: "LIB read",
          url: `https://www.syosetu-libread.com/${locale}`,
        },
      },
      label
    );
  }
}

// hreflang alternates: only the PDF page has a Japanese counterpart.
assert.deepEqual(buildSearchDiscoveryMetadata("pdf-epub-bilingual-reader", "en").alternates?.languages, {
  ja: "/pdf-bilingual-reader",
  en: "/en/pdf-epub-bilingual-reader",
  ko: "/ko/pdf-epub-bilingual-reader",
  "x-default": "/pdf-bilingual-reader",
});
assert.deepEqual(buildSearchDiscoveryMetadata("japanese-novel-reader", "ko").alternates?.languages, {
  en: "/en/japanese-novel-reader",
  ko: "/ko/japanese-novel-reader",
});

console.log("PASS: current search discovery (term replacement, facts/features, metadata, alternates, JSON-LD)");
