import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const route = readFileSync("src/app/api/account/delete/route.ts", "utf8");
const ui = readFileSync("src/app/mypage/AccountSettingsCard.tsx", "utf8");
const privacy = readFileSync("src/app/privacy/page.tsx", "utf8");
const terms = readFileSync("src/app/terms/page.tsx", "utf8");
const contact = readFileSync("src/app/contact/page.tsx", "utf8");

const intake = readFileSync("docs/child84-account-deletion-manual-intake.md", "utf8");
for (const requirement of [
  "PUBLIC MAIL INTAKE VERIFIED; MANUAL REVIEW ONLY; NO AUTOMATED ERASURE",
  "libread08@gmail.com",
  "RECEIPT_VERIFIED=true",
  "REPLY_VERIFIED=true",
  "ACCOUNT_CLOSURE",
  "PERSONAL_DATA_ERASURE",
  "AUTHOR_WORK_UNPUBLISH",
  "HUMAN_TRANSLATION_WITHDRAW",
  "HUMAN_NARRATION_WITHDRAW",
  "RIGHTS_COMPLAINT",
  "BILLING_CANCEL",
  "NEEDS_REVIEW",
  "case_id",
  "identity_status",
  "billing_status",
  "postcondition",
  "/api/billing/portal",
  "Child84 NOT DONE; Child85 BLOCKED",
]) assert.ok(intake.includes(requirement), `Missing manual support gate: ${requirement}`);
assert.ok(intake.includes("Never ask by ordinary email for passwords"),
  "Manual intake must not solicit passwords or one-time codes by email");
assert.ok(intake.includes("A dedicated Gmail intake label"),
  "Approved operator intake must remain auditable");
assert.ok(intake.includes("Receiving a request is not identity verification"),
  "Verified email delivery cannot authorize destructive account changes");
assert.ok(intake.includes("A matching email sender is not"),
  "Email sender address alone must not authorize destructive actions");

const catalog = readFileSync("src/lib/publicWorks.ts", "utf8");
const permission = readFileSync("src/app/api/series/[seriesId]/translation-permission/route.ts", "utf8");

const subscriptionPage = readFileSync("src/app/subscription/page.tsx", "utf8");
const billingPortal = readFileSync("src/app/api/billing/portal/route.ts", "utf8");
const billingButton = readFileSync("src/features/billing/SubscriptionActionButton.tsx", "utf8");

// Suspending deletion must not hide or disable the independent paid
// subscription-management path. These are source contracts, not a live
// Stripe portal E2E and do not claim a subscription was canceled.
assert.ok(subscriptionPage.includes('<SubscriptionActionButton mode="portal"'),
  "subscription page must retain its dedicated billing-management action");
assert.ok(billingButton.includes('mode === "checkout" ? "/api/billing/checkout" : "/api/billing/portal"'),
  "portal mode must continue to call the separate authenticated billing API");
assert.ok(billingPortal.includes("supabase.auth.getUser()"),
  "billing portal must validate the account independently of deletion");
assert.ok(billingPortal.includes("getBillingCustomerId(data.user.id)"),
  "billing portal must only use the authenticated account's customer ID");
assert.ok(billingPortal.includes("billingPortal.sessions.create("),
  "Stripe portal access must not depend on the suspended deletion API");
assert.ok(!billingPortal.includes('/api/account/delete'),
  "deletion review must not be a prerequisite for subscription cancellation");

const deletedRefs = readFileSync("scripts/child84h-soft-deleted-reference-inventory.sql", "utf8");
const cleanedDeletedRefs = deletedRefs.replace(/^\s*--.*$/gm, "").trim();
assert.ok(cleanedDeletedRefs.startsWith("BEGIN READ ONLY;"), "historical-reference audit must be read-only");
assert.ok(cleanedDeletedRefs.endsWith("COMMIT;"), "audit must close its transaction");
assert.equal(
  /\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|CALL|EXECUTE|VACUUM)\b/i.test(
    cleanedDeletedRefs.replace(/'(?:[^']|'')*'/g, "''")
  ),
  false,
  "historical-reference audit may not mutate data or permissions",
);
assert.equal((deletedRefs.match(/FROM public\.[a-z0-9_]+ t\b/g) ?? []).length, 44,
  "historical reference inventory must cover all 44 verified public UUID principal columns");
assert.equal((deletedRefs.match(/JOIN auth\.users au ON/g) ?? []).length, 51,
  "44 UUID user-reference columns plus seven profile, Storage and text principal references must all be checked");
for (const required of [
  "storage.buckets.owner_id",
  "storage.s3_multipart_uploads.owner_id",
  "storage.s3_multipart_uploads_parts.owner_id",
  "public.nemo_generation_queue.last_requested_by_user_id",
]) assert.ok(deletedRefs.includes(required), `missing non-UUID principal audit: ${required}`);
assert.ok(deletedRefs.includes("expected 44, got"), "fail closed on future source-schema drift");
assert.ok(!deletedRefs.includes("SELECT au.id"), "never export soft-deleted principal IDs");

// The prior auto-deletion flow could strand data and return a misleading
// success. This regression intentionally rejects its old "success" contract.
for (const forbidden of [
  "admin.auth.admin.deleteUser(",
  "cancelSubscriptionsBeforeAccountDeletion(",
  'from("series")',
  'from("episodes")',
  "revalidateTag(",
  "updateTag(",
]) {
  assert.ok(!route.includes(forbidden), `interim gate must not invoke ${forbidden}`);
}
assert.ok(route.includes('code: "ACCOUNT_DELETION_REVIEW_REQUIRED"'));
assert.ok(route.includes("status: 409"));
assert.ok(route.includes("await supabase.auth.getUser()"));
assert.ok(!ui.includes('fetch("/api/account/delete"'));
assert.ok(!ui.includes("handleDelete()"));
assert.ok(ui.includes('href="/contact"'));
assert.ok(ui.includes('href="/subscription"'), "users need direct billing management while automatic deletion is paused");
assert.ok(privacy.includes("セルフサービス自動削除を一時停止"));
assert.ok(privacy.includes("完全消去を保証していませんでした"));
assert.ok(terms.includes("第13条 アカウント削除・公開停止の申請"));
assert.ok(contact.includes("アカウント削除・データ消去の申請"));
// #137: account-deletion checks must not depend on a stale shared public catalog.
assert.ok(catalog.includes("const getCachedPublicBaseWorkCardsInternal = cache(buildPublicBaseWorkCards);"));
assert.ok(permission.includes('revalidateTag("public-base-work-cards", { expire: 0 })'));

type Scenario = {
  session: "authenticated" | "anonymous" | "session_missing" | "auth_error" | "auth_throw" | "client_throw";
};

async function invoke(scenario: Scenario) {
  const calls: string[] = [];
  const exports: Record<string, () => Promise<{ status: number; body: Record<string, unknown> }>> = {};
  const javascript = ts.transpileModule(route, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: "src/app/api/account/delete/route.ts",
  }).outputText;
  runInNewContext(javascript, {
    exports,
    require: (name: string) => {
      calls.push(`require:${name}`);
      if (name === "next/server") {
        return {
          NextResponse: {
            json(body: Record<string, unknown>, opts: { status: number }) {
              return { status: opts.status, body };
            },
          },
        };
      }
      if (name === "@/lib/supabase/server") {
        return {
          createClient: async () => {
            calls.push("createClient");
            if (scenario.session === "client_throw") throw Error("simulated Auth outage");
            return {
              auth: {
                getUser: async () => {
                  calls.push("getUser");
                  if (scenario.session === "auth_throw") throw Error("simulated timeout");
                  if (scenario.session === "session_missing") {
                    const error = new Error("Auth session missing");
                    error.name = "AuthSessionMissingError";
                    return { data: { user: null }, error };
                  }
                  if (scenario.session === "auth_error") {
                    return { data: { user: null }, error: new Error("simulated provider failure") };
                  }
                  return {
                    data: { user: scenario.session === "authenticated" ? { id: "synthetic" } : null },
                    error: null,
                  };
                },
              },
            };
          },
        };
      }
      // Any newly imported admin/billing/cache dependency is unexpected.
      throw new Error(`unexpected dependency: ${name}`);
    },
  });
  const result = await exports.POST();
  return { result, calls };
}

async function main() {
  for (const session of ["authenticated", "anonymous", "session_missing", "auth_error", "auth_throw", "client_throw"] as const) {
    const first = await invoke({ session });
    const second = await invoke({ session });
    const expectedStatus = session === "authenticated" ? 409 : session === "anonymous" || session === "session_missing" ? 401 : 503;
    assert.equal(first.result.status, expectedStatus, session);
    assert.equal(second.result.status, expectedStatus, `retry: ${session}`);
    assert.equal(JSON.stringify(first.result), JSON.stringify(second.result));
    assert.equal(first.calls.some((x) => /admin|stripe|billing|cache/i.test(x)), false);
    if (session === "authenticated") {
      assert.equal(first.result.body.code, "ACCOUNT_DELETION_REVIEW_REQUIRED");
      assert.equal(first.result.body.contactPath, "/contact");
      assert.equal(first.result.body.ok, undefined);
    }
  }

  console.log("PASS: interim deletion API fail-closed on authenticated/anonymous/Auth-error/timeout/retry mocks; no billing, DB mutation or Auth deletion side effects; truthful UI/Privacy/Terms/contact");

}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
