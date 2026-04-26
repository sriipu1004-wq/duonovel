import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type BookmarkRow = {
  id: string;
};

type SupabaseLikeError = {
  code?: string;
  message?: string;
};

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isDuplicateBookmarkError(error: SupabaseLikeError | null): boolean {
  if (!error) {
    return false;
  }

  return (
    error.code === "23505" ||
    (typeof error.message === "string" &&
      error.message.toLowerCase().includes("duplicate key"))
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

async function getBookmarkState(args: {
  userId: string;
  seriesId: string;
}): Promise<boolean> {
  const adminSupabase = createAdminClient();

  const { data, error } = await adminSupabase
    .from("user_series_bookmarks")
    .select("id")
    .eq("user_id", args.userId)
    .eq("series_id", args.seriesId)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as BookmarkRow[]).length > 0;
}

export async function GET(request: Request) {
  const user = await requireSignedInUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "ログインしてから操作して。" },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const seriesId = readText(url.searchParams.get("seriesId"));

  if (!seriesId) {
    return NextResponse.json(
      { ok: false, error: "seriesId が足りない。" },
      { status: 400 }
    );
  }

  try {
    const isBookmarked = await getBookmarkState({
      userId: user.id,
      seriesId,
    });

    return NextResponse.json({
      ok: true,
      isBookmarked,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "ブックマーク状態の確認に失敗した。",
      },
      { status: 500 }
    );
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

  const user = await requireSignedInUser();
  const seriesId = readText(payload.seriesId);

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "ログインしてから操作して。" },
      { status: 401 }
    );
  }

  if (!seriesId) {
    return NextResponse.json(
      { ok: false, error: "seriesId が足りない。" },
      { status: 400 }
    );
  }

  try {
    const adminSupabase = createAdminClient();

    const alreadyBookmarked = await getBookmarkState({
      userId: user.id,
      seriesId,
    });

    if (!alreadyBookmarked) {
      const { error } = await adminSupabase
        .from("user_series_bookmarks")
        .insert({
          user_id: user.id,
          series_id: seriesId,
        });

      if (error && !isDuplicateBookmarkError(error)) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      isBookmarked: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "ブックマーク追加に失敗した。",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "リクエストを読めなかった。" },
      { status: 400 }
    );
  }

  const user = await requireSignedInUser();
  const seriesId = readText(payload.seriesId);

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "ログインしてから操作して。" },
      { status: 401 }
    );
  }

  if (!seriesId) {
    return NextResponse.json(
      { ok: false, error: "seriesId が足りない。" },
      { status: 400 }
    );
  }

  try {
    const adminSupabase = createAdminClient();

    const { error } = await adminSupabase
      .from("user_series_bookmarks")
      .delete()
      .eq("user_id", user.id)
      .eq("series_id", seriesId);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      isBookmarked: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "ブックマーク解除に失敗した。",
      },
      { status: 500 }
    );
  }
}