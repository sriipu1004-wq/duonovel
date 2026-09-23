import { NextResponse } from "next/server";
import { classifyGeneratedContentWarnings } from "@/lib/generation/generatedContentWarnings.server";
import { detectSourceLanguageFromText } from "@/lib/translation/detectSourceLanguage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SAVE_LIMIT_PER_24H = 5;
const MAX_REQUEST_BYTES = 256 * 1024;
const STORY_ID_MAX_LENGTH = 120;
const TITLE_MAX_LENGTH = 300;
const SYNOPSIS_MAX_LENGTH = 4_000;
const BODY_MAX_LENGTH = 40_000;
const TAG_MAX_COUNT = 20;
const TAG_MAX_LENGTH = 100;

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

type PublicUserRow = Record<string, unknown> & {
  id?: string | null;
  display_name?: string | null;
  username?: string | null;
  pen_name?: string | null;
  name?: string | null;
};

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
  const raw = Array.isArray(value)
    ? value.map((item) => String(item))
    : typeof value === "string" && value.trim().length > 0
      ? value.split(/[\n,、]/)
      : [];

  return raw
    .map((item) => item.trim().slice(0, TAG_MAX_LENGTH))
    .filter((item) => item.length > 0)
    .slice(0, TAG_MAX_COUNT);
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
  const genre = readText(request.genre).slice(0, TAG_MAX_LENGTH);
  return Array.from(new Set([genre].filter(Boolean)));
}

function buildTags(args: {
  request: Record<string, unknown>;
  storyTags: string[];
  estimatedReadingMinutes: number;
}): string[] {
  const scene = readText(args.request.scene).slice(0, TAG_MAX_LENGTH);
  const genre = readText(args.request.genre).slice(0, TAG_MAX_LENGTH);
  const mood = readText(args.request.mood).slice(0, TAG_MAX_LENGTH);
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
  ).slice(0, TAG_MAX_COUNT);
}

function resolvePublicDisplayName(args: {
  publicUserRow?: PublicUserRow | null;
  metadata: unknown;
}): string {
  const metadata =
    args.metadata && typeof args.metadata === "object"
      ? (args.metadata as Record<string, unknown>)
      : {};

  const candidates = [
    readText(args.publicUserRow?.display_name),
    readText(args.publicUserRow?.pen_name),
    readText(args.publicUserRow?.username),
    readText(args.publicUserRow?.name),
    readText(metadata.display_name),
    readText(metadata.displayName),
    readText(metadata.name),
    readText(metadata.full_name),
    readText(metadata.display_name_candidate),
    "ユーザー",
  ];

  return candidates.find((value) => value.length > 0) ?? "ユーザー";
}

async function ensurePublicUserRow(args: {
  supabase: AdminSupabase;
  userId: string;
  displayName: string;
}): Promise<void> {
  const existing = await args.supabase
    .from("users")
    .select("id")
    .eq("id", args.userId)
    .maybeSingle();

  if (!existing.error && existing.data?.id) {
    return;
  }

  const updatedAt = new Date().toISOString();
  const roleCandidates = ["author", "user", "member", "reader", "voice"];
  const errors: string[] = [];

  for (const role of roleCandidates) {
    for (const payload of [
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
    ]) {
      const result = await args.supabase
        .from("users")
        .insert(payload)
        .select("id")
        .maybeSingle();

      if (!result.error && result.data?.id) {
        return;
      }

      if (isDuplicateError(result.error)) {
        return;
      }

      if (result.error?.message) {
        errors.push(result.error.message);
      }
    }
  }

  throw new Error(errors.join(" | ") || "public_user_prepare_failed");
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

function requestTooLarge(request: Request): boolean {
  const raw = request.headers.get("content-length");
  if (!raw) return false;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > MAX_REQUEST_BYTES;
}

export async function POST(request: Request) {
  const user = await requireSignedInUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "保存するにはログインが必要です。" },
      { status: 401 }
    );
  }

  if (requestTooLarge(request)) {
    return NextResponse.json(
      { ok: false, error: "リクエストが大きすぎる。" },
      { status: 413 }
    );
  }

  let payload: TimeFitStorySaveRequest;

  try {
    payload = (await request.json()) as TimeFitStorySaveRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "リクエストを読めなかった。" },
      { status: 400 }
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

  if (
    !storyId ||
    storyId.length > STORY_ID_MAX_LENGTH ||
    !title ||
    title.length > TITLE_MAX_LENGTH ||
    synopsis.length > SYNOPSIS_MAX_LENGTH ||
    !body ||
    body.length > BODY_MAX_LENGTH
  ) {
    return NextResponse.json(
      { ok: false, error: "保存に必要な生成作品データが不正です。" },
      { status: 400 }
    );
  }

  const adminSupabase = createAdminClient();
  const nowIso = new Date().toISOString();
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const publicUserResult = await adminSupabase
    .from("users")
    .select("id, display_name, username, pen_name, name")
    .eq("id", user.id)
    .maybeSingle();

  if (publicUserResult.error) {
    console.error("[time-fit-save-private-user-read]", publicUserResult.error);
  }

  const publicDisplayName = resolvePublicDisplayName({
    publicUserRow: (publicUserResult.data as PublicUserRow | null) ?? null,
    metadata: user.user_metadata,
  });

  try {
    await ensurePublicUserRow({
      supabase: adminSupabase,
      userId: user.id,
      displayName: publicDisplayName,
    });
  } catch (error) {
    console.error("[time-fit-save-private-user-prepare]", error);
    return NextResponse.json(
      { ok: false, error: "ユーザー情報の準備に失敗した。" },
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
    console.error("[time-fit-save-private-count]", saveCountResult.error);
    return NextResponse.json(
      { ok: false, error: "保存回数の確認に失敗した。" },
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

  let contentClassification: Awaited<
    ReturnType<typeof classifyGeneratedContentWarnings>
  >;
  try {
    contentClassification = await classifyGeneratedContentWarnings({
      title,
      synopsis,
      body,
    });
  } catch (error) {
    console.error("[time-fit-story-content-warnings]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "content_warning_classification_failed",
        message: "AI生成作品のコンテンツ警告判定に失敗しました。",
      },
      { status: 503 }
    );
  }

  const contentRating = contentClassification.warnings.includes("sexual_r18")
    ? "r18"
    : "general";

  const baseSeriesPayload = {
    title,
    author_id: authorId,
    source_language: detectSourceLanguageFromText(body),
    publication_status: "private",
    reviews_enabled: true,
    episode_comments_enabled: true,
    genres,
    tags,
    recording_permission_mode: "open",
    translation_permission_mode: "open",
    content_rating: contentRating,
    content_warnings: contentClassification.warnings,
    content_warning_locks: contentClassification.lockedWarnings,
    effect_settings: {
      version: 1,
      source: "time_fit_ai_story",
      aiGenerated: true,
      storyFormat: "short",
      generatedStoryId: storyId,
      generatedAt: readText(payload.createdAt).slice(0, 100),
      savedAt: nowIso,
      bookmarkUnitIndex,
      authorName: "AI生成",
      editorName: publicDisplayName,
      editorUserId: user.id,
      request: requestObject,
      estimatedReadingMinutes,
      generatedContentWarnings: contentClassification.warnings,
    },
  };

  const seriesPayloads: Array<Record<string, unknown>> = [
    { ...baseSeriesPayload, summary: synopsis },
    { ...baseSeriesPayload, description: synopsis },
    { ...baseSeriesPayload, catch_copy: synopsis },
    { ...baseSeriesPayload },
  ];

  let createdSeriesId = "";
  let lastSeriesError: unknown = null;

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

    lastSeriesError = result.error;
  }

  if (!createdSeriesId) {
    console.error("[time-fit-save-private-series]", lastSeriesError);
    return NextResponse.json(
      { ok: false, error: "作品保存に失敗した。" },
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
    console.error("[time-fit-save-private-episode]", episodeResult.error);
    await adminSupabase.from("series").delete().eq("id", createdSeriesId);
    return NextResponse.json(
      { ok: false, error: "話の保存に失敗した。" },
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
    console.error("[time-fit-save-private-bookmark]", bookmarkResult.error);
    await adminSupabase
      .from("episodes")
      .delete()
      .eq("id", episodeResult.data.id);
    await adminSupabase.from("series").delete().eq("id", createdSeriesId);
    return NextResponse.json(
      { ok: false, error: "保存後のブックマーク登録に失敗した。" },
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
