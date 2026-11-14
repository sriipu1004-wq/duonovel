import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  handlePopularityEvent,
  type PopularityEpisodeRow,
  type PopularityRecordingRow,
  type PopularitySeriesRow,
} from "@/lib/popularityIngest";

// Issue #154 GI-P2: the ingest decisions live in src/lib/popularityIngest.ts
// (bot / same-site filter, per actor-day cap). This file only wires Supabase.

async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  // Created lazily: requests filtered by headers never touch Supabase.
  let admin: ReturnType<typeof createAdminClient> | null = null;
  const db = () => (admin ??= createAdminClient());

  return handlePopularityEvent(request, {
    getCurrentUserId,
    findEpisode: async (episodeId) => {
      const { data, error } = await db()
        .from("episodes")
        .select("id, series_id, episode_number, posting_status, is_published")
        .eq("id", episodeId)
        .maybeSingle();
      return { data: data as PopularityEpisodeRow | null, error };
    },
    findSeries: async (seriesId) => {
      const { data, error } = await db()
        .from("series")
        .select("id, publication_status")
        .eq("id", seriesId)
        .maybeSingle();
      return { data: data as PopularitySeriesRow | null, error };
    },
    findRecording: async (recordingId) => {
      const { data, error } = await db()
        .from("recordings")
        .select("id, series_id, episode_id, is_public")
        .eq("id", recordingId)
        .maybeSingle();
      return { data: data as PopularityRecordingRow | null, error };
    },
    listActorSeriesIds: async (table, sessionId, limit) => {
      // Filters on session_id only: the leading column of the
      // (session_id, episode_id|recording_id) unique index.
      const { data, error } = await db()
        .from(table)
        .select("series_id")
        .eq("session_id", sessionId)
        .limit(limit);
      if (error || !Array.isArray(data)) {
        console.error("[popularity-ingest-count]", error);
        return null;
      }
      return data.map((row) => String((row as { series_id: unknown }).series_id));
    },
    insertEvent: async (table, row) => {
      const { error } = await db()
        .from(table)
        .upsert(row, {
          onConflict:
            table === "series_view_events"
              ? "session_id,episode_id"
              : "session_id,recording_id",
          ignoreDuplicates: true,
        });
      return { error };
    },
  });
}
