export type AccountRegistrationMethod = "email" | "google" | "apple";

export const ACCOUNT_SIGNUP_CONSENT_VERSION = "2026-04-17";
export const ACCOUNT_TERMS_VERSION = "2026-04-17";
export const ACCOUNT_PRIVACY_VERSION = "2026-04-17";

export const ACCOUNT_GENDER_OPTIONS = [
  { value: "female", label: "女性" },
  { value: "male", label: "男性" },
  { value: "other", label: "その他" },
  { value: "no_answer", label: "回答しない" },
] as const;

export type AccountRegistrationConsentInput = {
  agreedToTerms: boolean;
  agreedToPrivacy: boolean;
  acknowledgedPublicSurface: boolean;
};

export type AccountRegistrationProfileInput =
  AccountRegistrationConsentInput & {
    method: AccountRegistrationMethod;
    displayName: string;
    birthdate: string;
    gender: string;
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

export function normalizeAccountRegistrationMethod(
  value: unknown,
  fallback: AccountRegistrationMethod = "email"
): AccountRegistrationMethod {
  if (value === "google") return "google";
  if (value === "apple") return "apple";
  if (value === "email") return "email";
  return fallback;
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

function hasRequiredAccountRegistrationProfile(
  input: AccountRegistrationProfileInput
): boolean {
  return (
    readText(input.displayName).length > 0 &&
    readText(input.birthdate).length > 0 &&
    readText(input.gender).length > 0 &&
    hasRequiredAccountRegistrationConsent(input)
  );
}

export function buildPendingAccountRegistrationMetadata(
  input: AccountRegistrationProfileInput
): Record<string, string | boolean> {
  if (!hasRequiredAccountRegistrationProfile(input)) {
    throw new Error("required account registration input is missing");
  }

  return {
    account_registration_method: input.method,
    account_registration_completed: false,
    account_signup_consent_version: ACCOUNT_SIGNUP_CONSENT_VERSION,
    account_terms_version: ACCOUNT_TERMS_VERSION,
    account_privacy_version: ACCOUNT_PRIVACY_VERSION,
    account_public_profile_ack: true,
    account_public_content_ack: true,
    account_enforcement_ack: true,
    account_birthdate: readText(input.birthdate),
    account_gender: readText(input.gender),
    display_name_candidate: readText(input.displayName),
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
  return readText(record.display_name_candidate);
}

export function readAccountRegistrationBirthdate(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }

  const record = metadata as Record<string, unknown>;
  return readText(record.account_birthdate);
}

export function readAccountRegistrationGender(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }

  const record = metadata as Record<string, unknown>;
  return readText(record.account_gender);
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