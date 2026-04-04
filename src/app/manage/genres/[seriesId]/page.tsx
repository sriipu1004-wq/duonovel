import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import SeriesGenresManageForm from "@/features/manage/SeriesGenresManageForm";

type PageProps = {
  params: Promise<{ seriesId: string }>;
};

type SeriesRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  genres?: string[] | string | null;
  genre?: string | null;
  genre_list?: string[] | string | null;
  genreList?: string[] | string | null;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

function parseInitialGenres(series: SeriesRow): string[] {
  const candidates = [
    series.genres,
    series.genre_list,
    series.genreList,
    series.genre,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const parsed = candidate
        .map((genre) => String(genre).trim())
        .filter((genre) => genre.length > 0);

      if (parsed.length > 0) {
        return parsed;
      }
    }

    if (typeof candidate === "string" && candidate.trim().length > 0) {
      const parsed = candidate
        .split(/[\n,、]/)
        .map((genre) => genre.trim())
        .filter((genre) => genre.length > 0);

      if (parsed.length > 0) {
        return parsed;
      }
    }
  }

  return [];
}

export default async function ManageSeriesGenresPage({ params }: PageProps) {
  const { seriesId } = await params;
  const nextPath = `/manage/genres/${seriesId}`;
  const { supabase } = await requireOwnedSeries(seriesId, nextPath);

  const { data: seriesData, error: seriesError } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .single();

  if (seriesError || !seriesData) {
    notFound();
  }

  const series = seriesData as SeriesRow;

  return (
    <SeriesGenresManageForm
      seriesId={seriesId}
      seriesTitle={pickText(series.title) || "無題"}
      initialGenres={parseInitialGenres(series)}
    />
  );
}