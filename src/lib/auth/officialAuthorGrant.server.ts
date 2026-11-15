import "server-only";

import { createOfficialAuthorGrantCheck } from "@/lib/auth/officialAuthorGrant";
import { createAdminClient } from "@/lib/supabase/admin";
import { runReadOnlyWithRetry } from "@/lib/reliability/readOnly";

/**
 * Grant-side counterpart of isOfficialAuthorAccountForDisplay
 * (officialAuthor.server.ts, deny side): true only when the series author is
 * the official account. Used to ALLOW something only official works may
 * show (the legacy original-author attribution), so it fails closed to
 * false. The decision logic lives in officialAuthorGrant.ts (tested with a
 * fake lookup); this file only supplies the admin lookup.
 */
export const isOfficialAuthorAccountForGrant = createOfficialAuthorGrantCheck(
  async (authorId) => {
    const admin = createAdminClient();
    const result = await runReadOnlyWithRetry(
      async () => await admin.auth.admin.getUserById(authorId),
      { operation: "author official grant check", timeoutMs: 1500, retries: 0 }
    );
    return { user: result.data?.user ?? null, error: result.error };
  }
);
