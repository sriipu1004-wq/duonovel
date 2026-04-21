import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DB_REACTION_TYPE = "support";

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

async function resolveLikeCount(seriesId: string): Promise<number> {
  const adminSupabase = createAdminClient();

  const { count, error } = await adminSupabase
    .from("user_series_reactions")
    .select("id", { count: "exact", head: true })
    .eq("series_id", seriesId)
    .eq("reaction_type", DB_REACTION_TYPE);

  if (error) {
    throw new Error(error.message);
  }

  return typeof count === "number" ? count : 0;
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

  const seriesId = readText(payload.seriesId);
  const user = await requireSignedInUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "ログインしてからいいねして。" },
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

    const existing = await adminSupabase
      .from("user_series_reactions")
      .select("id")
      .eq("user_id", user.id)
      .eq("series_id", seriesId)
      .eq("reaction_type", DB_REACTION_TYPE)
      .maybeSingle();

    if (existing.error && existing.error.code !== "PGRST116") {
      return NextResponse.json(
        { ok: false, error: existing.error.message },
        { status: 500 }
      );
    }

    if (!existing.data) {
      const { error } = await adminSupabase.from("user_series_reactions").insert({
        user_id: user.id,
        series_id: seriesId,
        reaction_type: DB_REACTION_TYPE,
      });

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }
    }

    const likeCount = await resolveLikeCount(seriesId);

    return NextResponse.json({
      ok: true,
      isLiked: true,
      likeCount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "いいね保存に失敗した。",
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

  const seriesId = readText(payload.seriesId);
  const user = await requireSignedInUser();

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
      .from("user_series_reactions")
      .delete()
      .eq("user_id", user.id)
      .eq("series_id", seriesId)
      .eq("reaction_type", DB_REACTION_TYPE);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const likeCount = await resolveLikeCount(seriesId);

    return NextResponse.json({
      ok: true,
      isLiked: false,
      likeCount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "いいね解除に失敗した。",
      },
      { status: 500 }
    );
  }
}