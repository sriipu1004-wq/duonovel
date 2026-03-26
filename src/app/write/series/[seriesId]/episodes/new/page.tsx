import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import WriteEpisodeForm from "@/features/write/WriteEpisodeForm";
import { getEpisodeNumber, type EpisodeRow } from "@/features/write/writeShared";

type PageProps = {
  params: Promise<{ seriesId: string }>;
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

export default async function WriteEpisodeNewPage({ params }: PageProps) {
  const { seriesId } = await params;
  const { supabase } = await requireOwnedSeries(
    seriesId,
    `/write/series/${seriesId}/episodes/new`
  );

  const episodes = await fetchEpisodes(seriesId, supabase);
  const nextEpisodeNumber =
    episodes.length > 0
      ? Math.max(...episodes.map((episode) => getEpisodeNumber(episode))) + 1
      : 1;

  return (
    <WriteEpisodeForm
      mode="create"
      seriesId={seriesId}
      initialEpisodeNumber={nextEpisodeNumber}
    />
  );
}
