import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  getEpisodeNumber,
  getSeriesGenres,
  getSeriesPublicationStatus,
  getSeriesSummary,
  isEpisodePubliclyVisible,
  pickText,
  sortEpisodes,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { getUiLocale } from "@/i18n/server";
import { workDictionaries } from "@/i18n/dictionaries/work";
import { localizePath } from "@/i18n/navigation";

type PageProps = {
  params: Promise<{ seriesId: string }>;
};

async function fetchSeries(seriesId: string): Promise<SeriesRow | null> {
  const { data, error } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .maybeSingle();

  if (error || !data) return null;
  return data as SeriesRow;
}

async function fetchEpisodes(seriesId: string): Promise<EpisodeRow[]> {
  const firstTry = await supabase
    .from("episodes")
    .select("*")
    .eq("series_id", seriesId);

  if (!firstTry.error) return (firstTry.data ?? []) as EpisodeRow[];

  const secondTry = await supabase
    .from("episodes")
    .select("*")
    .eq("seriesId", seriesId);

  if (secondTry.error) return [];
  return (secondTry.data ?? []) as EpisodeRow[];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = await getUiLocale();
  const dictionary = workDictionaries[locale];
  const { seriesId } = await params;
  const series = await fetchSeries(seriesId);

  if (!series || getSeriesPublicationStatus(series) !== "public") {
    return {
      title: `${dictionary.notFound} | LIB read`,
      robots: { index: false, follow: false },
    };
  }

  const title = pickText(series.title) || dictionary.untitled;
  const summary = getSeriesSummary(series).trim() || dictionary.noSummary;
  const canonical = localizePath(`/works/${encodeURIComponent(seriesId)}`, locale);

  return {
    title: `${title} | LIB read`,
    description: summary.slice(0, 160),
    alternates: {
      canonical,
      languages: {
        ja: `/works/${encodeURIComponent(seriesId)}`,
        en: `/en/works/${encodeURIComponent(seriesId)}`,
        ko: `/ko/works/${encodeURIComponent(seriesId)}`,
        "x-default": `/works/${encodeURIComponent(seriesId)}`,
      },
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      locale: locale === "en" ? "en_US" : "ko_KR",
      siteName: "LIB read",
      url: canonical,
      title: `${title} | LIB read`,
      description: summary.slice(0, 160),
      images: ["/opengraph-image"],
    },
  };
}

export default async function LocaleWorkPage({ params }: PageProps) {
  const locale = await getUiLocale();
  if (locale === "ja") notFound();

  const dictionary = workDictionaries[locale];
  const { seriesId } = await params;
  const series = await fetchSeries(seriesId);

  if (!series || getSeriesPublicationStatus(series) !== "public") notFound();

  const episodes = sortEpisodes(
    (await fetchEpisodes(seriesId)).filter((episode) =>
      isEpisodePubliclyVisible(episode)
    )
  );
  if (episodes.length === 0) notFound();

  const title = pickText(series.title) || dictionary.untitled;
  const authorName = pickText(series["author_name"]) || dictionary.unknownAuthor;
  const summary = getSeriesSummary(series) || dictionary.noSummary;
  const genres = getSeriesGenres(series);
  const firstEpisodeNumber = getEpisodeNumber(episodes[0]);

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <div className="mb-6 text-sm text-neutral-500">
          <Link href={localizePath("/search", locale)} className="hover:text-black">
            {dictionary.backSearch}
          </Link>
        </div>

        <section className="rounded-[30px] border border-black/10 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs tracking-[0.2em] text-neutral-500">WORK</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-600">
            <span>{dictionary.author}: {authorName}</span>
            <span>{dictionary.episodes(episodes.length)}</span>
            {genres.length > 0 ? <span>{dictionary.genres}: {genres.join(" · ")}</span> : null}
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={localizePath(`/read/${seriesId}/${firstEpisodeNumber}`, locale)}
              className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              {dictionary.startReading}
            </Link>
          </div>
        </section>

        <section className="mt-7 rounded-[28px] border border-black/10 bg-neutral-50 p-6 sm:p-7">
          <p className="text-xs tracking-[0.18em] text-neutral-500">SYNOPSIS</p>
          <h2 className="mt-2 text-xl font-semibold">{dictionary.synopsis}</h2>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-8 text-neutral-700">{summary}</p>
        </section>

        <section className="mt-7">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.18em] text-neutral-500">CONTENTS</p>
              <h2 className="mt-2 text-2xl font-semibold">{dictionary.contents}</h2>
            </div>
            <p className="text-sm text-neutral-500">{dictionary.episodes(episodes.length)}</p>
          </div>

          <div className="mt-4 grid gap-3">
            {episodes.map((episode) => {
              const episodeNumber = getEpisodeNumber(episode);
              const episodeTitle =
                pickText(episode.title, episode["episode_title"]) ||
                dictionary.episodeFallback(episodeNumber);
              return (
                <Link
                  key={episode.id}
                  href={localizePath(`/read/${seriesId}/${episodeNumber}`, locale)}
                  className="flex min-h-16 items-center justify-between gap-4 rounded-[22px] border border-black/10 bg-white px-5 py-4 shadow-sm transition hover:bg-neutral-50"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-neutral-500">#{episodeNumber}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-black sm:text-base">{episodeTitle}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-neutral-700">{dictionary.read}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
