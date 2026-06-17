import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SAVE_LIMIT_PER_24H = 5;

type TimeFitStorySaveRequest = {
  storyId?: unknown;
  createdAt?: unknown;
  title?: unknown;
  synopsis?: unknown;
  body?: unknown;
  estimatedReadingMinutes?: unknown;
  request?: unknown;
  tags?: unknown;
  bookmarkUnitIndex?: unknown;
  editorName?: unknown;
};

type SupabaseLikeError = {
  code?: string;
  message?: string;
};

type AdminSupabase = ReturnType<typeof createAdminClient>;

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value
      .split(/[\n,、]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

function isDuplicateError(error: SupabaseLikeError | null): boolean {
  if (!error) return false;

  return (
    error.code === "23505" ||
    (typeof error.message === "string" &&
      error.message.toLowerCase().includes("duplicate key"))
  );
}

function readRequestObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildGenres(request: Record<string, unknown>): string[] {
  const genre = readText(request.genre);

  return Array.from(new Set([genre].filter(Boolean)));
}

function buildTags(args: {
  request: Record<string, unknown>;
  storyTags: string[];
  estimatedReadingMinutes: number;
}): string[] {
  const scene = readText(args.request.scene);
  const genre = readText(args.request.genre);
  const mood = readText(args.request.mood);
  const timeMinutes =
    readNumber(args.request.timeMinutes, args.estimatedReadingMinutes) ||
    args.estimatedReadingMinutes;

  return Array.from(
    new Set(
      [
        "AI生成",
        "時間指定AI短編",
        timeMinutes > 0 ? `${timeMinutes}分` : "",
        scene,
        genre,
        mood,
        ...args.storyTags,
      ].filter(Boolean)
    )
  );
}

function resolvePublicDisplayName(args: {
  editorName: string;
  userEmail?: string | null;
  metadata: unknown;
}): string {
  const metadata =
    args.metadata && typeof args.metadata === "object"
      ? (args.metadata as Record<string, unknown>)
      : {};

  const candidates = [
    args.editorName,
    readText(metadata.display_name),
    readText(metadata.displayName),
    readText(metadata.name),
    readText(metadata.full_name),
    readText(metadata.display_name_candidate),
    readText(args.userEmail),
    "ユーザー",
  ];

  return candidates.find((value) => value.trim().length > 0) ?? "ユーザー";
}

async function ensurePublicUserRow(args: {
  supabase: AdminSupabase;
  userId: string;
  displayName: string;
}): Promise<void> {
  const updatedAt = new Date().toISOString();

  const updatePayloads: Array<Record<string, unknown>> = [
    { display_name: args.displayName, updated_at: updatedAt },
    { display_name: args.displayName },
  ];

  for (const payload of updatePayloads) {
    const result = await args.supabase
      .from("users")
      .update(payload)
      .eq("id", args.userId)
      .select("id")
      .maybeSingle();

    if (!result.error && result.data?.id) {
      return;
    }
  }

  const roleCandidates = ["author", "user", "member", "reader", "voice"];

  const insertPayloads: Array<Record<string, unknown>> = roleCandidates.flatMap(
    (role) => [
      {
        id: args.userId,
        display_name: args.displayName,
        role,
        updated_at: updatedAt,
      },
      {
        id: args.userId,
        display_name: args.displayName,
        role,
      },
    ]
  );

  const errors: string[] = [];

  for (const payload of insertPayloads) {
    const result = await args.supabase
      .from("users")
      .upsert(payload, { onConflict: "id" })
      .select("id")
      .maybeSingle();

    if (!result.error && result.data?.id) {
      return;
    }

    if (result.error?.message) {
      errors.push(`${JSON.stringify(payload)} => ${result.error.message}`);
    }
  }

  throw new Error(`ユーザー情報の準備に失敗した: ${errors.join(" | ")}`);
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
  let payload: TimeFitStorySaveRequest;

  try {
    payload = (await request.json()) as TimeFitStorySaveRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "リクエストを読めなかった。" },
      { status: 400 }
    );
  }

  const user = await requireSignedInUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "保存するにはログインが必要です。" },
      { status: 401 }
    );
  }

  const storyId = readText(payload.storyId);
  const title = readText(payload.title);
  const synopsis = readText(payload.synopsis);
  const body = readText(payload.body);
  const requestObject = readRequestObject(payload.request);
  const storyTags = readStringArray(payload.tags);
  const estimatedReadingMinutes = readNumber(payload.estimatedReadingMinutes, 0);
  const bookmarkUnitIndex = readNumber(payload.bookmarkUnitIndex, 0);
  const editorName = readText(payload.editorName) || readText(user.email);
  const publicDisplayName = resolvePublicDisplayName({
    editorName,
    userEmail: user.email,
    metadata: user.user_metadata,
  });

  if (!storyId || !title || !body) {
    return NextResponse.json(
      { ok: false, error: "保存に必要な生成作品データが足りない。" },
      { status: 400 }
    );
  }

  const adminSupabase = createAdminClient();
  const nowIso = new Date().toISOString();
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    await ensurePublicUserRow({
      supabase: adminSupabase,
      userId: user.id,
      displayName: publicDisplayName,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "ユーザー情報の準備に失敗した。",
      },
      { status: 500 }
    );
  }

  const authorId = user.id;

  const genres = buildGenres(requestObject);
  const tags = buildTags({
    request: requestObject,
    storyTags,
    estimatedReadingMinutes,
  });

  try {
    const existingSeries = await adminSupabase
      .from("series")
      .select("id")
      .eq("author_id", authorId)
      .contains("effect_settings", {
        source: "time_fit_ai_story",
        generatedStoryId: storyId,
      })
      .limit(1);

    if (!existingSeries.error && existingSeries.data?.[0]?.id) {
      const seriesId = String(existingSeries.data[0].id);

      const existingEpisode = await adminSupabase
        .from("episodes")
        .select("id, episode_number")
        .eq("series_id", seriesId)
        .order("episode_number", { ascending: true })
        .limit(1);

      const episodeId =
        existingEpisode.data?.[0]?.id &&
        typeof existingEpisode.data[0].id === "string"
          ? existingEpisode.data[0].id
          : "";

      return NextResponse.json({
        ok: true,
        alreadySaved: true,
        seriesId,
        episodeId,
        workspaceHref: `/write/series/${seriesId}`,
        editHref: episodeId
          ? `/write/series/${seriesId}/episodes/${episodeId}`
          : `/write/series/${seriesId}`,
        readHref: `/read/${seriesId}/1`,
      });
    }
  } catch {
    // effect_settings が contains 検索できない環境でも保存処理自体は続ける。
  }

  const saveCountResult = await adminSupabase
    .from("series")
    .select("id", { count: "exact", head: true })
    .eq("author_id", authorId)
    .gte("created_at", cutoffIso)
    .contains("tags", ["AI生成"]);

  if (saveCountResult.error) {
    return NextResponse.json(
      { ok: false, error: saveCountResult.error.message },
      { status: 500 }
    );
  }

  if ((saveCountResult.count ?? 0) >= SAVE_LIMIT_PER_24H) {
    return NextResponse.json(
      {
        ok: false,
        error: `AI生成作品の保存は直近24時間で${SAVE_LIMIT_PER_24H}回までです。`,
      },
      { status: 429 }
    );
  }

  const baseSeriesPayload = {
    title,
    author_id: authorId,
    publication_status: "private",
    reviews_enabled: true,
    episode_comments_enabled: true,
    genres,
    tags,
    recording_permission_mode: "closed",
    effect_settings: {
      version: 1,
      source: "time_fit_ai_story",
      aiGenerated: true,
      generatedStoryId: storyId,
      generatedAt: readText(payload.createdAt),
      savedAt: nowIso,
      bookmarkUnitIndex,
      authorName: "AI生成",
      editorName: publicDisplayName,
      editorUserId: user.id,
      request: requestObject,
      estimatedReadingMinutes,
    },
  };

  const seriesPayloads: Array<Record<string, unknown>> = [
    { ...baseSeriesPayload, summary: synopsis },
    { ...baseSeriesPayload, description: synopsis },
    { ...baseSeriesPayload, catch_copy: synopsis },
    { ...baseSeriesPayload },
  ];

  let createdSeriesId = "";
  let lastSeriesError = "作品保存に失敗した。";

  for (const seriesPayload of seriesPayloads) {
    const result = await adminSupabase
      .from("series")
      .insert(seriesPayload)
      .select("id")
      .single();

    if (!result.error && result.data?.id) {
      createdSeriesId = String(result.data.id);
      break;
    }

    lastSeriesError = result.error?.message ?? lastSeriesError;
  }

  if (!createdSeriesId) {
    return NextResponse.json(
      { ok: false, error: lastSeriesError },
      { status: 500 }
    );
  }

  const episodePayload = {
    series_id: createdSeriesId,
    episode_number: 1,
    title,
    body,
    is_published: false,
    posting_status: "draft",
    scheduled_for: null,
    posted_at: null,
    last_edited_at: nowIso,
  };

  const episodeResult = await adminSupabase
    .from("episodes")
    .insert(episodePayload)
    .select("id")
    .single();

  if (episodeResult.error || !episodeResult.data?.id) {
    await adminSupabase.from("series").delete().eq("id", createdSeriesId);

    return NextResponse.json(
      {
        ok: false,
        error: episodeResult.error?.message ?? "話の保存に失敗した。",
      },
      { status: 500 }
    );
  }

  const bookmarkResult = await adminSupabase
    .from("user_series_bookmarks")
    .insert({
      user_id: user.id,
      series_id: createdSeriesId,
    });

  if (bookmarkResult.error && !isDuplicateError(bookmarkResult.error)) {
    await adminSupabase
      .from("episodes")
      .delete()
      .eq("id", episodeResult.data.id);
    await adminSupabase.from("series").delete().eq("id", createdSeriesId);

    return NextResponse.json(
      { ok: false, error: bookmarkResult.error.message },
      { status: 500 }
    );
  }

  const episodeId = String(episodeResult.data.id);

  return NextResponse.json({
    ok: true,
    alreadySaved: false,
    seriesId: createdSeriesId,
    episodeId,
    workspaceHref: `/write/series/${createdSeriesId}`,
    editHref: `/write/series/${createdSeriesId}/episodes/${episodeId}`,
    readHref: `/read/${createdSeriesId}/1`,
  });
}
