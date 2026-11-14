import "server-only";

import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { isUiLocale, UI_LOCALE_COOKIE, UI_LOCALE_HEADER, type UiLocale } from "@/i18n/config";
import {
  REGISTRATION_REQUIRED_ERROR,
  isBlockedFromWritesUntilRegistered,
  type RegistrationUserLike,
} from "@/lib/auth/registrationGate";
import { buildRegisterPath, registrationRequiredMessage } from "@/lib/auth/registrationGateMessage";

// Issue #142 PR2: write APIs refuse accounts with a Google identity that have
// not completed STEP 2 (display name + 3 consents) for that identity.
// Email-only accounts are unaffected.
//
// Limitations (see the PR body; fixed in PR3 before the provider is enabled):
// - This only covers the app's API routes / server actions. series, episodes,
//   comments and reviews can also be written by an authenticated user through
//   PostgREST directly, where only RLS applies.
// - The consent record lives in user_metadata, which the user can rewrite
//   themself (supabase.auth.updateUser) without going through STEP 2.

/**
 * The UI locale for an API request. The proxy (which sets UI_LOCALE_HEADER)
 * does not run on /api, so the locale cookie is read first.
 */
async function resolveRequestUiLocale(): Promise<UiLocale> {
  try {
    const cookieValue = (await cookies()).get(UI_LOCALE_COOKIE)?.value;
    if (isUiLocale(cookieValue)) return cookieValue;
  } catch {
    // Outside a request scope; fall through.
  }
  try {
    const headerValue = (await headers()).get(UI_LOCALE_HEADER);
    if (isUiLocale(headerValue)) return headerValue;
  } catch {
    // Outside a request scope; fall through.
  }
  return "ja";
}

/**
 * - "text": routes whose clients show `error` as text (recordings).
 * - "code": routes whose clients branch on `error` codes and show `message`.
 * Both carry `code: "registration_required"`, the localized `message` and
 * `registerPath`.
 */
export type RegistrationRequiredStyle = "text" | "code";

export async function registrationRequiredJson(
  style: RegistrationRequiredStyle
): Promise<NextResponse> {
  const locale = await resolveRequestUiLocale();
  const message = registrationRequiredMessage(locale);
  return NextResponse.json(
    {
      ok: false,
      error: style === "text" ? message : REGISTRATION_REQUIRED_ERROR,
      code: REGISTRATION_REQUIRED_ERROR,
      message,
      registerPath: buildRegisterPath(locale),
    },
    { status: 403 }
  );
}

/** Returns a 403 response for a write by an unregistered Google account, else null. */
export async function registrationRequiredResponse(
  user: RegistrationUserLike | null | undefined,
  style: RegistrationRequiredStyle = "text"
): Promise<NextResponse | null> {
  if (!isBlockedFromWritesUntilRegistered(user)) return null;
  return registrationRequiredJson(style);
}
