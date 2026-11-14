// Issue #142 PR2: "Continue with Google" stays hidden unless this public flag
// is exactly "true". Default (unset or any other value) is disabled.
// Turning the flag on does not enable the Google provider in Supabase; that
// is a separate, approved step.

export const GOOGLE_SIGN_IN_FLAG_NAME = "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED";

export function isGoogleSignInEnabledValue(value: string | null | undefined): boolean {
  return value === "true";
}

export function isGoogleSignInEnabled(): boolean {
  // Direct property access so Next.js inlines the public value at build time.
  return isGoogleSignInEnabledValue(process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED);
}

/**
 * The redirectTo passed to signInWithOAuth: same-origin /auth/callback with
 * the already-normalized next path. `flow=oauth` only selects the error
 * message for a failed code exchange.
 */
export function buildGoogleOAuthRedirectTo(origin: string, nextPath: string): string {
  const query = new URLSearchParams();
  query.set("flow", "oauth");
  query.set("next", nextPath);
  return `${origin.replace(/\/+$/, "")}/auth/callback?${query.toString()}`;
}
