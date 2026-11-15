import "server-only";

import { isOfficialAccountUser } from "@/lib/auth/officialAccount";
import { createAdminClient } from "@/lib/supabase/admin";
import { runReadOnlyWithRetry } from "@/lib/reliability/readOnly";

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const cache = new Map<string, { official: boolean; expiresAt: number }>();

/**
 * Grant-side counterpart of isOfficialAuthorAccountForDisplay
 * (officialAuthor.server.ts, deny side): true only when the series author is
 * the official account (isOfficialAccountUser: the official address AND a
 * confirmed email identity). Used to ALLOW something only official works may
 * show (the legacy original-author attribution), so it fails closed to
 * false: when the lookup fails, nothing is granted.
 */
export async function isOfficialAuthorAccountForGrant(
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
      { operation: "author official grant check", timeoutMs: 1500, retries: 0 }
    );
    if (result.error || !result.data?.user) return false;
    const official = isOfficialAccountUser(result.data.user);
    if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
    cache.set(id, { official, expiresAt: now + CACHE_TTL_MS });
    return official;
  } catch {
    return false;
  }
}
