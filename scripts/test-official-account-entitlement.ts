import assert from "node:assert/strict";
import Module from "node:module";
import { OFFICIAL_ACCOUNT_EMAIL } from "../src/lib/auth/officialAccount";

// Characterization test: pins current behavior only (LT-002).
// The admin Supabase client is replaced in-process; no Auth or DB access.

const state = {
  user: null as Record<string, unknown> | null,
  authError: null as { message: string } | null,
  upsertError: null as { message: string } | null,
  lookups: [] as string[],
  upserts: [] as Array<{ table: string; row: Record<string, unknown>; options: unknown }>,
};
const adminStub = {
  createAdminClient: () => ({
    auth: {
      admin: {
        getUserById: async (id: string) => {
          state.lookups.push(id);
          return { data: { user: state.user }, error: state.authError };
        },
      },
    },
    from(table: string) {
      return {
        upsert: async (row: Record<string, unknown>, options: unknown) => {
          state.upserts.push({ table, row, options });
          return { error: state.upsertError };
        },
      };
    },
  }),
};

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase/admin" || request.endsWith("/lib/supabase/admin")) return adminStub;
  return originalLoad.call(this, request, parent, isMain);
};

function emailUser(email: string, verified: boolean) {
  return {
    email,
    identities: [{ provider: "email", identity_data: { email, email_verified: verified } }],
  };
}

async function main() {
  try {
    const { ensureOfficialSubscriberEntitlement } = await import("../src/lib/auth/officialAccount.server");

    // Official address with a verified email identity -> subscriber entitlement upserted.
    state.user = emailUser(OFFICIAL_ACCOUNT_EMAIL.toUpperCase(), true);
    assert.equal(await ensureOfficialSubscriberEntitlement("official-id"), true);
    assert.deepEqual(state.lookups, ["official-id"]);
    assert.equal(state.upserts.length, 1);
    const { table, row, options } = state.upserts[0]!;
    assert.equal(table, "libread_user_entitlements");
    assert.equal(typeof row.updated_at, "string");
    assert.deepEqual({ ...row, updated_at: "<time>" }, {
      user_id: "official-id",
      plan_type: "subscriber",
      subscriber_until: null,
      updated_at: "<time>",
    });
    assert.deepEqual(options, { onConflict: "user_id" });

    // Not granted: other address, unverified identity, missing user, or lookup error.
    for (const [label, user, authError] of [
      ["other address", emailUser("someone@example.invalid", true), null],
      ["unverified identity", { email: OFFICIAL_ACCOUNT_EMAIL, identities: [{ provider: "email", identity_data: { email: OFFICIAL_ACCOUNT_EMAIL } }] }, null],
      ["google identity only", { email: OFFICIAL_ACCOUNT_EMAIL, identities: [{ provider: "google", identity_data: { email: OFFICIAL_ACCOUNT_EMAIL, email_verified: true } }] }, null],
      ["no user", null, null],
      ["lookup error", emailUser(OFFICIAL_ACCOUNT_EMAIL, true), { message: "x" }],
    ] as const) {
      state.user = user as Record<string, unknown> | null;
      state.authError = authError;
      state.upserts = [];
      assert.equal(await ensureOfficialSubscriberEntitlement("u"), false, label);
      assert.equal(state.upserts.length, 0, label);
    }
    state.authError = null;

    // Upsert failure is thrown.
    state.user = emailUser(OFFICIAL_ACCOUNT_EMAIL, true);
    state.upsertError = { message: "denied" };
    await assert.rejects(ensureOfficialSubscriberEntitlement("official-id"), /公式アカウント権限の保存に失敗しました: denied/);
  } finally {
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: official subscriber entitlement (verified official identity only, upsert payload, failures)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
