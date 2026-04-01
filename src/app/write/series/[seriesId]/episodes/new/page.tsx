import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import WriteEpisodeForm from "@/features/write/WriteEpisodeForm";
import {
  getEpisodeNumber,
  sortEpisodes,
  type EpisodePostingStatus,
  type EpisodeRow,
} from "@/features/write/writeShared";

type PageProps = {
  params: Promise<{ seriesId: string }>;
  searchParams?: Promise<{
    initialPostingStatus?: string;
    initialScheduledFor?: string;
  }>;
};

async function fetchEpisodes(
  seriesId: string,
  supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"]
): Promise<EpisodeRow[]> {
  const firstTry = await supabase.from("episodes").select("*").eq("series_id", seriesId);
  if (!firstTry.error) {
    return (firstTry.data ?? []) as EpisodeRow[];
  }

  const secondTry = await supabase.from("episodes").select("*").eq("seriesId", seriesId);
  if (!secondTry.error) {
    return (secondTry.data ?? []) as EpisodeRow[];
  }

  return [];
}

function resolveInitialPostingStatus(value?: string): EpisodePostingStatus {
  if (value === "posted" || value === "scheduled" || value === "draft") {
    return value;
  }

  return "draft";
}

function findPreviousEpisode(
  episodes: EpisodeRow[],
  currentEpisodeNumber: number
): EpisodeRow | null {
  const candidates = sortEpisodes(episodes).filter(
    (episode) => getEpisodeNumber(episode) < currentEpisodeNumber
  );

  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

export default async function WriteEpisodeNewPage({
  params,
  searchParams,
}: PageProps) {
  const { seriesId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const { supabase } = await requireOwnedSeries(
    seriesId,
    `/write/series/${seriesId}/episodes/new`
  );

  const episodes = await fetchEpisodes(seriesId, supabase);
  const nextEpisodeNumber =
    episodes.length > 0
      ? Math.max(...episodes.map((episode) => getEpisodeNumber(episode))) + 1
      : 1;

  const previousEpisode = findPreviousEpisode(episodes, nextEpisodeNumber);

  return (
    <WriteEpisodeForm
      mode="create"
      seriesId={seriesId}
      initialEpisodeNumber={nextEpisodeNumber}
      initialPostingStatus={resolveInitialPostingStatus(
        resolvedSearchParams?.initialPostingStatus
      )}
      initialScheduledFor={resolvedSearchParams?.initialScheduledFor ?? null}
      previousEpisode={previousEpisode}
    />
  );
}