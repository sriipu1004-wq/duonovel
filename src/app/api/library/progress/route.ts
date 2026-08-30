import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 }
    );
  }

  const chapterId =
    typeof payload.chapterId === "string" ? payload.chapterId.trim() : "";
  const progressRatio = Number(payload.progressRatio);
  const rawSegmentIndex = payload.segmentIndex;
  const segmentIndex =
    rawSegmentIndex === null || typeof rawSegmentIndex === "undefined"
      ? null
      : Number(rawSegmentIndex);

  if (
    !chapterId ||
    !Number.isFinite(progressRatio) ||
    progressRatio < 0 ||
    progressRatio > 1 ||
    (segmentIndex !== null &&
      (!Number.isInteger(segmentIndex) || segmentIndex < 0))
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 }
    );
  }

  const result = await supabase.rpc("update_private_library_reading_progress", {
    p_chapter_id: chapterId,
    p_progress_ratio: progressRatio,
    p_segment_index: segmentIndex,
  });

  if (result.error || result.data !== true) {
    return NextResponse.json(
      { ok: false, error: "progress_update_failed" },
      { status: 422 }
    );
  }

  return NextResponse.json({ ok: true });
}
