import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { isR18Series } from "@/lib/contentRating";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";
import { isPublishedHumanRecording } from "@/lib/recording/humanRecordingState";
import { buildHumanRecordingPlaybackHref } from "@/lib/recording/humanRecordingStorage";
import {
  isSchemaCompatibilityReadFailure,
  runReadOnlyWithRetry,
} from "@/lib/reliability/readOnly";
import { isAuthSessionMissingError } from "@/lib/auth/authSessionState";

export type PublicReadRecordingRow = Record<string, unknown> & {
  id: string;
  episode_id?: string | null;
  episodeId?: string | null;
  reader_id?: string | null;
  reader_user_id?: string | null;
  readerUserId?: string | null;
  reader_name?: string | null;
  narrator_name?: string | null;
  display_name?: string | null;
  speaker_name?: string | null;
  audio_storage_path?: string | null;
  audioStoragePath?: string | null;
  voice_model_id?: string | null;
  voiceModelId?: string | null;
  is_public?: boolean | null;
  public?: boolean | null;
};

export type PublicReadPagePayload = {
  series: SeriesRow;
  episode: EpisodeRow;
  previousEpisode: EpisodeRow | null;
  nextEpisode: EpisodeRow | null;
  allEpisodeRecordings: PublicReadRecordingRow[];
  isOwner: boolean;
  r18Blocked: boolean;
  viewerSignedIn: boolean;
  viewerUserId: string | null;
  viewerEmail: string | null;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}


const PUBLIC_READ_EPISODE_NAV_SELECT = `
  id,
  series_id,
  episode_number,
  posting_status,
  scheduled_for,
  posted_at
`;

const PUBLIC_READ_RECORDING_SELECT = `
  id,
  episode_id,
  reader_id,
  reader_user_id,
  reader_name,
  audio_storage_path,
  voice_model_id,
  is_public
`;

async function fetchAdjacentEpisode(
  seriesId: string,
  episodeNumber: number,
  direction: "previous" | "next",
  includePrivate: boolean,
  signal?: AbortSignal
): Promise<EpisodeRow | null> {
  const admin = createAdminClient();

  async function run(selectClause: string) {
    let query = admin
      .from("episodes")
      .select(selectClause)
      .eq("series_id", seriesId);

    if (!includePrivate) {
      query = query
        .eq("posting_status", "posted")
        .eq("is_published", true);
    }

    query =
      direction === "previous"
        ? query
            .lt("episode_number", episodeNumber)
            .order("episode_number", { ascending: false })
            .order("id", { ascending: false })
        : query
            .gt("episode_number", episodeNumber)
            .order("episode_number", { ascending: true })
            .order("id", { ascending: true });

    query = query.limit(1);
    if (signal) query = query.abortSignal(signal);
    return query.maybeSingle();
  }

  const narrow = await run(PUBLIC_READ_EPISODE_NAV_SELECT);
  if (!narrow.error) {
    return narrow.data ? (narrow.data as unknown as EpisodeRow) : null;
  }
  if (!isSchemaCompatibilityReadFailure(narrow.error)) {
    throw new Error(
      `reader ${direction} episode failed: ${narrow.error.message}`
    );
  }

  const fallback = await run("*");
  if (!fallback.error) {
    return fallback.data ? (fallback.data as unknown as EpisodeRow) : null;
  }
  throw new Error(
    `reader ${direction} episode failed: ${fallback.error.message}`
  );
}

async function fetchCurrentEpisode(
  seriesId: string,
  episodeNumber: number,
  includePrivate: boolean,
  signal?: AbortSignal
): Promise<EpisodeRow | null> {
  const admin = createAdminClient();
  let query = admin
    .from("episodes")
    .select("*")
    .eq("series_id", seriesId)
    .eq("episode_number", episodeNumber);

  if (!includePrivate) {
    query = query
      .eq("posting_status", "posted")
      .eq("is_published", true);
  }

  if (signal) query = query.abortSignal(signal);
  const result = await query.maybeSingle();
  if (result.error) {
    throw new Error(`reader episode failed: ${result.error.message}`);
  }
  return result.data ? (result.data as EpisodeRow) : null;
}

async function fetchPublicRecordings(
  episodeId: string
): Promise<PublicReadRecordingRow[]> {
  if (!episodeId) return [];
  const admin = createAdminClient();

  try {
    const narrow = await runReadOnlyWithRetry(
      async (signal) =>
        await admin
          .from("recordings")
          .select(PUBLIC_READ_RECORDING_SELECT)
          .eq("episode_id", episodeId)
          .order("created_at", { ascending: false })
          .abortSignal(signal),
      { operation: "reader recordings", timeoutMs: 1800, retries: 0 }
    );

    let firstTry = narrow;
    if (narrow.error && isSchemaCompatibilityReadFailure(narrow.error)) {
      firstTry = await runReadOnlyWithRetry(
        async (signal) =>
          await admin
            .from("recordings")
            .select("*")
            .eq("episode_id", episodeId)
            .order("created_at", { ascending: false })
            .abortSignal(signal),
        {
          operation: "reader recordings compatibility",
          timeoutMs: 1800,
          retries: 0,
        }
      );
    }

    if (!firstTry.error) {
      return ((firstTry.data ?? []) as unknown as PublicReadRecordingRow[])
        .filter(isPublishedHumanRecording)
        .map((recording) => ({
          ...recording,
          audio_storage_path: buildHumanRecordingPlaybackHref(recording.id),
        }));
    }
  } catch {
    console.warn("[reader] recordings unavailable");
  }

  return [];
}

type ReaderViewerState = {
  available: boolean;
  userId: string | null;
  email: string | null;
};

async function loadReaderViewerState(
  sessionClient: Awaited<ReturnType<typeof createClient>>,
  options: { timeoutMs: number; retries: number }
): Promise<ReaderViewerState> {
  try {
    const result = await runReadOnlyWithRetry(
      async () => {
        const authResult = await sessionClient.auth.getUser();
        if (
          authResult.error &&
          !isAuthSessionMissingError(authResult.error)
        ) {
          throw authResult.error;
        }
        return authResult;
      },
      {
        operation: "reader auth",
        timeoutMs: options.timeoutMs,
        retries: options.retries,
      }
    );
    return {
      available: true,
      userId: result.data.user?.id ?? null,
      email: result.data.user?.email ?? null,
    };
  } catch {
    console.warn("[reader] auth unavailable");
    return { available: false, userId: null, email: null };
  }
}

export const getCachedPublicReadPagePayload = cache(async (
  seriesId: string,
  episodeNumber: number
): Promise<PublicReadPagePayload | null> => {
  const [sessionClient, admin] = await Promise.all([
    createClient(),
    Promise.resolve(createAdminClient()),
  ]);

  const seriesResult = await runReadOnlyWithRetry(
    async (signal) => {
      const result = await admin
        .from("series")
        .select("*")
        .eq("id", seriesId)
        .abortSignal(signal)
        .maybeSingle();
      if (result.error) {
        throw new Error(`reader series failed: ${result.error.message}`);
      }
      return result;
    },
    { operation: "reader series", timeoutMs: 2500, retries: 1 }
  );

  if (!seriesResult.data) return null;

  const series = seriesResult.data as SeriesRow;
  const isPublicSeries = getSeriesPublicationStatus(series) === "public";
  const viewerPromise = loadReaderViewerState(sessionClient, {
    timeoutMs: 1000,
    retries: 0,
  });
  let viewer = await viewerPromise;

  if (!isPublicSeries && !viewer.available) {
    viewer = await loadReaderViewerState(sessionClient, {
      timeoutMs: 2000,
      retries: 1,
    });
  }

  const ownerId = pickText(
    series.author_id,
    series["user_id"],
    series["userId"]
  );
  const isOwner = Boolean(viewer.userId && ownerId === viewer.userId);

  if (!isPublicSeries && !isOwner) return null;

  const r18PreferencePromise =
    isR18Series(series) && viewer.userId
      ? runReadOnlyWithRetry(
          () => getCurrentR18ViewerPreference(),
          { operation: "reader r18 preference", timeoutMs: 1800, retries: 0 }
        ).catch(() => ({
          signedIn: true,
          userId: viewer.userId,
          showR18Content: false,
          ageConfirmed: false,
        }))
      : Promise.resolve(null);

  const [episode, previousEpisode, nextEpisode, r18Preference] =
    await Promise.all([
      runReadOnlyWithRetry(
        (signal) =>
          fetchCurrentEpisode(seriesId, episodeNumber, isOwner, signal),
        { operation: "reader episode", timeoutMs: 2500, retries: 1 }
      ),
      runReadOnlyWithRetry(
        (signal) =>
          fetchAdjacentEpisode(
            seriesId,
            episodeNumber,
            "previous",
            isOwner,
            signal
          ),
        {
          operation: "reader previous episode",
          timeoutMs: 1800,
          retries: 1,
        }
      ),
      runReadOnlyWithRetry(
        (signal) =>
          fetchAdjacentEpisode(
            seriesId,
            episodeNumber,
            "next",
            isOwner,
            signal
          ),
        {
          operation: "reader next episode",
          timeoutMs: 1800,
          retries: 1,
        }
      ),
      r18PreferencePromise,
    ]);

  if (!episode) return null;
  if (!isOwner && !isEpisodePubliclyVisible(episode)) return null;

  const r18Blocked = isR18Series(series)
    ? !(r18Preference?.showR18Content ?? false)
    : false;

  return {
    series,
    episode,
    previousEpisode,
    nextEpisode,
    allEpisodeRecordings: r18Blocked
      ? []
      : await fetchPublicRecordings(episode.id),
    isOwner,
    r18Blocked,
    viewerSignedIn: Boolean(viewer.userId),
    viewerUserId: viewer.userId,
    viewerEmail: viewer.email,
  };
});
