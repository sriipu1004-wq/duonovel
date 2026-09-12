import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import R18ContentGate from "@/components/content/R18ContentGate";
import { getUiLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/navigation";
import {
  getSeriesSummary,
  pickText,
} from "@/features/write/writeShared";
import { isR18Series } from "@/lib/contentRating";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";
import {
  getSupportedLanguage,
  isPublicTranslationTargetLanguage,
  parseSupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import { getPublicWorkTranslationOverview } from "@/lib/translation/publicWorkTranslations";

type Props = {
  params: Promise<{ seriesId: string; targetLanguage: string }>;
};

const copy = {
  ja: {
    translationVersion: "翻訳版",
    originalLanguage: "原文言語",
    selectedLanguage: "表示言語",
    episodes: "話一覧",
    ready: "翻訳あり",
    missing: "未生成",
    read: "翻訳で読む",
    generateAndRead: "Readerで翻訳して読む",
    noMetadataTranslation: "タイトル・あらすじは現在原文を表示しています。本文翻訳は各話の共有翻訳レイヤーを利用します。",
  },
  en: {
    translationVersion: "Translation version",
    originalLanguage: "Original language",
    selectedLanguage: "Reading language",
    episodes: "Episodes",
    ready: "Translation ready",
    missing: "Not generated",
    read: "Read translation",
    generateAndRead: "Translate in Reader",
    noMetadataTranslation: "Title and synopsis currently remain in the original language. Episode text uses the shared translation layer.",
  },
  ko: {
    translationVersion: "번역판",
    originalLanguage: "원문 언어",
    selectedLanguage: "표시 언어",
    episodes: "회차 목록",
    ready: "번역 있음",
    missing: "미생성",
    read: "번역으로 읽기",
    generateAndRead: "리더에서 번역해 읽기",
    noMetadataTranslation: "제목과 줄거리는 현재 원문을 표시합니다. 본문은 각 회차의 공유 번역 레이어를 사용합니다.",
  },
} as const;

async function resolvePageData(params: Props["params"]) {
  const { seriesId, targetLanguage: rawTargetLanguage } = await params;
  const [overview, locale] = await Promise.all([
    getPublicWorkTranslationOverview(seriesId),
    getUiLocale(),
  ]);
  const targetLanguage = parseSupportedLanguageTag(rawTargetLanguage);

  if (
    !overview ||
    !overview.translationEligible ||
    !targetLanguage ||
    !isPublicTranslationTargetLanguage(targetLanguage) ||
    targetLanguage === overview.sourceLanguage
  ) {
    return null;
  }

  return { seriesId, overview, locale, targetLanguage };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await resolvePageData(params);
  if (!data) {
    return {
      title: "Translation | LIB read",
      robots: { index: false, follow: false },
    };
  }

  const { seriesId, overview, locale, targetLanguage } = data;
  const title = pickText(overview.series.title) || "Untitled";
  const summary = getSeriesSummary(overview.series).trim();
  const encodedSeriesId = encodeURIComponent(seriesId);
  const encodedTarget = encodeURIComponent(targetLanguage);
  const basePath = `/works/${encodedSeriesId}/translations/${encodedTarget}`;
  const canonical = localizePath(basePath, locale);

  return {
    title: `${title} — ${getSupportedLanguage(targetLanguage).nativeLabel} | LIB read`,
    description: summary ? summary.slice(0, 160) : undefined,
    alternates: {
      canonical,
      languages: {
        ja: basePath,
        en: `/en${basePath}`,
        ko: `/ko${basePath}`,
        "x-default": basePath,
      },
    },
    // Metadata itself is not localized yet. Keep these stable content-language
    // routes discoverable to users but out of the index until translated
    // metadata/SSR text is substantial enough to avoid thin pages.
    robots: { index: false, follow: true },
  };
}

export default async function WorkTranslationPage({ params }: Props) {
  const data = await resolvePageData(params);
  if (!data) notFound();

  const { seriesId, overview, locale, targetLanguage } = data;
  const dictionary = copy[locale];
  const target = getSupportedLanguage(targetLanguage);
  const source = getSupportedLanguage(overview.sourceLanguage);
  const seriesTitle = pickText(overview.series.title) || "無題";
  const summary = getSeriesSummary(overview.series).trim();

  if (isR18Series(overview.series)) {
    const preference = await getCurrentR18ViewerPreference();
    if (!preference.showR18Content) {
      return (
        <R18ContentGate
          signedIn={preference.signedIn}
          returnHref={localizePath(
            `/works/${encodeURIComponent(seriesId)}/translations/${encodeURIComponent(targetLanguage)}`,
            locale
          )}
        />
      );
    }
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[32px] border border-black/10 bg-white p-5 shadow-sm sm:p-7">
          <p className="text-xs tracking-[0.18em] text-neutral-500">
            {dictionary.translationVersion}
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight">{seriesTitle}</h1>
          {summary ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-8 text-neutral-700">
              {summary}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5">
              {dictionary.originalLanguage}: {source.nativeLabel}
            </span>
            <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1.5">
              {dictionary.selectedLanguage}: {target.nativeLabel}
            </span>
          </div>
          <p className="mt-4 text-xs leading-6 text-neutral-500">
            {dictionary.noMetadataTranslation}
          </p>
        </div>

        <section className="mt-6 rounded-[32px] border border-black/10 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-semibold">{dictionary.episodes}</h2>
          <div className="mt-4 grid gap-3">
            {overview.episodes.map((episode) => {
              const ready = episode.availableLanguages.includes(targetLanguage);
              const baseReadPath = `/read/${encodeURIComponent(seriesId)}/${encodeURIComponent(String(episode.episodeNumber))}`;
              const params = new URLSearchParams({
                readingMode: "translation",
                translationOnly: "1",
                sourceLanguage: overview.sourceLanguage,
                targetLanguage,
              });
              if (!ready) params.set("autoGenerate", "1");
              const href = localizePath(`${baseReadPath}?${params.toString()}`, locale);

              return (
                <div
                  key={episode.id}
                  className="flex flex-col gap-3 rounded-2xl border border-black/10 bg-neutral-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-neutral-500">
                      #{episode.episodeNumber} · {ready ? dictionary.ready : dictionary.missing}
                    </p>
                    <p className="mt-1 truncate font-medium">{episode.title}</p>
                  </div>
                  <Link
                    href={href}
                    className="shrink-0 rounded-full bg-black px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-neutral-800"
                  >
                    {ready ? dictionary.read : dictionary.generateAndRead}
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
