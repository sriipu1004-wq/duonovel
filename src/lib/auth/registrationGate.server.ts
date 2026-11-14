import "server-only";

import { NextResponse } from "next/server";
import {
  REGISTRATION_REQUIRED_ERROR,
  isBlockedFromWritesUntilRegistered,
  type RegistrationUserLike,
} from "@/lib/auth/registrationGate";

// Issue #142 PR2: write APIs refuse accounts with a Google identity that have
// not completed STEP 2 (display name + 3 consents) for that identity.
// Email-only accounts are unaffected. See registrationGate.ts for the
// limitation that user_metadata is self-writable.

export const REGISTRATION_REQUIRED_MESSAGE =
  "登録が完了していない。表示名と同意の手続き（/register）を先に済ませて。";

/** Returns a 403 response for a write by an unregistered Google account, else null. */
export function registrationRequiredResponse(
  user: RegistrationUserLike | null | undefined
): NextResponse | null {
  if (!isBlockedFromWritesUntilRegistered(user)) return null;
  return NextResponse.json(
    { ok: false, error: REGISTRATION_REQUIRED_MESSAGE, code: REGISTRATION_REQUIRED_ERROR },
    { status: 403 }
  );
}

/** For server actions and helpers that throw instead of returning a response. */
export function assertRegisteredForWrite(
  user: RegistrationUserLike | null | undefined
): void {
  if (isBlockedFromWritesUntilRegistered(user)) {
    throw new Error(REGISTRATION_REQUIRED_MESSAGE);
  }
}
