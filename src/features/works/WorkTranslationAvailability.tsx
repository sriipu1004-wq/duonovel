import Link from "next/link";
import { getUiLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/navigation";
import { isR18Series } from "@/lib/contentRating";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";
import { getSupportedLanguage } from "@/lib/translation/languageRegistry";
import { getPublicWorkTranslationOverview } from "@/lib/translation/publicWorkTranslations";

type Props = {
  seriesId: string;
};

const text = {
  ja: {
    title: "言語",
    original: "原文",
    available: "利用可能な翻訳",
    none: "まだ保存済み翻訳はありません。Readerで必要な言語を選ぶと、既存の利用条件に従って生成できます。",
    unavailable: "この作品では現在、翻訳Readerは利用できません。",
    partial: "一部の話で利用可能",
    complete: "公開中の全話で利用可能",
  },
  en: {
    title: "Languages",
    original: "Original",
    available: "Available translations",
    none: "No saved translations yet. Choose a language in the Reader to generate one under the existing usage rules.",
    unavailable: "Translation reading is currently unavailable for this work.",
    partial: "Available for some episodes",
    complete: "Available for every published episode",
  },
  ko: {
    title: "언어",
    original: "원문",
    available: "이용 가능한 번역",
    none: "저장된 번역이 아직 없습니다. 리더에서 언어를 선택하면 기존 이용 조건에 따라 생성할 수 있습니다.",
    unavailable: "이 작품에서는 현재 번역 리더를 이용할 수 없습니다.",
    partial: "일부 회차에서 이용 가능",
    complete: "공개된 모든 회차에서 이용 가능",
  },
} as const;

export default async function WorkTranslationAvailability({ seriesId }: Props) {
  const [locale, overview] = await Promise.all([
    getUiLocale(),
    getPublicWorkTranslationOverview(seriesId),
  ]);
  if (!overview) return null;

  if (isR18Series(overview.series)) {
    const preference = await getCurrentR18ViewerPreference();
    if (!preference.showR18Content) return null;
  }

  const dictionary = text[locale];
  const totalEpisodes = overview.episodes.length;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 lg:px-8">
      <div className="rounded-[24px] border border-black/10 bg-white p-4 shadow-sm">
        <p className="text-xs tracking-[0.18em] text-neutral-500">{dictionary.title}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5">
            {dictionary.original}: {getSupportedLanguage(overview.sourceLanguage).nativeLabel}
          </span>
        </div>

        <p className="mt-4 text-xs font-medium text-neutral-600">{dictionary.available}</p>
        {!overview.translationEligible ? (
          <p className="mt-2 text-sm leading-7 text-neutral-500">
            {dictionary.unavailable}
          </p>
        ) : overview.availableLanguages.length === 0 ? (
          <p className="mt-2 text-sm leading-7 text-neutral-500">{dictionary.none}</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {overview.availableLanguages.map((language) => {
              const readyCount = overview.episodes.filter((episode) =>
                episode.availableLanguages.includes(language)
              ).length;
              return (
                <Link
                  key={language}
                  href={localizePath(
                    `/works/${encodeURIComponent(seriesId)}/translations/${encodeURIComponent(language)}`,
                    locale
                  )}
                  className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-black transition hover:bg-sky-100"
                >
                  <span className="font-medium">
                    {getSupportedLanguage(language).nativeLabel}
                  </span>
                  <span className="ml-2 text-xs text-neutral-500">
                    {readyCount === totalEpisodes ? dictionary.complete : dictionary.partial}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
