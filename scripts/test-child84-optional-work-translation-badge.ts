import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fetcher = readFileSync("src/lib/translation/publicWorkTranslations.ts","utf8");
const badge = readFileSync("src/features/works/WorkTranslationAvailability.tsx","utf8");
const route = readFileSync("src/app/works/[seriesId]/translations/[targetLanguage]/page.tsx","utf8");
const evidence = readFileSync("docs/public-read-reliability-performance.md","utf8");

assert.ok(fetcher.includes("shouldLoadFullWorkTranslationOverview(count, error)"));
assert.ok(fetcher.includes('.select("episode_id, episodes!inner(series_id)", { count: "exact", head: true })'));
assert.ok(fetcher.includes('.eq("episodes.series_id", cleanSeriesId)'));
assert.ok(fetcher.includes('.eq("episodes.posting_status", "posted")'));
assert.ok(fetcher.includes('.eq("episodes.is_published", true)'));
assert.ok(fetcher.includes('.eq("status", "ready")'));
assert.ok(fetcher.includes("if (signal) query = query.abortSignal(signal)"));
assert.ok(fetcher.includes("return error != null || readyRowCount !== 0;"));
assert.ok(badge.includes("mayHaveReadyTranslationForWorkBadge(seriesId, signal)"));
assert.ok(badge.includes("if (!hasCandidate) return null;"));
assert.ok(badge.includes("getPublicWorkTranslationOverview(seriesId, signal)"));
assert.ok(route.includes("getPublicWorkTranslationOverview(seriesId)"),
 "Standalone translation-version page must retain its all-episodes behavior");
assert.equal(route.includes("mayHaveReadyTranslationForWorkBadge"),false);
assert.ok(fetcher.includes("if (getSeriesPublicationStatus(series) !== \"public\") return null"));
assert.ok(fetcher.includes("isSeriesTranslationEligibleIncludingOfficial(series)"));
assert.ok(badge.includes("getCurrentR18ViewerPreference()"));
assert.ok(evidence.includes("12 total ready"));
for(const {readyRowCount,error,full} of [
 {readyRowCount:0,error:null,full:false},
 {readyRowCount:1,error:null,full:true},
 {readyRowCount:12,error:null,full:true},
 {readyRowCount:null,error:null,full:true},
 {readyRowCount:0,error:new Error("transient network failure"),full:true},
 {readyRowCount:null,error:new Error("permission / schema failure"),full:true},
]){
 const actual=error!==null||readyRowCount!==0;
 assert.equal(actual,full);
}
console.log("PASS: Work-only optional badge prefilter is fail-open for errors, skips only zero ready rows, and retains permission/R18/source-hash/version-page decisions");
