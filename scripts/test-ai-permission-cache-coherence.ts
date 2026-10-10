import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (path: string) => readFileSync(path, "utf8");
const route = src("src/app/api/series/[seriesId]/translation-permission/route.ts");
const bridge = src("src/features/write/TranslationPermissionWorkspaceBridge.tsx");
const pending = src("src/features/write/PendingTranslationPermissionBridge.tsx");
const modern = src("src/features/write/WriteSeriesForm.tsx");
const legacy = src("src/features/write/WriteSeriesCreateForm.tsx");
const creationAction = src("src/app/actions/createOwnedSeries.ts");
const publicCards = src("src/lib/publicWorks.ts");
const humanRoute = src("src/app/api/series/[seriesId]/human-translation-permission/route.ts");

// The public base-card cache materializes AI permission; an author can edit
// that value using a standalone API without invoking the workspace save action.
assert.ok(publicCards.includes("translationEligible: isSeriesTranslationEligible(series)"));
assert.ok(publicCards.includes("translation_permission_mode"));
assert.ok(route.includes('await supabase.auth.getUser()'));
assert.ok(route.includes('if (seriesResult.data.author_id !== user.id)'));
assert.ok(route.includes('.eq("author_id", user.id)'));
assert.ok(route.includes('.update({ translation_permission_mode: mode })'));
assert.ok(route.includes('revalidateTag("public-base-work-cards", { expire: 0 })'));
assert.equal(route.includes('revalidateTag("public-base-work-cards", "max")'), false);
const mutation = route.indexOf('.update({ translation_permission_mode: mode })');
const invalidate = route.indexOf('revalidateTag("public-base-work-cards", { expire: 0 })');
assert.ok(mutation > 0 && invalidate > mutation, "only invalidate after DB write");
assert.ok(route.includes('persisted: true, mode: savedMode'));
assert.ok(route.includes('error: "cache_invalidation_failed"'));

assert.ok(bridge.includes('payload.persisted === true ? copy.cacheWarning : copy.saved'));
assert.ok(bridge.includes('payload.mode !== "open" && payload.mode !== "closed"'));
assert.ok(pending.includes('payload.persisted === true'));
assert.equal(bridge.includes("rememberCreateSelection("), false);
assert.ok(modern.includes("translationPermissionMode,"));
assert.ok(modern.includes('window.sessionStorage.removeItem("duonovel:pending-translation-permission-create")'));
assert.ok(legacy.includes('window.sessionStorage.removeItem("duonovel:pending-translation-permission-create")'));
assert.ok(creationAction.includes(".insert({ ...validated, author_id: auth.user.id })"));
assert.ok(creationAction.includes("updateTag(PUBLIC_WORKS_CACHE_TAG)"));
assert.ok(!humanRoute.includes('revalidateTag("public-base-work-cards"'),
  "Human permission has separate provenance and is not part of the current AI translation card flag");

console.log("PASS: AI permission updates invalidate public card tag, preserve partial commits, avoid duplicate post-create mutation, and leave Human provenance separate");
