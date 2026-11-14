import {
  hasConfirmedEmailIdentity,
  type RegistrationUserLike,
} from "@/lib/auth/registrationGate";

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

/** Issue #142 PR2: grant check; see isOfficialAccountUser in officialAccount.ts. */
export function isOfficialNarrationAccountUser(
  user: RegistrationUserLike | null | undefined
): boolean {
  return (
    isOfficialNarrationAccountEmail(user?.email) && hasConfirmedEmailIdentity(user)
  );
}
