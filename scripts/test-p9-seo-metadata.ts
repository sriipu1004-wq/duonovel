/**
 * P9 SEO metadata regression (owner decisions 2026-11-15:
 * 「原作者を作者にする」「元のページにまとめる」).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLocalizedWorkMetadataText,
  buildReaderJsonLd,
  buildReaderMetadataTitle,
  episodeLastModifiedValue,
  isWorkSummaryPlaceholder,
  JA_WORK_SUMMARY_FALLBACK,
  readerCanonicalLocale,
  readerCanonicalPath,
  resolvePublicWorkAttribution,
  serializeJsonLd,
  stripAuthorSuffixFromTitle,
} from "../src/lib/seo/publicWorkSeo";
import { buildSitemapEntries } from "../src/lib/sitemap/buildSitemapEntries";
import { loadSitemapEpisodeDatesSafe } from "../src/lib/sitemap/loadSitemapEpisodeDates";
import type { PublicBaseWorkCard } from "../src/lib/publicWorks";

const SITE = "https://www.syosetu-libread.com";
const PD_SERIES = "a173c008-3e53-4126-927b-366e44a69b48";
const USER_SERIES = "11111111-2222-4333-8444-555555555555";

// 1. Reader title must not repeat the work title.
assert.equal(
  buildReaderMetadataTitle("修道院の秋・南部修太郎", "修道院の秋・南部修太郎 — Part 1"),
  "修道院の秋・南部修太郎 — Part 1 | LIB read"
);
assert.equal(buildReaderMetadataTitle("作品", "作品"), "作品 | LIB read");
assert.equal(buildReaderMetadataTitle("作品", "第1話 はじまり"), "作品 第1話 はじまり | LIB read");
assert.equal(buildReaderMetadataTitle("Work", "Episode 1"), "Work Episode 1 | LIB read");
assert.equal(buildReaderMetadataTitle("작품", "1화"), "작품 1화 | LIB read");

// 2. Attribution: Public Domain -> original author + publisher; user works unchanged.
assert.deepEqual(
  resolvePublicWorkAttribution({
    publicDomainOriginalAuthor: "南部修太郎",
    accountAuthorName: "LIB read Official",
  }),
  { authorName: "南部修太郎", publisherName: "LIB read Official", isPublicDomain: true }
);
assert.deepEqual(
  resolvePublicWorkAttribution({ publicDomainOriginalAuthor: null, accountAuthorName: "投稿者A" }),
  { authorName: "投稿者A", publisherName: null, isPublicDomain: false }
);
assert.equal(stripAuthorSuffixFromTitle("修道院の秋・南部修太郎", "南部修太郎"), "修道院の秋");
assert.equal(stripAuthorSuffixFromTitle("南部修太郎", "南部修太郎"), "南部修太郎");
assert.equal(stripAuthorSuffixFromTitle("羅生門", "芥川龍之介"), "羅生門");

// 3. /en and /ko Work metadata are in the UI language; no Japanese placeholder.
assert.ok(isWorkSummaryPlaceholder(JA_WORK_SUMMARY_FALLBACK));
assert.ok(isWorkSummaryPlaceholder("  "));
assert.equal(isWorkSummaryPlaceholder("本物のあらすじ"), false);
const en = buildLocalizedWorkMetadataText({
  locale: "en",
  title: "修道院の秋・南部修太郎",
  summary: JA_WORK_SUMMARY_FALLBACK,
  authorName: "南部修太郎",
  isPublicDomain: true,
  sourceLanguage: "ja",
  sourceProvider: "Aozora Bunko",
});
assert.equal(en.title, "修道院の秋 by 南部修太郎 — Read online | LIB read");
assert.equal(en.description.includes(JA_WORK_SUMMARY_FALLBACK), false);
assert.ok(en.description.startsWith('Read "修道院の秋" by 南部修太郎 online'));
assert.ok(en.description.includes("Original author: 南部修太郎."));
assert.ok(en.description.includes("Original language: Japanese."));
assert.ok(en.description.length <= 160);
const ko = buildLocalizedWorkMetadataText({
  locale: "ko",
  title: "修道院の秋・南部修太郎",
  summary: JA_WORK_SUMMARY_FALLBACK,
  authorName: "南部修太郎",
  isPublicDomain: true,
  sourceLanguage: "ja",
  sourceProvider: "Aozora Bunko",
});
assert.equal(ko.title, "修道院の秋 - 南部修太郎 | 온라인으로 읽기 | LIB read");
assert.equal(ko.description.includes(JA_WORK_SUMMARY_FALLBACK), false);
assert.ok(ko.description.includes("원저자: 南部修太郎."));
assert.ok(ko.description.includes("원문 언어: 일본어."));
const enUser = buildLocalizedWorkMetadataText({
  locale: "en",
  title: "My Story",
  summary: "A real synopsis.",
  authorName: "Writer",
  isPublicDomain: false,
  sourceLanguage: "en",
  sourceProvider: null,
});
assert.equal(enUser.title, "My Story — Read online | LIB read");
assert.ok(enUser.description.startsWith("A real synopsis. Author: Writer."));

// 4. Reader canonical = source-language copy.
assert.equal(readerCanonicalLocale("ja"), "ja");
assert.equal(readerCanonicalLocale("en"), "en");
assert.equal(readerCanonicalLocale("ko"), "ko");
assert.equal(readerCanonicalLocale("zh-Hans"), "ja");
assert.equal(readerCanonicalLocale(null), "ja");
assert.equal(readerCanonicalPath(PD_SERIES, 1, "ja"), `/read/${PD_SERIES}/1`);
assert.equal(readerCanonicalPath(USER_SERIES, 2, "en"), `/en/read/${USER_SERIES}/2`);
assert.equal(readerCanonicalPath(USER_SERIES, 3, "ko"), `/ko/read/${USER_SERIES}/3`);

// 5. Reader JSON-LD: Chapter, isPartOf, original author, publisher.
const pdLd = buildReaderJsonLd({
  seriesId: PD_SERIES,
  seriesTitle: "修道院の秋・南部修太郎",
  episodeTitle: "修道院の秋・南部修太郎 — Part 1",
  episodeNumber: 1,
  sourceLanguage: "ja",
  attribution: resolvePublicWorkAttribution({
    publicDomainOriginalAuthor: "南部修太郎",
    accountAuthorName: "LIB read Official",
  }),
  isShortStory: false,
  publicDomainSourceUrl: "https://www.aozora.gr.jp/cards/000048/card4386.html",
  publicDomainFirstPublicationYear: 1916,
});
assert.equal(pdLd["@type"], "Chapter");
assert.equal(pdLd.name, "修道院の秋・南部修太郎 — Part 1");
assert.equal(pdLd.url, `${SITE}/read/${PD_SERIES}/1`);
assert.deepEqual(pdLd.author, { "@type": "Person", name: "南部修太郎" });
assert.deepEqual(pdLd.publisher, { "@type": "Organization", name: "LIB read Official" });
assert.deepEqual(pdLd.isPartOf, {
  "@type": "CreativeWork",
  name: "修道院の秋・南部修太郎",
  url: `${SITE}/works/${PD_SERIES}`,
  author: { "@type": "Person", name: "南部修太郎" },
  datePublished: "1916",
});
const userLd = buildReaderJsonLd({
  seriesId: USER_SERIES,
  seriesTitle: "Short",
  episodeTitle: "Short",
  episodeNumber: 1,
  sourceLanguage: "en",
  attribution: resolvePublicWorkAttribution({ publicDomainOriginalAuthor: null, accountAuthorName: "Writer" }),
  isShortStory: true,
});
assert.equal("publisher" in userLd, false);
assert.equal("url" in (userLd.isPartOf as Record<string, unknown>), false);
assert.equal(serializeJsonLd({ a: "</script>" }).includes("</script>"), false);

// 6. Episode lastmod uses the later of posted_at / last_edited_at.
assert.equal(
  episodeLastModifiedValue({ posted_at: "2026-09-22T00:00:00Z", last_edited_at: "2026-11-01T00:00:00Z" }),
  Date.parse("2026-11-01T00:00:00Z")
);
assert.equal(episodeLastModifiedValue({ posted_at: null, last_edited_at: null }), 0);

// 7. Sitemap: Reader only in the source-language locale; Work in 3 locales.
function card(overrides: Partial<PublicBaseWorkCard>): PublicBaseWorkCard {
  return {
    seriesId: PD_SERIES,
    title: "t",
    originalTitle: null,
    summary: "",
    authorName: "a",
    authorId: null,
    episodeCount: 2,
    firstEpisodeNumber: 1,
    latestPostedLabel: "",
    latestPostedAtValue: Date.parse("2026-09-22T00:00:00Z"),
    earliestPublicAtValue: 0,
    createdAtValue: 0,
    tags: [],
    genres: [],
    contentRating: "general",
    contentLanguage: "ja",
    sourceLanguage: "ja",
    translationEligible: true,
    isShortStory: false,
    publicEpisodeNumbers: [1, 2, 2],
    ...overrides,
  } as PublicBaseWorkCard;
}
const entries = buildSitemapEntries(
  [card({}), card({ seriesId: USER_SERIES, sourceLanguage: "en", contentLanguage: "en", publicEpisodeNumbers: [1], isShortStory: true })],
  new Map([[PD_SERIES, new Map([[2, Date.parse("2026-11-10T00:00:00Z")]])]])
);
const urls = entries.map((entry) => entry.url);
assert.equal(urls.some((url) => /\/(en|ko)\/read\//.test(url) && url.includes(PD_SERIES)), false,
  "ja-source Reader pages must not list /en/read or /ko/read copies");
assert.ok(urls.includes(`${SITE}/read/${PD_SERIES}/1`));
assert.ok(urls.includes(`${SITE}/read/${PD_SERIES}/2`));
assert.equal(urls.filter((url) => url === `${SITE}/read/${PD_SERIES}/2`).length, 1);
assert.ok(urls.includes(`${SITE}/en/read/${USER_SERIES}/1`));
assert.equal(urls.includes(`${SITE}/read/${USER_SERIES}/1`), false);
for (const locale of ["", "/en", "/ko"]) {
  assert.ok(urls.includes(`${SITE}${locale}/works/${PD_SERIES}`), `Work page kept for ${locale || "ja"}`);
}
const workEntry = entries.find((entry) => entry.url === `${SITE}/works/${PD_SERIES}`);
assert.deepEqual(Object.keys(workEntry?.alternates?.languages ?? {}).sort(), ["en", "ja", "ko", "x-default"]);
assert.equal((workEntry?.lastModified as Date).toISOString(), "2026-11-10T00:00:00.000Z");
const ep1 = entries.find((entry) => entry.url === `${SITE}/read/${PD_SERIES}/1`);
const ep2 = entries.find((entry) => entry.url === `${SITE}/read/${PD_SERIES}/2`);
assert.equal((ep1?.lastModified as Date).toISOString(), "2026-09-22T00:00:00.000Z");
assert.equal((ep2?.lastModified as Date).toISOString(), "2026-11-10T00:00:00.000Z");
assert.equal(ep1?.alternates, undefined, "non-canonical Reader copies must not be offered as hreflang alternates");
assert.ok(entries.length < 50000, "a single sitemap file must stay under the 50,000 URL limit");

// 8. Source contracts: R18/private gates and wiring.
const read = (path: string) => readFileSync(path, "utf8");
const sitemapSource = read("src/app/sitemap.ts");
const sitemapBuilderSource = read("src/lib/sitemap/buildSitemapEntries.ts");
assert.ok(sitemapBuilderSource.includes("readerCanonicalPath(work.seriesId, episodeNumber, work.sourceLanguage)"));
assert.ok(sitemapSource.includes('getCachedPublicBaseWorkCards({ visibility: "general" })'),
  "sitemap must keep excluding R18 works");
const readerPage = read("src/app/read/[seriesId]/[episodeNumber]/page.tsx");
assert.ok(readerPage.includes("isPublicReadPage && !isR18Series(series)"),
  "Reader JSON-LD must be gated to public, non-R18 pages");
assert.ok(readerPage.includes("readerCanonicalPath("));
assert.equal(/languages:\s*\{\s*ja: localizePath\(baseCanonicalPath/.test(readerPage), false,
  "Reader must not emit hreflang to non-canonical copies");
assert.ok(readerPage.includes("if (payload.r18Blocked)"), "Reader metadata R18 gate kept");
const layout = read("src/app/read/[seriesId]/[episodeNumber]/layout.tsx");
assert.ok(layout.includes("resolvePublicWorkAttribution("));
const workPage = read("src/app/works/[seriesId]/page.tsx");
assert.equal(workPage.includes('|| "あらすじはまだ登録されていません。"'), false,
  "Work body must use the localized no-summary text");
const localeWork = read("src/app/locale-work/[seriesId]/page.tsx");
assert.ok(localeWork.includes("buildLocalizedWorkMetadataText("));
assert.ok(localeWork.includes('en: `/en/works/${encodedSeriesId}`'), "Work hreflang kept");

async function main() {
  const fallback = await loadSitemapEpisodeDatesSafe(async () => {
    throw new Error("transient");
  });
  assert.equal(fallback.size, 0, "episode date failure must degrade to work-level lastmod");
  console.log("PASS: P9 SEO metadata (Reader title, PD attribution, localized Work metadata, Reader JSON-LD, source-language sitemap/canonical, lastmod)");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
