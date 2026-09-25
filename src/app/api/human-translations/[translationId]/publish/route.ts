import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveHumanTranslationContext,
  validatePublishableHumanPayload,
  type HumanTranslationRow,
} from "@/lib/translation/humanTranslationServer";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ translationId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { translationId } = await context.params;
  if (!isUuid(translationId)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (payload?.rightsConfirmed !== true) {
    return NextResponse.json({ ok: false, error: "rights_confirmation_required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await admin.from("episode_human_translations").select("*").eq("id", translationId).maybeSingle();
  const row = result.data as HumanTranslationRow | null;
  if (result.error || !row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const current = await resolveHumanTranslationContext(row.episode_id, row.target_language);
  if (!current) return NextResponse.json({ ok: false, error: "source_unavailable" }, { status: 409 });
  if (!current.currentUserId) return NextResponse.json({ ok: false, error: "authentication_required" }, { status: 401 });
  if (row.translator_user_id !== current.currentUserId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!current.humanPermissionOpen) {
    return NextResponse.json({ ok: false, error: "human_translation_permission_closed" }, { status: 403 });
  }
  if (row.source_hash !== current.sourceHash) {
    return NextResponse.json({ ok: false, error: "source_changed" }, { status: 409 });
  }

  const publishable = validatePublishableHumanPayload({
    payload: row.draft_payload,
    sourceLanguage: current.sourceLanguage,
    targetLanguage: current.targetLanguage,
    sourceSegments: current.sourceDocument.segments,
  });
  if (!publishable) {
    return NextResponse.json({ ok: false, error: "incomplete_translation" }, { status: 400 });
  }

  const profile = await admin.from("users").select("display_name").eq("id", current.currentUserId).maybeSingle();
  const displayName =
    !profile.error && typeof profile.data?.display_name === "string"
      ? profile.data.display_name.trim()
      : "";
  if (!displayName) {
    return NextResponse.json({ ok: false, error: "public_display_name_required" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const updated = await admin.from("episode_human_translations").update({
    status: "published",
    published_payload: publishable,
    published_source_hash: current.sourceHash,
    published_at: now,
    withdrawn_at: null,
    rights_confirmed_at: now,
    updated_at: now,
  }).eq("id", row.id).eq("translator_user_id", current.currentUserId)
    .select("id,published_at").single();

  if (updated.error || !updated.data) {
    return NextResponse.json({ ok: false, error: "human_translation_publish_failed" }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    translationId: row.id,
    publishedAt: updated.data.published_at,
    translatorDisplayName: displayName,
  });
}
