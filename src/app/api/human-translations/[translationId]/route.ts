import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildHumanDraftPayloadFromTranslations,
  resolveHumanTranslationContext,
  type HumanTranslationRow,
} from "@/lib/translation/humanTranslationServer";
import { parseStoredTranslationPayload } from "@/lib/translation/translationPayload";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ translationId: string }> };

async function getRow(id: string) {
  const admin = createAdminClient();
  const result = await admin.from("episode_human_translations").select("*").eq("id", id).maybeSingle();
  return { admin, row: result.data as HumanTranslationRow | null, error: result.error };
}

export async function GET(_request: Request, context: RouteContext) {
  const { translationId } = await context.params;
  if (!isUuid(translationId)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { row, error } = await getRow(translationId);
  if (error || !row || row.status !== "published") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const current = await resolveHumanTranslationContext(row.episode_id, row.target_language);
  if (!current || row.published_source_hash !== current.sourceHash) {
    return NextResponse.json({ ok: false, error: "human_translation_stale" }, { status: 409 });
  }
  const parsed = parseStoredTranslationPayload(row.published_payload, {
    sourceLanguage: current.sourceLanguage,
    targetLanguage: current.targetLanguage,
  });
  if (!parsed) return NextResponse.json({ ok: false, error: "invalid_translation_payload" }, { status: 500 });
  const admin = createAdminClient();
  const profile = await admin.from("users").select("display_name").eq("id", row.translator_user_id).maybeSingle();
  const translatorName =
    !profile.error && typeof profile.data?.display_name === "string"
      ? profile.data.display_name.trim()
      : "";
  if (!translatorName) {
    return NextResponse.json({ ok: false, error: "translator_identity_unavailable" }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    translationId: row.id,
    sourceHash: current.sourceHash,
    sourceLanguage: current.sourceLanguage,
    targetLanguage: current.targetLanguage,
    translator: {
      id: row.translator_user_id,
      displayName: translatorName,
      isAuthor: row.translator_user_id === current.seriesAuthorId,
    },
    segments: parsed.segments,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { translationId } = await context.params;
  if (!isUuid(translationId)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body?.translations || typeof body.translations !== "object" || Array.isArray(body.translations)) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  const translations: Record<string, string> = {};
  let totalChars = 0;
  for (const [id, value] of Object.entries(body.translations as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    totalChars += value.length;
    if (totalChars > 4_000_000) {
      return NextResponse.json({ ok: false, error: "translation_too_large" }, { status: 413 });
    }
    translations[id] = value;
  }

  const { admin, row, error } = await getRow(translationId);
  if (error || !row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const current = await resolveHumanTranslationContext(row.episode_id, row.target_language);
  if (!current) return NextResponse.json({ ok: false, error: "source_unavailable" }, { status: 409 });
  if (!current.currentUserId) return NextResponse.json({ ok: false, error: "authentication_required" }, { status: 401 });
  if (row.translator_user_id !== current.currentUserId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const draftPayload = buildHumanDraftPayloadFromTranslations({
    sourceLanguage: current.sourceLanguage,
    targetLanguage: current.targetLanguage,
    sourceSegments: current.sourceDocument.segments,
    translations,
  });
  const updated = await admin.from("episode_human_translations").update({
    source_language: current.sourceLanguage,
    source_hash: current.sourceHash,
    segment_version: draftPayload.version,
    draft_payload: draftPayload,
    updated_at: new Date().toISOString(),
  }).eq("id", row.id).eq("translator_user_id", current.currentUserId)
    .select("id,status,updated_at").single();
  if (updated.error || !updated.data) {
    return NextResponse.json({ ok: false, error: "human_translation_save_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status: updated.data.status, updatedAt: updated.data.updated_at });
}
