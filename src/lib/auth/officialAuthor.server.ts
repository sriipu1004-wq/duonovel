import "server-only";

import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import { createAdminClient } from "@/lib/supabase/admin";
import { runReadOnlyWithRetry } from "@/lib/reliability/readOnly";

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const cache = new Map<string, { official: boolean; expiresAt: number }>();

/**
 * True when a series author account may be the LIB read operator account,
 * used only to WITHHOLD the account name as a work's author (P9 share text).
 * This is a deny-side check, so it uses isOfficialAccountEmail (matching more
 * is the safe side) and fails closed: when the lookup fails, it returns true
 * and the caller shows no author. It never grants anything.
 */
export async function isOfficialAuthorAccountForDisplay(
  authorId: string | null | undefined
): Promise<boolean> {
  const id = (authorId ?? "").trim();
  if (!id) return false;

  const now = Date.now();
  const cached = cache.get(id);
  if (cached && cached.expiresAt > now) return cached.official;

  try {
    const admin = createAdminClient();
    const result = await runReadOnlyWithRetry(
      async () => await admin.auth.admin.getUserById(id),
      { operation: "author official check", timeoutMs: 1500, retries: 0 }
    );
    if (result.error || !result.data?.user) return true;
    const official = isOfficialAccountEmail(result.data.user.email);
    if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
    cache.set(id, { official, expiresAt: now + CACHE_TTL_MS });
    return official;
  } catch {
    return true;
  }
}
