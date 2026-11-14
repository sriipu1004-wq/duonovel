// Issue #142 PR3: pure decision logic for POST /api/account/google-consent.
//
// The route records STEP 2 for a Google account in two places that the user
// cannot write:
// - public.account_consents (append-only; authenticated/anon have no
//   INSERT/UPDATE/DELETE), one row per consent;
// - auth.users.raw_app_meta_data (GOOGLE_CONSENT_* keys), which is copied into
//   the JWT `app_metadata` claim and read by the app gate and by RLS.
// Kept free of server-only imports so the tests can call it directly.

import {
  ACCOUNT_PRIVACY_VERSION,
  ACCOUNT_TERMS_VERSION,
  normalizeDisplayName,
  validateDisplayName,
} from "@/lib/auth/accountSignupConsent";
import {
  GOOGLE_CONSENT_AT_KEY,
  GOOGLE_CONSENT_IDENTITY_KEY,
  GOOGLE_CONSENT_PRIVACY_VERSION_KEY,
  GOOGLE_CONSENT_TERMS_VERSION_KEY,
  findGoogleIdentity,
  type RegistrationUserLike,
} from "@/lib/auth/registrationGate";

export const GOOGLE_CONSENT_PROVIDER = "google";

export type GoogleConsentErrorCode =
  | "invalid_request"
  | "display_name_invalid"
  | "display_name_not_saved"
  | "consent_missing"
  | "no_google_identity";

export type AccountConsentRow = {
  user_id: string;
  identity_id: string;
  provider: typeof GOOGLE_CONSENT_PROVIDER;
  terms_version: string;
  privacy_version: string;
  agreed_to_terms: true;
  agreed_to_privacy: true;
  acknowledged_public_surface: true;
  consented_at: string;
};

export type GoogleConsentDecision =
  | {
      ok: true;
      /** The current Google identity already has a server-recorded consent. */
      alreadyRecorded: boolean;
      identityId: string;
      displayName: string;
      row: AccountConsentRow;
      appMetadata: Record<string, string>;
    }
  | { ok: false; status: 400 | 409; error: GoogleConsentErrorCode };

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Decides whether a consent may be recorded.
 * - `user` must be the result of `auth.getUser()` (verified by the Auth server).
 * - `payload` is the request body: displayName and the three consents, each
 *   strictly `true`.
 * - `storedDisplayName` is the user's current public.users.display_name; it
 *   must equal the submitted name, so the profile save (STEP 2 runs it first)
 *   has actually happened.
 */
export function decideGoogleConsent(args: {
  user: (RegistrationUserLike & { id: string }) | null | undefined;
  payload: unknown;
  storedDisplayName: string | null | undefined;
  now: Date;
}): GoogleConsentDecision {
  const { user, payload } = args;
  if (!user || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, status: 400, error: "invalid_request" };
  }
  const body = payload as Record<string, unknown>;

  if (
    body.agreedToTerms !== true ||
    body.agreedToPrivacy !== true ||
    body.acknowledgedPublicSurface !== true
  ) {
    return { ok: false, status: 400, error: "consent_missing" };
  }

  const displayName = normalizeDisplayName(readText(body.displayName));
  if (!displayName || validateDisplayName(displayName)) {
    return { ok: false, status: 400, error: "display_name_invalid" };
  }
  if (normalizeDisplayName(readText(args.storedDisplayName)) !== displayName) {
    return { ok: false, status: 409, error: "display_name_not_saved" };
  }

  const googleIdentity = findGoogleIdentity(user);
  const identityId = readText(googleIdentity?.identity_id);
  if (!identityId) {
    return { ok: false, status: 409, error: "no_google_identity" };
  }

  const consentedAt = args.now.toISOString();
  const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    alreadyRecorded: readText(appMetadata[GOOGLE_CONSENT_IDENTITY_KEY]) === identityId,
    identityId,
    displayName,
    row: {
      user_id: user.id,
      identity_id: identityId,
      provider: GOOGLE_CONSENT_PROVIDER,
      terms_version: ACCOUNT_TERMS_VERSION,
      privacy_version: ACCOUNT_PRIVACY_VERSION,
      agreed_to_terms: true,
      agreed_to_privacy: true,
      acknowledged_public_surface: true,
      consented_at: consentedAt,
    },
    appMetadata: {
      [GOOGLE_CONSENT_IDENTITY_KEY]: identityId,
      [GOOGLE_CONSENT_TERMS_VERSION_KEY]: ACCOUNT_TERMS_VERSION,
      [GOOGLE_CONSENT_PRIVACY_VERSION_KEY]: ACCOUNT_PRIVACY_VERSION,
      [GOOGLE_CONSENT_AT_KEY]: consentedAt,
    },
  };
}
