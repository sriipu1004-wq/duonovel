import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sourceRoute = readFileSync(
  "src/app/api/series/[seriesId]/source-language/route.ts", "utf8"
);
const ratingRoute = readFileSync(
  "src/app/api/series/[seriesId]/content-rating/route.ts", "utf8"
);
const works = readFileSync("src/lib/publicWorks.ts", "utf8");

for (const route of [sourceRoute, ratingRoute]) {
  assert.ok(route.includes('import { revalidateTag } from "next/cache";'));
  assert.ok(route.includes('revalidateTag("public-base-work-cards", { expire: 0 });'));
  assert.equal(route.includes('revalidateTag("public-base-work-cards", "max")'), false);
  assert.equal(route.includes("updateTag("), false);
  assert.ok(route.includes('error: "cache_invalidation_failed"'));
  assert.ok(route.includes('persisted: true'));
  assert.ok(route.includes("await supabase.auth.getUser()"));
  assert.ok(route.includes('.eq("author_id", user.id)'));
  const invalidation = route.indexOf('revalidateTag("public-base-work-cards", { expire: 0 });');
  const write = route.lastIndexOf(".update(");
  assert.ok(write >= 0 && write < invalidation);
}
assert.ok(works.includes('{ revalidate: 60, tags: ["public-base-work-cards"] }'));
const sourceClient = readFileSync("src/features/write/SourceLanguageWorkspaceBridge.tsx", "utf8");
const ratingClient = readFileSync("src/features/write/ContentRatingWorkspaceBridge.tsx", "utf8");
const sourcePending = readFileSync("src/features/write/PendingSourceLanguageBridge.tsx", "utf8");
const ratingPending = readFileSync("src/features/write/PendingContentRatingBridge.tsx", "utf8");
assert.ok(sourceRoute.includes('persisted: true,\n        language:'));
assert.ok(ratingRoute.includes('persisted: true,\n        rating,'));
assert.ok(sourceClient.includes("payload.persisted === true && saved"));
assert.ok(ratingClient.includes("payload.persisted === true && Array.isArray(payload.warnings)"));
assert.ok(sourcePending.includes("payload.persisted === true"));
assert.ok(ratingPending.includes("payload?.persisted === true"));
assert.ok(sourcePending.includes("cacheInvalidationFailed: payload.persisted === true"));
assert.ok(ratingPending.includes("cacheInvalidationFailed: payload.persisted === true"));

console.log("PASS: owned source-language/R18 metadata expiry and persisted-after-cache-failure clients");
