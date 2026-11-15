import "server-only";

import { isOfficialAuthorAccountForGrant } from "@/lib/auth/officialAuthorGrant.server";
import { readLegacyAttribution, type LegacyAttribution } from "@/lib/legacyAttribution";

/**
 * Legacy attribution accepted for display: a well-formed
 * effect_settings.legacyAttribution on a work of the official account.
 * Series authors can write their own effect_settings, so the record of any
 * other account is ignored (no new way to present someone else as author).
 * The account lookup runs only when the record exists.
 */
export async function readLegacyAttributionForDisplay(
  effectSettings: unknown,
  authorId: string | null | undefined
): Promise<LegacyAttribution | null> {
  const legacy = readLegacyAttribution(effectSettings);
  if (!legacy) return null;
  return (await isOfficialAuthorAccountForGrant(authorId)) ? legacy : null;
}
