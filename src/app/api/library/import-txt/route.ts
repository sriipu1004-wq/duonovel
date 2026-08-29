import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PRIVATE_LIBRARY_LIMITS } from "@/lib/library/privateLibrary";
import { parseSupportedLanguageTag } from "@/lib/translation/languageRegistry";

export const runtime = "nodejs";

type ChapterInput = {
  title: string;
  body: string;
};

function parseChapters(value: unknown): ChapterInput[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const parsed: ChapterInput[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const body = typeof record.body === "string" ? record.body.trim() : "";

    if (
      !title ||
      title.length > 200 ||
      !body ||
      body.length > PRIVATE_LIBRARY_LIMITS.maxChapterChars
    ) {
      return null;
    }

    parsed.push({ title, body });
  }

  return parsed;
}

function getImportErrorMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("free private library work limit")) {
    return `無料プランの個人本棚は${PRIVATE_LIBRARY_LIMITS.freeMaxWorksPerUser}作品までです。作品を削除するか、サブスクを利用してください。`;
  }

  if (normalized.includes("work limit")) {
    return `サブスクの個人本棚は${PRIVATE_LIBRARY_LIMITS.subscriberMaxWorksPerUser}作品までです。`;
  }

  if (normalized.includes("text limit")) {
    return `個人本棚に保存できる本文は合計${PRIVATE_LIBRARY_LIMITS.maxTotalCharsPerUser.toLocaleString("ja-JP")}文字までです。`;
  }

  if (normalized.includes("chapter count")) {
    return `1作品は${PRIVATE_LIBRARY_LIMITS.maxChapters}話以内にしてください。`;
  }

  if (normalized.includes("text size")) {
    return `1作品は${PRIVATE_LIBRARY_LIMITS.maxSourceChars.toLocaleString("ja-JP")}文字以内にしてください。`;
  }

  return "TXTの取り込みに失敗しました。内容を確認して、もう一度お試しください。";
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

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const authorName =
    typeof payload.authorName === "string" ? payload.authorName.trim() : "";
  const originalFileName =
    typeof payload.originalFileName === "string"
      ? payload.originalFileName.trim()
      : "";
  const sourceLanguage = parseSupportedLanguageTag(payload.sourceLanguage);
  const chapters = parseChapters(payload.chapters);
  const totalChars =
    chapters?.reduce((total, chapter) => total + chapter.body.length, 0) ?? 0;

  if (
    !title ||
    title.length > 200 ||
    authorName.length > 200 ||
    originalFileName.length > 255 ||
    !sourceLanguage ||
    !chapters ||
    chapters.length > PRIVATE_LIBRARY_LIMITS.maxChapters ||
    totalChars <= 0 ||
    totalChars > PRIVATE_LIBRARY_LIMITS.maxSourceChars
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

  const result = await supabase.rpc("import_private_library_txt", {
    p_title: title,
    p_author_name: authorName || null,
    p_source_language: sourceLanguage,
    p_original_file_name: originalFileName || null,
    p_chapters: chapters,
  });

  if (result.error || typeof result.data !== "string") {
    const message = result.error?.message ?? "";
    return NextResponse.json(
      {
        ok: false,
        error: "private_library_import_failed",
        message: getImportErrorMessage(message),
      },
      { status: 422 }
    );
  }

  return NextResponse.json({
    ok: true,
    workId: result.data,
    chapterCount: chapters.length,
    sourceCharCount: totalChars,
  });
}
