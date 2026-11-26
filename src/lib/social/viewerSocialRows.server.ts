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
 * The signed-in viewer's own follow / like rows (KD-2).
 * The user id comes only from auth.getUser() on the given session client
 * (checked with the Auth server); there is no user id parameter. The rows are
 * then read with the service role, filtered by that id, columns limited to
 * owner, target id and created_at.
 */
/**
 * Same read for a caller that already ran auth.getUser() on its session in
 * this request (avoids a second Auth round trip). Takes the Auth `User`
 * object returned by getUser(), not a bare id; server code only.
 */
export async function readViewerSocialTargetsForAuthUser(args: {
  authUser: Pick<User, "id"> | null;
  kind: ViewerSocialKind;
}): Promise<ViewerSocialResult> {
  return readViewerSocialTargetsWith({
    kind: args.kind,
    getVerifiedViewer: async () => (args.authUser ? { userId: args.authUser.id } : null),
    createReader: () => createAdminClient() as unknown as SocialRowsReader,
  });
}

export async function readViewerSocialTargets(args: {
  supabase: SessionClient;
  kind: ViewerSocialKind;
}): Promise<ViewerSocialResult> {
  return readViewerSocialTargetsWith({
    kind: args.kind,
    getVerifiedViewer: async () => {
      const { data, error } = await args.supabase.auth.getUser();
      if (error) {
        if (isAuthSessionMissingError(error)) return null;
        throw error;
      }
      return data.user ? { userId: data.user.id } : null;
    },
    createReader: () => createAdminClient() as unknown as SocialRowsReader,
  });
}
