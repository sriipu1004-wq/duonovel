import { NextResponse } from "next/server";
import { getCachedPublicBaseWorkCards } from "@/lib/publicWorks";
import {
  PUBLIC_SEARCH_SOURCE_LANGUAGES,
} from "@/lib/search/publicWorkLanguageFilter";
import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";

export async function GET() {
  const works = await getCachedPublicBaseWorkCards({
    ignoreContentLanguageFilter: true,
    prioritizeForUiLocale: false,
    // The response contains language counts only; author names are not used.
    omitAuthorDisplayNames: true,
  });

  const counts = Object.fromEntries(
    PUBLIC_SEARCH_SOURCE_LANGUAGES.map((language) => [language, 0])
  ) as Record<SupportedLanguageTag, number>;

  for (const work of works) {
    if (!work.sourceLanguage) continue;
    counts[work.sourceLanguage] += 1;
  }

  return NextResponse.json({
    ok: true,
    counts,
  });
}
