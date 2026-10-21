import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isEpisodePubliclyVisible } from "../src/features/write/writeShared";
import { getSeriesContentRating } from "../src/lib/contentRating";

// Regression for the Production 200/noindex "公開話なし" metadata observed
// while the same exact public work's Reader and EN/KO Work pages render.
const source = readFileSync("src/app/works/[seriesId]/page.tsx", "utf8");
const selectStart = source.indexOf("const WORK_PAGE_EPISODE_NAV_SELECT =");
const selectEnd = source.indexOf("`;", selectStart);
assert.ok(selectStart >= 0 && selectEnd > selectStart);
const select = source.slice(selectStart, selectEnd);
for (const field of ["id", "episode_number", "posting_status", "is_published"]) {
  assert.match(select, new RegExp("\\b" + field + "\\b"), "first public episode must select " + field);
}
const metadataStart = source.indexOf("export async function generateMetadata(");
const metadataEnd = source.indexOf("function TocEpisodeListFallback()", metadataStart);
const metadata = source.slice(metadataStart, metadataEnd);
assert.ok(metadata.includes("fetchFirstPublicEpisode(seriesId)"));
assert.ok(metadata.includes("isEpisodePubliclyVisible(firstPublicEpisode)"));
assert.ok(metadata.includes("robots:"));

const seriesPublicationGate = metadata.indexOf('getSeriesPublicationStatus(series) !== "public"');
const r18Gate = metadata.indexOf('if (getSeriesContentRating(series) === "r18")');
const episodeGate = metadata.indexOf("fetchFirstPublicEpisode(seriesId)");
const titleExposure = metadata.indexOf("const seriesTitle = pickText(series.title)");
assert.ok(seriesPublicationGate >= 0 && seriesPublicationGate < r18Gate,
  "Private series must be denied before any R18 metadata processing");
assert.ok(r18Gate > seriesPublicationGate && r18Gate < episodeGate && episodeGate < titleExposure,
  "R18 preference must be checked before episode/index/title metadata is exposed");
const r18Guard = metadata.slice(r18Gate, episodeGate);
assert.ok(r18Guard.includes("await getCurrentR18ViewerPreference()"),
  "JA Work metadata must use the authenticated server-side R18 preference");
assert.match(r18Guard,
  /if \(!viewer\.showR18Content\) \{\s*return \{\s*title: "作品が見つかりません \| LIB read",\s*robots: \{\s*index: false,\s*follow: false,/,
  "Denied or unknown R18 viewer must receive only generic noindex/nofollow metadata");
for (const forbidden of ["seriesTitle", "description,", "openGraph:", "twitter:", "index: true"]) {
  assert.ok(!r18Guard.includes(forbidden), "Denied R18 metadata must not include " + forbidden);
}
for (const [series, expectedRating] of [
  [{ content_rating: "r18" }, "r18"],
  [{ content_rating: "general", content_warnings: ["sexual_r18"] }, "r18"],
  [{ content_rating: "r18", content_warnings: ["violence"] }, "r18"],
  [{ content_rating: "general", content_warnings: ["violence"] }, "general"],
  [{ content_rating: "general" }, "general"],
] as const) {
  assert.equal(getSeriesContentRating(series), expectedRating,
    "Effective rating must govern the R18 permission branch, not just the raw column");
}
const idAndNumberOnly = { id: "episode", episode_number: 1 };
assert.equal(isEpisodePubliclyVisible(idAndNumberOnly), false,
  "partial selected row must not become visible");
assert.equal(isEpisodePubliclyVisible({
  ...idAndNumberOnly, posting_status: "posted", is_published: true,
}), true, "complete posted and published row must permit accurate indexing");
assert.equal(isEpisodePubliclyVisible({
  ...idAndNumberOnly, posting_status: "draft", is_published: true,
}), false, "draft remains denied");
assert.equal(isEpisodePubliclyVisible({
  ...idAndNumberOnly, posting_status: "posted", is_published: false,
}), false, "unpublished remains denied");
console.log("PASS: JA Work SEO metadata checks effective R18 rating and fail-closed viewer preference before indexing while retaining posted/published episode gate");
