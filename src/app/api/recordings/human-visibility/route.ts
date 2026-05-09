import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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

  if (!recordingId || !seriesId || !episodeId) {
    return NextResponse.json(
      {
        ok: false,
        error: "recordingId / seriesId / episodeId が足りない。",
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
        detail: lookupError?.message,
      },
      { status: 404 }
    );
  }

  const row = recordingRow as RawRow;
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
      detail: secondTry.error?.message || firstTry.error.message,
    },
    { status: 500 }
  );
}
