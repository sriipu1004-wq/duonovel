// #137 H2, bounded nonproduction HUMAN temporary upload capabilities.
// A bearer signed URL is not revoked by a Next Auth session/consent change.
// Never fall back to unrestricted service-role writes if the H2 RPC is absent.
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
type StageScope = {
  sessionId: string;
  seriesId: string;
  episodeId: string;
  actorId: string;
  sourceExtension: string;
  totalSizeBytes: number;
};

async function requirePositiveRpc(
  callback: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  context: string
): Promise<void> {
  const { data, error } = await callback;
  if (error || data !== true) {
    // Do not echo a signed bearer, file path, SQL detail or any owner token.
    throw new Error(`human_staging_${context}_unavailable`);
  }
}

export async function openHumanStagingLease(
  admin: Admin,
  scope: StageScope,
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
  admin: Admin,
  scope: StageScope,
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
