// Issue #137 H2: server-side lease for Human multipart temporary staging.
// A signed upload URL is a bearer capability that an app-side check cannot
// revoke; the DB lease plus the storage.objects guard trigger is the barrier.
// Every RPC failure (missing migration, revoked EXECUTE, expired / foreign /
// reused / closed lease) throws. There is NO fallback to unguarded writes.
// Requires supabase/migrations/20261114130000_issue137_h2_human_staging_lease.sql.
import type { createAdminClient } from "@/lib/supabase/admin";
import { getHumanMultipartTempPrefix } from "@/lib/recording/humanMultipartUploadShared";

type AdminClient = ReturnType<typeof createAdminClient>;
type RpcAdmin = Pick<AdminClient, "rpc">;
type RetireAdmin = Pick<AdminClient, "rpc" | "storage">;

export type HumanStageScope = {
  sessionId: string;
  seriesId: string;
  episodeId: string;
  actorId: string;
  sourceExtension: string;
  totalSizeBytes: number;
};

async function requirePositiveRpc(
  call: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  context: string
): Promise<void> {
  const { data, error } = await call;
  if (error || data !== true) {
    // Never echo a signed token, file path or SQL detail to the caller.
    throw new Error(`human_staging_${context}_unavailable`);
  }
}

export async function openHumanStagingLease(
  admin: RpcAdmin,
  scope: HumanStageScope,
  partCount: number
): Promise<void> {
  await requirePositiveRpc(
    admin.rpc("issue137_h2_stage_open", {
      p_session: scope.sessionId,
      p_series: scope.seriesId,
      p_episode: scope.episodeId,
      p_actor: scope.actorId,
      p_extension: scope.sourceExtension,
      p_total_bytes: scope.totalSizeBytes,
      p_part_count: partCount,
    }),
    "open"
  );
}

export async function closeHumanStagingLease(
  admin: RpcAdmin,
  scope: HumanStageScope,
  mode: "seal" | "abort"
): Promise<void> {
  await requirePositiveRpc(
    admin.rpc("issue137_h2_stage_close", {
      p_session: scope.sessionId,
      p_series: scope.seriesId,
      p_episode: scope.episodeId,
      p_actor: scope.actorId,
      p_extension: scope.sourceExtension,
      p_total_bytes: scope.totalSizeBytes,
      p_mode: mode,
    }),
    mode
  );
}

/** Exact part object paths of a lease (the trigger admits no other names). */
export function buildHumanStagingPartPaths(args: {
  seriesId: string;
  episodeId: string;
  actorId: string;
  sessionId: string;
  sourceExtension: string;
  partCount: number;
}): string[] {
  const prefix = getHumanMultipartTempPrefix({
    seriesId: args.seriesId,
    episodeId: args.episodeId,
    userId: args.actorId,
    uploadSessionId: args.sessionId,
  });
  return Array.from({ length: args.partCount }, (_, index) =>
    `${prefix}/part-${String(index + 1).padStart(4, "0")}.${args.sourceExtension}`
  );
}

type RetireCandidate = {
  session_id: string;
  series_id: string;
  episode_id: string;
  actor_id: string;
  source_extension: string;
  part_count: number;
};

/**
 * Retire matured leases of ONE actor: claim (blocks writes, checks no
 * recording references it) -> remove exactly the lease's part paths through
 * the Storage API -> finish (DB receipt refuses while any object remains).
 * Any failure leaves the lease in a re-tryable state; nothing else is deleted.
 */
export async function retireMaturedHumanStagingLeases(
  admin: RetireAdmin,
  args: { actorId: string; bucketName: string; limit?: number }
): Promise<{ retired: number; held: number }> {
  const { data, error } = await admin.rpc("issue137_h2_stage_retire_candidates", {
    p_actor: args.actorId,
    p_limit: args.limit ?? 5,
  });
  if (error) throw new Error("human_staging_retire_unavailable");
  let retired = 0;
  let held = 0;
  for (const row of (Array.isArray(data) ? data : []) as RetireCandidate[]) {
    if (row.actor_id !== args.actorId) {
      held += 1;
      continue;
    }
    try {
      await requirePositiveRpc(
        admin.rpc("issue137_h2_stage_claim_retirement", { p_session: row.session_id }),
        "claim"
      );
      const paths = buildHumanStagingPartPaths({
        seriesId: row.series_id,
        episodeId: row.episode_id,
        actorId: row.actor_id,
        sessionId: row.session_id,
        sourceExtension: row.source_extension,
        partCount: row.part_count,
      });
      const removed = await admin.storage.from(args.bucketName).remove(paths);
      if (removed.error) throw new Error("human_staging_remove_failed");
      await requirePositiveRpc(
        admin.rpc("issue137_h2_stage_finish_retirement", { p_session: row.session_id }),
        "finish"
      );
      retired += 1;
    } catch {
      held += 1;
    }
  }
  return { retired, held };
}
