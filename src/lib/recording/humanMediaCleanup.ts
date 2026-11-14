// Issue #137 S2-1: remove a Human narrator's released audio from the PRIVATE
// bucket after the H1 RPC has committed (row deleted, or row now points at a
// new take). Called ONLY after a successful commit; a failed RPC never
// reaches here, so nothing is deleted on failure.
//
// What may be removed: for each released playback path that is EXACTLY
//   human/<series>/<episode>/<owner>/<take>/playback-from-<ext>.m4a
// (owner prefix checked against the committed scope), that object plus its
// original.<ext> and playback-from-<ext>.m4a.timing.json in the same take
// directory. Nothing else: no prefix/wildcard delete, no URL-form legacy rows.
// A take directory still referenced by ANY recordings row is skipped.
//
// A Storage failure never changes the user-facing result. It is logged by
// category/count only (no paths) and recorded through the service-role-only
// issue137_human_media_cleanup_record RPC so it can be retried later.
import type { createAdminClient } from "@/lib/supabase/admin";
import { assertApprovedPrivateHumanRecordingBucket } from "@/lib/recording/humanRecordingStorage";

type AdminClient = ReturnType<typeof createAdminClient>;
type CleanupAdmin = Pick<AdminClient, "rpc" | "from" | "storage">;

export type HumanMediaScope = {
  seriesId: string;
  episodeId: string;
  ownerId: string;
};

export type HumanMediaCleanupReason = "delete" | "replace";

export type HumanMediaCleanupOutcome = {
  released: number;
  rejected: number;
  stillReferenced: number;
  removedTakes: number;
  failedTakes: number;
  recorded: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export type HumanTakeArtifacts = {
  takeDirectory: string;
  paths: string[];
};

/**
 * Returns the exact artifact paths of one canonical Human take, or null when
 * the stored value is not a canonical playback path under this owner's
 * prefix (other owner, other series/episode, URL form, traversal, nesting).
 */
export function resolveHumanTakeArtifacts(
  storedPath: string | null | undefined,
  scope: HumanMediaScope
): HumanTakeArtifacts | null {
  const seriesId = scope.seriesId.trim().toLowerCase();
  const episodeId = scope.episodeId.trim().toLowerCase();
  const ownerId = scope.ownerId.trim().toLowerCase();
  if (![seriesId, episodeId, ownerId].every((id) => UUID.test(id))) return null;
  const value = typeof storedPath === "string" ? storedPath : "";
  const prefix = `human/${seriesId}/${episodeId}/${ownerId}/`;
  if (!value.startsWith(prefix)) return null;
  const match = /^([a-z0-9-]+)\/playback-from-([a-z0-9]{2,8})\.m4a$/u.exec(
    value.slice(prefix.length)
  );
  if (!match) return null;
  const [, take, extension] = match;
  const takeDirectory = `${prefix}${take}/`;
  return {
    takeDirectory,
    paths: [
      value,
      `${takeDirectory}original.${extension}`,
      `${value}.timing.json`,
    ],
  };
}

async function isTakeStillReferenced(
  admin: CleanupAdmin,
  takeDirectory: string
): Promise<boolean> {
  // The take directory segment is [a-z0-9-] only: no LIKE wildcards inside.
  const { data, error } = await admin
    .from("recordings")
    .select("id")
    .like("audio_storage_path", `%${takeDirectory}%`)
    .limit(1);
  if (error) return true; // Unknown -> treat as referenced (never delete).
  return Array.isArray(data) && data.length > 0;
}

async function recordPending(
  admin: CleanupAdmin,
  scope: HumanMediaScope,
  paths: string[],
  reason: HumanMediaCleanupReason
): Promise<boolean> {
  try {
    const { error } = await admin.rpc("issue137_human_media_cleanup_record", {
      p_owner_id: scope.ownerId,
      p_series_id: scope.seriesId,
      p_episode_id: scope.episodeId,
      p_object_paths: paths,
      p_reason: reason,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Best-effort removal of released takes. Never throws.
 * MUST be called only after the H1 commit RPC succeeded.
 */
export async function cleanupReleasedHumanMedia(
  admin: CleanupAdmin,
  args: {
    scope: HumanMediaScope;
    releasedPaths: Array<string | null | undefined>;
    reason: HumanMediaCleanupReason;
  }
): Promise<HumanMediaCleanupOutcome> {
  const outcome: HumanMediaCleanupOutcome = {
    released: 0, rejected: 0, stillReferenced: 0,
    removedTakes: 0, failedTakes: 0, recorded: false,
  };
  const takes = new Map<string, HumanTakeArtifacts>();
  for (const stored of args.releasedPaths) {
    if (!stored) continue;
    outcome.released += 1;
    const artifacts = resolveHumanTakeArtifacts(stored, args.scope);
    if (!artifacts) {
      outcome.rejected += 1;
      continue;
    }
    takes.set(artifacts.takeDirectory, artifacts);
  }

  const failedPaths: string[] = [];
  let bucketName: string | null = null;
  try {
    if (takes.size > 0) {
      bucketName = await assertApprovedPrivateHumanRecordingBucket(admin);
    }
  } catch {
    bucketName = null;
  }

  for (const take of takes.values()) {
    try {
      if (await isTakeStillReferenced(admin, take.takeDirectory)) {
        outcome.stillReferenced += 1;
        continue;
      }
      if (!bucketName) throw new Error("bucket_not_verified");
      const { error } = await admin.storage.from(bucketName).remove(take.paths);
      if (error) throw new Error("remove_failed");
      outcome.removedTakes += 1;
    } catch {
      outcome.failedTakes += 1;
      failedPaths.push(...take.paths);
    }
  }

  if (failedPaths.length > 0) {
    outcome.recorded = await recordPending(admin, args.scope, failedPaths, args.reason);
  }
  if (outcome.rejected > 0 || outcome.failedTakes > 0) {
    // Categories and counts only: never paths, IDs or names.
    console.warn("[human-media-cleanup]", {
      reason: args.reason,
      released: outcome.released,
      rejectedOutsideOwnerPrefix: outcome.rejected,
      stillReferenced: outcome.stillReferenced,
      removedTakes: outcome.removedTakes,
      failedTakes: outcome.failedTakes,
      recordedForRetry: outcome.recorded,
    });
  }
  return outcome;
}

type PendingRow = {
  id: string;
  series_id: string;
  episode_id: string;
  owner_id: string;
  object_paths: string[];
};

/**
 * Retry this owner's recorded failures (best-effort, never throws). The DB
 * receipt (resolve) refuses while any listed object or reference remains.
 */
export async function retryPendingHumanMediaCleanup(
  admin: CleanupAdmin,
  args: { ownerId: string; limit?: number }
): Promise<{ resolved: number; held: number }> {
  const result = { resolved: 0, held: 0 };
  try {
    const { data, error } = await admin.rpc("issue137_human_media_cleanup_pending", {
      p_owner_id: args.ownerId,
      p_limit: args.limit ?? 5,
    });
    if (error || !Array.isArray(data) || data.length === 0) return result;
    const bucketName = await assertApprovedPrivateHumanRecordingBucket(admin);
    for (const row of data as PendingRow[]) {
      const scope = { seriesId: row.series_id, episodeId: row.episode_id, ownerId: row.owner_id };
      const owned = row.owner_id === args.ownerId && Array.isArray(row.object_paths) &&
        row.object_paths.every((path) =>
          typeof path === "string" &&
          path.startsWith(`human/${scope.seriesId}/${scope.episodeId}/${scope.ownerId}/`) &&
          !path.includes(".."));
      let succeeded = false;
      if (owned) {
        const { error: removeError } = await admin.storage.from(bucketName).remove(row.object_paths);
        succeeded = !removeError;
      }
      const { data: resolved, error: resolveError } = await admin.rpc(
        "issue137_human_media_cleanup_resolve",
        { p_id: row.id, p_succeeded: succeeded }
      );
      if (!resolveError && resolved === true && succeeded) result.resolved += 1;
      else result.held += 1;
    }
  } catch {
    // Retry is opportunistic; the record stays for the next attempt.
  }
  return result;
}
