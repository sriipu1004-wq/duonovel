import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import WriteEpisodeForm from "@/features/write/WriteEpisodeForm";
import {
  getEpisodeNumber,
  sortEpisodes,
  type EpisodeRow,
} from "@/features/write/writeShared";

type PageProps = {
  params: Promise<{ seriesId: string; episodeId: string }>;
};

async function fetchEpisode(
  seriesId: string,
  episodeId: string,
  supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"]
): Promise<EpisodeRow | null> {
  const firstTry = await supabase
    .from("episodes")
    .select("*")
    .eq("id", episodeId)
    .eq("series_id", seriesId)
    .maybeSingle();

  if (!firstTry.error && firstTry.data) {
    return firstTry.data as EpisodeRow;
  }

  const secondTry = await supabase
    .from("episodes")
    .select("*")
    .eq("id", episodeId)
    .eq("seriesId", seriesId)
    .maybeSingle();

  if (!secondTry.error && secondTry.data) {
    return secondTry.data as EpisodeRow;
  }

  const fallback = await supabase.from("episodes").select("*").eq("id", episodeId).maybeSingle();
  if (!fallback.error && fallback.data) {
    return fallback.data as EpisodeRow;
  }

  return null;
}

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

function findPreviousEpisode(
  episodes: EpisodeRow[],
  currentEpisodeNumber: number,
  currentEpisodeId: string
): EpisodeRow | null {
  const candidates = sortEpisodes(episodes).filter((candidate) => {
    if (candidate.id === currentEpisodeId) {
      return false;
    }

    return getEpisodeNumber(candidate) < currentEpisodeNumber;
  });

  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

export default async function WriteEpisodeEditPage({ params }: PageProps) {
  const { seriesId, episodeId } = await params;
  const { supabase } = await requireOwnedSeries(
    seriesId,
    `/write/series/${seriesId}/episodes/${episodeId}`
  );

  const episode = await fetchEpisode(seriesId, episodeId, supabase);
  if (!episode) {
    notFound();
  }

  const allEpisodes = await fetchEpisodes(seriesId, supabase);
  const previousEpisode = findPreviousEpisode(
    allEpisodes,
    getEpisodeNumber(episode) || 1,
    episode.id
  );

  return (
    <WriteEpisodeForm
      mode="edit"
      seriesId={seriesId}
      episode={episode}
      initialEpisodeNumber={getEpisodeNumber(episode) || 1}
      previousEpisode={previousEpisode}
    />
  );
}