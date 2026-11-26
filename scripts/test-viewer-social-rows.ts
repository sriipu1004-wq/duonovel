import assert from "node:assert/strict";
import Module from "node:module";
import type { SocialRowsReader } from "../src/lib/social/viewerSocialRows";

// KD-2 regression: the viewer's own follow / like rows are read on the server
// for the user verified by auth.getUser(), never for a caller-supplied id.
// Supabase clients are replaced in-process; no DB access. Synthetic ids only.

type Result = { data: unknown; error: { message: string } | null };

const state = {
  adminCalls: [] as unknown[][],
  adminResults: {} as Record<string, Result>,
  user: null as { id: string } | null,
  authError: null as Error | null,
  sessionFromCalls: 0,
};

function builder(calls: unknown[], result: () => Result) {
  const b: Record<string, unknown> = {};
  for (const method of ["select", "eq"]) b[method] = (...args: unknown[]) => (calls.push([method, ...args]), b);
  b.then = (resolve: (value: Result) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve, reject);
  return b;
}

const admin = {
  from(table: string) {
    const calls: unknown[] = [table];
    state.adminCalls.push(calls);
    return builder(calls, () => state.adminResults[table] ?? { data: [], error: null });
  },
};
const session = {
  auth: {
    async getUser() {
      if (state.authError) return { data: { user: null }, error: state.authError };
      return { data: { user: state.user }, error: null };
    },
  },
  // The session client must never be used for these tables.
  from() {
    state.sessionFromCalls += 1;
    throw new Error("session client must not read follow / like tables");
  },
};

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
const is = (request: string, name: string) => request === `@/lib/${name}` || request.endsWith(`/lib/${name}`);
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (is(request, "supabase/admin")) return { createAdminClient: () => admin };
  if (is(request, "supabase/server")) return { createClient: async () => session };
  return originalLoad.call(this, request, parent, isMain);
};

function sessionMissing(): Error {
  const error = new Error("Auth session missing!");
  error.name = "AuthSessionMissingError";
  return error;
}

async function main() {
  try {
    const core = await import("../src/lib/social/viewerSocialRows");
    const { readViewerSocialTargets } = await import("../src/lib/social/viewerSocialRows.server");
    const { GET } = await import("../src/app/api/me/social-targets/route");
    type Session = Parameters<typeof readViewerSocialTargets>[0]["supabase"];
    const sessionClient = session as unknown as Session;

    // The server function has no user id input at all.
    assert.equal(readViewerSocialTargets.length, 1);

    // Each table: owner-filtered, minimal columns, service role reader.
    const cases = [
      { kind: "followed-authors", table: "author_follows", owner: "follower_user_id", target: "followed_author_id" },
      { kind: "liked-authors", table: "author_profile_likes", owner: "user_id", target: "author_id" },
      { kind: "liked-readers", table: "reader_card_likes", owner: "user_id", target: "series_id" },
    ] as const;
    for (const c of cases) {
      state.user = { id: "user-1" };
      state.authError = null;
      state.adminCalls = [];
      state.adminResults = {
        [c.table]: {
          data: [
            { [c.owner]: "user-1", [c.target]: " t-1 ", created_at: "2026-11-01T00:00:00Z" },
            { [c.owner]: "user-1", [c.target]: "t-1", created_at: "2026-11-02T00:00:00Z" },
            { [c.owner]: "other-user", [c.target]: "t-x", created_at: "2026-11-03T00:00:00Z" },
            { [c.owner]: "user-1", [c.target]: "", created_at: "2026-11-04T00:00:00Z" },
            { [c.owner]: "user-1", [c.target]: "t-2", created_at: null },
          ],
          error: null,
        },
      };
      assert.deepEqual(await readViewerSocialTargets({ supabase: sessionClient, kind: c.kind }), {
        signedIn: true,
        userId: "user-1",
        targets: [
          { targetId: "t-1", createdAt: "2026-11-01T00:00:00Z" },
          { targetId: "t-2", createdAt: "" },
        ],
      });
      assert.deepEqual(state.adminCalls, [
        [c.table, ["select", `${c.owner}, ${c.target}, created_at`], ["eq", c.owner, "user-1"]],
      ]);
    }
    assert.equal(state.sessionFromCalls, 0);

    // Signed out (session missing): empty, and the table is not read.
    state.user = null;
    state.adminCalls = [];
    assert.deepEqual(await readViewerSocialTargets({ supabase: sessionClient, kind: "followed-authors" }), {
      signedIn: false,
      userId: null,
      targets: [],
    });
    state.authError = sessionMissing();
    assert.deepEqual(await readViewerSocialTargets({ supabase: sessionClient, kind: "liked-readers" }), {
      signedIn: false,
      userId: null,
      targets: [],
    });
    assert.deepEqual(state.adminCalls, []);

    // Other auth failures and read failures throw (never "no rows").
    state.authError = new Error("auth down");
    await assert.rejects(readViewerSocialTargets({ supabase: sessionClient, kind: "liked-authors" }), /auth down/);
    state.authError = null;
    state.user = { id: "user-1" };
    state.adminResults = { author_follows: { data: null, error: { message: "timeout" } } };
    await assert.rejects(
      readViewerSocialTargets({ supabase: sessionClient, kind: "followed-authors" }),
      /^Error: author_follows: timeout$/
    );

    // Core: an unknown kind and an empty verified id are refused.
    await assert.rejects(
      core.readViewerSocialTargetsWith({
        kind: "bookmarks" as never,
        getVerifiedViewer: async () => ({ userId: "user-1" }),
        createReader: () => admin as unknown as SocialRowsReader,
      }),
      /unknown kind/
    );
    await assert.rejects(
      core.readSocialTargetsForVerifiedUser({ reader: admin as unknown as SocialRowsReader, verifiedUserId: " ", kind: "liked-authors" }),
      /missing verified user id/
    );
    assert.equal(core.isViewerSocialKind("liked-readers"), true);
    assert.equal(core.isViewerSocialKind("liked-works"), false);

    // Route: 400 bad filter, 401 signed out, 200 own rows; a userId query is ignored.
    const base = "http://localhost/api/me/social-targets";
    let response = await GET(new Request(`${base}?filter=everything`));
    assert.equal(response.status, 400);

    state.user = null;
    state.adminCalls = [];
    response = await GET(new Request(`${base}?filter=followed-authors`));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(state.adminCalls, []);

    state.user = { id: "user-1" };
    state.adminCalls = [];
    state.adminResults = {
      reader_card_likes: {
        data: [{ user_id: "user-1", series_id: "s-1", created_at: "2026-11-05T00:00:00Z" }],
        error: null,
      },
    };
    response = await GET(new Request(`${base}?filter=liked-readers&userId=victim&user_id=victim`));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { targets: [{ targetId: "s-1", createdAt: "2026-11-05T00:00:00Z" }] });
    assert.deepEqual(state.adminCalls, [
      ["reader_card_likes", ["select", "user_id, series_id, created_at"], ["eq", "user_id", "user-1"]],
    ]);

    // Read failure: 500 without the error text.
    state.adminResults = { author_profile_likes: { data: null, error: { message: "secret detail" } } };
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      response = await GET(new Request(`${base}?filter=liked-authors`));
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "unavailable" });

    console.log("viewer social rows (KD-2): PASS");
  } finally {
    moduleWithLoad._load = originalLoad;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
