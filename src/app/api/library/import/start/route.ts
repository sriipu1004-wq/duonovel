import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  PRIVATE_LIBRARY_LIMITS,
  type PrivateLibrarySourceType,
} from "@/lib/library/privateLibrary";
import { getPrivateLibraryImportErrorMessage } from "@/lib/library/privateLibraryImportServer";
import { parseSupportedLanguageTag } from "@/lib/translation/languageRegistry";

export const runtime = "nodejs";

const SOURCE_TYPES = new Set<PrivateLibrarySourceType>([
  "txt",
  "epub",
  "docx",
  "pdf",
]);

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

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const authorName =
    typeof payload.authorName === "string" ? payload.authorName.trim() : "";
  const originalFileName =
    typeof payload.originalFileName === "string"
      ? payload.originalFileName.trim()
      : "";
  const sourceLanguage = parseSupportedLanguageTag(payload.sourceLanguage);
  const sourceType =
    typeof payload.sourceType === "string" &&
    SOURCE_TYPES.has(payload.sourceType as PrivateLibrarySourceType)
      ? (payload.sourceType as PrivateLibrarySourceType)
      : null;
  const sourceCharCount = Number(payload.sourceCharCount);
  const unitCount = Number(payload.unitCount);
  const sectionCount = Number(payload.sectionCount);

  if (
    !title ||
    title.length > 200 ||
    authorName.length > 200 ||
    originalFileName.length > 255 ||
    !sourceLanguage ||
    !sourceType ||
    !Number.isInteger(sourceCharCount) ||
    sourceCharCount < 1 ||
    sourceCharCount > PRIVATE_LIBRARY_LIMITS.maxSourceChars ||
    !Number.isInteger(unitCount) ||
    unitCount < 1 ||
    unitCount > PRIVATE_LIBRARY_LIMITS.maxChapters ||
    !Number.isInteger(sectionCount) ||
    sectionCount < 1 ||
    sectionCount > PRIVATE_LIBRARY_LIMITS.maxSections ||
    sectionCount > unitCount
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

  const result = await supabase.rpc("begin_private_library_import", {
    p_title: title,
    p_author_name: authorName || null,
    p_source_type: sourceType,
    p_source_language: sourceLanguage,
    p_original_file_name: originalFileName || null,
    p_source_char_count: sourceCharCount,
    p_unit_count: unitCount,
    p_section_count: sectionCount,
  });

  if (result.error || typeof result.data !== "string") {
    const message = result.error?.message ?? "";
    return NextResponse.json(
      {
        ok: false,
        error: "private_library_import_start_failed",
        message: getPrivateLibraryImportErrorMessage(message),
      },
      { status: 422 }
    );
  }

  return NextResponse.json({ ok: true, workId: result.data });
}
