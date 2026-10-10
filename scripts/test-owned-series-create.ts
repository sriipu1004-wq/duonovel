import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isOwnedSeriesWorkspacePayload } from "../src/lib/write/ownedSeriesPayload";
import { validateOwnedSeriesCreationPayload } from "../src/lib/write/ownedSeriesCreatePayload";

const sample = {
  title: "Sample",
  description: "Valid text",
  publication_status: "private",
  reviews_enabled: true,
  episode_comments_enabled: true,
  genres: ["Fantasy"],
  tags: ["test"],
  recording_permission_mode: "closed",
  translation_permission_mode: "open",
  human_translation_permission_mode: "open",
  effect_settings: null,
};
assert.equal(isOwnedSeriesWorkspacePayload(sample), true);
assert.equal(isOwnedSeriesWorkspacePayload({ ...sample, publication_status: "public" }), true);
assert.equal(isOwnedSeriesWorkspacePayload({ ...sample, author_id: "forged" }), false);
assert.equal(isOwnedSeriesWorkspacePayload({ ...sample, source_language: "ja" }), false);
assert.equal(isOwnedSeriesWorkspacePayload({ ...sample, content_rating: "general" }), false);
assert.equal(isOwnedSeriesWorkspacePayload({ ...sample, effect_settings: { publicDomain: { rightsChecked: true } } }), false);
assert.equal(isOwnedSeriesWorkspacePayload({ ...sample, publication_status: "deleted" }), false);

const action = readFileSync("src/app/actions/createOwnedSeries.ts", "utf8");
const work = readFileSync("src/features/write/WriteSeriesForm.tsx", "utf8");
const legacy = readFileSync("src/features/write/WriteSeriesCreateForm.tsx", "utf8");
const cards = readFileSync("src/lib/publicWorks.ts", "utf8");
assert.ok(action.startsWith('"use server"'));
assert.ok(action.includes("validateOwnedSeriesCreationPayload(candidate)"));
assert.ok(action.includes("await supabase.auth.getUser()"));
assert.ok(action.includes("author_id: auth.user.id"));
assert.ok(action.includes('.from("series")'));
assert.ok(action.includes(".insert({ ...validated, author_id: auth.user.id })"));
assert.ok(action.includes(".select(\"id\")"));
assert.ok(action.includes("updateTag(PUBLIC_WORKS_CACHE_TAG)"));
assert.ok(action.includes('code: "cache_invalidation_failed"'));
assert.ok(action.includes("persisted: true"));
assert.equal(action.includes("service_role"), false);
assert.equal(action.includes('revalidateTag(PUBLIC_WORKS_CACHE_TAG, "max")'), false);
for (const form of [work, legacy]) {
  assert.ok(form.includes("await createOwnedSeries("));
  assert.ok(form.includes("if (result.ok || result.persisted)"));
  const start = form.indexOf("  async function handleCreate(");
  const end = form.indexOf("\n  }\n", start);
  assert.ok(start >= 0 && end > start);
  const createSection = form.slice(start, form.indexOf("\n  const isSaving =", start) >= 0
    ? form.indexOf("\n  const isSaving =", start)
    : form.indexOf("  async function handleUpdate()", start));
  assert.equal(createSection.includes('.from("series")'), false);
  assert.ok(createSection.includes("result.seriesId"));
}
assert.ok(cards.includes('{ revalidate: 60, tags: ["public-base-work-cards"] }'));
const r18 = { ...sample, publication_status: "public", source_language: "ja", content_warnings: ["sexual_r18", "violence"] };
const safe = validateOwnedSeriesCreationPayload(r18);
assert.ok(safe);
assert.equal(safe.source_language, "ja");
assert.equal(safe.publication_status, "public");
assert.deepEqual(safe.content_warnings, ["sexual_r18", "violence"]);
assert.equal(safe.content_rating, "r18");
assert.equal(validateOwnedSeriesCreationPayload({ ...r18, content_warnings: [] })?.content_rating, "general");
assert.equal(validateOwnedSeriesCreationPayload({ ...r18, content_warnings: ["violence"] })?.content_rating, "general");
assert.equal(validateOwnedSeriesCreationPayload({ ...r18, source_language: null }), null);
assert.equal(validateOwnedSeriesCreationPayload({ ...r18, source_language: "xx" }), null);
assert.equal(validateOwnedSeriesCreationPayload({ ...r18, content_warnings: ["sexual_r18", "sexual_r18"] }), null);
assert.equal(validateOwnedSeriesCreationPayload({ ...r18, content_warnings: ["unknown"] }), null);
assert.equal(validateOwnedSeriesCreationPayload({ ...r18, content_warnings: null }), null);
assert.equal(validateOwnedSeriesCreationPayload({ ...r18, content_rating: "general" }), null);
assert.equal(validateOwnedSeriesCreationPayload({ ...r18, content_warning_locks: ["sexual_r18"] }), null);
assert.equal(validateOwnedSeriesCreationPayload({ ...r18, author_id: "forged" }), null);
assert.equal(validateOwnedSeriesCreationPayload({ ...r18, effect_settings: { publicDomain: { rightsChecked: true } } }), null);
assert.ok(work.includes("source_language: sourceLanguage"));
assert.ok(work.includes("content_warnings: selectedWarnings"));
assert.ok(work.includes("[data-create-content-warnings="));
assert.ok(legacy.includes("source_language: sourceLanguage"));
assert.ok(legacy.includes("content_warnings: contentWarnings"));
const ratingBridge = readFileSync("src/features/write/ContentRatingWorkspaceBridge.tsx", "utf8");
const sourceBridge = readFileSync("src/features/write/SourceLanguageWorkspaceBridge.tsx", "utf8");
assert.ok(ratingBridge.includes('data-create-content-warnings="true"'));
assert.equal(ratingBridge.includes("rememberCreateSelection("), false);
assert.equal(sourceBridge.includes("rememberCreateSelection("), false);
console.log("PASS: work creation atomically persists language/R18/visibility; owner RLS and immediate cache expiration");
