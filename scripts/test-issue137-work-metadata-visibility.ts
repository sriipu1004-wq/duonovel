import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isEpisodePubliclyVisible } from "../src/features/write/writeShared";
import { getSeriesContentRating } from "../src/lib/contentRating";
import { canViewPublicWorkBody } from "../src/lib/workBodyVisibility";
import type { SeriesRow } from "../src/features/write/writeShared";

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

// Exercise the predicate used by the actual shared Work BODY, not merely a
// source string. All three JA/EN/KO Work routes share this server component.
const fixture = (
  publication_status: "public" | "private" | undefined,
  content_rating: "general" | "r18",
  content_warnings: string[] = []
): SeriesRow => ({
  id: "fixture",
  publication_status,
  content_rating,
  content_warnings,
} as SeriesRow);
const permittedViewer = { showR18Content: true };
const deniedViewer = { showR18Content: false };
for (const [series, viewer, expected, label] of [
  [fixture("public", "general"), null, true, "general/anonymous; no Auth needed"],
  [fixture("public", "general", ["violence"]), null, true, "violence warning only"],
  [fixture("public", "r18"), null, false, "rating R18/anonymous"],
  [fixture("public", "r18"), deniedViewer, false, "rating R18/opted out"],
  [fixture("public", "r18"), permittedViewer, true, "rating R18/verified opt in"],
  [fixture("public", "general", ["sexual_r18"]), null, false, "sexual warning/anonymous"],
  [fixture("public", "general", ["sexual_r18"]), deniedViewer, false, "sexual warning/opted out"],
  [fixture("public", "general", ["sexual_r18"]), permittedViewer, true, "sexual warning/verified opt in"],
  [fixture("private", "general"), permittedViewer, false, "private/general even opted in"],
  [fixture("private", "r18"), permittedViewer, false, "private/R18 even opted in"],
  [fixture(undefined, "general"), null, false, "unknown publication/anonymous"],
  [null, permittedViewer, false, "absent series even opted in"],
] as const) {
  assert.equal(canViewPublicWorkBody(series, viewer), expected, label);
}

const bodyStart = source.indexOf("export default async function WorkPage(");
assert.ok(bodyStart > metadataEnd, "shared Work body component must exist");
const body = source.slice(bodyStart);
const bodyPublication = body.indexOf('getSeriesPublicationStatus(series) !== "public"');
const bodyRating = body.indexOf('getSeriesContentRating(series) === "r18"');
const bodyPreference = body.indexOf("await getCurrentR18ViewerPreference()");
const bodyGuard = body.indexOf("if (!canViewPublicWorkBody(series, r18Viewer))");
const firstDetailRead = body.indexOf("const currentUserPromise = loadOptionalWorkUser()");
const firstPublicDomain = body.indexOf("const publicDomain = readPublicDomainMetadata(");
const firstAuthorLoad = body.indexOf("loadOptionalAuthor(authorId)");
const shortStoryRedirect = body.indexOf("if (isShortStorySeries(series)");
const seriesTitle = body.indexOf("const seriesTitle = pickText(series.title)");
assert.ok(bodyPublication >= 0 && bodyPublication < bodyRating &&
  bodyRating < bodyPreference && bodyPreference < bodyGuard,
  "Private guard must run before R18 authentication and denial");
assert.ok(bodyGuard < firstDetailRead && bodyGuard < firstPublicDomain &&
  bodyGuard < firstAuthorLoad && bodyGuard < shortStoryRedirect &&
  bodyGuard < seriesTitle,
  "R18 body permission guard must precede user/author/episode data reads, redirect and work identity");
const deniedBody = body.slice(bodyGuard, firstDetailRead);
assert.match(deniedBody, /if \(!canViewPublicWorkBody\(series, r18Viewer\)\) \{\s*notFound\(\);\s*\}/,
  "Denied R18 Work body must stop via generic notFound, not render title or a fallback");
const r18OnlyCall = body.slice(bodyRating, bodyGuard);
assert.ok(r18OnlyCall.includes("? await getCurrentR18ViewerPreference()") &&
  r18OnlyCall.includes(": null;"),
  "Only R18 public Work must load viewer preference; general Work must not depend on Auth");
const localeWrapper = readFileSync("src/app/locale-work/[seriesId]/page.tsx", "utf8");
assert.ok(localeWrapper.includes("<WorkPage {...props} />"),
  "EN and KO wrappers must render the same gated Work body");
const translationBadge = readFileSync("src/features/works/WorkTranslationAvailability.tsx", "utf8");
assert.ok(translationBadge.includes("isR18Series(overview.series)") &&
  translationBadge.includes("if (!preference.showR18Content) return null"),
  "Localized pre-body badge must not reveal R18 translation availability");
console.log("PASS: shared JA/EN/KO Work BODY denies unauthorized R18 and private work; general remains anonymous-accessible; guard runs before content");
