import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Issue #137 structural regression contract. The full Next.js late-write
// race was separately reproduced with synthetic public/private state.
const src = readFileSync("src/lib/publicWorks.ts", "utf8");
const section = src.slice(
  src.indexOf("async function buildPublicBaseWorkCards():"),
  src.indexOf("function prioritizeForLocale(")
);
assert.ok(section.includes("const getCachedPublicBaseWorkCardsInternal = cache(buildPublicBaseWorkCards);"));
assert.ok(src.includes("const [publicSeries, summariesBySeriesId] = await Promise.all(["), "fresh public series and summaries can run concurrently");
assert.ok(src.includes('if (seriesIds) query = query.in("series_id", seriesIds);'), "single-work metadata query stays scoped");
const summaryView = readFileSync("supabase/migrations/20261010013603_public_episode_work_summaries.sql", "utf8");
assert.ok(summaryView.includes("with (security_invoker = true)"));
assert.ok(summaryView.includes("s.publication_status = 'public'"));
assert.ok(summaryView.includes("e.posting_status = 'posted'"));
assert.ok(summaryView.includes("e.is_published = true"));
assert.equal(section.includes("unstable_cache("), false, "public metadata cannot use shared unstable_cache");
assert.ok(src.includes('import { cache } from "react";'));
assert.ok(src.includes('.eq("publication_status", "public")'), "fresh source must check series publication");
assert.ok(src.includes('.eq("posting_status", "posted")'), "episode fallback must reject drafts");
assert.ok(src.includes('.eq("is_published", true)'), "episode fallback must reject unpublished");
assert.ok(src.includes("getSeriesContentRating(series)"), "R18 must derive from fresh series data");
assert.ok(src.includes('if (visibility === "general") return cards.filter((card) => card.contentRating !== "r18");'));
assert.ok(src.includes("getCurrentR18ViewerPreference()"), "viewer R18 preference must remain checked");
assert.ok(src.includes("const getCachedPublicRecordingAggregatesInternal = unstable_cache("),
  "out-of-scope non-catalog recording aggregate caching stays intact");

const mutationPaths = [
  "src/app/actions/saveOwnedSeriesWorkspace.ts",
  "src/app/actions/createOwnedSeries.ts",
  "src/app/actions/saveOwnedEpisode.ts",
];
for (const path of mutationPaths) {
 const mutation=readFileSync(path,"utf8");
 assert.ok(mutation.includes("updateTag(PUBLIC_WORKS_CACHE_TAG);"),
   "existing immediate invalidation is kept for "+path);
}
const rating=readFileSync("src/app/api/series/[seriesId]/content-rating/route.ts","utf8");
assert.ok(rating.includes('revalidateTag("public-base-work-cards", { expire: 0 })'),
  "R18 rating mutation remains immediate (defense-in-depth)");
console.log("PASS: #137 request-scoped public catalog and unchanged R18/publication checks");
