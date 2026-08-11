import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function readDisplayName(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "ユーザー";
  const row = metadata as Record<string, unknown>;
  for (const value of [
    row.display_name,
    row.displayName,
    row.display_name_candidate,
    row.name,
    row.full_name,
  ]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "ユーザー";
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return error || !user ? null : user;
}

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 }
    );
  }

  const admin = createAdminClient();
  const result = await admin
    .from("users")
    .select("show_r18_content, r18_confirmed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (result.error) {
    return NextResponse.json(
      {
        ok: false,
        error: "content_preference_load_failed",
        message: result.error.message,
      },
      { status: 500 }
    );
  }

  const ageConfirmed =
    typeof result.data?.r18_confirmed_at === "string" &&
    result.data.r18_confirmed_at.trim().length > 0;

  return NextResponse.json({
    ok: true,
    showR18Content: result.data?.show_r18_content === true && ageConfirmed,
    ageConfirmed,
  });
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 }
    );
  }

  if (typeof payload.showR18Content !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "invalid_show_r18_content" },
      { status: 400 }
    );
  }

  const user = await requireUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 }
    );
  }

  const admin = createAdminClient();
  const existing = await admin
    .from("users")
    .select("id, r18_confirmed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (existing.error) {
    return NextResponse.json(
      {
        ok: false,
        error: "content_preference_load_failed",
        message: existing.error.message,
      },
      { status: 500 }
    );
  }

  const alreadyConfirmed =
    typeof existing.data?.r18_confirmed_at === "string" &&
    existing.data.r18_confirmed_at.trim().length > 0;

  if (
    payload.showR18Content === true &&
    !alreadyConfirmed &&
    payload.ageConfirmed !== true
  ) {
    return NextResponse.json(
      { ok: false, error: "age_confirmation_required" },
      { status: 400 }
    );
  }

  const confirmedAt = alreadyConfirmed
    ? existing.data?.r18_confirmed_at
    : payload.showR18Content === true
      ? new Date().toISOString()
      : null;

  const updatePayload = {
    show_r18_content: payload.showR18Content,
    ...(confirmedAt ? { r18_confirmed_at: confirmedAt } : {}),
  };

  if (existing.data?.id) {
    const update = await admin
      .from("users")
      .update(updatePayload)
      .eq("id", user.id)
      .select("show_r18_content, r18_confirmed_at")
      .single();

    if (update.error || !update.data) {
      return NextResponse.json(
        {
          ok: false,
          error: "content_preference_update_failed",
          message: update.error?.message ?? "設定を更新できませんでした。",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      showR18Content: update.data.show_r18_content === true,
      ageConfirmed: Boolean(update.data.r18_confirmed_at),
    });
  }

  const displayName = readDisplayName(user.user_metadata);
  let lastError = "設定を保存できませんでした。";

  for (const role of ["author", "user", "member", "reader", "voice"]) {
    const upsert = await admin
      .from("users")
      .upsert(
        {
          id: user.id,
          display_name: displayName,
          role,
          ...updatePayload,
        },
        { onConflict: "id" }
      )
      .select("show_r18_content, r18_confirmed_at")
      .single();

    if (!upsert.error && upsert.data) {
      return NextResponse.json({
        ok: true,
        showR18Content: upsert.data.show_r18_content === true,
        ageConfirmed: Boolean(upsert.data.r18_confirmed_at),
      });
    }

    lastError = upsert.error?.message ?? lastError;
  }

  return NextResponse.json(
    {
      ok: false,
      error: "content_preference_update_failed",
      message: lastError,
    },
    { status: 500 }
  );
}
