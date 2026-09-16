import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/uuid";

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

async function requireCanonicalPublicSeries(seriesId: string): Promise<boolean> {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("series")
    .select("id, publication_status")
    .eq("id", seriesId)
    .maybeSingle();

  if (error) {
    throw new Error(`作品状態の確認に失敗した: ${error.message}`);
  }

  return Boolean(data?.id && data.publication_status === "public");
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

  if (!seriesId || !isUuid(seriesId)) {
    return NextResponse.json(
      { ok: false, error: "seriesId が不正。" },
      { status: 400 }
    );
  }

  try {
    // The service-role client below bypasses RLS, so target visibility must be
    // re-established explicitly here. Do not allow reactions to drafts/private
    // works merely because a caller knows their UUID.
    if (!(await requireCanonicalPublicSeries(seriesId))) {
      return NextResponse.json(
        { ok: false, error: "作品が見つからない。" },
        { status: 404 }
      );
    }

    const adminSupabase = createAdminClient();

    const existing = await adminSupabase
      .from("user_series_reactions")
      .select("id")
      .eq("user_id", user.id)
      .eq("series_id", seriesId)
      .eq("reaction_type", DB_REACTION_TYPE)
      .limit(1)
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

      // Once the UNIQUE(user_id, series_id) migration is applied, concurrent
      // POSTs can legitimately race here. One wins; the other is equivalent to
      // an already-liked state and must not surface as a user-visible failure.
      if (error && error.code !== "23505") {
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

  if (!seriesId || !isUuid(seriesId)) {
    return NextResponse.json(
      { ok: false, error: "seriesId が不正。" },
      { status: 400 }
    );
  }

  try {
    const adminSupabase = createAdminClient();

    // Do not require the work to remain public for deletion. A user must still
    // be able to remove their existing reaction after an author unpublishes a
    // work, while ownership is always constrained by user.id here.
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
