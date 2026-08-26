import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";

export const PRIVATE_LIBRARY_LIMITS = {
  maxFileBytes: 3_000_000,
  maxSourceChars: 1_000_000,
  maxChapterChars: 7_500,
  maxChapters: 500,
  maxWorksPerUser: 20,
  maxTotalCharsPerUser: 5_000_000,
} as const;

export type PrivateLibraryWork = {
  id: string;
  owner_user_id: string;
  title: string;
  author_name: string | null;
  source_type: "txt";
  source_language: SupportedLanguageTag;
  original_file_name: string | null;
  source_char_count: number;
  chapter_count: number;
  last_opened_chapter_number: number | null;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PrivateLibraryChapter = {
  id: string;
  work_id: string;
  chapter_number: number;
  title: string;
  body: string;
  source_char_count: number;
  created_at: string;
  updated_at: string;
};

export function buildPrivateLibraryWorkHref(workId: string): string {
  return `/library/works/${encodeURIComponent(workId)}`;
}

export function buildPrivateLibraryReadHref(
  workId: string,
  chapterNumber: number
): string {
  return `/library/read/${encodeURIComponent(workId)}/${chapterNumber}`;
}

export function formatCharacterCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0文字";
  return `${Math.floor(value).toLocaleString("ja-JP")}文字`;
}
