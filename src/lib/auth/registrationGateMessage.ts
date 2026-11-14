import type { UiLocale } from "@/i18n/config";
import { localizePath } from "@/i18n/navigation";
import { registrationGateDictionaries } from "@/i18n/dictionaries/registrationGate";
import { REGISTRATION_REQUIRED_ERROR } from "@/lib/auth/registrationGate";

// Issue #142 PR2: localized "finish STEP 2" guidance shared by the server
// (API responses) and the client (forms, comments, reviews).

export function buildRegisterPath(locale: UiLocale, nextPath?: string | null): string {
  const base = localizePath("/register", locale);
  return nextPath ? `${base}?next=${encodeURIComponent(nextPath)}` : base;
}

export function registrationRequiredMessage(locale: UiLocale): string {
  return registrationGateDictionaries[locale].registrationRequired(buildRegisterPath(locale));
}

/**
 * For a client that received an API payload: the localized guidance when the
 * server refused because registration is incomplete, else null.
 */
export function readRegistrationRequiredNotice(
  payload: unknown,
  locale: UiLocale
): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (record.code !== REGISTRATION_REQUIRED_ERROR && record.error !== REGISTRATION_REQUIRED_ERROR) {
    return null;
  }
  return registrationRequiredMessage(locale);
}
