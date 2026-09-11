import { NextResponse } from "next/server";
import { getCachedPublicBaseWorkCards } from "@/lib/publicWorks";
import { CONTENT_LANGUAGES, type ContentLanguage } from "@/i18n/contentLanguage";

type CountTable = Record<ContentLanguage, Record<string, number>>;

function createLanguageCountTable(): CountTable {
  return Object.fromEntries(
    CONTENT_LANGUAGES.map((language) => [language, {}])
  ) as CountTable;
}

function normalizeTagToken(value: string): string {
  return value.trim().replace(/^#+/, "").toLowerCase();
}

function normalizeGenreToken(value: string): string {
  return value.trim().toLowerCase();
}

function increment(table: CountTable, language: ContentLanguage, key: string) {
  if (!key) return;
  table[language][key] = (table[language][key] ?? 0) + 1;
}

export async function GET() {
  const works = await getCachedPublicBaseWorkCards({
    ignoreContentLanguageFilter: true,
    prioritizeForUiLocale: false,
  });

  const counts = Object.fromEntries(
    CONTENT_LANGUAGES.map((language) => [language, 0])
  ) as Record<ContentLanguage, number>;
  const tagCounts = createLanguageCountTable();
  const genreCounts = createLanguageCountTable();

  for (const work of works) {
    const language = work.contentLanguage;
    counts[language] += 1;

    const seenTags = new Set<string>();
    for (const tag of work.tags) {
      const key = normalizeTagToken(tag);
      if (!key || seenTags.has(key)) continue;
      seenTags.add(key);
      increment(tagCounts, language, key);
    }

    const seenGenres = new Set<string>();
    for (const genre of work.genres) {
      const key = normalizeGenreToken(genre);
      if (!key || seenGenres.has(key)) continue;
      seenGenres.add(key);
      increment(genreCounts, language, key);
    }
  }

  return NextResponse.json({
    ok: true,
    counts,
    filters: {
      tags: tagCounts,
      genres: genreCounts,
    },
  });
}
