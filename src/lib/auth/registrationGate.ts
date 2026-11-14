// Issue #142 PR2: registration state for accounts that have a Google identity.
//
// Pure helpers (no server-only imports) shared by /auth/callback, the
// register page (STEP 2), the server-side write gate and the tests.
//
// Why the consent is bound to the Google identity id:
// Supabase links a Google sign-in to an existing user with the same email
// (automatic identity linking). If that user was created by someone else and
// never confirmed (a pre-account-takeover attempt), its user_metadata may
// already contain `account_registration_completed: true` and the three
// consent flags, written by the other party. Those flags must not count as
// the Google user's consent. `identity_id` is the uuid Supabase generates for
// the auth.identities row when the Google identity is attached, so nobody can
// put the matching value into user_metadata before that identity exists.
// STEP 2 records it under GOOGLE_CONSENT_IDENTITY_KEY; a Google identity that
// is new (or re-linked) therefore always has to go through STEP 2 again.
//
// Limitation: user_metadata is writable by the signed-in user themself
// (supabase.auth.updateUser). A user can set these keys for their own account
// without the UI. That only lets a user skip their own consent screen; it
// does not let another person's stale metadata count.

import {
  hasRequiredAccountRegistrationConsent,
  isAccountRegistrationCompleted,
  readAccountRegistrationConsent,
  readAccountRegistrationDisplayName,
} from "@/lib/auth/accountSignupConsent";

export const GOOGLE_CONSENT_IDENTITY_KEY = "account_google_consent_identity_id";

export type IdentityLike = {
  provider?: string | null;
  identity_id?: string | null;
  created_at?: string | null;
};

export type RegistrationUserLike = {
  email?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
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

/**
 * True when the account has a confirmed email identity (signed up with email
 * and confirmed it). Used by the official-account check so that a Google
 * identity alone never makes an account official.
 */
export function hasConfirmedEmailIdentity(
  user: RegistrationUserLike | null | undefined
): boolean {
  const confirmed = readText(user?.email_confirmed_at).length > 0;
  return (
    confirmed &&
    identitiesOf(user).some((identity) => readText(identity?.provider) === "email")
  );
}

function hasCompleteMetadataProfile(metadata: Record<string, unknown>): boolean {
  return (
    isAccountRegistrationCompleted(metadata) &&
    readAccountRegistrationDisplayName(metadata).length > 0 &&
    hasRequiredAccountRegistrationConsent({
      agreedToTerms: readAccountRegistrationConsent(metadata, "account_public_profile_ack"),
      agreedToPrivacy: readAccountRegistrationConsent(metadata, "account_public_content_ack"),
      acknowledgedPublicSurface: readAccountRegistrationConsent(
        metadata,
        "account_enforcement_ack"
      ),
    })
  );
}

/**
 * Registration state of an account with a Google identity:
 * - "not_google": no Google identity; the email flow applies unchanged.
 * - "google_complete": STEP 2 was completed for the current Google identity.
 * - "google_needs_profile": display name or consent missing, or the consent
 *   was not given for the current Google identity (first link / re-link).
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

  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const identityId = readText(googleIdentity.identity_id);
  const consentedIdentityId = readText(metadata[GOOGLE_CONSENT_IDENTITY_KEY]);

  if (
    identityId.length > 0 &&
    consentedIdentityId === identityId &&
    hasCompleteMetadataProfile(metadata)
  ) {
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

/** Metadata keys STEP 2 adds for a Google account (on top of the completed profile). */
export function buildGoogleConsentMetadata(
  user: RegistrationUserLike | null | undefined
): Record<string, string> {
  const googleIdentity = findGoogleIdentity(user);
  const identityId = readText(googleIdentity?.identity_id);
  if (!identityId) return {};
  return { [GOOGLE_CONSENT_IDENTITY_KEY]: identityId };
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
