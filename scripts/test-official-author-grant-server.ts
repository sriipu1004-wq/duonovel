import assert from "node:assert/strict";
import Module from "node:module";
import { OFFICIAL_ACCOUNT_EMAIL } from "../src/lib/auth/officialAccount";

// Characterization test: pins current behavior only (LT-002).
// The admin Supabase client is replaced in-process; no Auth access.

type Lookup = { data: { user: Record<string, unknown> | null } | null; error: { message: string } | null } | Error;
const state = { lookups: [] as string[], next: new Map<string, Lookup>() };
const adminStub = {
  createAdminClient: () => ({
    auth: {
      admin: {
        getUserById: async (id: string) => {
          state.lookups.push(id);
          const next = state.next.get(id) ?? { data: { user: null }, error: null };
          if (next instanceof Error) throw next;
          return next;
        },
      },
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
  return { email, identities: [{ provider: "email", identity_data: { email, email_verified: verified } }] };
}

async function main() {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const { isOfficialAuthorAccountForGrant } = await import("../src/lib/auth/officialAuthorGrant.server");

    assert.equal(await isOfficialAuthorAccountForGrant(" "), false);
    assert.equal(state.lookups.length, 0);

    state.next.set("official", { data: { user: emailUser(OFFICIAL_ACCOUNT_EMAIL, true) }, error: null });
    state.next.set("unverified", { data: { user: emailUser(OFFICIAL_ACCOUNT_EMAIL, false) }, error: null });
    state.next.set("writer", { data: { user: emailUser("writer@example.invalid", true) }, error: null });
    state.next.set("broken", { data: null, error: { message: "x" } });
    state.next.set("thrower", new Error("network"));

    assert.equal(await isOfficialAuthorAccountForGrant("official"), true);
    assert.equal(await isOfficialAuthorAccountForGrant("unverified"), false);
    assert.equal(await isOfficialAuthorAccountForGrant("writer"), false);
    // Grant side fails closed to false.
    assert.equal(await isOfficialAuthorAccountForGrant("broken"), false);
    assert.equal(await isOfficialAuthorAccountForGrant("thrower"), false);
    assert.equal(await isOfficialAuthorAccountForGrant("missing"), false);

    // Definite answers are cached; failures are not.
    const before = state.lookups.length;
    assert.equal(await isOfficialAuthorAccountForGrant("official"), true);
    assert.equal(state.lookups.length, before);
    await isOfficialAuthorAccountForGrant("broken");
    assert.equal(state.lookups.length, before + 1);
  } finally {
    console.warn = originalWarn;
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: official author grant check with admin lookup (verified official only, fail closed, caching)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
