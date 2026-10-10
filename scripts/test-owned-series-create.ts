import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isOwnedSeriesWorkspacePayload } from "../src/lib/write/ownedSeriesPayload";

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
assert.ok(action.includes("isOwnedSeriesWorkspacePayload(candidate)"));
assert.ok(action.includes("await supabase.auth.getUser()"));
assert.ok(action.includes("author_id: auth.user.id"));
assert.ok(action.includes('.from("series")'));
assert.ok(action.includes(".insert({ ...candidate, author_id: auth.user.id })"));
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
console.log("PASS: both author creation forms use owner-RLS Server Action and immediate cache expiration");
