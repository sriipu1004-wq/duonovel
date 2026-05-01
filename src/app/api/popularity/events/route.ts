import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type EventKind = "series_view" | "recording_play";

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
}

async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "リクエストを読めなかった。" },
      { status: 400 }
    );
  }

  const kind = readText(payload.kind) as EventKind;
  const seriesId = readText(payload.seriesId);
  const episodeId = readText(payload.episodeId);
  const recordingId = readText(payload.recordingId);
  const sessionId = readText(payload.sessionId);
  const episodeNumber = readPositiveInteger(payload.episodeNumber);

  if (kind !== "series_view" && kind !== "recording_play") {
    return NextResponse.json(
      { ok: false, error: "event kind が不正。" },
      { status: 400 }
    );
  }

  if (!seriesId || !episodeId || !sessionId || episodeNumber <= 0) {
    return NextResponse.json(
      { ok: false, error: "必要な値が足りない。" },
      { status: 400 }
    );
  }

  if (kind === "recording_play" && !recordingId) {
    return NextResponse.json(
      { ok: false, error: "recordingId が足りない。" },
      { status: 400 }
    );
  }

  const adminSupabase = createAdminClient();
  const userId = await getCurrentUserId();

  if (kind === "series_view") {
    const { error } = await adminSupabase.from("series_view_events").upsert(
      {
        series_id: seriesId,
        episode_id: episodeId,
        episode_number: episodeNumber,
        user_id: userId,
        session_id: sessionId,
      },
      {
        onConflict: "session_id,episode_id",
        ignoreDuplicates: true,
      }
    );

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  const { error } = await adminSupabase.from("recording_play_events").upsert(
    {
      series_id: seriesId,
      episode_id: episodeId,
      episode_number: episodeNumber,
      recording_id: recordingId,
      user_id: userId,
      session_id: sessionId,
    },
    {
      onConflict: "session_id,recording_id",
      ignoreDuplicates: true,
    }
  );

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}