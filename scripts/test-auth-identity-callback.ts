// Issue #142 PR1 regression: provider real names never become public display
// names, and /auth/callback failures are mapped to fixed codes whose wording
// is localized (the provider's error_description is never shown).
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  AUTH_CALLBACK_ERROR_CODES,
  AUTH_CALLBACK_EXCHANGE_FAILED,
  buildAuthCallbackErrorRedirect,
  classifyAuthCallbackRequest,
  classifyProviderCallbackError,
  resolveAuthCallbackNoticeKey,
} from "../src/lib/auth/authCallbackError";
import {
  NEUTRAL_DISPLAY_NAME_FALLBACK,
  PROVIDER_IDENTITY_METADATA_KEYS,
  isEmailOnlyAccount,
  readSelfChosenDisplayName,
} from "../src/lib/auth/selfChosenDisplayName";
import { authDictionaries } from "../src/i18n/dictionaries/auth";

const googleMetadata = {
  name: "Real Person",
  full_name: "Real Person",
  given_name: "Real",
  family_name: "Person",
  avatar_url: "https://lh3.example/photo.jpg",
  picture: "https://lh3.example/photo.jpg",
  email: "real.person@example.com",
  email_verified: true,
};

function testSelfChosenDisplayName() {
  assert.equal(readSelfChosenDisplayName(googleMetadata), "");
  assert.equal(readSelfChosenDisplayName(null), "");
  assert.equal(readSelfChosenDisplayName("x"), "");
  // Email signup (accountSignupConsent.ts) writes both keys.
  assert.equal(
    readSelfChosenDisplayName({
      display_name: " PenName ",
      display_name_candidate: "PenName",
      name: "Real Person",
    }),
    "PenName"
  );
  assert.equal(
    readSelfChosenDisplayName({ display_name_candidate: "Cand", full_name: "Real" }),
    "Cand"
  );
  assert.equal(readSelfChosenDisplayName({ displayName: "Legacy" }), "Legacy");
  assert.equal(readSelfChosenDisplayName({ display_name: "   ", name: "Real" }), "");
  assert.equal(NEUTRAL_DISPLAY_NAME_FALLBACK, "ユーザー");
  for (const key of ["name", "full_name", "avatar_url", "picture"]) {
    assert.ok(
      (PROVIDER_IDENTITY_METADATA_KEYS as readonly string[]).includes(key),
      `${key} must be listed as a provider identity key`
    );
  }

  assert.equal(isEmailOnlyAccount({ app_metadata: { provider: "email", providers: ["email"] } }), true);
  assert.equal(isEmailOnlyAccount({ app_metadata: {} }), true);
  assert.equal(isEmailOnlyAccount(null), true);
  assert.equal(isEmailOnlyAccount({ app_metadata: { provider: "google", providers: ["google"] } }), false);
  assert.equal(
    isEmailOnlyAccount({ app_metadata: { provider: "email", providers: ["email", "google"] } }),
    false
  );
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...listSourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function testNoProviderNameFallbackInSource() {
  // Any read of a provider identity key from auth metadata in app code.
  // (`row.name` on public.users profile rows is a DB column, not metadata.)
  const forbidden =
    /(metadata|values)\s*(\?\.|\.)\s*(name|full_name|given_name|family_name|avatar_url|picture)\b|\.(full_name|given_name|family_name|avatar_url)\b|\[\s*["'](full_name|avatar_url|picture|given_name)["']\s*\]/;
  const offenders: string[] = [];
  for (const file of listSourceFiles("src")) {
    if (file.replace(/\\/g, "/").endsWith("src/lib/auth/selfChosenDisplayName.ts")) continue;
    const code = stripComments(readFileSync(file, "utf8"));
    if (!/user_metadata|metadata/.test(code)) continue;
    code.split("\n").forEach((line, index) => {
      if (forbidden.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], `provider identity fallback found:\n${offenders.join("\n")}`);

  const callSites = [
    "src/app/api/account/content-preferences/route.ts",
    "src/app/api/recordings/human-publish/route.ts",
    "src/app/api/recordings/human-upload-finalize/route.ts",
    "src/app/record/create/[seriesId]/page.tsx",
    "src/app/mypage/page.tsx",
    "src/features/comment/EpisodeCommentSection.tsx",
    "src/features/review/SeriesReviewSection.tsx",
  ];
  for (const file of callSites) {
    const code = readFileSync(file, "utf8");
    assert.ok(
      code.includes("@/lib/auth/selfChosenDisplayName"),
      `${file} must resolve names through selfChosenDisplayName`
    );
  }
  for (const file of [
    "src/features/comment/EpisodeCommentSection.tsx",
    "src/features/review/SeriesReviewSection.tsx",
  ]) {
    const code = readFileSync(file, "utf8");
    assert.ok(
      /isEmailOnlyAccount\(user\)\s*\?\s*user\?\.email\?\.split\("@"\)\[0\]/.test(code),
      `${file}: email local part fallback must be limited to email-only accounts`
    );
  }
}

function params(query: string) {
  return new URLSearchParams(query);
}

function testCallbackClassification() {
  // code missing
  assert.equal(classifyAuthCallbackRequest(params("")), "missing_auth_code");
  assert.equal(classifyAuthCallbackRequest(params("code=")), "missing_auth_code");
  assert.equal(classifyAuthCallbackRequest(params("next=%2Fen")), "missing_auth_code");
  // code present, no error -> proceed to exchange
  assert.equal(classifyAuthCallbackRequest(params("code=abc&next=%2F")), null);
  // provider errors
  assert.equal(
    classifyAuthCallbackRequest(
      params("error=access_denied&error_description=The+user+denied+access")
    ),
    "oauth_cancelled"
  );
  assert.equal(
    classifyAuthCallbackRequest(params("error=server_error&error_code=unexpected_failure")),
    "oauth_failed"
  );
  assert.equal(
    classifyAuthCallbackRequest(params("error_description=%3Cscript%3E")),
    "oauth_failed"
  );
  // provider error wins even if a code is present
  assert.equal(
    classifyAuthCallbackRequest(params("code=abc&error=invalid_request")),
    "oauth_failed"
  );
  // expired email links keep their previous classification
  assert.equal(
    classifyProviderCallbackError(
      params("error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid")
    ),
    "missing_auth_code"
  );
  assert.equal(classifyProviderCallbackError(params("code=abc")), null);
  // exchange failure keeps the email-link code (Issue #138 wording unchanged)
  assert.equal(AUTH_CALLBACK_EXCHANGE_FAILED, "email_confirm_callback_failed");
}

function testRedirectDropsProviderText() {
  const redirect = buildAuthCallbackErrorRedirect(
    "https://www.example.test/auth/callback?error=access_denied&error_code=x&error_description=Leaky+text&state=s#frag",
    "/en/login",
    "oauth_cancelled",
    "/en/read/work/2?x=1"
  );
  assert.equal(redirect.origin, "https://www.example.test");
  assert.equal(redirect.pathname, "/en/login");
  assert.equal(redirect.hash, "");
  assert.deepEqual([...redirect.searchParams.keys()].sort(), ["error", "next"]);
  assert.equal(redirect.searchParams.get("error"), "oauth_cancelled");
  assert.equal(redirect.searchParams.get("next"), "/en/read/work/2?x=1");
  assert.equal(redirect.toString().includes("Leaky"), false);
}

function testLoginNotices() {
  assert.equal(resolveAuthCallbackNoticeKey(null, false), null);
  assert.equal(resolveAuthCallbackNoticeKey("The user denied access", false), null);
  assert.equal(resolveAuthCallbackNoticeKey("access_denied", false), null);
  assert.equal(
    resolveAuthCallbackNoticeKey("email_confirm_callback_failed", false),
    "confirmCallbackFailed"
  );
  assert.equal(
    resolveAuthCallbackNoticeKey("email_confirm_callback_failed", true),
    "resetCallbackFailed"
  );
  assert.equal(resolveAuthCallbackNoticeKey("missing_auth_code", false), "missingAuthCode");
  assert.equal(resolveAuthCallbackNoticeKey("missing_auth_code", true), "resetCallbackFailed");
  assert.equal(resolveAuthCallbackNoticeKey("oauth_cancelled", false), "oauthCancelled");
  assert.equal(resolveAuthCallbackNoticeKey("oauth_failed", false), "oauthFailed");
  // PR2 (PR1 review S3): reset guidance wins for every code.
  assert.equal(resolveAuthCallbackNoticeKey("oauth_failed", true), "resetCallbackFailed");

  for (const code of AUTH_CALLBACK_ERROR_CODES) {
    for (const reset of [false, true]) {
      const key = resolveAuthCallbackNoticeKey(code, reset);
      assert.ok(key, `${code} must map to a notice`);
      for (const locale of ["ja", "en", "ko"] as const) {
        const text: unknown = authDictionaries[locale][key];
        assert.ok(typeof text === "string" && text.trim().length > 0, `${locale}.${key} must not be empty`);
      }
    }
  }
  assert.notEqual(authDictionaries.ja.oauthFailed, authDictionaries.en.oauthFailed);
  assert.notEqual(authDictionaries.en.oauthCancelled, authDictionaries.ko.oauthCancelled);

  const loginClient = stripComments(
    readFileSync("src/app/login/LoginPageClient.tsx", "utf8")
  );
  assert.equal(loginClient.includes("error_description"), false);
  assert.ok(loginClient.includes("resolveAuthCallbackNoticeKey("));

  const route = stripComments(readFileSync("src/app/auth/callback/route.ts", "utf8"));
  assert.ok(route.includes("classifyAuthCallbackRequest(requestUrl.searchParams)"));
  assert.equal(route.includes("error_description"), false);
  assert.equal(
    (route.match(/buildAuthCallbackErrorRedirect\(/g) ?? []).length,
    2,
    "both early failure and exchange failure must use the fixed-code redirect"
  );
}

function main() {
  testSelfChosenDisplayName();
  testNoProviderNameFallbackInSource();
  testCallbackClassification();
  testRedirectDropsProviderText();
  testLoginNotices();
  console.log(
    "PASS: provider real names are never used as display names; auth callback errors use fixed localized codes"
  );
}

main();
