import assert from "node:assert/strict";
import Module from "node:module";
import { UI_LOCALE_HEADER } from "../src/i18n/config";

// Characterization test: pins current behavior only (LT-002).
// Supabase server client, next/headers and next/navigation are replaced in-process.

const state = {
  user: null as { id: string } | null,
  authError: null as { message: string } | null,
  locale: null as string | null,
};
const fakeClient = {
  auth: { getUser: async () => ({ data: { user: state.user }, error: state.authError }) },
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
  if (request === "next/headers") {
    return { headers: async () => new Headers(state.locale ? { [UI_LOCALE_HEADER]: state.locale } : {}) };
  }
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
    const { requireLoggedInUser } = await import("../src/lib/auth/requireLoggedInUser");
    const { requireOfficialAccount } = await import("../src/lib/auth/requireOfficialAccount");

    state.user = { id: "user-1" };
    const result = await requireLoggedInUser("/write");
    assert.equal(result.user, state.user);
    assert.equal(result.supabase, fakeClient);

    // Signed out: redirect to the localized login page with an encoded, localized next path.
    state.user = null;
    await expectRedirect(requireLoggedInUser("/write?tab=1"), "/login?next=%2Fwrite%3Ftab%3D1");
    state.locale = "en";
    await expectRedirect(requireLoggedInUser("/write"), "/en/login?next=%2Fen%2Fwrite");
    state.locale = "ko";
    await expectRedirect(requireLoggedInUser("/library"), "/ko/login?next=%2Fko%2Flibrary");
    state.locale = "xx";
    await expectRedirect(requireLoggedInUser("/write"), "/login?next=%2Fwrite");
    state.locale = null;

    // An auth error redirects even when a user object is present.
    state.user = { id: "user-1" };
    state.authError = { message: "expired" };
    await expectRedirect(requireLoggedInUser("/write"), "/login?next=%2Fwrite");
    state.authError = null;

    // requireOfficialAccount currently only requires a signed-in user (no official-account check).
    state.user = { id: "any-user" };
    assert.equal((await requireOfficialAccount("/write")).user.id, "any-user");
    state.user = null;
    await expectRedirect(requireOfficialAccount("/write"), "/login?next=%2Fwrite");
  } finally {
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: requireLoggedInUser / requireOfficialAccount (signed-in pass-through, localized login redirects)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
