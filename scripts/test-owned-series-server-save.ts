import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isOwnedSeriesWorkspacePayload,
  isValidSeriesId,
} from "../src/lib/write/ownedSeriesPayload";

const id = "d77a5e6c-0c45-4b45-9faf-60d0e6107a94";
assert.equal(isValidSeriesId(id), true);
assert.equal(isValidSeriesId("not-a-uuid"), false);

const payload = {
  title: "Author work",
  description: "Updated synopsis",
  publication_status: "private",
  reviews_enabled: true,
  episode_comments_enabled: false,
  genres: ["Fantasy"],
  tags: ["new"],
  recording_permission_mode: "closed",
  translation_permission_mode: "open",
  human_translation_permission_mode: "closed",
  effect_settings: { typography: { bold: false }, notes: [] },
};
assert.equal(isOwnedSeriesWorkspacePayload(payload), true);
assert.equal(isOwnedSeriesWorkspacePayload({ ...payload, publication_status: "public" }), true);
assert.equal(isOwnedSeriesWorkspacePayload({ ...payload, title: "" }), false);
assert.equal(isOwnedSeriesWorkspacePayload({ ...payload, author_id: id }), false);
assert.equal(isOwnedSeriesWorkspacePayload({ ...payload, source_language: "ja" }), false);
assert.equal(isOwnedSeriesWorkspacePayload({ ...payload, content_rating: "general" }), false);
assert.equal(isOwnedSeriesWorkspacePayload({ ...payload, publication_status: "deleted" }), false);
assert.equal(isOwnedSeriesWorkspacePayload({ ...payload, translation_permission_mode: "unknown" }), false);
assert.equal(isOwnedSeriesWorkspacePayload({ ...payload, genres: ["Fantasy", 12] }), false);
assert.equal(isOwnedSeriesWorkspacePayload({ ...payload, effect_settings: ["unauthorized"] }), false);
assert.equal(isOwnedSeriesWorkspacePayload({ ...payload, tags: Array.from({ length: 201 }, () => "x") }), false);
assert.equal(isOwnedSeriesWorkspacePayload({ ...payload, description: "a".repeat(100001) }), false);
assert.equal(isOwnedSeriesWorkspacePayload(null), false);

const form = readFileSync("src/features/write/WriteSeriesForm.tsx", "utf8");
const action = readFileSync("src/app/actions/saveOwnedSeriesWorkspace.ts", "utf8");
const works = readFileSync("src/lib/publicWorks.ts", "utf8");
const updateForm = form.slice(
  form.indexOf("  async function handleUpdate() {"),
  form.indexOf("  async function handleSubmit(", form.indexOf("  async function handleUpdate() {"))
);

assert.ok(form.includes('import { saveOwnedSeriesWorkspace } from "@/app/actions/saveOwnedSeriesWorkspace";'));
assert.ok(updateForm.includes("await saveOwnedSeriesWorkspace(series.id, {"));
assert.equal(updateForm.includes('supabase.from("series").update('), false);
assert.ok(form.includes('.from("series")\n        .insert(payload)')); // creation remains unchanged
assert.ok(updateForm.includes("result.persisted")); // post-write cache failure is visible

assert.ok(action.includes('import { updateTag } from "next/cache";'));
assert.ok(action.includes("await supabase.auth.getUser()"));
assert.ok(action.includes('.eq("author_id", auth.user.id)'));
assert.ok(action.includes('.select("id")'));
assert.ok(action.includes(".maybeSingle()"));
assert.ok(action.includes("if (!data)"));
assert.ok(action.includes("updateTag(PUBLIC_WORKS_CACHE_TAG);"));
assert.ok(action.includes('code: "cache_invalidation_failed", persisted: true'));
assert.equal(action.includes("service_role"), false);
assert.equal(action.includes('revalidateTag(PUBLIC_WORKS_CACHE_TAG, "max")'), false);

assert.ok(works.includes('{ revalidate: 60, tags: ["public-base-work-cards"] }'));
console.log("PASS: Child84 owner-only server-side workspace edit, input limits and immediate cache expiration");
