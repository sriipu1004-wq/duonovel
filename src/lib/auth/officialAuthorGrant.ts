import { isOfficialAccountUser } from "@/lib/auth/officialAccount";
import type { RegistrationUserLike } from "@/lib/auth/registrationGate";

export type OfficialAuthorLookup = (
  authorId: string
) => Promise<{ user: RegistrationUserLike | null | undefined; error: unknown }>;

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

/**
 * Grant-side official-author check, independent of Supabase so it can be
 * tested with a fake lookup. True only when the author account is the
 * official account (isOfficialAccountUser: the official address AND a
 * confirmed email identity). Fails closed to false: empty id, a lookup
 * error, a missing user or an exception never grant. Only definite answers
 * are cached.
 */
export function createOfficialAuthorGrantCheck(
  lookup: OfficialAuthorLookup,
  now: () => number = Date.now
): (authorId: string | null | undefined) => Promise<boolean> {
  const cache = new Map<string, { official: boolean; expiresAt: number }>();
  return async (authorId) => {
    const id = (authorId ?? "").trim();
    if (!id) return false;

    const time = now();
    const cached = cache.get(id);
    if (cached && cached.expiresAt > time) return cached.official;

    try {
      const result = await lookup(id);
      if (result.error || !result.user) return false;
      const official = isOfficialAccountUser(result.user);
      if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
      cache.set(id, { official, expiresAt: time + CACHE_TTL_MS });
      return official;
    } catch {
      return false;
    }
  };
}
