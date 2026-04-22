import { NextResponse } from "next/server";
import { buildNemoTimingObjectPathFromAudioObjectPath } from "@/lib/recording/nemoTiming";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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

function getRecordingAudioBucketName(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_RECORDING_BUCKET?.trim() ||
    "recording-audio"
  );
}

function extractBucketObjectPathFromPublicUrl(
  publicUrl: string,
  bucketName: string
): string | null {
  const marker = `/storage/v1/object/public/${bucketName}/`;
  const markerIndex = publicUrl.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const objectPath = publicUrl.slice(markerIndex + marker.length).trim();
  return objectPath.length > 0 ? decodeURIComponent(objectPath) : null;
}

function buildRecordingArtifactObjectPathsFromPublicUrl(
  publicUrl: string,
  bucketName: string
): string[] {
  const objectPath = extractBucketObjectPathFromPublicUrl(publicUrl, bucketName);

  if (!objectPath) {
    return [];
  }

  const results = [objectPath];

  const normalizedPlaybackMatch = objectPath.match(
    /^(.*\/)playback-from-([a-z0-9]+)\.m4a$/i
  );

  if (normalizedPlaybackMatch) {
    results.push(
      `${normalizedPlaybackMatch[1]}original.${normalizedPlaybackMatch[2]}`
    );
    results.push(buildNemoTimingObjectPathFromAudioObjectPath(objectPath));
  }

  const legacyPlaybackMatch = objectPath.match(/^(.*\/)playback\.([a-z0-9]+)$/i);

  if (legacyPlaybackMatch) {
    results.push(`${legacyPlaybackMatch[1]}original.${legacyPlaybackMatch[2]}`);
    results.push(buildNemoTimingObjectPathFromAudioObjectPath(objectPath));
  }

  if (objectPath.startsWith("nemo/") || objectPath.includes("/nemo/")) {
    results.push(buildNemoTimingObjectPathFromAudioObjectPath(objectPath));
  }

  return [...new Set(results)];
}

async function removeStorageObjectPaths(
  adminSupabase: ReturnType<typeof createAdminClient>,
  bucketName: string,
  objectPaths: string[]
): Promise<void> {
  const filtered = [
    ...new Set(objectPaths.map((value) => value.trim()).filter(Boolean)),
  ];

  if (filtered.length === 0) {
    return;
  }

  const { error } = await adminSupabase.storage.from(bucketName).remove(filtered);

  if (error) {
    throw new Error(error.message);
  }
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
    () =>
      args.adminSupabase
        .from("recordings")
        .select("*")
        .eq("seriesId", args.seriesId)
        .eq("readerUserId", args.userId)
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

      deduped.set(String(row.id), row);
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

    const recordingIds = existingRecordings.map((row) => String(row.id));
    const audioStoragePaths = existingRecordings
      .map((row) => pickText(row, ["audio_storage_path", "audioStoragePath"]))
      .filter((value) => value.length > 0);

    const { error: deleteError } = await adminSupabase
      .from("recordings")
      .delete()
      .in("id", recordingIds);

    if (deleteError) {
      return NextResponse.json(
        {
          ok: false,
          error: `recordings 削除に失敗した: ${deleteError.message}`,
        },
        { status: 500 }
      );
    }

    try {
      const bucketName = getRecordingAudioBucketName();
      const objectPaths = audioStoragePaths.flatMap((publicUrl) =>
        buildRecordingArtifactObjectPathsFromPublicUrl(publicUrl, bucketName)
      );

      await removeStorageObjectPaths(adminSupabase, bucketName, objectPaths);
    } catch (storageError) {
      console.warn("[human-delete storage cleanup warning]", storageError);
    }

    return NextResponse.json(
      {
        ok: true,
        deletedCount: recordingIds.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[human-delete]", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "朗読削除中に想定外エラーが出た。",
      },
      { status: 500 }
    );
  }
}