// Issue #142: registration state for accounts that have a Google identity.
//
// Pure helpers (no server-only imports) shared by /auth/callback, the
// register page (STEP 2), the server-side write gate and the tests.
//
// Why the consent is bound to the Google identity id:
// Supabase links a Google sign-in to an existing user with the same email
// (automatic identity linking). If that user was created by someone else and
// never confirmed (a pre-account-takeover attempt), its metadata may already
// contain "completed" flags written by the other party. Those flags must not
// count as the Google user's consent. `identity_id` is the uuid Supabase
// generates for the auth.identities row when the Google identity is attached.
// A Google identity that is new (or re-linked) therefore always has to go
// through STEP 2 again.
//
// PR3 (PR #204 review S1): the consent is read from `app_metadata`, which only
// the server (service role) can write. STEP 2 calls
// POST /api/account/google-consent, which appends a row to
// public.account_consents and writes GOOGLE_CONSENT_IDENTITY_KEY into
// app_metadata. user_metadata (writable by the user through
// supabase.auth.updateUser) is no longer read for this decision. The same
// app_metadata key is checked by RLS (migration 20261115120000).

/** app_metadata keys written only by POST /api/account/google-consent (service role). */
export const GOOGLE_CONSENT_IDENTITY_KEY = "google_consent_identity_id";
export const GOOGLE_CONSENT_TERMS_VERSION_KEY = "google_consent_terms_version";
export const GOOGLE_CONSENT_PRIVACY_VERSION_KEY = "google_consent_privacy_version";
export const GOOGLE_CONSENT_AT_KEY = "google_consent_at";

/**
 * The email confirmation must precede every Google identity by at least this
 * much for the official-account check (PR #204 review S3). When a Google
 * sign-in itself confirms an address, `email_confirmed_at` and the Google
 * identity's `created_at` are written within the same request, possibly in
 * either order and a few milliseconds apart, so a bare "earlier than" check
 * could pass by accident. 60 seconds is far longer than one request and far
 * shorter than any real gap between confirming an email and linking Google.
 */
export const EMAIL_CONFIRMATION_BEFORE_GOOGLE_MARGIN_MS = 60_000;

export type IdentityLike = {
  provider?: string | null;
  identity_id?: string | null;
  created_at?: string | null;
  identity_data?: { [key: string]: unknown } | null;
};

export type RegistrationUserLike = {
  email?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
  identities?: IdentityLike[] | null;
};

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function identitiesOf(user: RegistrationUserLike | null | undefined): IdentityLike[] {
  return Array.isArray(user?.identities) ? user!.identities! : [];
}

/** The most recently attached Google identity, or null. */
export function findGoogleIdentity(
  user: RegistrationUserLike | null | undefined
): IdentityLike | null {
  const google = identitiesOf(user).filter(
    (identity) => readText(identity?.provider) === "google"
  );
  if (google.length === 0) return null;
  return google.reduce((latest, identity) =>
    readText(identity.created_at) > readText(latest.created_at) ? identity : latest
  );
}

export function hasGoogleIdentity(
  user: RegistrationUserLike | null | undefined
): boolean {
  return findGoogleIdentity(user) !== null;
}

function parseTime(value: unknown): number | null {
  const text = readText(value);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? time : null;
}

/**
 * True when the account's EMAIL identity itself was confirmed, not merely the
 * user row. Used by the official-account check so that a Google identity
 * never makes an account official (PR #204 review S3).
 *
 * What is checked, and why:
 * 1. An identity with provider "email" whose `identity_data.email` equals the
 *    account email.
 * 2. That identity is confirmed when EITHER
 *    a. `identity_data.email_verified === true`, OR
 *    b. `user.email_confirmed_at` is set AND at least
 *       EMAIL_CONFIRMATION_BEFORE_GOOGLE_MARGIN_MS earlier than the creation
 *       of every Google identity on the account (or there is none).
 * `email_verified` alone cannot be used here: production check 2026-11-15
 * (aggregate only) shows the official account's email identity has
 * `email_verified = false` although the account was confirmed through the
 * email link (only 7 of 17 email identities have it true). (b) is the
 * identity-level evidence that remains: the account was confirmed before any
 * Google identity existed, so the confirmation can only have come from the
 * email identity. If a Google sign-in is what confirmed the address (auto
 * link onto an unconfirmed account), `email_confirmed_at` is not earlier than
 * the Google identity and (b) fails.
 */
export function hasConfirmedEmailIdentity(
  user: RegistrationUserLike | null | undefined
): boolean {
  const accountEmail = readText(user?.email).toLowerCase();
  if (!accountEmail) return false;

  const emailIdentity = identitiesOf(user).find(
    (identity) =>
      readText(identity?.provider) === "email" &&
      readText(identity?.identity_data?.email).toLowerCase() === accountEmail
  );
  if (!emailIdentity) return false;

  if (emailIdentity.identity_data?.email_verified === true) return true;

  const confirmedAt = parseTime(user?.email_confirmed_at);
  if (confirmedAt === null) return false;

  const googleCreatedTimes = identitiesOf(user)
    .filter((identity) => readText(identity?.provider) === "google")
    .map((identity) => parseTime(identity.created_at));
  // A Google identity without a readable creation time cannot be ordered.
  if (googleCreatedTimes.some((time) => time === null)) return false;
  return googleCreatedTimes.every(
    (time) => confirmedAt + EMAIL_CONFIRMATION_BEFORE_GOOGLE_MARGIN_MS <= (time as number)
  );
}

/**
 * Registration state of an account with a Google identity:
 * - "not_google": no Google identity; the email flow applies unchanged.
 * - "google_complete": the server recorded the consent (display name and the
 *   three consents were checked by POST /api/account/google-consent) for the
 *   current Google identity, in app_metadata.
 * - "google_needs_profile": no server-recorded consent for the current Google
 *   identity (first link / re-link / never completed).
 */
export type GoogleRegistrationState =
  | "not_google"
  | "google_complete"
  | "google_needs_profile";

export function resolveGoogleRegistrationState(
  user: RegistrationUserLike | null | undefined
): GoogleRegistrationState {
  const googleIdentity = findGoogleIdentity(user);
  if (!googleIdentity) return "not_google";

  const appMetadata = (user?.app_metadata ?? {}) as Record<string, unknown>;
  const identityId = readText(googleIdentity.identity_id);
  const consentedIdentityId = readText(appMetadata[GOOGLE_CONSENT_IDENTITY_KEY]);

  if (identityId.length > 0 && consentedIdentityId === identityId) {
    return "google_complete";
  }
  return "google_needs_profile";
}

/**
 * Server-side write gate. Email-only accounts keep their current behaviour
 * (not blocked here); accounts with a Google identity must have completed
 * STEP 2 for that identity.
 */
export function isBlockedFromWritesUntilRegistered(
  user: RegistrationUserLike | null | undefined
): boolean {
  return resolveGoogleRegistrationState(user) === "google_needs_profile";
}

export const REGISTRATION_REQUIRED_ERROR = "registration_required";

/**
 * Where /auth/callback sends a signed-in user (after a successful code
 * exchange):
 * - "email_flow": no Google identity; the existing email handling runs
 *   unchanged (metadata finalize, then /login?confirmed=1 or reset-password).
 * - "register": Google account that still needs STEP 2.
 * - "next": Google account that completed STEP 2, or any account following
 *   a password-reset link (resetting a password is not a public write).
 */
export type AuthCallbackDestination = "email_flow" | "register" | "next";

export function decideAuthCallbackDestination(
  user: RegistrationUserLike | null | undefined,
  nextPathIsPasswordReset: boolean
): AuthCallbackDestination {
  const state = resolveGoogleRegistrationState(user);
  if (state === "not_google") return "email_flow";
  if (state === "google_needs_profile" && !nextPathIsPasswordReset) return "register";
  return "next";
}
