import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// Supabase server client, next/headers and next/navigation are replaced in-process.

type Row = Record<string, unknown> | null;
const state = {
  user: { id: "user-1" } as { id: string } | null,
  row: null as Row,
  rowError: null as { message: string } | null,
  queries: [] as unknown[][],
};
const fakeClient = {
  auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  from(table: string) {
    const calls: unknown[] = [table];
    state.queries.push(calls);
    const builder = {
      select: (columns: string) => (calls.push(["select", columns]), builder),
      eq: (column: string, value: unknown) => (calls.push(["eq", column, value]), builder),
      single: async () => ({ data: state.row, error: state.rowError }),
    };
    return builder;
  },
};

class RedirectSignal extends Error {
  constructor(public readonly location: string) {
    super(`redirect:${location}`);
  }
}

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "@/lib/supabase/server" || request.endsWith("/lib/supabase/server")) {
    return { createClient: async () => fakeClient };
  }
  if (request === "next/headers") return { headers: async () => new Headers() };
  if (request === "next/navigation") {
    return {
      redirect: (location: string) => {
        throw new RedirectSignal(location);
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

async function expectRedirect(promise: Promise<unknown>, location: string) {
  await assert.rejects(promise, (error: unknown) => error instanceof RedirectSignal && error.location === location);
}

async function main() {
  try {
    const { requireOwnedSeries } = await import("../src/lib/auth/requireOwnedSeries");
    const next = "/write/series-1";
    const loginRedirect = "/login?next=%2Fwrite%2Fseries-1";

    // Owner via author_id.
    state.row = { id: "series-1", author_id: "user-1" };
    const owned = await requireOwnedSeries("series-1", next);
    assert.equal(owned.user.id, "user-1");
    assert.deepEqual(state.queries.at(-1), ["series", ["select", "*"], ["eq", "id", "series-1"]]);

    // Owner via legacy user_id (author_id blank).
    state.row = { id: "series-1", author_id: "  ", user_id: " user-1 " };
    assert.equal((await requireOwnedSeries("series-1", next)).user.id, "user-1");

    // Not the owner, no owner columns, missing row, or read error -> login redirect.
    state.row = { id: "series-1", author_id: "someone-else" };
    await expectRedirect(requireOwnedSeries("series-1", next), loginRedirect);
    state.row = { id: "series-1", author_id: null, user_id: null };
    await expectRedirect(requireOwnedSeries("series-1", next), loginRedirect);
    state.row = null;
    await expectRedirect(requireOwnedSeries("series-1", next), loginRedirect);
    state.row = { id: "series-1", author_id: "user-1" };
    state.rowError = { message: "denied" };
    await expectRedirect(requireOwnedSeries("series-1", next), loginRedirect);
    state.rowError = null;

    // Signed out: requireLoggedInUser redirects before any series read.
    const before = state.queries.length;
    state.user = null;
    await expectRedirect(requireOwnedSeries("series-1", next), loginRedirect);
    assert.equal(state.queries.length, before);
  } finally {
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: requireOwnedSeries (author_id / user_id ownership, redirects on missing, foreign or failed reads)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
