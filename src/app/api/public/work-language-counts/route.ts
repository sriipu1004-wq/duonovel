import { NextResponse } from "next/server";
import { getCachedPublicBaseWorkCards } from "@/lib/publicWorks";
import { CONTENT_LANGUAGES, type ContentLanguage } from "@/i18n/contentLanguage";

export async function GET() {
  const works = await getCachedPublicBaseWorkCards({
    ignoreContentLanguageFilter: true,
    prioritizeForUiLocale: false,
  });

  const counts = Object.fromEntries(
    CONTENT_LANGUAGES.map((language) => [language, 0])
  ) as Record<ContentLanguage, number>;

  for (const work of works) counts[work.contentLanguage] += 1;

  return NextResponse.json({ ok: true, counts });
}
