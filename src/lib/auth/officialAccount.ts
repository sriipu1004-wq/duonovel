export const OFFICIAL_ACCOUNT_EMAIL = "libread08@gmail.com";

export function isOfficialAccountEmail(
  value: string | null | undefined
): boolean {
  if (typeof value !== "string") {
    return false;
  }

  return value.trim().toLowerCase() === OFFICIAL_ACCOUNT_EMAIL;
}