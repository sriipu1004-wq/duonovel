export const ACCOUNT_SIGNUP_CONSENT_VERSION = "2026-04-17";
export const ACCOUNT_TERMS_VERSION = "2026-04-17";
export const ACCOUNT_PRIVACY_VERSION = "2026-04-17";

export type AccountRegistrationConsentInput = {
  agreedToTerms: boolean;
  agreedToPrivacy: boolean;
  acknowledgedPublicSurface: boolean;
};

export type AccountRegistrationProfileInput =
  AccountRegistrationConsentInput & {
    displayName: string;
  };

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

export function normalizeNextPath(
  value: string | null | undefined,
  fallback = "/"
): string {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  return trimmed;
}

export function hasRequiredAccountRegistrationConsent(
  input: AccountRegistrationConsentInput
): boolean {
  return (
    input.agreedToTerms &&
    input.agreedToPrivacy &&
    input.acknowledgedPublicSurface
  );
}

export function normalizeDisplayName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function validateDisplayName(value: string): string | null {
  const normalized = normalizeDisplayName(value);

  if (normalized.length < 2) {
    return "ユーザー名は2文字以上で入力して。";
  }

  if (normalized.length > 32) {
    return "ユーザー名は32文字以内で入力して。";
  }

  if (/[\r\n]/.test(normalized)) {
    return "ユーザー名に改行は使えない。";
  }

  if (/^@/.test(normalized)) {
    return "ユーザー名の先頭に @ は使えない。";
  }

  if (/https?:\/\//i.test(normalized) || /www\./i.test(normalized)) {
    return "URL のような文字列はユーザー名に使えない。";
  }

  return null;
}

function hasRequiredAccountRegistrationProfile(
  input: AccountRegistrationProfileInput
): boolean {
  return (
    normalizeDisplayName(input.displayName).length > 0 &&
    hasRequiredAccountRegistrationConsent(input)
  );
}

export function buildPendingAccountRegistrationMetadata(
  input: AccountRegistrationProfileInput
): Record<string, string | boolean> {
  if (!hasRequiredAccountRegistrationProfile(input)) {
    throw new Error("required account registration input is missing");
  }

  const normalizedDisplayName = normalizeDisplayName(input.displayName);

  return {
    account_registration_method: "email_link",
    account_registration_completed: false,
    account_signup_consent_version: ACCOUNT_SIGNUP_CONSENT_VERSION,
    account_terms_version: ACCOUNT_TERMS_VERSION,
    account_privacy_version: ACCOUNT_PRIVACY_VERSION,
    account_public_profile_ack: true,
    account_public_content_ack: true,
    account_enforcement_ack: true,
    display_name_candidate: normalizedDisplayName,
    display_name: normalizedDisplayName,
    account_signup_consented_at: new Date().toISOString(),
  };
}

export function buildCompletedAccountRegistrationMetadata(
  input: AccountRegistrationProfileInput
): Record<string, string | boolean> {
  return {
    ...buildPendingAccountRegistrationMetadata(input),
    account_registration_completed: true,
    account_registration_completed_at: new Date().toISOString(),
  };
}

export function isAccountRegistrationCompleted(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") {
    return false;
  }

  const record = metadata as Record<string, unknown>;
  return readBoolean(record.account_registration_completed);
}

export function readAccountRegistrationDisplayName(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }

  const record = metadata as Record<string, unknown>;
  return readText(record.display_name_candidate) || readText(record.display_name);
}

export function readAccountRegistrationConsent(
  metadata: unknown,
  key:
    | "account_public_profile_ack"
    | "account_public_content_ack"
    | "account_enforcement_ack"
): boolean {
  if (!metadata || typeof metadata !== "object") {
    return false;
  }

  const record = metadata as Record<string, unknown>;
  return readBoolean(record[key]);
}
