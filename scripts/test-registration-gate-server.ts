import assert from "node:assert/strict";
import Module from "node:module";
import { UI_LOCALE_COOKIE, UI_LOCALE_HEADER } from "../src/i18n/config";
import { REGISTRATION_REQUIRED_ERROR, isBlockedFromWritesUntilRegistered } from "../src/lib/auth/registrationGate";
import { buildRegisterPath, registrationRequiredMessage } from "../src/lib/auth/registrationGateMessage";

// Characterization test: pins current behavior only (LT-002).
// next/headers is replaced in-process; synthetic users only.

const state = {
  cookie: null as string | null,
  header: null as string | null,
  cookiesThrow: false,
  headersThrow: false,
};

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "next/headers") {
    return {
      cookies: async () => {
        if (state.cookiesThrow) throw new Error("outside request scope");
        return { get: (name: string) => (name === UI_LOCALE_COOKIE && state.cookie ? { value: state.cookie } : undefined) };
      },
      headers: async () => {
        if (state.headersThrow) throw new Error("outside request scope");
        return new Headers(state.header ? { [UI_LOCALE_HEADER]: state.header } : {});
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const emailOnly = {
  email: "writer@example.invalid",
  identities: [{ provider: "email", identity_data: { email: "writer@example.invalid", email_verified: true } }],
};
const googleWithoutProfile = {
  email: "reader@example.invalid",
  app_metadata: {},
  user_metadata: {},
  identities: [{ provider: "google", identity_data: { email: "reader@example.invalid", email_verified: true } }],
};

async function main() {
  try {
    const { registrationRequiredJson, registrationRequiredResponse } = await import("../src/lib/auth/registrationGate.server");

    async function body(responsePromise: Promise<Response | null>) {
      const response = await responsePromise;
      assert.ok(response);
      assert.equal(response.status, 403);
      return (await response.json()) as Record<string, unknown>;
    }

    // Locale: cookie first, then header, else ja; scope errors fall through.
    state.cookie = "en";
    state.header = "ko";
    assert.deepEqual(await body(registrationRequiredJson("code")), {
      ok: false,
      error: REGISTRATION_REQUIRED_ERROR,
      code: REGISTRATION_REQUIRED_ERROR,
      message: registrationRequiredMessage("en"),
      registerPath: buildRegisterPath("en"),
    });
    state.cookie = "xx";
    assert.equal((await body(registrationRequiredJson("code"))).registerPath, buildRegisterPath("ko"));
    state.cookie = null;
    state.header = null;
    assert.equal((await body(registrationRequiredJson("code"))).registerPath, buildRegisterPath("ja"));
    state.cookiesThrow = true;
    state.headersThrow = true;
    assert.equal((await body(registrationRequiredJson("code"))).message, registrationRequiredMessage("ja"));
    state.cookiesThrow = false;
    state.headersThrow = false;

    // "text" style puts the localized message into error.
    state.cookie = "ko";
    const text = await body(registrationRequiredJson("text"));
    assert.equal(text.error, registrationRequiredMessage("ko"));
    assert.equal(text.code, REGISTRATION_REQUIRED_ERROR);

    // Only Google accounts that still need STEP 2 are blocked.
    assert.equal(isBlockedFromWritesUntilRegistered(googleWithoutProfile), true);
    assert.equal(await registrationRequiredResponse(emailOnly), null);
    assert.equal(await registrationRequiredResponse(null), null);
    const blocked = await body(registrationRequiredResponse(googleWithoutProfile));
    assert.equal(blocked.error, registrationRequiredMessage("ko"), "default style is text");
    const blockedCode = await body(registrationRequiredResponse(googleWithoutProfile, "code"));
    assert.equal(blockedCode.error, REGISTRATION_REQUIRED_ERROR);
  } finally {
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: registration gate responses (403 payloads, locale resolution, Google STEP 2 blocking)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
