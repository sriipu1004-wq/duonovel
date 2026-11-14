// Issue #142 PR2/PR3 regression: "Continue with Google" behind a default-off
// flag, /auth/callback branching for Google accounts (complete / needs STEP 2
// / first link with stale metadata), the server-side write gate, the
// official-account grant check, and (PR3) the consent recorded only by the
// server in app_metadata + account_consents, the RLS migration source and the
// before-user-created hook function (the SQL itself is exercised by
// scripts/issue142-google-consent/check.sql on a disposable PostgreSQL).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-only-placeholder";

import {
  EMAIL_CONFIRMATION_BEFORE_GOOGLE_MARGIN_MS,
  GOOGLE_CONSENT_IDENTITY_KEY,
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
import {
  ACCOUNT_PRIVACY_VERSION,
  ACCOUNT_TERMS_VERSION,
  buildCompletedAccountRegistrationMetadata,
} from "../src/lib/auth/accountSignupConsent";
import { decideGoogleConsent } from "../src/lib/auth/googleConsent";
import { OFFICIAL_ACCOUNT_EMAIL, isOfficialAccountUser } from "../src/lib/auth/officialAccount";
import { isOfficialNarrationAccountUser } from "../src/lib/auth/officialNarrationAccount";
import { authDictionaries } from "../src/i18n/dictionaries/auth";
import { registrationGateDictionaries } from "../src/i18n/dictionaries/registrationGate";
import {
  buildRegisterPath,
  readRegistrationRequiredNotice,
  registrationRequiredMessage,
} from "../src/lib/auth/registrationGateMessage";
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

  // Even a guessed/wrong identity id in app_metadata does not count.
  const wrongId = user({
    identities: [googleIdentity],
    user_metadata: { ...completedMetadata },
    app_metadata: { provider: "email", providers: ["email", "google"], [GOOGLE_CONSENT_IDENTITY_KEY]: OTHER_GOOGLE_ID },
  });
  assert.equal(decideAuthCallbackDestination(wrongId, false), "register");

  // PR3 (PR #204 review S1): a consent the user wrote into user_metadata
  // themself (supabase.auth.updateUser) never counts, under the old PR2 key
  // or the new key.
  const selfWritten = user({
    identities: [googleIdentity],
    user_metadata: {
      ...completedMetadata,
      account_google_consent_identity_id: GOOGLE_ID,
      [GOOGLE_CONSENT_IDENTITY_KEY]: GOOGLE_ID,
    },
    app_metadata: { provider: "email", providers: ["email", "google"] },
  });
  assert.equal(resolveGoogleRegistrationState(selfWritten), "google_needs_profile");
  assert.equal(isBlockedFromWritesUntilRegistered(selfWritten), true);

  // Consent recorded by the server for the current Google identity -> next.
  const done = user({
    identities: [emailIdentity, googleIdentity],
    app_metadata: { provider: "email", providers: ["email", "google"], [GOOGLE_CONSENT_IDENTITY_KEY]: GOOGLE_ID },
  });
  assert.equal(resolveGoogleRegistrationState(done), "google_complete");
  assert.equal(decideAuthCallbackDestination(done, false), "next");
  assert.equal(isBlockedFromWritesUntilRegistered(done), false);

  // Re-linked Google identity (new identity id) -> consent again.
  const relinked = user({
    identities: [{ ...googleIdentity, identity_id: OTHER_GOOGLE_ID, created_at: "2026-12-01T00:00:00Z" }],
    app_metadata: { [GOOGLE_CONSENT_IDENTITY_KEY]: GOOGLE_ID },
  });
  assert.equal(decideAuthCallbackDestination(relinked, false), "register");

  // A Google identity without an identity_id never completes.
  const noId = user({
    identities: [{ ...googleIdentity, identity_id: null }],
    app_metadata: { [GOOGLE_CONSENT_IDENTITY_KEY]: "" },
  });
  assert.equal(resolveGoogleRegistrationState(noId), "google_needs_profile");

  // A password-reset link is honoured even before STEP 2.
  assert.equal(decideAuthCallbackDestination(fresh, true), "next");
}

function testConsentApiDecision() {
  const now = new Date("2026-11-15T12:00:00Z");
  const google = {
    id: "00000000-0000-4000-8000-00000000000a",
    email: "someone@example.com",
    identities: [emailIdentity, googleIdentity],
    app_metadata: { provider: "email", providers: ["email", "google"] },
  };
  const body = {
    displayName: "PenName",
    agreedToTerms: true,
    agreedToPrivacy: true,
    acknowledgedPublicSurface: true,
  };

  const ok = decideGoogleConsent({ user: google, payload: body, storedDisplayName: "PenName", now });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.alreadyRecorded, false);
    assert.equal(ok.identityId, GOOGLE_ID);
    assert.deepEqual(ok.row, {
      user_id: google.id,
      identity_id: GOOGLE_ID,
      provider: "google",
      terms_version: ACCOUNT_TERMS_VERSION,
      privacy_version: ACCOUNT_PRIVACY_VERSION,
      agreed_to_terms: true,
      agreed_to_privacy: true,
      acknowledged_public_surface: true,
      consented_at: now.toISOString(),
    });
    assert.equal(ok.appMetadata[GOOGLE_CONSENT_IDENTITY_KEY], GOOGLE_ID);
    assert.equal(ok.appMetadata.google_consent_terms_version, ACCOUNT_TERMS_VERSION);
    assert.equal(ok.appMetadata.google_consent_privacy_version, ACCOUNT_PRIVACY_VERSION);
    // The recorded app_metadata is exactly what the gate accepts.
    assert.equal(
      resolveGoogleRegistrationState({ ...google, app_metadata: { ...google.app_metadata, ...ok.appMetadata } }),
      "google_complete"
    );
  }

  const already = decideGoogleConsent({
    user: { ...google, app_metadata: { ...google.app_metadata, [GOOGLE_CONSENT_IDENTITY_KEY]: GOOGLE_ID } },
    payload: body,
    storedDisplayName: "PenName",
    now,
  });
  assert.equal(already.ok && already.alreadyRecorded, true);

  const refusals: Array<[string, Parameters<typeof decideGoogleConsent>[0], string, number]> = [
    ["no user", { user: null, payload: body, storedDisplayName: "PenName", now }, "invalid_request", 400],
    ["array body", { user: google, payload: [], storedDisplayName: "PenName", now }, "invalid_request", 400],
    ["terms missing", { user: google, payload: { ...body, agreedToTerms: false }, storedDisplayName: "PenName", now }, "consent_missing", 400],
    ["privacy as string", { user: google, payload: { ...body, agreedToPrivacy: "true" }, storedDisplayName: "PenName", now }, "consent_missing", 400],
    ["public ack missing", { user: google, payload: { ...body, acknowledgedPublicSurface: undefined }, storedDisplayName: "PenName", now }, "consent_missing", 400],
    ["empty name", { user: google, payload: { ...body, displayName: " " }, storedDisplayName: "", now }, "display_name_invalid", 400],
    ["url name", { user: google, payload: { ...body, displayName: "https://x.example" }, storedDisplayName: "https://x.example", now }, "display_name_invalid", 400],
    ["profile not saved", { user: google, payload: body, storedDisplayName: null, now }, "display_name_not_saved", 409],
    ["other saved name", { user: google, payload: body, storedDisplayName: "Other", now }, "display_name_not_saved", 409],
    ["email only", { user: { ...google, identities: [emailIdentity] }, payload: body, storedDisplayName: "PenName", now }, "no_google_identity", 409],
    ["google without id", { user: { ...google, identities: [{ ...googleIdentity, identity_id: "" }] }, payload: body, storedDisplayName: "PenName", now }, "no_google_identity", 409],
  ];
  for (const [label, input, error, status] of refusals) {
    const result = decideGoogleConsent(input);
    assert.equal(result.ok, false, label);
    if (!result.ok) {
      assert.equal(result.error, error, label);
      assert.equal(result.status, status, label);
    }
  }

  // Route wiring: verified user, service role writes, no user_metadata.
  const route = readFileSync("src/app/api/account/google-consent/route.ts", "utf8");
  assert.ok(route.includes("supabase.auth.getUser()"), "route must verify the session with the Auth server");
  assert.ok(route.includes("admin.auth.admin.getUserById(user.id)"), "route must re-read the user with the service role");
  assert.ok(route.includes('admin.from("account_consents").insert(decision.row)'));
  assert.ok(route.includes("app_metadata: { ...currentAppMetadata, ...decision.appMetadata }"));
  assert.equal(route.includes("user_metadata"), false, "consent is never written to user_metadata");
  assert.ok(
    route.indexOf('from("account_consents").insert') < route.indexOf("updateUserById"),
    "the consent row is appended before app_metadata marks the account complete"
  );

  // STEP 2 calls the API and refreshes the JWT; it no longer writes the
  // consent key itself.
  const register = readFileSync("src/app/register/page.tsx", "utf8");
  assert.ok(register.includes('fetch("/api/account/google-consent"'));
  assert.ok(register.includes("supabase.auth.refreshSession()"));
  assert.ok(register.includes("await recordGoogleConsent(availableDisplayName)"));
  assert.equal(register.includes("buildGoogleConsentMetadata"), false);
  assert.equal(register.includes("GOOGLE_CONSENT_IDENTITY_KEY"), false);
  assert.ok(
    register.indexOf("await syncPublicUserProfile(availableDisplayName)") <
      register.indexOf("await recordGoogleConsent(availableDisplayName)"),
    "the public display name is saved before the consent (the API checks it)"
  );
  const gate = readFileSync("src/lib/auth/registrationGate.ts", "utf8");
  assert.ok(gate.includes("user?.app_metadata"));
  assert.equal(gate.includes("user?.user_metadata"), false, "the gate does not read user_metadata");
}

function testMigrationSource() {
  const migration = readFileSync(
    "supabase/migrations/20261115120000_issue142_google_consent_rls.sql",
    "utf8"
  );
  const code = migration.replace(/^\s*--.*$/gm, "");
  for (const table of [
    "series",
    "episodes",
    "user_episode_comments",
    "user_series_reviews",
    "series_translation_glossary_entries",
    "series_translation_glossary_targets",
    "series_translation_profiles",
    "users",
  ]) {
    assert.ok(code.includes(`('${table}', `), `${table} must be guarded`);
  }
  assert.ok(code.includes("as restrictive for insert to public"));
  assert.ok(code.includes("as restrictive for update to public"));
  assert.ok(code.includes("auth.jwt() -> 'app_metadata'"));
  assert.ok(code.includes("google_consent_identity_id"));
  assert.equal(code.includes("user_metadata"), false, "RLS never reads user_metadata");
  assert.equal(/alter policy|drop policy if exists (?!%I|account_consents_select_own)/i.test(code), false, "existing policies are not altered or dropped");
  assert.ok(code.includes("revoke all on table public.account_consents from public, anon, authenticated, service_role"));
  assert.ok(code.includes("grant select on table public.account_consents to authenticated"));
  assert.ok(code.includes("grant select, insert on table public.account_consents to service_role"));
  assert.ok(code.includes("to supabase_auth_admin"));
  assert.ok(code.includes("from authenticated, anon, public"));

  const workflow = readFileSync(".github/workflows/issue142-google-consent-rls.yml", "utf8");
  assert.ok(workflow.includes("scripts/issue142-google-consent/check.sql"));
  assert.ok(workflow.includes("postgres:17"));
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
  // Production shape (2026-11-15, aggregate check): the official account's
  // email identity has identity_data.email matching and email_verified=false,
  // and the account was confirmed through the email link.
  const officialEmailIdentity = {
    provider: "email",
    identity_id: "e-official",
    created_at: "2026-01-01T00:00:00Z",
    identity_data: { email: OFFICIAL_ACCOUNT_EMAIL, email_verified: false },
  };
  const official = {
    email: OFFICIAL_ACCOUNT_EMAIL,
    email_confirmed_at: "2026-01-01T00:05:00Z",
    identities: [officialEmailIdentity],
  };
  assert.equal(isOfficialAccountUser(official), true);
  assert.equal(isOfficialNarrationAccountUser(official), true);
  // Google linked later onto the official account keeps it official
  // (confirmed through email before the Google identity existed).
  assert.equal(
    isOfficialAccountUser({ ...official, identities: [officialEmailIdentity, googleIdentity] }),
    true
  );
  // A Google-only account with the official address is not official.
  const googleOnly = { ...official, identities: [googleIdentity] };
  assert.equal(isOfficialAccountUser(googleOnly), false);
  assert.equal(isOfficialNarrationAccountUser(googleOnly), false);
  // Confirmation that came with (or after) the Google identity -- e.g. an
  // unconfirmed email account auto-linked by a Google sign-in -- is not the
  // email identity's own confirmation.
  const confirmedByGoogle = {
    ...official,
    email_confirmed_at: googleIdentity.created_at,
    identities: [officialEmailIdentity, googleIdentity],
  };
  assert.equal(isOfficialAccountUser(confirmedByGoogle), false);
  assert.equal(isOfficialNarrationAccountUser(confirmedByGoogle), false);
  assert.equal(
    isOfficialAccountUser({ ...confirmedByGoogle, email_confirmed_at: "2026-11-16T00:00:00Z" }),
    false
  );
  // ...unless the email identity itself carries email_verified=true.
  assert.equal(
    isOfficialAccountUser({
      ...confirmedByGoogle,
      identities: [
        { ...officialEmailIdentity, identity_data: { email: OFFICIAL_ACCOUNT_EMAIL, email_verified: true } },
        googleIdentity,
      ],
    }),
    true
  );
  // PR #204 review S3: the confirmation must precede the Google identity by
  // at least the margin (60 s), so a confirmation written by the same Google
  // sign-in a moment earlier does not count.
  assert.equal(EMAIL_CONFIRMATION_BEFORE_GOOGLE_MARGIN_MS, 60_000);
  const googleAt = Date.parse(googleIdentity.created_at);
  const confirmedSecondsBefore = (seconds: number) => ({
    ...official,
    email_confirmed_at: new Date(googleAt - seconds * 1000).toISOString(),
    identities: [officialEmailIdentity, googleIdentity],
  });
  assert.equal(isOfficialAccountUser(confirmedSecondsBefore(0.005)), false, "5 ms before");
  assert.equal(isOfficialAccountUser(confirmedSecondsBefore(30)), false, "30 s before");
  assert.equal(isOfficialAccountUser(confirmedSecondsBefore(59.999)), false, "just inside the margin");
  assert.equal(isOfficialAccountUser(confirmedSecondsBefore(60)), true, "exactly the margin");
  assert.equal(isOfficialAccountUser(confirmedSecondsBefore(3600)), true, "an hour before");
  assert.equal(isOfficialNarrationAccountUser(confirmedSecondsBefore(30)), false);
  assert.equal(isOfficialNarrationAccountUser(confirmedSecondsBefore(3600)), true);

  // A Google identity whose creation time is unknown cannot be ordered.
  assert.equal(
    isOfficialAccountUser({
      ...official,
      identities: [officialEmailIdentity, { ...googleIdentity, created_at: null }],
    }),
    false
  );
  // The email identity must be for the account's address.
  assert.equal(
    isOfficialAccountUser({
      ...official,
      identities: [{ ...officialEmailIdentity, identity_data: { email: "other@example.com", email_verified: true } }],
    }),
    false
  );
  // Unconfirmed email is not official.
  assert.equal(isOfficialAccountUser({ ...official, email_confirmed_at: null }), false);
  assert.equal(isOfficialAccountUser({ ...official, email: "other@example.com" }), false);
  assert.equal(isOfficialAccountUser(null), false);
  assert.equal(hasConfirmedEmailIdentity({ email: "a@b", email_confirmed_at: "2026-01-01T00:00:00Z", identities: [] }), false);
  assert.ok(
    readFileSync("src/lib/auth/registrationGate.ts", "utf8").includes("email_verified === true"),
    "the email identity's own verification flag is checked"
  );

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
    ["src/app/api/recordings/human-upload-session/route.ts", "await registrationRequiredResponse(user, \"text\")"],
    ["src/app/api/recordings/human-upload-finalize/route.ts", "await registrationRequiredResponse(user, \"text\")"],
    ["src/app/api/recordings/human-publish/route.ts", "await registrationRequiredResponse(user, \"text\")"],
    ["src/lib/translation/prepareEpisodeTranslationGeneration.ts", "access.registrationBlocked"],
    ["src/app/api/library/translations/generate/route.ts", "access.registrationBlocked"],
    ["src/app/api/human-translations/draft/route.ts", "context.registrationBlocked"],
    ["src/app/api/human-translations/[translationId]/publish/route.ts", "current.registrationBlocked"],
    ["src/app/api/human-translations/[translationId]/route.ts", "current.registrationBlocked"],
    ["src/app/api/word-explanations/route.ts", "await registrationRequiredResponse(gateAuth.user, \"code\")"],
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
  assert.ok(register.includes('resolveGoogleRegistrationState(user) === "google_complete"'));
  // The consent API is STEP 2 itself and must stay reachable.
  assert.equal(
    readFileSync("src/app/api/account/google-consent/route.ts", "utf8").includes("registrationRequiredResponse"),
    false
  );
}

function testLocalizedGuidance() {
  // PR #204 review S3: the refusal text exists in ja/en/ko and names the
  // (localized) register page, so a password-login user with a linked Google
  // identity knows where to finish STEP 2.
  const texts = new Set<string>();
  for (const locale of ["ja", "en", "ko"] as const) {
    const text = registrationRequiredMessage(locale);
    const registerPath = buildRegisterPath(locale);
    assert.ok(text.includes(registerPath), `${locale} guidance names ${registerPath}`);
    assert.ok(registrationGateDictionaries[locale].completeRegistration.trim().length > 0);
    texts.add(text);
    assert.equal(readRegistrationRequiredNotice({ ok: false, code: "registration_required" }, locale), text);
    assert.equal(readRegistrationRequiredNotice({ ok: false, error: "registration_required" }, locale), text);
    assert.equal(readRegistrationRequiredNotice({ ok: false, error: "forbidden" }, locale), null);
    assert.equal(readRegistrationRequiredNotice(null, locale), null);
  }
  assert.equal(texts.size, 3, "each locale has its own text");
  assert.equal(buildRegisterPath("ja"), "/register");
  assert.equal(buildRegisterPath("en"), "/en/register");
  assert.equal(buildRegisterPath("ko"), "/ko/register");

  // No fixed Japanese refusal text in the server helper or the review section.
  const server = readFileSync("src/lib/auth/registrationGate.server.ts", "utf8");
  assert.equal(/[぀-ヿ一-龯]/u.test(server), false, "server helper has no fixed Japanese text");
  assert.ok(server.includes("registrationRequiredMessage(locale)"));
  assert.ok(server.includes("UI_LOCALE_COOKIE"), "API locale comes from the locale cookie (proxy does not run on /api)");
  const review = readFileSync("src/features/review/SeriesReviewSection.tsx", "utf8");
  assert.equal(review.includes("先に登録（表示名と同意）"), false);
  assert.ok(review.includes("registrationRequiredMessage(uiLocaleForNotice)"));

  // Every client of a gated write shows the guidance.
  for (const [file, needle] of [
    ["src/features/comment/EpisodeCommentSection.tsx", "registrationRequiredMessage(uiLocaleForNotice)"],
    ["src/features/write/WriteSeriesCreateForm.tsx", 'result.code === "registration_required"'],
    ["src/features/write/WriteSeriesForm.tsx", 'result.code === "registration_required"'],
    ["src/features/write/WriteEpisodeForm.tsx", 'result.code === "registration_required"'],
    ["src/features/translation/HumanTranslationEditor.tsx", "readRegistrationRequiredNotice(payload, locale)"],
    ["src/features/playback/BilingualEpisodePlayback.tsx", "readRegistrationRequiredNotice(payload, locale)"],
    ["src/features/playback/TranslationOnlyEpisodePlayback.tsx", "readRegistrationRequiredNotice(payload, uiLocaleForNotice)"],
    ["src/features/library/PrivateLibraryBilingualPlayback.tsx", "readRegistrationRequiredNotice(payload, uiLocaleForNotice)"],
    // PR #204 review S3: word explanations show it in en and ko too.
    ["src/features/playback/useBilingualWordExplanation.ts", "readRegistrationRequiredNotice(payload, locale)"],
  ] as const) {
    assert.ok(readFileSync(file, "utf8").includes(needle), `${file} must include ${needle}`);
  }
  // Recording routes put the localized text in `error` (the studio shows it).
  for (const file of [
    "src/app/api/recordings/human-upload-session/route.ts",
    "src/app/api/recordings/human-upload-finalize/route.ts",
    "src/app/api/recordings/human-publish/route.ts",
  ]) {
    assert.ok(readFileSync(file, "utf8").includes('registrationRequiredResponse(user, "text")'));
  }
}

async function main() {
  testCallbackBranches();
  testConsentApiDecision();
  testMigrationSource();
  testCallbackRouteWiring();
  testResetNoticeWins();
  await testFlagAndButton();
  testOfficialAccount();
  testWriteGateCoverage();
  testLocalizedGuidance();
  console.log(
    "PASS: Google button is flag-gated; callback sends unregistered Google accounts to STEP 2; consent is server-recorded in app_metadata; write gate, RLS migration source and official-account grant checks hold"
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
