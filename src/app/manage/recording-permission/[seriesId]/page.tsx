import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import SeriesRecordingPermissionManageForm from "@/features/manage/SeriesRecordingPermissionManageForm";

type PageProps = {
  params: Promise<{ seriesId: string }>;
};

type RecordingPermissionMode = "open" | "closed" | "approval_required";

type SeriesRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  recording_permission_mode?: RecordingPermissionMode | null;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

export default async function ManageSeriesRecordingPermissionPage({
  params,
}: PageProps) {
  const { seriesId } = await params;
  const nextPath = `/manage/recording-permission/${seriesId}`;
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
    <SeriesRecordingPermissionManageForm
      seriesId={seriesId}
      seriesTitle={pickText(series.title) || "無題"}
      initialMode={series.recording_permission_mode ?? "closed"}
    />
  );
}