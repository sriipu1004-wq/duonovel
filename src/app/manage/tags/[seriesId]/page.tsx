import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import SeriesTagsManageForm from "@/features/manage/SeriesTagsManageForm";

type PageProps = {
  params: Promise<{ seriesId: string }>;
};

type SeriesRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  tags?: string[] | string | null;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

function parseInitialTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((tag) => String(tag).trim())
      .filter((tag) => tag.length > 0);
  }

  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw
      .split(/[\n,、]/)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  return [];
}

export default async function ManageSeriesTagsPage({ params }: PageProps) {
  const { seriesId } = await params;
  const nextPath = `/manage/tags/${seriesId}`;
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
    <SeriesTagsManageForm
      seriesId={seriesId}
      seriesTitle={pickText(series.title) || "無題"}
      initialTags={parseInitialTags(series.tags)}
    />
  );
}