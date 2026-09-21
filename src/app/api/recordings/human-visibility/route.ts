import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";
import { isHumanRecordingRow } from "@/lib/recording/humanRecordingState";

export const runtime = "nodejs";

type RawRow = Record<string, unknown>;

function pickText(row: RawRow | null | undefined, keys: string[]): string {
  if (!row) return "";

  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function readBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["false", "0", "private", "非公開"].includes(normalized)) {
      return false;
    }

    if (["true", "1", "public", "公開"].includes(normalized)) {
      return true;
    }
  }

  return fallback;
}

async function canExposeRecordingTarget(args: {
  adminSupabase: ReturnType<typeof createAdminClient>;
  seriesId: string;
  episodeId: string;
}): Promise<boolean> {
  const [seriesResult, episodeResult] = await Promise.all([
    args.adminSupabase
      .from("series")
      .select("id, publication_status")
      .eq("id", args.seriesId)
      .maybeSingle(),
    args.adminSupabase
      .from("episodes")
      .select("id, series_id, posting_status, is_published")
      .eq("id", args.episodeId)
      .maybeSingle(),
  ]);

  if (seriesResult.error) {
    throw new Error(`series_visibility_lookup_failed:${seriesResult.error.message}`);
  }
  if (episodeResult.error) {
    throw new Error(`episode_visibility_lookup_failed:${episodeResult.error.message}`);
  }

  return Boolean(
    seriesResult.data?.id &&
      seriesResult.data.publication_status === "public" &&
      episodeResult.data?.id &&
      String(episodeResult.data.series_id) === args.seriesId &&
      episodeResult.data.posting_status === "posted" &&
      episodeResult.data.is_published === true
  );
}

export async function POST(request: Request) {
  let payload: RawRow;

  try {
    payload = (await request.json()) as RawRow;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "JSONを読めなかった。",
      },
      { status: 400 }
    );
  }

  const recordingId = pickText(payload, ["recordingId", "id"]);
  const seriesId = pickText(payload, ["seriesId", "series_id"]);
  const episodeId = pickText(payload, ["episodeId", "episode_id"]);
  const isPublic = readBoolean(payload.isPublic, true);

  if (
    !recordingId ||
    !seriesId ||
    !episodeId ||
    !isUuid(recordingId) ||
    !isUuid(seriesId) ||
    !isUuid(episodeId)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "recordingId / seriesId / episodeId が不正。",
      },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      {
        ok: false,
        error: "ログイン状態を確認できなかった。",
      },
      { status: 401 }
    );
  }

  const adminSupabase = createAdminClient();

  const { data: recordingRow, error: lookupError } = await adminSupabase
    .from("recordings")
    .select("*")
    .eq("id", recordingId)
    .maybeSingle();

  if (lookupError || !recordingRow) {
    return NextResponse.json(
      {
        ok: false,
        error: "対象朗読が見つからない。",
      },
      { status: 404 }
    );
  }

  const row = recordingRow as RawRow;
  if (!isHumanRecordingRow(row)) {
    return NextResponse.json(
      {
        ok: false,
        error: "対象はHuman narrationではない。",
      },
      { status: 404 }
    );
  }

  const rowSeriesId = pickText(row, ["series_id", "seriesId"]);
  const rowEpisodeId = pickText(row, ["episode_id", "episodeId"]);
  const readerId = pickText(row, ["reader_id", "reader_user_id", "readerUserId"]);

  if (rowSeriesId !== seriesId || rowEpisodeId !== episodeId || readerId !== user.id) {
    return NextResponse.json(
      {
        ok: false,
        error: "この朗読の公開範囲を変更する権限がない。",
      },
      { status: 403 }
    );
  }

  try {
    // Hiding an existing recording is always allowed for its reader. Exposing it
    // publicly is stricter: the underlying work and episode must themselves be
    // canonically public at the time of the change.
    if (
      isPublic &&
      !(await canExposeRecordingTarget({
        adminSupabase,
        seriesId,
        episodeId,
      }))
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "非公開または未投稿の作品・話では朗読を公開できない。",
        },
        { status: 409 }
      );
    }

    const firstTry = await adminSupabase
      .from("recordings")
      .update({ is_public: isPublic })
      .eq("id", recordingId)
      .select("id, is_public")
      .maybeSingle();

    if (!firstTry.error) {
      return NextResponse.json(
        {
          ok: true,
          recordingId,
          isPublic,
        },
        { status: 200 }
      );
    }

    const secondTry = await adminSupabase
      .from("recordings")
      .update({ isPublic })
      .eq("id", recordingId)
      .select("id, isPublic")
      .maybeSingle();

    if (!secondTry.error) {
      return NextResponse.json(
        {
          ok: true,
          recordingId,
          isPublic,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "公開範囲の更新に失敗した。",
      },
      { status: 500 }
    );
  } catch (error) {
    console.error("[human-visibility]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "公開範囲の確認または更新に失敗した。",
      },
      { status: 500 }
    );
  }
}
