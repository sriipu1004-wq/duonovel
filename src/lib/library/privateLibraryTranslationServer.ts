import "server-only";

import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import {
  type PrivateLibraryChapter,
  type PrivateLibraryWork,
} from "@/lib/library/privateLibrary";
import {
  parseSupportedLanguageTag,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import {
  normalizeTranslationSourceText,
  segmentSourceDocument,
} from "@/lib/translation/segmentSourceDocument";

export type PrivateLibraryTranslationAccess = {
  userId: string;
  work: PrivateLibraryWork;
  chapter: PrivateLibraryChapter;
  sourceLanguage: SupportedLanguageTag;
  body: string;
};

export function buildPrivateLibraryTranslationSourceHash(body: string): string {
  const normalized = normalizeTranslationSourceText(body);
  return createHash("sha256")
    .update("private-library-chapter-translation-source-v1\0" + normalized, "utf8")
    .digest("hex");
}

export function buildPrivateLibraryTranslationSource(
  body: string,
  sourceLanguage: SupportedLanguageTag
) {
  return segmentSourceDocument(body, sourceLanguage);
}

export async function resolvePrivateLibraryTranslationAccess(
  chapterId: string
): Promise<PrivateLibraryTranslationAccess | null> {
  const cleanChapterId = chapterId.trim();
  if (!cleanChapterId) return null;

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData.user ?? null;

  if (authError || !user) return null;

  const chapterResult = await supabase
    .from("private_library_chapters")
    .select("*")
    .eq("id", cleanChapterId)
    .maybeSingle();

  if (chapterResult.error || !chapterResult.data) return null;

  const chapter = chapterResult.data as PrivateLibraryChapter;
  const workResult = await supabase
    .from("private_library_works")
    .select("*")
    .eq("id", chapter.work_id)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (workResult.error || !workResult.data) return null;

  const work = workResult.data as PrivateLibraryWork;
  const sourceLanguage = parseSupportedLanguageTag(work.source_language);
  if (!sourceLanguage || !chapter.body.trim()) return null;

  return {
    userId: user.id,
    work,
    chapter,
    sourceLanguage,
    body: chapter.body,
  };
}
