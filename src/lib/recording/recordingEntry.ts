import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import { getUiLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/navigation";
import type { UiLocale } from "@/i18n/config";

export type RecordingPermissionMode = "open" | "closed";
export type RecordingEntryDeniedReason = "login_required" | "closed";

export type RecordingEntryDecision = {
  canEnter: boolean;
  deniedReason: RecordingEntryDeniedReason | null;
};

export type RecordingEntryGuardResult = {
  seriesId: string;
  seriesTitle: string;
  permissionMode: RecordingPermissionMode;
  userId: string;
  locale: UiLocale;
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
  return "closed";
}

export function buildRecordingEntryPath(seriesId: string): string {
  return `/record/create/${seriesId}`;
}

export function buildRecordingRequestPath(seriesId: string): string {
  return buildWorkPath(seriesId);
}

export function buildWorkPath(seriesId: string): string {
  return `/works/${seriesId}`;
}

export function decideRecordingEntryAccess({
  permissionMode,
  isLoggedIn,
}: {
  permissionMode: RecordingPermissionMode;
  isLoggedIn: boolean;
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

  return {
    canEnter: false,
    deniedReason: "closed",
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


function redirectForDeniedEntry(
  seriesId: string,
  deniedReason: RecordingEntryDeniedReason,
  nextPath: string,
  locale: UiLocale
): never {
  if (deniedReason === "login_required") {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  redirect(localizePath(buildWorkPath(seriesId), locale));
}

export async function requireRecordingEntryAccess(
  seriesId: string
): Promise<RecordingEntryGuardResult> {
  const supabase = await createClient();
  const locale = await getUiLocale();
  const nextPath = localizePath(buildRecordingEntryPath(seriesId), locale);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  if (user && isOfficialAccountEmail(user.email)) {
    redirect(localizePath(buildWorkPath(seriesId), locale));
  }

  const series = await fetchSeriesRecordingPermission(supabase, seriesId);
  const permissionMode = normalizeRecordingPermissionMode(
    series.recording_permission_mode
  );

  const decision = decideRecordingEntryAccess({
    permissionMode,
    isLoggedIn: !!user,
  });

  if (!decision.canEnter) {
    return redirectForDeniedEntry(seriesId, decision.deniedReason!, nextPath, locale);
  }

  return {
    seriesId,
    seriesTitle: pickText(series.title) || "無題",
    permissionMode,
    userId: user!.id,
    locale,
  };
}
