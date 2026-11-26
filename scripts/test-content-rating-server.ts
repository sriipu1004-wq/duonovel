import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// Supabase server/admin clients are replaced in-process; no DB or Auth access.

type Scenario = {
  user?: { id: string } | null;
  authError?: { message: string } | null;
  authThrows?: boolean;
  preference?: { data: unknown; error: { message: string } | null };
};
let scenario: Scenario = {};
const adminQueries: unknown[][] = [];

const serverStub = {
  createClient: async () => ({
    auth: {
      getUser: async () => {
        if (scenario.authThrows) throw new Error("auth down");
        return { data: { user: scenario.user ?? null }, error: scenario.authError ?? null };
      },
    },
  }),
};
const adminStub = {
  createAdminClient: () => ({
    from(table: string) {
      const calls: unknown[] = [table];
      adminQueries.push(calls);
      const builder = {
        select: (columns: string) => (calls.push(["select", columns]), builder),
        eq: (column: string, value: unknown) => (calls.push(["eq", column, value]), builder),
        maybeSingle: async () => scenario.preference ?? { data: null, error: null },
      };
      return builder;
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
  if (request === "@/lib/supabase/server" || request.endsWith("/lib/supabase/server")) return serverStub;
  return originalLoad.call(this, request, parent, isMain);
};

const signedOut = { signedIn: false, userId: null, showR18Content: false, ageConfirmed: false };

async function main() {
  try {
    const { getCurrentR18ViewerPreference } = await import("../src/lib/contentRatingServer");
    const run = async (next: Scenario) => {
      scenario = next;
      return getCurrentR18ViewerPreference();
    };

    assert.deepEqual(await run({ user: null }), signedOut);
    assert.deepEqual(await run({ user: { id: "u1" }, authError: { message: "expired" } }), signedOut);
    assert.deepEqual(await run({ authThrows: true }), signedOut);
    assert.equal(adminQueries.length, 0, "no profile read without a user");

    // Signed in, profile read fails or is missing -> R18 off.
    assert.deepEqual(await run({ user: { id: "u1" }, preference: { data: null, error: { message: "x" } } }), {
      signedIn: true,
      userId: "u1",
      showR18Content: false,
      ageConfirmed: false,
    });
    assert.deepEqual(adminQueries.at(-1), ["users", ["select", "show_r18_content, r18_confirmed_at"], ["eq", "id", "u1"]]);
    assert.deepEqual((await run({ user: { id: "u1" }, preference: { data: null, error: null } })).showR18Content, false);

    // R18 is shown only when opted in AND age confirmed.
    assert.deepEqual(
      await run({ user: { id: "u1" }, preference: { data: { show_r18_content: true, r18_confirmed_at: "2026-01-01T00:00:00Z" }, error: null } }),
      { signedIn: true, userId: "u1", showR18Content: true, ageConfirmed: true }
    );
    assert.deepEqual(
      await run({ user: { id: "u1" }, preference: { data: { show_r18_content: true, r18_confirmed_at: "  " }, error: null } }),
      { signedIn: true, userId: "u1", showR18Content: false, ageConfirmed: false }
    );
    assert.deepEqual(
      await run({ user: { id: "u1" }, preference: { data: { show_r18_content: "true", r18_confirmed_at: "2026-01-01" }, error: null } }),
      { signedIn: true, userId: "u1", showR18Content: false, ageConfirmed: true }
    );
    assert.deepEqual(
      await run({ user: { id: "u1" }, preference: { data: { show_r18_content: false, r18_confirmed_at: "2026-01-01" }, error: null } }),
      { signedIn: true, userId: "u1", showR18Content: false, ageConfirmed: true }
    );
  } finally {
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: R18 viewer preference (signed out, auth errors, profile failures, opt-in AND age confirmation)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
