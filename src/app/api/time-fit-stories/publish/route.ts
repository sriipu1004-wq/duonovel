import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PUBLISH_LIMIT_PER_24H = 1;

type PublishRequest = {
  seriesId?: unknown;
};

type SeriesRow = {
  id: string;
  author_id?: string | null;
  tags?: unknown;
  effect_settings?: unknown;
};

type EpisodeRow = {
  id: string;
  series_id?: string | null;
  episode_number?: number | null;
  posting_status?: string | null;
  posted_at?: string | null;
};

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasTextArrayItem(value: unknown, target: string): boolean {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).includes(target);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,、]/)
      .map((item) => item.trim())
      .includes(target);
  }

  return false;
}

function isAiGeneratedSeries(series: SeriesRow): boolean {
  if (hasTextArrayItem(series.tags, "AI生成")) {
    return true;
  }

  const settings = series.effect_settings;
  if (!settings || typeof settings !== "object") {
    return false;
  }

  const record = settings as Record<string, unknown>;

  return (
    record.source === "time_fit_ai_story" ||
    record.aiGenerated === true ||
    record.authorName === "AI生成"
  );
}

async function requireSignedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function POST(request: Request) {
  let payload: PublishRequest;

  try {
    payload = (await request.json()) as PublishRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "リクエストを読めなかった。" },
      { status: 400 }
    );
  }

  const user = await requireSignedInUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "投稿するにはログインが必要です。" },
      { status: 401 }
    );
  }

  const seriesId = readText(payload.seriesId);

  if (!seriesId) {
    return NextResponse.json(
      { ok: false, error: "seriesId が足りない。" },
      { status: 400 }
    );
  }

  const adminSupabase = createAdminClient();

  const seriesResult = await adminSupabase
    .from("series")
    .select("id, author_id, tags, effect_settings")
    .eq("id", seriesId)
    .maybeSingle();

  if (seriesResult.error || !seriesResult.data) {
    return NextResponse.json(
      {
        ok: false,
        error: seriesResult.error?.message ?? "作品が見つからない。",
      },
      { status: 404 }
    );
  }

  const series = seriesResult.data as SeriesRow;

  if (series.author_id !== user.id) {
    return NextResponse.json(
      { ok: false, error: "この作品を投稿する権限がない。" },
      { status: 403 }
    );
  }

  if (!isAiGeneratedSeries(series)) {
    return NextResponse.json(
      { ok: false, error: "AI生成作品として保存された作品だけ投稿できます。" },
      { status: 400 }
    );
  }

  const episodeResult = await adminSupabase
    .from("episodes")
    .select("id, series_id, episode_number, posting_status, posted_at")
    .eq("series_id", seriesId)
    .order("episode_number", { ascending: true })
    .limit(1);

  if (episodeResult.error || !episodeResult.data?.[0]) {
    return NextResponse.json(
      {
        ok: false,
        error: episodeResult.error?.message ?? "投稿対象の話が見つからない。",
      },
      { status: 404 }
    );
  }

  const episode = episodeResult.data[0] as EpisodeRow;
  const episodeNumber =
    typeof episode.episode_number === "number" && Number.isFinite(episode.episode_number)
      ? episode.episode_number
      : 1;

  if (episode.posting_status === "posted") {
    return NextResponse.json({
      ok: true,
      alreadyPublished: true,
      seriesId,
      episodeId: episode.id,
      readHref: `/read/${seriesId}/${episodeNumber}`,
      workHref: `/works/${seriesId}`,
    });
  }

  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const aiSeriesResult = await adminSupabase
    .from("series")
    .select("id, tags, effect_settings")
    .eq("author_id", user.id);

  if (aiSeriesResult.error) {
    return NextResponse.json(
      { ok: false, error: aiSeriesResult.error.message },
      { status: 500 }
    );
  }

  const aiSeriesIds = ((aiSeriesResult.data ?? []) as SeriesRow[])
    .filter(isAiGeneratedSeries)
    .map((row) => row.id);

  if (aiSeriesIds.length > 0) {
    const publishCountResult = await adminSupabase
      .from("episodes")
      .select("id", { count: "exact", head: true })
      .in("series_id", aiSeriesIds)
      .eq("posting_status", "posted")
      .gte("posted_at", cutoffIso);

    if (publishCountResult.error) {
      return NextResponse.json(
        { ok: false, error: publishCountResult.error.message },
        { status: 500 }
      );
    }

    if ((publishCountResult.count ?? 0) >= PUBLISH_LIMIT_PER_24H) {
      return NextResponse.json(
        {
          ok: false,
          error: `AI生成作品の公開投稿は直近24時間で${PUBLISH_LIMIT_PER_24H}回までです。`,
        },
        { status: 429 }
      );
    }
  }

  const nowIso = new Date().toISOString();

  const seriesUpdate = await adminSupabase
    .from("series")
    .update({
      publication_status: "public",
    })
    .eq("id", seriesId);

  if (seriesUpdate.error) {
    return NextResponse.json(
      { ok: false, error: seriesUpdate.error.message },
      { status: 500 }
    );
  }

  const episodeUpdate = await adminSupabase
    .from("episodes")
    .update({
      is_published: true,
      posting_status: "posted",
      posted_at: nowIso,
      last_edited_at: nowIso,
    })
    .eq("id", episode.id);

  if (episodeUpdate.error) {
    return NextResponse.json(
      { ok: false, error: episodeUpdate.error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    alreadyPublished: false,
    seriesId,
    episodeId: episode.id,
    readHref: `/read/${seriesId}/${episodeNumber}`,
    workHref: `/works/${seriesId}`,
  });
}
