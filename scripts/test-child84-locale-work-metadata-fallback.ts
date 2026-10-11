import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/app/locale-work/[seriesId]/page.tsx", "utf8");
const works = readFileSync("src/lib/publicWorks.ts", "utf8");

const metadataStart = page.indexOf("export async function generateMetadata(");
const pageStart = page.indexOf("export default async function LocaleWorkPage(");
assert.ok(metadataStart >= 0 && pageStart > metadataStart);
const metadata = page.slice(metadataStart, pageStart);

assert.ok(metadata.includes("if (!isUuid(seriesId))"), "Reject malformed IDs before any read");
assert.ok(metadata.includes("getPublicWorkMetadataCardById(seriesId)"),
  "Localized Work metadata must load ONLY one work");
assert.ok(!metadata.includes("getCachedPublicBaseWorkCards"),
  "Metadata must not touch the global public-work catalog");
assert.ok(metadata.includes("} catch {"), "Read failure must be handled within metadata");
assert.ok(metadata.includes('title: "LIB read"'), "Transient failures get generic title");
assert.ok(metadata.includes("robots: { index: false, follow: false }"),
  "Errors and hidden works remain noindex");
assert.ok(metadata.includes("if (!work)"), "Absent/private/R18 works remain hidden");
assert.ok(metadata.includes("robots: { index: true, follow: true }"),
  "Eligible work metadata stays indexable");
assert.ok(metadata.includes("description: metadataDescription"),
  "Keep localized title/summary/author/source metadata");
assert.ok(metadata.includes("languages:"), "Keep all localized canonical language links");
assert.ok(page.includes("<WorkPage {...props} />"),
  "Do not replace canonical Work access gate");

const boundedStart = works.indexOf("export async function getPublicWorkMetadataCardById(");
const boundedEnd = works.indexOf("const getCachedPublicBaseWorkCardsInternal =", boundedStart);
assert.ok(boundedStart >= 0 && boundedEnd > boundedStart);
const bounded = works.slice(boundedStart, boundedEnd);
for (const guard of [
  'createPublicServerClient()',
  '.from("series")',
  '.eq("id", seriesId)',
  '.eq("publication_status", "public")',
  '.maybeSingle()',
  'getSeriesPublicationStatus(series) !== "public"',
  "readCanonicalSeriesSourceLanguage(series)",
  "getCurrentR18ViewerPreference()",
  'getSeriesContentRating(series) === "r18"',
  "fetchPublicEpisodeSummariesBySeriesIds([seriesId])",
  "makePublicBaseWorkCard(series, summaries.get(seriesId), authors)",
  "getPublicSearchLanguageFilters()",
  "matchesPublicWorkLanguageFilters({",
]) assert.ok(bounded.includes(guard), `Missing bounded metadata safety guard: ${guard}`);
assert.ok(!bounded.includes("fetchPublicSeriesRows()"), "Never load all series");
assert.ok(!bounded.includes("getCachedPublicBaseWorkCardsInternal()"), "Never read shared catalog cache");
assert.ok(!bounded.includes("unstable_cache("), "Do not serve stale metadata from a new cache");

const makerStart = works.indexOf("function makePublicBaseWorkCard(");
const makerEnd = works.indexOf("async function buildPublicBaseWorkCards(", makerStart);
const builderStart = works.indexOf("async function buildPublicBaseWorkCards(");
assert.ok(makerStart >= 0 && makerEnd > makerStart && builderStart > makerEnd);
const maker = works.slice(makerStart, makerEnd);
const builder = works.slice(builderStart, boundedStart);
assert.ok(builder.includes("makePublicBaseWorkCard(series, summariesBySeriesId.get(series.id), authorAccountMap)"),
  "Catalog and individual lookup must use exactly one canonical data-mapping function");
for (const guard of [
  "if (!episodeSummary || episodeSummary.episode_count === 0) return null",
  "readCanonicalSeriesSourceLanguage(series)",
  "readPublicDomainMetadata(",
  "publicDomain?.originalAuthor",
  "getSeriesContentRating(series)",
  "sourceLanguageToContentLanguage(canonicalSourceLanguage)",
  "translationEligible: isSeriesTranslationEligible(series)",
  "getSeriesGenres(series)",
]) assert.ok(maker.includes(guard), `Canonical metadata parity guard missing: ${guard}`);

console.log("PASS: per-work localized SEO lookup is bounded, public/R18/source-language fail-closed, and canonical card mapping remains shared");
