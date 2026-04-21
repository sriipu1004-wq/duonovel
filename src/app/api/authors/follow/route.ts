import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const authorId = readText(payload.authorId);
  const user = await requireSignedInUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "ログイン状態を確認できなかった。" },
      { status: 401 }
    );
  }

  if (!authorId) {
    return NextResponse.json(
      { ok: false, error: "authorId が足りない。" },
      { status: 400 }
    );
  }

  if (authorId === user.id) {
    return NextResponse.json(
      { ok: false, error: "自分自身はフォローできない。" },
      { status: 400 }
    );
  }

  try {
    const adminSupabase = createAdminClient();

    const { error } = await adminSupabase.from("author_follows").upsert(
      {
        follower_user_id: user.id,
        followed_author_id: authorId,
      },
      {
        onConflict: "follower_user_id,followed_author_id",
      }
    );

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const { count, error: countError } = await adminSupabase
      .from("author_follows")
      .select("id", { count: "exact", head: true })
      .eq("followed_author_id", authorId);

    if (countError) {
      return NextResponse.json(
        { ok: false, error: countError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      isFollowing: true,
      followerCount: typeof count === "number" ? count : 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "フォローに失敗した。",
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

  const authorId = readText(payload.authorId);
  const user = await requireSignedInUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "ログイン状態を確認できなかった。" },
      { status: 401 }
    );
  }

  if (!authorId) {
    return NextResponse.json(
      { ok: false, error: "authorId が足りない。" },
      { status: 400 }
    );
  }

  try {
    const adminSupabase = createAdminClient();

    const { error } = await adminSupabase
      .from("author_follows")
      .delete()
      .eq("follower_user_id", user.id)
      .eq("followed_author_id", authorId);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const { count, error: countError } = await adminSupabase
      .from("author_follows")
      .select("id", { count: "exact", head: true })
      .eq("followed_author_id", authorId);

    if (countError) {
      return NextResponse.json(
        { ok: false, error: countError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      isFollowing: false,
      followerCount: typeof count === "number" ? count : 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "フォロー解除に失敗した。",
      },
      { status: 500 }
    );
  }
}