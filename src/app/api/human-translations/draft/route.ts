import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildHumanDraftPayload,
  resolveHumanTranslationContext,
  type HumanTranslationRow,
} from "@/lib/translation/humanTranslationServer";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const episodeId = typeof payload?.episodeId === "string" ? payload.episodeId : "";
  if (!isUuid(episodeId)) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  const context = await resolveHumanTranslationContext(episodeId, payload?.targetLanguage);
  if (!context) return NextResponse.json({ ok: false, error: "translation_unavailable" }, { status: 404 });
  if (!context.currentUserId) return NextResponse.json({ ok: false, error: "authentication_required" }, { status: 401 });

  const admin = createAdminClient();
  const existing = await admin
    .from("episode_human_translations")
    .select("*")
    .eq("episode_id", episodeId)
    .eq("target_language", context.targetLanguage)
    .eq("translator_user_id", context.currentUserId)
    .maybeSingle();
  if (existing.error) {
    return NextResponse.json({ ok: false, error: "human_translation_load_failed" }, { status: 503 });
  }

  let row = existing.data as HumanTranslationRow | null;
  if (!row && !context.humanPermissionOpen) {
    return NextResponse.json({ ok: false, error: "human_translation_permission_closed" }, { status: 403 });
  }

  const draftPayload = buildHumanDraftPayload({
    sourceLanguage: context.sourceLanguage,
    targetLanguage: context.targetLanguage,
    sourceSegments: context.sourceDocument.segments,
    previousPayload: row?.draft_payload ?? row?.published_payload,
  });

  if (!row) {
    const inserted = await admin.from("episode_human_translations").insert({
      series_id: context.seriesId,
      episode_id: context.episode.id,
      translator_user_id: context.currentUserId,
      source_language: context.sourceLanguage,
      target_language: context.targetLanguage,
      source_hash: context.sourceHash,
      segment_version: draftPayload.version,
      status: "draft",
      draft_payload: draftPayload,
    }).select("*").single();

    if (inserted.error || !inserted.data) {
      if (inserted.error?.code === "23505") {
        const raced = await admin
          .from("episode_human_translations")
          .select("*")
          .eq("episode_id", episodeId)
          .eq("target_language", context.targetLanguage)
          .eq("translator_user_id", context.currentUserId)
          .single();
        if (!raced.error && raced.data) row = raced.data as HumanTranslationRow;
      }
      if (!row) return NextResponse.json({ ok: false, error: "human_translation_create_failed" }, { status: 500 });
    } else {
      row = inserted.data as HumanTranslationRow;
    }
  }

  const effectiveDraft = buildHumanDraftPayload({
    sourceLanguage: context.sourceLanguage,
    targetLanguage: context.targetLanguage,
    sourceSegments: context.sourceDocument.segments,
    previousPayload: row.source_hash === context.sourceHash ? row.draft_payload : draftPayload,
  });

  return NextResponse.json({
    ok: true,
    translationId: row.id,
    status: row.status,
    sourceHash: context.sourceHash,
    sourceLanguage: context.sourceLanguage,
    targetLanguage: context.targetLanguage,
    segmentVersion: effectiveDraft.version,
    segments: effectiveDraft.segments,
    humanPermissionOpen: context.humanPermissionOpen,
    stale: Boolean(row.published_source_hash && row.published_source_hash !== context.sourceHash),
    publishedAt: row.published_at,
  });
}
