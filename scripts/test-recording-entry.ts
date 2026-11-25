import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// Supabase server client, next/headers and next/navigation are replaced in-process; no DB or Auth access.

type Row = Record<string, unknown> | null;
const state = {
  user: null as { id: string; email?: string } | null,
  authError: null as { message: string } | null,
  row: null as Row,
  rowError: null as { message: string } | null,
  locale: null as string | null,
  queries: [] as unknown[][],
};
const fakeClient = {
  auth: { getUser: async () => ({ data: { user: state.user }, error: state.authError }) },
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
class NotFoundSignal extends Error {}

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "@/lib/supabase/server" || request.endsWith("/lib/supabase/server")) {
    return { createClient: async () => fakeClient };
  }
  if (request === "next/headers") {
    return {
      headers: async () => {
        const h = new Headers();
        if (state.locale) h.set("x-libread-ui-locale", state.locale);
        return h;
      },
    };
  }
  if (request === "next/navigation") {
    return {
      redirect: (location: string) => {
        throw new RedirectSignal(location);
      },
      notFound: () => {
        throw new NotFoundSignal("not-found");
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

async function expectRedirect(promise: Promise<unknown>, location: string) {
  await assert.rejects(promise, (error: unknown) => error instanceof RedirectSignal && error.location === location);
}

function reset() {
  state.user = null;
  state.authError = null;
  state.row = null;
  state.rowError = null;
  state.locale = null;
  state.queries = [];
}

async function main() {
  try {
    const mod = await import("../src/lib/recording/recordingEntry");
    const { OFFICIAL_ACCOUNT_EMAIL } = await import("../src/lib/auth/officialAccount");

    // Pure helpers.
    assert.equal(mod.normalizeRecordingPermissionMode("open"), "open");
    for (const value of ["closed", "OPEN", " open", null, undefined, 1, true]) {
      assert.equal(mod.normalizeRecordingPermissionMode(value), "closed");
    }
    assert.equal(mod.buildRecordingEntryPath("s-1"), "/record/create/s-1");
    assert.equal(mod.buildWorkPath("s-1"), "/works/s-1");
    assert.equal(mod.buildRecordingRequestPath("s-1"), "/works/s-1");

    assert.deepEqual(mod.decideRecordingEntryAccess({ permissionMode: "open", isLoggedIn: false }), {
      canEnter: false,
      deniedReason: "login_required",
    });
    assert.deepEqual(mod.decideRecordingEntryAccess({ permissionMode: "closed", isLoggedIn: false }), {
      canEnter: false,
      deniedReason: "login_required",
    });
    assert.deepEqual(mod.decideRecordingEntryAccess({ permissionMode: "open", isLoggedIn: true }), {
      canEnter: true,
      deniedReason: null,
    });
    assert.deepEqual(mod.decideRecordingEntryAccess({ permissionMode: "closed", isLoggedIn: true }), {
      canEnter: false,
      deniedReason: "closed",
    });

    const guard = mod.requireRecordingEntryAccess;

    // Open series, logged-in user, default locale (ja).
    reset();
    state.user = { id: "user-1", email: "reader@example.test" };
    state.row = { id: "s-1", title: "作品", recording_permission_mode: "open" };
    assert.deepEqual(await guard("s-1"), {
      seriesId: "s-1",
      seriesTitle: "作品",
      permissionMode: "open",
      userId: "user-1",
      locale: "ja",
    });
    assert.deepEqual(state.queries, [
      ["series", ["select", "id, title, recording_permission_mode"], ["eq", "id", "s-1"]],
    ]);

    // Blank or missing title falls back to 無題; a non-ja locale is passed through.
    reset();
    state.user = { id: "user-1" };
    state.locale = "en";
    state.row = { id: "s-1", title: "   ", recording_permission_mode: "open" };
    const blank = await guard("s-1");
    assert.equal(blank.seriesTitle, "無題");
    assert.equal(blank.locale, "en");
    reset();
    state.user = { id: "user-1" };
    state.row = { id: "s-1", recording_permission_mode: "open" };
    assert.equal((await guard("s-1")).seriesTitle, "無題");
    // A title with surrounding spaces is kept as is (not trimmed).
    reset();
    state.user = { id: "user-1" };
    state.row = { id: "s-1", title: " 題 ", recording_permission_mode: "open" };
    assert.equal((await guard("s-1")).seriesTitle, " 題 ");

    // Anonymous viewer: login redirect with the localized entry path as next.
    reset();
    state.row = { id: "s-1", title: "作品", recording_permission_mode: "open" };
    await expectRedirect(guard("s-1"), "/login?next=%2Frecord%2Fcreate%2Fs-1");
    reset();
    state.locale = "ko";
    state.row = { id: "s-1", title: "作品", recording_permission_mode: "closed" };
    await expectRedirect(guard("s-1"), "/login?next=%2Fko%2Frecord%2Fcreate%2Fs-1");

    // Auth error: login redirect before any series query.
    reset();
    state.authError = { message: "expired" };
    state.user = { id: "user-1" };
    await expectRedirect(guard("s-1"), "/login?next=%2Frecord%2Fcreate%2Fs-1");
    assert.deepEqual(state.queries, []);

    // Closed (or unknown / missing) mode: logged-in user goes back to the work page.
    for (const mode of ["closed", "invite", null]) {
      reset();
      state.user = { id: "user-1" };
      state.locale = "en";
      state.row = { id: "s-1", title: "作品", recording_permission_mode: mode };
      await expectRedirect(guard("s-1"), "/en/works/s-1");
    }

    // Official account (email compared trimmed, case-insensitive): work page, no series query.
    reset();
    state.user = { id: "official", email: ` ${OFFICIAL_ACCOUNT_EMAIL.toUpperCase()} ` };
    state.row = { id: "s-1", title: "作品", recording_permission_mode: "open" };
    await expectRedirect(guard("s-1"), "/works/s-1");
    assert.deepEqual(state.queries, []);

    // Missing series or query error: notFound for a logged-in user and for an anonymous viewer.
    for (const user of [{ id: "user-1" }, null]) {
      reset();
      state.user = user;
      state.row = null;
      await assert.rejects(guard("missing"), (error: unknown) => error instanceof NotFoundSignal);
      reset();
      state.user = user;
      state.row = { id: "s-1", recording_permission_mode: "open" };
      state.rowError = { message: "boom" };
      await assert.rejects(guard("s-1"), (error: unknown) => error instanceof NotFoundSignal);
    }

    console.log("recordingEntry characterization: PASS");
  } finally {
    moduleWithLoad._load = originalLoad;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
