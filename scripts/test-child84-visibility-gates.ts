import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isEpisodePubliclyVisible,
  type EpisodeRow,
} from "../src/features/write/writeShared";
import { validateOwnedSeriesCreationPayload } from "../src/lib/write/ownedSeriesCreatePayload";

const root = "src/";
const source = (path: string) => readFileSync(root + path, "utf8");

// A public R18-labelled work must not have an intermediate GENERAL-rated
// creation write; the creation validator computes the rating itself.
const newWork = {
  title: "Verified fixture",
  description: "",
  publication_status: "public",
  reviews_enabled: true,
  episode_comments_enabled: true,
  genres: [],
  tags: [],
  recording_permission_mode: "closed",
  translation_permission_mode: "open",
  human_translation_permission_mode: "open",
  effect_settings: null,
  source_language: "ja",
  content_warnings: ["sexual_r18"],
};
const created = validateOwnedSeriesCreationPayload(newWork);
assert.ok(created);
assert.equal(created.content_rating, "r18");
assert.equal(created.publication_status, "public");
assert.equal(created.source_language, "ja");

// Authorship, rights, R18 and source language are not caller-overridable
// workspace fields. Later source/R18 edits require owner-only routes.
const invalidRating = { ...newWork, content_rating: "general" };
assert.equal(validateOwnedSeriesCreationPayload(invalidRating), null);
const invalidOwner = { ...newWork, author_id: "00000000-0000-4000-8000-000000000000" };
assert.equal(validateOwnedSeriesCreationPayload(invalidOwner), null);

// Current owner UI interprets a scheduled episode as live once its clock
// passes. This is deliberately NOT an acceptance test for public exposure;
// Production RLS and public selects presently only allow posted+published.
// It documents the mismatch without weakening either side independently.
const scheduled: EpisodeRow = {
  id: "9ae39b4a-2f1e-4444-8d5e-82d8f41d413b",
  series_id: "7ae09a66-3c1f-4f0e-a29c-6df02dd2ab78",
  episode_number: 1,
  posting_status: "scheduled",
  is_published: false,
  scheduled_for: "2026-01-01T00:00:00Z",
};
assert.equal(isEpisodePubliclyVisible(scheduled, new Date("2026-01-02T00:00:00Z")), true);
assert.equal(isEpisodePubliclyVisible(scheduled, new Date("2025-12-31T00:00:00Z")), false);

const reader = source("lib/publicRead.ts");
const work = source("app/works/[seriesId]/page.tsx");
const catalog = source("lib/publicWorks.ts");
for (const current of [reader, work, catalog]) {
  assert.ok(current.includes('.eq("posting_status", "posted")'));
  assert.ok(current.includes('.eq("is_published", true)'));
}
assert.ok(reader.includes("if (!isOwner && !isEpisodePubliclyVisible(episode)) return null"));
assert.ok(work.includes('getSeriesPublicationStatus(series) !== "public"'));
const seriesEdit = source("app/actions/saveOwnedSeriesWorkspace.ts");
const episodeEdit = source("app/actions/saveOwnedEpisode.ts");
const create = source("app/actions/createOwnedSeries.ts");
const language = source("app/api/series/[seriesId]/source-language/route.ts");
const rating = source("app/api/series/[seriesId]/content-rating/route.ts");
for (const action of [seriesEdit, episodeEdit, create]) {
  assert.ok(action.includes('updateTag(PUBLIC_WORKS_CACHE_TAG)'));
  assert.ok(action.includes("await supabase.auth.getUser()"));
}
for (const route of [language, rating]) {
  assert.ok(route.includes('revalidateTag("public-base-work-cards", { expire: 0 })'));
  assert.ok(route.includes('persisted: true'));
}
assert.ok(create.includes(".insert({ ...validated, author_id: auth.user.id })"));
const legacyRating = source("features/write/ContentRatingWorkspaceBridge.tsx");
const legacyLanguage = source("features/write/SourceLanguageWorkspaceBridge.tsx");
assert.ok(legacyRating.includes('data-create-content-warnings="true"'));
assert.equal(legacyRating.includes("rememberCreateSelection("), false);
assert.equal(legacyLanguage.includes("rememberCreateSelection("), false);

console.log("PASS: Child84 integrated R18/private mutation contracts remain fail-closed");
console.log("KNOWN GAP: scheduled-clock visibility predicate is not yet equal to public SQL/RLS admission; no scheduler rows in verified Production");
