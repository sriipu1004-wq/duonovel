import assert from "node:assert/strict";
import Module from "node:module";
import { OFFICIAL_ACCOUNT_EMAIL } from "../src/lib/auth/officialAccount";

// Characterization test: pins current behavior only (LT-002).
// The admin Supabase client is replaced in-process; no Auth access.

type Lookup = { data: { user: { email?: string } | null } | null; error: { message: string } | null } | Error;
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

const realNow = Date.now;
let now = 5_000_000;

async function main() {
  Date.now = () => now;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    const { isOfficialAuthorAccountForDisplay } = await import("../src/lib/auth/officialAuthor.server");

    assert.equal(await isOfficialAuthorAccountForDisplay(null), false);
    assert.equal(await isOfficialAuthorAccountForDisplay("   "), false);
    assert.equal(state.lookups.length, 0);

    state.next.set("official", { data: { user: { email: ` ${OFFICIAL_ACCOUNT_EMAIL.toUpperCase()} ` } }, error: null });
    state.next.set("writer", { data: { user: { email: "writer@example.invalid" } }, error: null });
    assert.equal(await isOfficialAuthorAccountForDisplay(" official "), true);
    assert.equal(await isOfficialAuthorAccountForDisplay("writer"), false);
    assert.deepEqual(state.lookups, ["official", "writer"]);

    // Results are cached for 10 minutes.
    assert.equal(await isOfficialAuthorAccountForDisplay("writer"), false);
    assert.equal(state.lookups.length, 2);
    now += 10 * 60 * 1000;
    assert.equal(await isOfficialAuthorAccountForDisplay("writer"), false);
    assert.equal(state.lookups.length, 3);

    // Fail closed (true = hide the author) on errors, missing users or thrown lookups; not cached.
    state.next.set("broken", { data: null, error: { message: "x" } });
    state.next.set("ghost", { data: { user: null }, error: null });
    state.next.set("thrower", new Error("network"));
    assert.equal(await isOfficialAuthorAccountForDisplay("broken"), true);
    assert.equal(await isOfficialAuthorAccountForDisplay("ghost"), true);
    assert.equal(await isOfficialAuthorAccountForDisplay("thrower"), true);
    state.next.set("broken", { data: { user: { email: "writer@example.invalid" } }, error: null });
    assert.equal(await isOfficialAuthorAccountForDisplay("broken"), false, "failure was not cached");
  } finally {
    Date.now = realNow;
    console.warn = originalWarn;
    console.error = originalError;
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: official author display check (deny-side, fail closed, 10 min cache)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
