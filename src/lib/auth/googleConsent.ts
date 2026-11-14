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
  | "display_name_taken"
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
      /**
       * app_metadata already names the current Google identity. This alone
       * does not mean the consent is recorded: RLS also needs an
       * account_consents row for that identity (see planConsentWrites).
       */
      metadataRecorded: boolean;
      identityId: string;
      displayName: string;
      row: AccountConsentRow;
      appMetadata: Record<string, string>;
    }
  | { ok: false; status: 400 | 409; error: GoogleConsentErrorCode };

export type ConsentRequestCheck =
  | { ok: true }
  | { ok: false; status: 403 | 415; error: "cross_origin" | "unsupported_media_type" };

/**
 * PR #205 review S3: the consent API accepts only a JSON body (so a plain
 * HTML form cannot post it) sent from this site's own origin.
 * - Content-Type must be application/json (parameters such as charset are
 *   allowed).
 * - Origin must be present and equal to the origin of the request URL, or to
 *   https://<Host> / http://<Host> (behind a proxy the request URL can carry
 *   an internal host). A missing Origin is refused: browsers send Origin on
 *   every cross-site and same-origin POST from fetch.
 */
export function checkConsentRequest(args: {
  requestUrl: string;
  contentType: string | null;
  origin: string | null;
  host: string | null;
}): ConsentRequestCheck {
  const mediaType = (args.contentType ?? "").split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return { ok: false, status: 415, error: "unsupported_media_type" };
  }

  const origin = (args.origin ?? "").trim();
  if (!origin || origin === "null") {
    return { ok: false, status: 403, error: "cross_origin" };
  }
  let originValue: string;
  try {
    const parsed = new URL(origin);
    originValue = parsed.origin;
    if (originValue !== origin.replace(/\/+$/, "")) {
      return { ok: false, status: 403, error: "cross_origin" };
    }
  } catch {
    return { ok: false, status: 403, error: "cross_origin" };
  }

  const allowed = new Set<string>();
  try {
    allowed.add(new URL(args.requestUrl).origin);
  } catch {
    // ignore an unparsable request URL; the Host header may still match
  }
  const host = (args.host ?? "").trim().toLowerCase();
  if (host && /^[a-z0-9.\-:\[\]]+$/.test(host)) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  return allowed.has(originValue.toLowerCase())
    ? { ok: true }
    : { ok: false, status: 403, error: "cross_origin" };
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Decides whether a consent may be recorded.
 * - `user` must be the result of `auth.getUser()` (verified by the Auth server).
 * - `payload` is the request body: displayName and the three consents, each
 *   strictly `true`.
 *
 * PR3c (PR #206 review S3-3): the display name is no longer saved before this
 * call. The route records the consent first and saves the public display name
 * afterwards, so a STEP 2 left half-way never changes the public name.
 */
export function decideGoogleConsent(args: {
  user: (RegistrationUserLike & { id: string }) | null | undefined;
  payload: unknown;
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
  const googleIdentity = findGoogleIdentity(user);
  const identityId = readText(googleIdentity?.identity_id);
  if (!identityId) {
    return { ok: false, status: 409, error: "no_google_identity" };
  }

  const consentedAt = args.now.toISOString();
  const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    metadataRecorded: readText(appMetadata[GOOGLE_CONSENT_IDENTITY_KEY]) === identityId,
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

export type ConsentWritePlan = {
  /** Append a row to public.account_consents for (user, identity, google). */
  insertRow: boolean;
  /** Write the GOOGLE_CONSENT_* keys to app_metadata. */
  updateAppMetadata: boolean;
};

/**
 * PR3c (PR #206 review S3-1): the consent counts only when BOTH stores have
 * it for the current Google identity (that is what RLS checks:
 * account_google_consent_satisfied()). Judging by app_metadata alone let an
 * account whose key was set but whose row was missing pass the app gate while
 * RLS refused it, with no way out. Each missing half is written again:
 * - no row for the identity -> insert one (even if app_metadata has the key);
 * - app_metadata key missing or for another identity -> write the keys.
 * The row is written before app_metadata (the route keeps that order).
 */
export function planConsentWrites(args: {
  metadataRecorded: boolean;
  rowExists: boolean;
}): ConsentWritePlan {
  return {
    insertRow: !args.rowExists,
    updateAppMetadata: !args.metadataRecorded,
  };
}
