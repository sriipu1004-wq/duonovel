import { notFound } from "next/navigation";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import SeriesRecordingRequestForm from "@/features/recording-request/SeriesRecordingRequestForm";

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

type ExistingRequestRow = Record<string, unknown> & {
  id: string;
  status?: RequestStatus | null;
  request_message?: string | null;
  created_at?: string | null;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

function normalizeRecordingPermissionMode(
  value: unknown
): RecordingPermissionMode {
  if (value === "open") return "open";
  if (value === "approval_required") return "approval_required";
  return "closed";
}

function normalizeRequestStatus(value: unknown): RequestStatus | null {
  if (value === "pending") return "pending";
  if (value === "approved") return "approved";
  if (value === "rejected") return "rejected";
  if (value === "cancelled") return "cancelled";
  return null;
}

export default async function RecordingRequestPage({ params }: PageProps) {
  const { seriesId } = await params;
  const nextPath = `/recording-request/${seriesId}`;
  const { supabase, user } = await requireLoggedInUser(nextPath);

  const { data: seriesData, error: seriesError } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .single();

  if (seriesError || !seriesData) {
    notFound();
  }

  const series = seriesData as SeriesRow;
  const permissionMode = normalizeRecordingPermissionMode(
    series.recording_permission_mode
  );

  const { data: existingRequestData } = await supabase
    .from("series_recording_requests")
    .select("*")
    .eq("series_id", seriesId)
    .eq("requester_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingRequest = existingRequestData as ExistingRequestRow | null;

  return (
    <SeriesRecordingRequestForm
      seriesId={seriesId}
      seriesTitle={pickText(series.title) || "無題"}
      currentUserId={user.id}
      permissionMode={permissionMode}
      initialLatestStatus={normalizeRequestStatus(existingRequest?.status)}
      initialLatestMessage={pickText(existingRequest?.request_message)}
      initialLatestCreatedAt={
        typeof existingRequest?.created_at === "string"
          ? existingRequest.created_at
          : null
      }
    />
  );
}