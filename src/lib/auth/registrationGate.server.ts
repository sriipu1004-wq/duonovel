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
// PR3: the consent is read from app_metadata (written only by
// POST /api/account/google-consent with the service role), and the same
// condition is enforced by RLS for direct PostgREST writes to series,
// episodes, comments, reviews, translation settings and public.users
// (migration 20261115120000_issue142_google_consent_rls.sql).

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
