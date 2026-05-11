export const OFFICIAL_NARRATION_ACCOUNT_EMAIL = "libread08@gmail.com";

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isOfficialNarrationAccountEmail(
  value: string | null | undefined
): boolean {
  return normalizeEmail(value) ===
    normalizeEmail(OFFICIAL_NARRATION_ACCOUNT_EMAIL);
}