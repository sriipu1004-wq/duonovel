import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type EventKind = "series_view" | "recording_play";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function forwardedIp(headers: Headers): string {
  for (const name of [
    "x-forwarded-for",
    "x-vercel-forwarded-for",
    "cf-connecting-ip",
    "x-real-ip",
  ]) {
    const value = headers.get(name)?.split(",")[0]?.trim();
    if (value) return value;
  }
  return "unknown";
}

function popularitySessionId(args: {
  request: Request;
  userId: string | null;
}): string {
  const salt =
    process.env.IP_HASH_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "libread-local-popularity";
  const day = new Date().toISOString().slice(0, 10);
  const actor = args.userId
    ? `user:${args.userId}`
    : `ip:${forwardedIp(args.request.headers)}`;
  return createHash("sha256")
    .update(`${salt}:popularity:v2:${day}:${actor}`)
    .digest("hex");
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
  const requestedSeriesId = readText(payload.seriesId);
  const episodeId = readText(payload.episodeId);
  const recordingId = readText(payload.recordingId);

  if (kind !== "series_view" && kind !== "recording_play") {
    return NextResponse.json(
      { ok: false, error: "event kind が不正。" },
      { status: 400 }
    );
  }

  if (!isUuid(requestedSeriesId) || !isUuid(episodeId)) {
    return NextResponse.json(
      { ok: false, error: "作品または話IDが不正。" },
      { status: 400 }
    );
  }

  if (kind === "recording_play" && !isUuid(recordingId)) {
    return NextResponse.json(
      { ok: false, error: "recordingId が不正。" },
      { status: 400 }
    );
  }

  const adminSupabase = createAdminClient();
  const userId = await getCurrentUserId();

  // Do not trust seriesId, episodeNumber, recording relationships, or public
  // visibility supplied by the browser. Popularity rows feed ranking counters,
  // so all canonical event dimensions are resolved from the database.
  const { data: episode, error: episodeError } = await adminSupabase
    .from("episodes")
    .select("id, series_id, episode_number, posting_status, is_published")
    .eq("id", episodeId)
    .maybeSingle();

  if (
    episodeError ||
    !episode ||
    String(episode.series_id) !== requestedSeriesId ||
    episode.posting_status !== "posted" ||
    episode.is_published !== true
  ) {
    return NextResponse.json(
      { ok: false, error: "公開中の話が見つからない。" },
      { status: 404 }
    );
  }

  const { data: series, error: seriesError } = await adminSupabase
    .from("series")
    .select("id, publication_status")
    .eq("id", requestedSeriesId)
    .maybeSingle();

  if (seriesError || !series || series.publication_status !== "public") {
    return NextResponse.json(
      { ok: false, error: "公開中の作品が見つからない。" },
      { status: 404 }
    );
  }

  const canonicalSessionId = popularitySessionId({ request, userId });
  const canonicalEpisodeNumber = Number(episode.episode_number);
  if (!Number.isSafeInteger(canonicalEpisodeNumber) || canonicalEpisodeNumber <= 0) {
    return NextResponse.json(
      { ok: false, error: "話番号が不正。" },
      { status: 500 }
    );
  }

  if (kind === "series_view") {
    const { error } = await adminSupabase.from("series_view_events").upsert(
      {
        series_id: requestedSeriesId,
        episode_id: episodeId,
        episode_number: canonicalEpisodeNumber,
        user_id: userId,
        session_id: canonicalSessionId,
      },
      {
        onConflict: "session_id,episode_id",
        ignoreDuplicates: true,
      }
    );

    if (error) {
      console.error("[popularity-series-view]", error);
      return NextResponse.json(
        { ok: false, error: "view_event_unavailable" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  const { data: recording, error: recordingError } = await adminSupabase
    .from("recordings")
    .select("id, series_id, episode_id, is_public")
    .eq("id", recordingId)
    .maybeSingle();

  if (
    recordingError ||
    !recording ||
    recording.is_public !== true ||
    String(recording.series_id) !== requestedSeriesId ||
    String(recording.episode_id) !== episodeId
  ) {
    return NextResponse.json(
      { ok: false, error: "公開中の朗読が見つからない。" },
      { status: 404 }
    );
  }

  const { error } = await adminSupabase.from("recording_play_events").upsert(
    {
      series_id: requestedSeriesId,
      episode_id: episodeId,
      episode_number: canonicalEpisodeNumber,
      recording_id: recordingId,
      user_id: userId,
      session_id: canonicalSessionId,
    },
    {
      onConflict: "session_id,recording_id",
      ignoreDuplicates: true,
    }
  );

  if (error) {
    console.error("[popularity-recording-play]", error);
    return NextResponse.json(
      { ok: false, error: "recording_play_event_unavailable" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
