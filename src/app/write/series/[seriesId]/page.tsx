import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import WriteSeriesForm from "@/features/write/WriteSeriesForm";
import { type EpisodeRow, type SeriesRow } from "@/features/write/writeShared";

type PageProps = {
  params: Promise<{ seriesId: string }>;
};

async function fetchSeries(
  seriesId: string,
  supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"]
): Promise<SeriesRow | null> {
  const { data, error } = await supabase.from("series").select("*").eq("id", seriesId).single();
  if (error || !data) {
    return null;
  }

  return data as SeriesRow;
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

export default async function WriteSeriesEditPage({ params }: PageProps) {
  const { seriesId } = await params;
  const { supabase, user } = await requireOwnedSeries(seriesId, `/write/series/${seriesId}`);

  const series = await fetchSeries(seriesId, supabase);
  if (!series) {
    notFound();
  }

  const episodes = await fetchEpisodes(seriesId, supabase);

  return (
    <WriteSeriesForm
      mode="edit"
      currentUserId={user.id}
      series={series}
      episodes={episodes}
    />
  );
}
