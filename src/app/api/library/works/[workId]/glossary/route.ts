import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseSupportedLanguageTag } from "@/lib/translation/languageRegistry";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { workId } = await context.params;
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 }
    );
  }

  const sourceTerm =
    typeof payload.sourceTerm === "string" ? payload.sourceTerm.trim() : "";
  const targetTerm =
    typeof payload.targetTerm === "string" ? payload.targetTerm.trim() : "";
  const targetLanguage = parseSupportedLanguageTag(payload.targetLanguage);

  if (
    !workId ||
    !sourceTerm ||
    sourceTerm.length > 120 ||
    !targetTerm ||
    targetTerm.length > 200 ||
    !targetLanguage
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 }
    );
  }

  const workResult = await supabase
    .from("private_library_works")
    .select("id, source_language")
    .eq("id", workId)
    .eq("owner_user_id", authData.user.id)
    .eq("import_status", "ready")
    .maybeSingle();
  const sourceLanguage = parseSupportedLanguageTag(
    workResult.data?.source_language
  );
  if (workResult.error || !sourceLanguage || sourceLanguage === targetLanguage) {
    return NextResponse.json(
      { ok: false, error: "work_not_found" },
      { status: 404 }
    );
  }

  const existingResult = await supabase
    .from("private_library_glossary_terms")
    .select("id")
    .eq("work_id", workId)
    .eq("source_language", sourceLanguage)
    .eq("target_language", targetLanguage)
    .eq("source_term", sourceTerm)
    .maybeSingle();

  if (!existingResult.data) {
    const countResult = await supabase
      .from("private_library_glossary_terms")
      .select("id", { count: "exact", head: true })
      .eq("work_id", workId)
      .eq("source_language", sourceLanguage)
      .eq("target_language", targetLanguage);
    if ((countResult.count ?? 0) >= 500) {
      return NextResponse.json(
        {
          ok: false,
          error: "glossary_limit",
          message: "1言語あたりの用語は500件までです。",
        },
        { status: 422 }
      );
    }
  }

  const result = await supabase
    .from("private_library_glossary_terms")
    .upsert(
      {
        work_id: workId,
        owner_user_id: authData.user.id,
        source_language: sourceLanguage,
        target_language: targetLanguage,
        source_term: sourceTerm,
        target_term: targetTerm,
        is_locked: true,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "work_id,source_language,target_language,source_term",
      }
    )
    .select("*")
    .single();

  if (result.error || !result.data) {
    return NextResponse.json(
      { ok: false, error: "glossary_save_failed" },
      { status: 422 }
    );
  }

  return NextResponse.json({ ok: true, term: result.data });
}
