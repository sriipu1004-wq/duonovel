// Public display names must come only from a name the user chose on LIB read
// (registration STEP 2 writes `display_name` / `display_name_candidate`, see
// accountSignupConsent.ts). OAuth providers such as Google put the account's
// real name into user_metadata (`name`, `full_name`, `given_name`, ...) and a
// profile photo into `avatar_url` / `picture`; those must never be used as a
// fallback for anything that is shown publicly or saved to
// public.users.display_name (Issue #142 PR1, 2026-11-15).

export const SELF_CHOSEN_DISPLAY_NAME_KEYS = [
  "display_name",
  "displayName",
  "display_name_candidate",
] as const;

/** Keys an identity provider may fill with the account's real name/photo. */
export const PROVIDER_IDENTITY_METADATA_KEYS = [
  "name",
  "full_name",
  "given_name",
  "family_name",
  "nickname",
  "preferred_username",
  "user_name",
  "avatar_url",
  "picture",
] as const;

export const NEUTRAL_DISPLAY_NAME_FALLBACK = "ユーザー";

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The display name the user typed themselves, or "" when there is none. */
export function readSelfChosenDisplayName(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const row = metadata as Record<string, unknown>;
  for (const key of SELF_CHOSEN_DISPLAY_NAME_KEYS) {
    const text = readText(row[key]);
    if (text) return text;
  }
  return "";
}

/**
 * True when the account signed in only with email/password or email link
 * (or has no provider recorded, e.g. created by an operator). Callers that
 * historically fell back to the email local part keep doing so only for these
 * accounts; an OAuth account's email local part can itself be a real name.
 */
export function isEmailOnlyAccount(user: {
  app_metadata?: Record<string, unknown> | null;
} | null | undefined): boolean {
  const appMetadata = user?.app_metadata ?? {};
  const provider = readText(appMetadata.provider);
  if (provider && provider !== "email") return false;
  const providers = appMetadata.providers;
  if (Array.isArray(providers)) {
    return providers.every((entry) => entry === "email");
  }
  return true;
}
