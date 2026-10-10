import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isOwnedEpisodeSavePayload } from "../src/lib/write/ownedEpisodePayload";

const seriesId = "d77a5e6c-0c45-4b45-9faf-60d0e6107a94";
const payload = {
  series_id: seriesId,
  episode_number: 1,
  title: "Chapter One",
  body: "A public-domain-compatible sample, not actual user content.",
  is_published: false,
  posting_status: "draft",
  scheduled_for: null,
  posted_at: null,
  last_edited_at: null,
};

assert.equal(isOwnedEpisodeSavePayload(payload), true);
assert.equal(isOwnedEpisodeSavePayload({ ...payload, posting_status: "posted", is_published: true, posted_at: new Date().toISOString() }), true);
assert.equal(isOwnedEpisodeSavePayload({ ...payload, posting_status: "scheduled", scheduled_for: new Date().toISOString() }), true);
assert.equal(isOwnedEpisodeSavePayload({ ...payload, posting_status: "scheduled" }), false);
assert.equal(isOwnedEpisodeSavePayload({ ...payload, posting_status: "posted", is_published: false }), false);
assert.equal(isOwnedEpisodeSavePayload({ ...payload, posting_status: "posted", is_published: true }), false);
assert.equal(isOwnedEpisodeSavePayload({ ...payload, episode_number: 0 }), false);
assert.equal(isOwnedEpisodeSavePayload({ ...payload, episode_number: 2.5 }), false);
assert.equal(isOwnedEpisodeSavePayload({ ...payload, episode_number: "1" }), false);
assert.equal(isOwnedEpisodeSavePayload({ ...payload, series_id: "not-uuid" }), false);
assert.equal(isOwnedEpisodeSavePayload({ ...payload, title: "" }), false);
assert.equal(isOwnedEpisodeSavePayload({ ...payload, scheduled_for: "garbage" }), false);
assert.equal(isOwnedEpisodeSavePayload({ ...payload, series_id: seriesId, author_id: seriesId }), false);
assert.equal(isOwnedEpisodeSavePayload({ ...payload, effect_settings: {}}), false);
assert.equal(isOwnedEpisodeSavePayload({ ...payload, body: "x".repeat(950_000) }), false);
assert.equal(isOwnedEpisodeSavePayload(null), false);

const form = readFileSync("src/features/write/WriteEpisodeForm.tsx", "utf8");
const action = readFileSync("src/app/actions/saveOwnedEpisode.ts", "utf8");
const works = readFileSync("src/lib/publicWorks.ts", "utf8");
const save = form.slice(form.indexOf("  async function handleSubmit("), form.indexOf('  const heading = mode === "create"'));
assert.ok(save.includes("await saveOwnedEpisode("));
assert.equal(save.includes('.from("episodes")'), false);
assert.ok(save.includes("if (result.persisted)"));
assert.ok(form.includes('import { saveOwnedEpisode } from "@/app/actions/saveOwnedEpisode";'));

assert.ok(action.includes('import { updateTag } from "next/cache";'));
assert.ok(action.includes("await supabase.auth.getUser()"));
assert.ok(action.includes('.eq("author_id", auth.user.id)'));
assert.ok(action.includes('.eq("series_id", candidate.series_id)'));
assert.ok(action.includes('.eq("episode_number", candidate.episode_number)'));
assert.ok(action.includes('.from("episodes")'));
assert.ok(action.includes(".insert(updateFields)"));
assert.ok(action.includes(".update(updateFields)"));
assert.ok(action.includes(".maybeSingle()"));
assert.ok(action.includes("updateTag(PUBLIC_WORKS_CACHE_TAG);"));
assert.ok(action.includes('code: "cache_invalidation_failed"'));
assert.ok(action.includes("persisted: true"));
assert.equal(action.includes("service_role"), false);
assert.equal(action.includes('revalidateTag(PUBLIC_WORKS_CACHE_TAG, "max")'), false);
assert.ok(works.includes('{ revalidate: 60, tags: ["public-base-work-cards"] }'));

console.log("PASS: owner/RLS episode mutations, strict status input, non-SWR cache expiration");
