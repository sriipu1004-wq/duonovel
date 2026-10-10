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
  assert.ok(route.includes('error: "cache_invalidation_failed", persisted: true'));
  assert.ok(route.includes("await supabase.auth.getUser()"));
  assert.ok(route.includes('.eq("author_id", user.id)'));
  const invalidation = route.indexOf('revalidateTag("public-base-work-cards", { expire: 0 });');
  const write = route.lastIndexOf(".update(");
  assert.ok(write >= 0 && write < invalidation);
}
assert.ok(works.includes('{ revalidate: 60, tags: ["public-base-work-cards"] }'));
console.log("PASS: owned source-language/R18 metadata route expiration uses blocking cache refresh");
