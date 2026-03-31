import { NextResponse } from "next/server";
import { isOperatorUser } from "@/lib/auth/operator";
import { createClient } from "@/lib/supabase/server";

function pickTrackId(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const raw = (payload as { trackId?: unknown }).trackId;
  return typeof raw === "string" ? raw.trim() : "";
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "true" || value === "1";
  return false;
}

async function authorizeFavoriteRequest(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "ログインが必要。" }, { status: 401 }),
    };
  }

  const payload = await request.json().catch(() => null);
  const trackId = pickTrackId(payload);

  if (!trackId) {
    return {
      error: NextResponse.json(
        { error: "trackId が不正。" },
        { status: 400 }
      ),
    };
  }

  const { data: track, error: trackError } = await supabase
    .from("bgm_library")
    .select("id, is_active")
    .eq("id", trackId)
    .single();

  if (trackError || !track) {
    return {
      error: NextResponse.json(
        { error: "対象BGMが見つからない。" },
        { status: 404 }
      ),
    };
  }

  const canUsePrivateTracks = isOperatorUser(user.email ?? null);
  if (!normalizeBoolean(track["is_active"]) && !canUsePrivateTracks) {
    return {
      error: NextResponse.json(
        { error: "このBGMにはアクセスできない。" },
        { status: 404 }
      ),
    };
  }

  return { supabase, user, trackId } as const;
}

export async function POST(request: Request) {
  const authorized = await authorizeFavoriteRequest(request);
  if ("error" in authorized) {
    return authorized.error;
  }

  const { supabase, user, trackId } = authorized;

  const { error } = await supabase.from("bgm_library_favorites").insert({
    user_id: user.id,
    bgm_library_id: trackId,
  });

  if (error && error.code !== "23505") {
    return NextResponse.json(
      { error: error.message || "お気に入り登録に失敗した。" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const authorized = await authorizeFavoriteRequest(request);
  if ("error" in authorized) {
    return authorized.error;
  }

  const { supabase, user, trackId } = authorized;

  const { error } = await supabase
    .from("bgm_library_favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("bgm_library_id", trackId);

  if (error) {
    return NextResponse.json(
      { error: error.message || "お気に入り解除に失敗した。" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}