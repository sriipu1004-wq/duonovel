// Fixed classification of /auth/callback failures (Issue #142 PR1).
// The login page shows a localized message per code and never displays the
// provider's own `error_description`, which is untrusted text from the URL.

export const AUTH_CALLBACK_ERROR_CODES = [
  "missing_auth_code",
  "oauth_cancelled",
  "oauth_failed",
  "email_confirm_callback_failed",
] as const;

export type AuthCallbackErrorCode = (typeof AUTH_CALLBACK_ERROR_CODES)[number];

export function isAuthCallbackErrorCode(
  value: string | null | undefined
): value is AuthCallbackErrorCode {
  return (
    typeof value === "string" &&
    (AUTH_CALLBACK_ERROR_CODES as readonly string[]).includes(value)
  );
}

function readParam(params: URLSearchParams, key: string): string {
  return (params.get(key) ?? "").trim().toLowerCase();
}

/**
 * Classifies an error that the identity provider (via Supabase Auth) sent
 * back in the callback query. Returns null when no error parameter is present.
 *
 * Expired/invalid email links (`error_code=otp_*`) keep the classification
 * they had before this change (`missing_auth_code`), so the email
 * confirmation and password-reset paths behave as before.
 */
export function classifyProviderCallbackError(
  params: URLSearchParams
): AuthCallbackErrorCode | null {
  const error = readParam(params, "error");
  const errorCode = readParam(params, "error_code");
  const errorDescription = readParam(params, "error_description");

  if (!error && !errorCode && !errorDescription) return null;

  if (errorCode.startsWith("otp_")) return "missing_auth_code";

  if (error === "access_denied" || errorCode === "access_denied") {
    return "oauth_cancelled";
  }

  return "oauth_failed";
}

/**
 * Decides the error code for a callback request before any code exchange:
 * a provider error wins over a missing code. Returns null when a code is
 * present and no provider error was reported.
 */
export function classifyAuthCallbackRequest(
  params: URLSearchParams
): AuthCallbackErrorCode | null {
  const providerError = classifyProviderCallbackError(params);
  if (providerError) return providerError;
  if (!(params.get("code") ?? "").trim()) return "missing_auth_code";
  return null;
}

/** The code used when exchanging the auth code for a session fails. */
export const AUTH_CALLBACK_EXCHANGE_FAILED: AuthCallbackErrorCode =
  "email_confirm_callback_failed";

/**
 * Query flag the "Continue with Google" button adds to its redirectTo
 * (`/auth/callback?flow=oauth&next=...`). It only chooses which fixed message
 * a failed code exchange shows; it is never used for any permission decision.
 */
export const AUTH_CALLBACK_OAUTH_FLOW_PARAM = "flow";
export const AUTH_CALLBACK_OAUTH_FLOW_VALUE = "oauth";

/** The code used when the code exchange fails, by flow. */
export function resolveExchangeFailureCode(
  params: URLSearchParams
): AuthCallbackErrorCode {
  return params.get(AUTH_CALLBACK_OAUTH_FLOW_PARAM) === AUTH_CALLBACK_OAUTH_FLOW_VALUE
    ? "oauth_failed"
    : AUTH_CALLBACK_EXCHANGE_FAILED;
}

export type AuthCallbackNoticeKey =
  | "confirmCallbackFailed"
  | "resetCallbackFailed"
  | "missingAuthCode"
  | "oauthCancelled"
  | "oauthFailed";

/**
 * Maps the login page's `error` query to a dictionary key. Unknown values
 * (including any provider text someone puts in the URL) map to null, so the
 * page never echoes URL text. A failed password-reset link keeps its own
 * guidance, as before (Issue #138).
 */
export function resolveAuthCallbackNoticeKey(
  errorParam: string | null | undefined,
  failedLinkWasPasswordReset: boolean
): AuthCallbackNoticeKey | null {
  if (!isAuthCallbackErrorCode(errorParam)) return null;
  // Issue #142 PR2 (PR1 review S3): when the failed link was a password-reset
  // link, the reset guidance wins for every code, including provider errors
  // that Supabase may report on the same callback.
  if (failedLinkWasPasswordReset) return "resetCallbackFailed";
  switch (errorParam) {
    case "email_confirm_callback_failed":
      return failedLinkWasPasswordReset
        ? "resetCallbackFailed"
        : "confirmCallbackFailed";
    case "missing_auth_code":
      return failedLinkWasPasswordReset ? "resetCallbackFailed" : "missingAuthCode";
    case "oauth_cancelled":
      return "oauthCancelled";
    case "oauth_failed":
      return "oauthFailed";
  }
}

/**
 * Builds the login-page redirect for a callback failure. Only the fixed code
 * and the already-normalized `next` path are carried over; every provider
 * parameter (error, error_code, error_description, state, ...) is dropped.
 */
export function buildAuthCallbackErrorRedirect(
  requestUrl: string | URL,
  loginPath: string,
  code: AuthCallbackErrorCode,
  nextPath: string
): URL {
  const redirectTo = new URL(requestUrl);
  redirectTo.pathname = loginPath;
  redirectTo.search = "";
  redirectTo.hash = "";
  redirectTo.searchParams.set("error", code);
  redirectTo.searchParams.set("next", nextPath);
  return redirectTo;
}
