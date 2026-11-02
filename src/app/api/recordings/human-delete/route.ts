import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isHumanRecordingRow } from "@/lib/recording/humanRecordingState";
import {
  readHumanAtomicRevision,
  commitHumanAtomicMutation,
} from "@/lib/recording/humanRecordingAtomic";

export const runtime = "nodejs";

type RawRow = Record<string, unknown>;
type RecordingRow = RawRow & {
  id: string;
  episode_id?: string | null;
  episodeId?: string | null;
  audio_storage_path?: string | null;
  audioStoragePath?: string | null;
};

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pickText(row: RawRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

async function findExistingRecordingsForSeriesUserEpisode(args: {
  adminSupabase: ReturnType<typeof createAdminClient>;
  seriesId: string;
  episodeId: string;
  userId: string;
}): Promise<RecordingRow[]> {
  const tries = [
    () =>
      args.adminSupabase
        .from("recordings")
        .select("*")
        .eq("series_id", args.seriesId)
        .eq("reader_id", args.userId)
        .order("created_at", { ascending: false }),
    () =>
      args.adminSupabase
        .from("recordings")
        .select("*")
        .eq("series_id", args.seriesId)
        .eq("reader_user_id", args.userId)
        .order("created_at", { ascending: false }),
  ];

  const deduped = new Map<string, RecordingRow>();

  for (const run of tries) {
    const { data, error } = await run();

    if (error) {
      continue;
    }

    for (const row of (data ?? []) as RecordingRow[]) {
      const episodeId = pickText(row, ["episode_id", "episodeId"]);

      if (!episodeId || episodeId !== args.episodeId) {
        continue;
      }

      if (isHumanRecordingRow(row)) {
        deduped.set(String(row.id), row);
      }
    }
  }

  return Array.from(deduped.values());
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "リクエストを読めなかった。",
      },
      { status: 400 }
    );
  }

  const seriesId = readText(payload.seriesId);
  const episodeId = readText(payload.episodeId);

  if (!seriesId || !episodeId) {
    return NextResponse.json(
      {
        ok: false,
        error: "seriesId または episodeId が足りない。",
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

  try {
    const expectedRevision = await readHumanAtomicRevision(adminSupabase, {
      seriesId,
      episodeId,
      ownerId: user.id,
    });
    const existingRecordings = await findExistingRecordingsForSeriesUserEpisode({
      adminSupabase,
      seriesId,
      episodeId,
      userId: user.id,
    });

    if (existingRecordings.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "削除対象の朗読が見つからない。",
        },
        { status: 404 }
      );
    }

    // H1: never delete by a stale client-assembled ID list.
    // The scoped RPC serializes delete against publish and visibility writes.
    const result = await commitHumanAtomicMutation(adminSupabase, {
      seriesId,
      episodeId,
      ownerId: user.id,
      expectedRevision,
      action: "delete_all",
    });
    // Preserve Storage bytes; a lost DB reply cannot authorize destructive
    // cleanup, and a separate storage lifecycle audit remains pending.
    return NextResponse.json(
      { ok: true, deletedCount: result.deletedCount },
      { status: 200 }
    );
  } catch (error) {
    const conflict = error instanceof Error &&
      /H1_STALE_REVISION|H1_OWNER_OR_ROW_CONFLICT|H1_AMBIGUOUS_OWNER/u.test(error.message);
    if (!conflict) console.error("[human-delete]", error);
    return NextResponse.json(
      {
        ok: false,
        error: conflict
          ? "朗読の状態または所有権が処理中に変更された。再確認が必要。"
          : "朗読削除中に想定外エラーが出た。",
      },
      { status: conflict ? 409 : 500 }
    );
  }
}
