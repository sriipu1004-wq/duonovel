import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type RecordingPermissionMode = "open" | "closed" | "approval_required";
export type RecordingEntryDeniedReason =
  | "login_required"
  | "closed"
  | "approval_required_not_approved";

export type RecordingEntryDecision = {
  canEnter: boolean;
  deniedReason: RecordingEntryDeniedReason | null;
};

export type RecordingEntryGuardResult = {
  seriesId: string;
  seriesTitle: string;
  permissionMode: RecordingPermissionMode;
  hasApprovedRequest: boolean;
  userId: string;
};

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

type SeriesRecordingPermissionRow = Record<string, unknown> & {
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

export function normalizeRecordingPermissionMode(
  value: unknown
): RecordingPermissionMode {
  if (value === "open") return "open";
  if (value === "approval_required") return "approval_required";
  return "closed";
}

export function buildRecordingEntryPath(seriesId: string): string {
  return `/record/create/${seriesId}`;
}

export function buildRecordingRequestPath(seriesId: string): string {
  return `/recording-request/${seriesId}`;
}

export function buildWorkPath(seriesId: string): string {
  return `/works/${seriesId}`;
}

export function decideRecordingEntryAccess({
  permissionMode,
  isLoggedIn,
  hasApprovedRequest,
}: {
  permissionMode: RecordingPermissionMode;
  isLoggedIn: boolean;
  hasApprovedRequest: boolean;
}): RecordingEntryDecision {
  if (!isLoggedIn) {
    return {
      canEnter: false,
      deniedReason: "login_required",
    };
  }

  if (permissionMode === "open") {
    return {
      canEnter: true,
      deniedReason: null,
    };
  }

  if (permissionMode === "closed") {
    return {
      canEnter: false,
      deniedReason: "closed",
    };
  }

  if (hasApprovedRequest) {
    return {
      canEnter: true,
      deniedReason: null,
    };
  }

  return {
    canEnter: false,
    deniedReason: "approval_required_not_approved",
  };
}

async function fetchSeriesRecordingPermission(
  supabase: ServerSupabase,
  seriesId: string
): Promise<SeriesRecordingPermissionRow> {
  const { data, error } = await supabase
    .from("series")
    .select("id, title, recording_permission_mode")
    .eq("id", seriesId)
    .single();

  if (error || !data) {
    notFound();
  }

  return data as SeriesRecordingPermissionRow;
}

export async function hasApprovedRecordingRequest(
  supabase: ServerSupabase,
  seriesId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("series_recording_requests")
    .select("id")
    .eq("series_id", seriesId)
    .eq("requester_user_id", userId)
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `approved な series_recording_requests の確認に失敗: ${error.message}`
    );
  }

  return !!data;
}

function redirectForDeniedEntry(
  seriesId: string,
  deniedReason: RecordingEntryDeniedReason,
  nextPath: string
): never {
  if (deniedReason === "login_required") {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  if (deniedReason === "closed") {
    redirect(buildWorkPath(seriesId));
  }

  redirect(buildRecordingRequestPath(seriesId));
}

export async function requireRecordingEntryAccess(
  seriesId: string
): Promise<RecordingEntryGuardResult> {
  const supabase = await createClient();
  const nextPath = buildRecordingEntryPath(seriesId);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const series = await fetchSeriesRecordingPermission(supabase, seriesId);
  const permissionMode = normalizeRecordingPermissionMode(
    series.recording_permission_mode
  );

  const hasApprovedRequest =
    !!user && permissionMode === "approval_required"
      ? await hasApprovedRecordingRequest(supabase, seriesId, user.id)
      : false;

  const decision = decideRecordingEntryAccess({
    permissionMode,
    isLoggedIn: !!user,
    hasApprovedRequest,
  });

  if (!decision.canEnter) {
    return redirectForDeniedEntry(seriesId, decision.deniedReason!, nextPath);
  }

  return {
    seriesId,
    seriesTitle: pickText(series.title) || "無題",
    permissionMode,
    hasApprovedRequest,
    userId: user!.id,
  };
}
