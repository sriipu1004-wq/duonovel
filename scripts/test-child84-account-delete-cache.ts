import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("src/app/api/account/delete/route.ts","utf8");
const ui = readFileSync("src/app/mypage/AccountSettingsCard.tsx","utf8");
const catalog = readFileSync("src/lib/publicWorks.ts","utf8");
const other = readFileSync("src/app/api/series/[seriesId]/translation-permission/route.ts","utf8");

// A soft Auth deletion is neither a hard author-content cascade nor a
// contractual unpublish operation. Keep billing-cancellation-before-delete.
const billing = route.indexOf("await cancelSubscriptionsBeforeAccountDeletion(user.id)");
const auth = route.indexOf("await supabase.auth.getUser()");
const deletion = route.indexOf("await admin.auth.admin.deleteUser(");
const expiry = route.indexOf('revalidateTag("public-base-work-cards", { expire: 0 })');
assert.ok(auth >= 0 && billing > auth && deletion > billing && expiry > deletion);
assert.ok(route.includes('admin.auth.admin.deleteUser(\n    user.id,\n    true'));
assert.ok(route.includes('import { revalidateTag } from "next/cache";'));
assert.ok(catalog.includes('{ revalidate: 60, tags: ["public-base-work-cards"] }'));
assert.ok(other.includes('revalidateTag("public-base-work-cards", { expire: 0 })'));
assert.equal(route.includes("updateTag("), false);
assert.equal(route.includes('revalidateTag("public-base-work-cards", "max")'), false);

// Once the account is soft-deleted, cache expiry cannot change that result.
// Never return 500/503 asking a user to repeat an already successful delete.
assert.ok(route.includes('return NextResponse.json({ ok: true, cacheRefreshPending: true });'));
assert.ok(route.includes('return NextResponse.json({ ok: true });'));
assert.ok(route.includes('console.warn("[account-delete] public catalog cache expiry pending");'));
assert.equal(route.includes('console.warn("[account-delete]",'), false);
assert.equal(route.includes('error: "cache_invalidation_failed"'), false);
assert.ok(ui.includes('await supabase.auth.signOut()'));
assert.ok(ui.includes('router.push("/")'));

// A cache refresh is not evidence that published content was deleted.
// Do not add direct series/episode/admin-table cascades to this small patch.
assert.equal(route.includes('.from("series")'), false);
assert.equal(route.includes('.from("episodes")'), false);
assert.equal(route.includes('.delete().'), false);
console.log("PASS: account Auth soft-delete emits immediate public card expiry, preserves billing safety and irreversible-success response; author content retention remains undecided");
