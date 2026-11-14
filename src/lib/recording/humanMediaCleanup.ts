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
// A reference check that errors or throws never leads to removal: the take
// is recorded instead, and EVERY retry re-checks references before removing.
// The owner retry stops at 5 attempts; such records remain in the operator
// list (issue137_human_media_cleanup_pending(null, n)) only.
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
  /** Reference check errored/threw: not removed now, recorded for a re-checked retry. */
  referenceUnknown: number;
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

type ReferenceState = "clear" | "referenced" | "unknown";

/**
 * Whether ANY recordings row still references the take directory. Only an
 * affirmative, error-free empty answer is "clear"; an error, a throw or an
 * unexpected shape is "unknown", which callers treat as "do not remove".
 */
async function takeReferenceState(
  admin: CleanupAdmin,
  takeDirectory: string
): Promise<ReferenceState> {
  try {
    // The take directory segment is [a-z0-9-] only: no LIKE wildcards inside.
    const { data, error } = await admin
      .from("recordings")
      .select("id")
      .like("audio_storage_path", `%${takeDirectory}%`)
      .limit(1);
    if (error || !Array.isArray(data)) return "unknown";
    return data.length > 0 ? "referenced" : "clear";
  } catch {
    return "unknown";
  }
}

/** Take directory of a recorded path under exactly this owner's prefix. */
function takeDirectoryOf(path: unknown, scope: HumanMediaScope): string | null {
  if (typeof path !== "string") return null;
  const prefix = `human/${scope.seriesId}/${scope.episodeId}/${scope.ownerId}/`;
  if (!path.startsWith(prefix) || path.includes("..")) return null;
  const match = /^([a-z0-9-]+)\/[a-z0-9.-]+$/u.exec(path.slice(prefix.length));
  return match ? `${prefix}${match[1]}/` : null;
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
    released: 0, rejected: 0, stillReferenced: 0, referenceUnknown: 0,
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
    const reference = await takeReferenceState(admin, take.takeDirectory);
    if (reference === "referenced") {
      outcome.stillReferenced += 1;
      continue;
    }
    if (reference === "unknown") {
      // Absence of references was NOT established: do not remove now. It is
      // recorded only because every retry re-checks references before any
      // removal (retryPendingHumanMediaCleanup); no record is removed blindly.
      outcome.referenceUnknown += 1;
      failedPaths.push(...take.paths);
      continue;
    }
    try {
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
  if (outcome.rejected > 0 || outcome.failedTakes > 0 || outcome.referenceUnknown > 0) {
    // Categories and counts only: never paths, IDs or names.
    console.warn("[human-media-cleanup]", {
      reason: args.reason,
      released: outcome.released,
      rejectedOutsideOwnerPrefix: outcome.rejected,
      stillReferenced: outcome.stillReferenced,
      referenceUnknown: outcome.referenceUnknown,
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

async function reportAttempt(
  admin: CleanupAdmin,
  id: string,
  succeeded: boolean
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("issue137_human_media_cleanup_resolve", {
      p_id: id,
      p_succeeded: succeeded,
    });
    return !error && data === true && succeeded;
  } catch {
    return false;
  }
}

/**
 * Retry this owner's recorded failures (best-effort, never throws).
 * Every record is treated as "references not yet verified": each take
 * directory must be confirmed unreferenced (error-free, empty answer) before
 * its paths are removed. Referenced or unknown -> nothing removed, the
 * attempt is counted. The DB lists a record to the owner only below the
 * attempt cap (5); beyond it the record stays only in the operator list.
 * The DB receipt (resolve) also refuses while any object or reference remains.
 */
export async function retryPendingHumanMediaCleanup(
  admin: CleanupAdmin,
  args: { ownerId: string; limit?: number }
): Promise<{ resolved: number; held: number }> {
  const result = { resolved: 0, held: 0 };
  let rows: PendingRow[] = [];
  try {
    const { data, error } = await admin.rpc("issue137_human_media_cleanup_pending", {
      p_owner_id: args.ownerId,
      p_limit: args.limit ?? 5,
    });
    if (error || !Array.isArray(data)) return result;
    rows = data as PendingRow[];
  } catch {
    return result;
  }
  if (rows.length === 0) return result;

  let bucketName: string | null = null;
  try {
    bucketName = await assertApprovedPrivateHumanRecordingBucket(admin);
  } catch {
    bucketName = null;
  }

  for (const row of rows) {
    let succeeded = false;
    try {
      const scope = { seriesId: row.series_id, episodeId: row.episode_id, ownerId: row.owner_id };
      const paths = Array.isArray(row.object_paths) ? row.object_paths : [];
      const takeDirectories = paths.map((path) => takeDirectoryOf(path, scope));
      const owned = row.owner_id === args.ownerId && paths.length > 0 &&
        takeDirectories.every((dir): dir is string => dir !== null);
      if (owned && bucketName) {
        let allClear = true;
        for (const dir of new Set(takeDirectories as string[])) {
          if (await takeReferenceState(admin, dir) !== "clear") {
            allClear = false;
            break;
          }
        }
        if (allClear) {
          const { error: removeError } = await admin.storage.from(bucketName).remove(paths);
          succeeded = !removeError;
        }
      }
    } catch {
      succeeded = false;
    }
    if (await reportAttempt(admin, row.id, succeeded)) result.resolved += 1;
    else result.held += 1;
  }
  return result;
}
