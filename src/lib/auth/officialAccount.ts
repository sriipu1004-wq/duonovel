import {
  hasConfirmedEmailIdentity,
  type RegistrationUserLike,
} from "@/lib/auth/registrationGate";

export const OFFICIAL_ACCOUNT_EMAIL = "libread08@gmail.com";

export function isOfficialAccountEmail(
  value: string | null | undefined
): boolean {
  if (typeof value !== "string") {
    return false;
  }

  return value.trim().toLowerCase() === OFFICIAL_ACCOUNT_EMAIL;
}

/**
 * Issue #142 PR2 (PR1 review S2): checks that GRANT official privileges use
 * this instead of the email alone. Besides the address, the account must have
 * a confirmed email identity, so a Google identity (auto-linked or not) never
 * makes an account official by itself. Production check 2026-11-15
 * (aggregate only): the official account has a confirmed email identity.
 * Checks that DENY something to the official account keep using
 * isOfficialAccountEmail (matching more accounts there is the safe side).
 */
export function isOfficialAccountUser(
  user: RegistrationUserLike | null | undefined
): boolean {
  return isOfficialAccountEmail(user?.email) && hasConfirmedEmailIdentity(user);
}
