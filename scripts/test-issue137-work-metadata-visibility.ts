import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isEpisodePubliclyVisible } from "../src/features/write/writeShared";

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
console.log("PASS: Work SEO existence check selects complete publication guards and fail-closed predicate retains draft/unpublished denial");
