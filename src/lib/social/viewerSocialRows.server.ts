import "server-only";

import type { User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthSessionMissingError } from "@/lib/auth/authSessionState";
import {
  readViewerSocialTargetsWith,
  type SocialRowsReader,
  type ViewerSocialKind,
  type ViewerSocialResult,
} from "@/lib/social/viewerSocialRows";

export type { ViewerSocialKind, ViewerSocialResult, ViewerSocialTarget } from "@/lib/social/viewerSocialRows";

type SessionClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The viewer of one request, checked once with auth.getUser() on the session
 * client. readSocialTargets is bound to that user; no user id can be passed
 * in from outside.
 */
export type VerifiedSessionViewer = {
  /** null when signed out (session missing). */
  user: User | null;
  /** The viewer's own follow / like rows (KD-2), for the user above. */
  readSocialTargets(kind: ViewerSocialKind): Promise<ViewerSocialResult>;
};

/**
 * Calls auth.getUser() exactly once (checked with the Auth server). A missing
 * session means signed out; any other auth error is thrown. The rows are read
 * later with the service role, filtered by that user's id, columns limited to
 * owner, target id and created_at.
 */
export async function verifySessionViewer(supabase: SessionClient): Promise<VerifiedSessionViewer> {
  const { data, error } = await supabase.auth.getUser();
  if (error && !isAuthSessionMissingError(error)) throw error;
  const user = error ? null : (data.user ?? null);
  const verified = user ? { userId: user.id } : null;
  return {
    user,
    readSocialTargets: (kind) =>
      readViewerSocialTargetsWith({
        kind,
        getVerifiedViewer: async () => verified,
        createReader: () => createAdminClient() as unknown as SocialRowsReader,
      }),
  };
}

/** One-shot form: verify the session viewer and read one kind of rows. */
export async function readViewerSocialTargets(args: {
  supabase: SessionClient;
  kind: ViewerSocialKind;
}): Promise<ViewerSocialResult> {
  return (await verifySessionViewer(args.supabase)).readSocialTargets(args.kind);
}
