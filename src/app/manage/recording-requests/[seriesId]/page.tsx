import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import SeriesRecordingRequestsManagePanel from "@/features/manage/SeriesRecordingRequestsManagePanel";

type PageProps = {
  params: Promise<{ seriesId: string }>;
};

type RecordingPermissionMode = "open" | "closed" | "approval_required";
type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

type SeriesRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  recording_permission_mode?: RecordingPermissionMode | null;
};

type SeriesRecordingRequestRow = Record<string, unknown> & {
  id: string;
  requester_user_id?: string | null;
  status?: RequestStatus | null;
  request_message?: string | null;
  review_message?: string | null;
  created_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by_user_id?: string | null;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

export default async function ManageSeriesRecordingRequestsPage({
  params,
}: PageProps) {
  const { seriesId } = await params;
  const nextPath = `/manage/recording-requests/${seriesId}`;
  const { supabase, user } = await requireOwnedSeries(seriesId, nextPath);

  const { data: seriesData, error: seriesError } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .single();

  if (seriesError || !seriesData) {
    notFound();
  }

  const { data: requestsData, error: requestsError } = await supabase
    .from("series_recording_requests")
    .select("*")
    .eq("series_id", seriesId)
    .order("created_at", { ascending: false });

  if (requestsError) {
    throw new Error(
      `series_recording_requests の取得に失敗: ${requestsError.message}`
    );
  }

  const series = seriesData as SeriesRow;
  const requests = (requestsData ?? []) as SeriesRecordingRequestRow[];

  return (
    <SeriesRecordingRequestsManagePanel
      currentUserId={user.id}
      seriesId={seriesId}
      seriesTitle={pickText(series.title) || "無題"}
      recordingPermissionMode={series.recording_permission_mode ?? "closed"}
      requests={requests}
    />
  );
}