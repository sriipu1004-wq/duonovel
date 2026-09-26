import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveHumanTranslationContext } from "@/lib/translation/humanTranslationServer";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ episodeId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { episodeId } = await context.params;
  const targetLanguage = new URL(request.url).searchParams.get("targetLanguage");
  if (!isUuid(episodeId) || !targetLanguage) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const current = await resolveHumanTranslationContext(episodeId, targetLanguage);
  if (!current) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const admin = createAdminClient();
  const rowsResult = await admin
    .from("episode_human_translations")
    .select("id,translator_user_id,target_language,published_at,updated_at")
    .eq("episode_id", episodeId)
    .eq("target_language", current.targetLanguage)
    .eq("status", "published")
    .eq("published_source_hash", current.sourceHash)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (rowsResult.error) {
    return NextResponse.json({ ok: false, error: "human_translation_list_failed" }, { status: 503 });
  }

  const rows = rowsResult.data ?? [];
  const translatorIds = Array.from(new Set(rows.map((row) => String(row.translator_user_id))));
  const profilesResult = translatorIds.length
    ? await admin.from("users").select("id,display_name").in("id", translatorIds)
    : { data: [], error: null };
  const names = new Map<string, string>();
  if (!profilesResult.error) {
    for (const profile of profilesResult.data ?? []) {
      if (typeof profile.display_name === "string" && profile.display_name.trim()) {
        names.set(String(profile.id), profile.display_name.trim());
      }
    }
  }

  const translations = rows.flatMap((row) => {
    const translatorId = String(row.translator_user_id);
    const displayName = names.get(translatorId);
    if (!displayName) return [];
    return [{
      id: String(row.id),
      translatorDisplayName: displayName,
      isAuthor: translatorId === current.seriesAuthorId,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
    }];
  });

  return NextResponse.json({
    ok: true,
    sourceHash: current.sourceHash,
    sourceLanguage: current.sourceLanguage,
    targetLanguage: current.targetLanguage,
    humanPermissionOpen: current.humanPermissionOpen,
    translations,
  });
}
