// Issue #142 PR2 regression: "Continue with Google" behind a default-off
// flag, /auth/callback branching for Google accounts (complete / needs STEP 2
// / first link with stale metadata), the server-side write gate and the
// official-account grant check.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-only-placeholder";

import {
  GOOGLE_CONSENT_IDENTITY_KEY,
  buildGoogleConsentMetadata,
  decideAuthCallbackDestination,
  hasConfirmedEmailIdentity,
  isBlockedFromWritesUntilRegistered,
  resolveGoogleRegistrationState,
  type RegistrationUserLike,
} from "../src/lib/auth/registrationGate";
import {
  buildGoogleOAuthRedirectTo,
  isGoogleSignInEnabledValue,
} from "../src/lib/auth/googleSignInFlag";
import {
  AUTH_CALLBACK_ERROR_CODES,
  resolveAuthCallbackNoticeKey,
  resolveExchangeFailureCode,
} from "../src/lib/auth/authCallbackError";
import { buildCompletedAccountRegistrationMetadata } from "../src/lib/auth/accountSignupConsent";
import { OFFICIAL_ACCOUNT_EMAIL, isOfficialAccountUser } from "../src/lib/auth/officialAccount";
import { isOfficialNarrationAccountUser } from "../src/lib/auth/officialNarrationAccount";
import { authDictionaries } from "../src/i18n/dictionaries/auth";
import { accountDictionaries } from "../src/i18n/dictionaries/account";

const GOOGLE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_GOOGLE_ID = "22222222-2222-4222-8222-222222222222";

const completedMetadata = buildCompletedAccountRegistrationMetadata({
  displayName: "PenName",
  agreedToTerms: true,
  agreedToPrivacy: true,
  acknowledgedPublicSurface: true,
});

const emailIdentity = { provider: "email", identity_id: "e1", created_at: "2026-01-01T00:00:00Z" };
const googleIdentity = { provider: "google", identity_id: GOOGLE_ID, created_at: "2026-11-15T00:00:00Z" };

function user(partial: RegistrationUserLike): RegistrationUserLike {
  return { email: "someone@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", ...partial };
}

function testCallbackBranches() {
  // Email-only accounts keep the existing email flow, whatever their metadata.
  for (const metadata of [{}, completedMetadata, { account_registration_completed: false }]) {
    const emailOnly = user({ identities: [emailIdentity], user_metadata: metadata });
    assert.equal(resolveGoogleRegistrationState(emailOnly), "not_google");
    assert.equal(decideAuthCallbackDestination(emailOnly, false), "email_flow");
    assert.equal(decideAuthCallbackDestination(emailOnly, true), "email_flow");
    assert.equal(isBlockedFromWritesUntilRegistered(emailOnly), false);
  }
  assert.equal(decideAuthCallbackDestination(user({ identities: [] }), false), "email_flow");
  assert.equal(decideAuthCallbackDestination(user({}), false), "email_flow");

  // New Google user: no display name / consent -> STEP 2.
  const fresh = user({
    identities: [googleIdentity],
    user_metadata: { name: "Real Person", full_name: "Real Person", email_verified: true },
  });
  assert.equal(resolveGoogleRegistrationState(fresh), "google_needs_profile");
  assert.equal(decideAuthCallbackDestination(fresh, false), "register");
  assert.equal(isBlockedFromWritesUntilRegistered(fresh), true);

  // First link onto an account whose metadata already says "completed"
  // (e.g. an unconfirmed account someone else created): stale flags are not
  // trusted -> STEP 2 and writes blocked.
  const firstLink = user({
    identities: [emailIdentity, googleIdentity],
    user_metadata: { ...completedMetadata },
  });
  assert.equal(resolveGoogleRegistrationState(firstLink), "google_needs_profile");
  assert.equal(decideAuthCallbackDestination(firstLink, false), "register");
  assert.equal(isBlockedFromWritesUntilRegistered(firstLink), true);

  // Even a guessed/wrong identity id in metadata does not count.
  const wrongId = user({
    identities: [googleIdentity],
    user_metadata: { ...completedMetadata, [GOOGLE_CONSENT_IDENTITY_KEY]: OTHER_GOOGLE_ID },
  });
  assert.equal(decideAuthCallbackDestination(wrongId, false), "register");

  // STEP 2 completed for the current Google identity -> straight to next.
  const done = user({
    identities: [emailIdentity, googleIdentity],
    user_metadata: { ...completedMetadata, ...buildGoogleConsentMetadata({ identities: [googleIdentity] }) },
  });
  assert.equal(resolveGoogleRegistrationState(done), "google_complete");
  assert.equal(decideAuthCallbackDestination(done, false), "next");
  assert.equal(isBlockedFromWritesUntilRegistered(done), false);

  // Bound identity id but a consent flag missing -> still STEP 2.
  const missingConsent = user({
    identities: [googleIdentity],
    user_metadata: {
      ...completedMetadata,
      account_enforcement_ack: false,
      [GOOGLE_CONSENT_IDENTITY_KEY]: GOOGLE_ID,
    },
  });
  assert.equal(decideAuthCallbackDestination(missingConsent, false), "register");
  const missingName = user({
    identities: [googleIdentity],
    user_metadata: {
      ...completedMetadata,
      display_name: "",
      display_name_candidate: "",
      [GOOGLE_CONSENT_IDENTITY_KEY]: GOOGLE_ID,
    },
  });
  assert.equal(decideAuthCallbackDestination(missingName, false), "register");

  // Re-linked Google identity (new identity id) -> consent again.
  const relinked = user({
    identities: [{ ...googleIdentity, identity_id: OTHER_GOOGLE_ID, created_at: "2026-12-01T00:00:00Z" }],
    user_metadata: { ...completedMetadata, [GOOGLE_CONSENT_IDENTITY_KEY]: GOOGLE_ID },
  });
  assert.equal(decideAuthCallbackDestination(relinked, false), "register");

  // A password-reset link is honoured even before STEP 2.
  assert.equal(decideAuthCallbackDestination(fresh, true), "next");

  assert.deepEqual(buildGoogleConsentMetadata({ identities: [emailIdentity] }), {});
}

function testCallbackRouteWiring() {
  const route = readFileSync("src/app/auth/callback/route.ts", "utf8");
  const decide = route.indexOf("decideAuthCallbackDestination(");
  const finalize = route.indexOf("buildCompletedAccountRegistrationMetadata({");
  assert.ok(decide > 0 && finalize > 0, "callback must decide the destination and keep the email finalize");
  assert.ok(decide < finalize, "Google accounts must branch off before the email metadata finalize");
  assert.ok(route.includes('localizePath("/register", locale)'));
  assert.ok(route.includes("resolveExchangeFailureCode(requestUrl.searchParams)"));

  assert.equal(resolveExchangeFailureCode(new URLSearchParams("code=x")), "email_confirm_callback_failed");
  assert.equal(resolveExchangeFailureCode(new URLSearchParams("flow=oauth&code=x")), "oauth_failed");
}

function testResetNoticeWins() {
  // PR1 review S3: a failed password-reset link shows the reset guidance for every code.
  for (const code of AUTH_CALLBACK_ERROR_CODES) {
    assert.equal(resolveAuthCallbackNoticeKey(code, true), "resetCallbackFailed", code);
  }
  assert.equal(resolveAuthCallbackNoticeKey("oauth_failed", false), "oauthFailed");
}

async function testFlagAndButton() {
  for (const value of [undefined, null, "", "false", "1", "TRUE", " true", "yes"]) {
    assert.equal(isGoogleSignInEnabledValue(value), false, `flag ${String(value)} must be off`);
  }
  assert.equal(isGoogleSignInEnabledValue("true"), true);

  assert.equal(
    buildGoogleOAuthRedirectTo("https://www.syosetu-libread.com/", "/en/works/1?x=1"),
    "https://www.syosetu-libread.com/auth/callback?flow=oauth&next=%2Fen%2Fworks%2F1%3Fx%3D1"
  );

  const { default: GoogleSignInButton } = await import("../src/components/auth/GoogleSignInButton");

  delete process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED;
  assert.equal(renderToStaticMarkup(createElement(GoogleSignInButton, { nextPath: "/" })), "");
  process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED = "false";
  assert.equal(renderToStaticMarkup(createElement(GoogleSignInButton, { nextPath: "/" })), "");

  process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED = "true";
  const html = renderToStaticMarkup(createElement(GoogleSignInButton, { nextPath: "/" }));
  assert.ok(html.includes(authDictionaries.ja.continueWithGoogle), "enabled button shows localized text");
  assert.ok(html.includes("<svg"), "logo is inline SVG");
  assert.equal(/<img|https?:\/\/(?!www\.w3\.org)/.test(html), false, "no externally loaded logo");
  delete process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED;

  for (const locale of ["ja", "en", "ko"] as const) {
    for (const key of ["continueWithGoogle", "orDivider", "googleRedirectFailed"] as const) {
      assert.ok(authDictionaries[locale][key].trim().length > 0, `${locale}.${key}`);
    }
    for (const key of ["googleRegistration", "googleRegisterDescription", "googleSignedInHint"] as const) {
      assert.ok(accountDictionaries[locale][key].trim().length > 0, `${locale}.${key}`);
    }
    assert.ok(authDictionaries[locale].continueWithGoogle.includes("Google"));
  }

  // Both pages render the button only behind the flag.
  for (const page of ["src/app/login/LoginPageClient.tsx", "src/app/register/page.tsx"]) {
    const source = readFileSync(page, "utf8");
    assert.ok(source.includes("isGoogleSignInEnabled() ?"), `${page} must gate the button on the flag`);
    assert.ok(source.includes("<GoogleSignInButton"), `${page} must render the button`);
  }
  const buttonSource = readFileSync("src/components/auth/GoogleSignInButton.tsx", "utf8");
  assert.ok(buttonSource.includes('provider: "google"'));
  assert.equal(/scopes\s*:/.test(buttonSource), false, "default scopes only");
}

function testOfficialAccount() {
  const official = {
    email: OFFICIAL_ACCOUNT_EMAIL,
    email_confirmed_at: "2026-01-01T00:00:00Z",
    identities: [emailIdentity],
  };
  assert.equal(isOfficialAccountUser(official), true);
  assert.equal(isOfficialNarrationAccountUser(official), true);
  // Google linked onto the official account keeps it official (email identity remains).
  assert.equal(isOfficialAccountUser({ ...official, identities: [emailIdentity, googleIdentity] }), true);
  // A Google-only account with the official address is not official.
  const googleOnly = { ...official, identities: [googleIdentity] };
  assert.equal(isOfficialAccountUser(googleOnly), false);
  assert.equal(isOfficialNarrationAccountUser(googleOnly), false);
  // Unconfirmed email is not official.
  assert.equal(isOfficialAccountUser({ ...official, email_confirmed_at: null }), false);
  assert.equal(isOfficialAccountUser({ ...official, email: "other@example.com" }), false);
  assert.equal(isOfficialAccountUser(null), false);
  assert.equal(hasConfirmedEmailIdentity({ email_confirmed_at: "x", identities: [] }), false);

  // Grant sites use the user-based check, not the email alone.
  const grantSites = [
    "src/app/api/recordings/aivis-generate/route.ts",
    "src/app/api/recordings/aivis-autogen-run-pending/route.ts",
    "src/app/api/recordings/nemo-generate/route.ts",
    "src/app/api/recordings/nemo-autogen/route.ts",
    "src/app/api/recordings/nemo-autogen-backfill/route.ts",
    "src/app/api/recordings/nemo-autogen-run-pending/route.ts",
    "src/lib/translation/episodeTranslationServer.ts",
    "src/lib/auth/officialAccount.server.ts",
    "src/app/write/series/new/page.tsx",
    "src/app/write/series/[seriesId]/page.tsx",
    "src/app/subscription/page.tsx",
  ];
  for (const file of grantSites) {
    const source = readFileSync(file, "utf8");
    assert.equal(/isOfficial(Narration)?AccountEmail\(/.test(source), false, `${file} must not grant by email alone`);
    assert.ok(/isOfficial(Narration)?AccountUser\(/.test(source), `${file} must use the user-based check`);
  }
}

function testWriteGateCoverage() {
  const gated: Array<[string, string]> = [
    ["src/app/actions/createOwnedSeries.ts", "isBlockedFromWritesUntilRegistered(auth.user)"],
    ["src/app/actions/saveOwnedEpisode.ts", "isBlockedFromWritesUntilRegistered(auth.user)"],
    ["src/app/actions/saveOwnedSeriesWorkspace.ts", "isBlockedFromWritesUntilRegistered(auth.user)"],
    ["src/app/api/recordings/human-upload-session/route.ts", "registrationRequiredResponse(user)"],
    ["src/app/api/recordings/human-upload-finalize/route.ts", "registrationRequiredResponse(user)"],
    ["src/app/api/recordings/human-publish/route.ts", "registrationRequiredResponse(user)"],
    ["src/lib/translation/prepareEpisodeTranslationGeneration.ts", "access.registrationBlocked"],
    ["src/app/api/library/translations/generate/route.ts", "access.registrationBlocked"],
    ["src/app/api/human-translations/draft/route.ts", "context.registrationBlocked"],
    ["src/app/api/human-translations/[translationId]/publish/route.ts", "current.registrationBlocked"],
    ["src/app/api/human-translations/[translationId]/route.ts", "current.registrationBlocked"],
    ["src/app/api/word-explanations/route.ts", "registrationRequiredResponse(gateAuth.user)"],
    ["src/features/comment/EpisodeCommentSection.tsx", "isBlockedFromWritesUntilRegistered(user)"],
    ["src/features/review/SeriesReviewSection.tsx", "isBlockedFromWritesUntilRegistered(user)"],
  ];
  for (const [file, needle] of gated) {
    assert.ok(readFileSync(file, "utf8").includes(needle), `${file} must include ${needle}`);
  }
  for (const [file, field] of [
    ["src/lib/translation/episodeTranslationServer.ts", "registrationBlocked: isBlockedFromWritesUntilRegistered(user)"],
    ["src/lib/library/privateLibraryTranslationServer.ts", "registrationBlocked: isBlockedFromWritesUntilRegistered(user)"],
  ] as const) {
    assert.ok(readFileSync(file, "utf8").includes(field), `${file} must compute ${field}`);
  }
  // STEP 2's own profile save must stay reachable.
  assert.equal(
    readFileSync("src/app/api/account/profile/route.ts", "utf8").includes("registrationRequiredResponse"),
    false
  );
  // The register page does not trust pre-existing flags for Google accounts.
  const register = readFileSync("src/app/register/page.tsx", "utf8");
  assert.ok(register.includes("buildGoogleConsentMetadata(freshUser.user)"));
  assert.ok(register.includes('resolveGoogleRegistrationState(user) === "google_complete"'));
}

async function main() {
  testCallbackBranches();
  testCallbackRouteWiring();
  testResetNoticeWins();
  await testFlagAndButton();
  testOfficialAccount();
  testWriteGateCoverage();
  console.log(
    "PASS: Google button is flag-gated; callback sends unregistered Google accounts to STEP 2; write gate and official-account grant checks hold"
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
