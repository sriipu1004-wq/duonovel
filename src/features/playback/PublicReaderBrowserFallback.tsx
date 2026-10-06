"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getEpisodeBody,
  getEpisodeNumber,
  pickText,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import {
  PUBLIC_READER_FALLBACK_EPISODE_SELECT,
  PUBLIC_READER_FALLBACK_SERIES_SELECT,
  isPublicReaderFallbackEpisodeEligible,
  isPublicReaderFallbackSeriesEligible,
} from "@/lib/publicReaderFallbackContract";
import { createAnonymousPublicBrowserClient } from "@/lib/supabase/browserPublic";
import { localizePath } from "@/i18n/navigation";

type UiLocale = "ja" | "en" | "ko";

type Props = {
  locale: UiLocale;
  seriesId: string;
  episodeNumber: number;
};

type ReadyPayload = {
  series: SeriesRow;
  episode: EpisodeRow;
  previousEpisode: EpisodeRow | null;
  nextEpisode: EpisodeRow | null;
};

type FallbackState =
  | { status: "loading" }
  | { status: "ready"; payload: ReadyPayload }
  | { status: "r18-blocked" }
  | { status: "unavailable" };

const COPY = {
  ja: {
    eyebrow: "DIRECT PUBLIC FALLBACK",
    loadingTitle: "公開本文を別経路で確認中",
    loadingBody:
      "通常のReader経路が一時的に利用できないため、公開済み本文だけをSupabaseの公開Data APIから確認している。",
    readyNotice:
      "通常経路が一時的に利用できないため、公開済みの原文だけを別経路で表示している。翻訳、朗読、ブックマークなどの付加機能はこのfallbackでは利用しない。",
    unavailableTitle: "この話を一時的に読み込めない",
    unavailableBody:
      "通常経路と公開fallbackの両方で本文を確認できなかった。作品が削除されたことを意味しない。",
    r18Title: "この作品はfallbackでは表示しない",
    r18Body:
      "R18閲覧設定を安全に確認できないため、障害時のbrowser-direct fallbackでは本文を取得しない。",
    retry: "通常のReaderを再試行",
    work: "作品ページ",
    previous: "前の話",
    next: "次の話",
    episode: (n: number) => `第${n}話`,
    untitled: "無題",
  },
  en: {
    eyebrow: "DIRECT PUBLIC FALLBACK",
    loadingTitle: "Checking the public source through an alternate path",
    loadingBody:
      "The normal Reader path is temporarily unavailable, so LIB read is checking only published source text through the public Supabase Data API.",
    readyNotice:
      "The normal path is temporarily unavailable. This fallback shows only published source text; translation, narration, bookmarks, and other optional features are not used here.",
    unavailableTitle: "This episode is temporarily unavailable",
    unavailableBody:
      "Neither the normal path nor the public fallback could verify the episode. This does not mean the work was removed.",
    r18Title: "This work is not shown through fallback",
    r18Body:
      "The R18 viewer preference cannot be verified safely on this route, so browser-direct fallback does not fetch the episode body.",
    retry: "Retry the normal Reader",
    work: "Work page",
    previous: "Previous",
    next: "Next",
    episode: (n: number) => `Episode ${n}`,
    untitled: "Untitled",
  },
  ko: {
    eyebrow: "DIRECT PUBLIC FALLBACK",
    loadingTitle: "다른 경로로 공개 원문을 확인 중입니다",
    loadingBody:
      "일반 Reader 경로를 일시적으로 사용할 수 없어 공개된 원문만 Supabase 공개 Data API로 확인하고 있습니다.",
    readyNotice:
      "일반 경로를 일시적으로 사용할 수 없어 공개된 원문만 다른 경로로 표시합니다. 번역, 낭독, 북마크 등의 부가 기능은 이 fallback에서 사용하지 않습니다.",
    unavailableTitle: "이 화를 일시적으로 불러올 수 없습니다",
    unavailableBody:
      "일반 경로와 공개 fallback 모두에서 본문을 확인하지 못했습니다. 작품이 삭제되었다는 의미는 아닙니다.",
    r18Title: "이 작품은 fallback에서 표시하지 않습니다",
    r18Body:
      "R18 열람 설정을 안전하게 확인할 수 없으므로 장애 시 browser-direct fallback에서는 본문을 가져오지 않습니다.",
    retry: "일반 Reader 다시 시도",
    work: "작품 페이지",
    previous: "이전 화",
    next: "다음 화",
    episode: (n: number) => `${n}화`,
    untitled: "제목 없음",
  },
} as const;

const FALLBACK_TIMEOUT_MS = 3500;

function buildReadHref(seriesId: string, episodeNumber: number): string {
  return `/read/${encodeURIComponent(seriesId)}/${episodeNumber}`;
}

async function loadPublicFallback(
  seriesId: string,
  episodeNumber: number,
  signal: AbortSignal
): Promise<FallbackState> {
  const supabase = createAnonymousPublicBrowserClient();

  const seriesResult = await supabase
    .from("series")
    .select(PUBLIC_READER_FALLBACK_SERIES_SELECT)
    .eq("id", seriesId)
    .eq("publication_status", "public")
    .abortSignal(signal)
    .maybeSingle();

  if (seriesResult.error || !seriesResult.data) {
    return { status: "unavailable" };
  }

  const series = seriesResult.data as unknown as SeriesRow;

  // R18 is deliberately excluded before any episode/body read. RLS protects
  // publication visibility, but the viewer's R18 preference is an application
  // safety gate and is not available to this anonymous fallback path.
  if (!isPublicReaderFallbackSeriesEligible(series)) {
    return series.content_rating === "r18" ||
      (Array.isArray(series.content_warnings) &&
        series.content_warnings.includes("sexual_r18"))
      ? { status: "r18-blocked" }
      : { status: "unavailable" };
  }

  const currentQuery = supabase
    .from("episodes")
    .select(PUBLIC_READER_FALLBACK_EPISODE_SELECT)
    .eq("series_id", seriesId)
    .eq("episode_number", episodeNumber)
    .eq("posting_status", "posted")
    .eq("is_published", true)
    .abortSignal(signal)
    .maybeSingle();

  const previousQuery = supabase
    .from("episodes")
    .select(PUBLIC_READER_FALLBACK_EPISODE_SELECT)
    .eq("series_id", seriesId)
    .eq("posting_status", "posted")
    .eq("is_published", true)
    .lt("episode_number", episodeNumber)
    .order("episode_number", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .abortSignal(signal)
    .maybeSingle();

  const nextQuery = supabase
    .from("episodes")
    .select(PUBLIC_READER_FALLBACK_EPISODE_SELECT)
    .eq("series_id", seriesId)
    .eq("posting_status", "posted")
    .eq("is_published", true)
    .gt("episode_number", episodeNumber)
    .order("episode_number", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .abortSignal(signal)
    .maybeSingle();

  const [currentResult, previousResult, nextResult] = await Promise.all([
    currentQuery,
    previousQuery,
    nextQuery,
  ]);

  if (currentResult.error || previousResult.error || nextResult.error) {
    return { status: "unavailable" };
  }

  const episode = currentResult.data as unknown as EpisodeRow | null;
  const previousEpisode =
    previousResult.data as unknown as EpisodeRow | null;
  const nextEpisode = nextResult.data as unknown as EpisodeRow | null;

  if (!isPublicReaderFallbackEpisodeEligible(episode)) {
    return { status: "unavailable" };
  }

  if (
    previousEpisode &&
    !isPublicReaderFallbackEpisodeEligible(previousEpisode)
  ) {
    return { status: "unavailable" };
  }

  if (nextEpisode && !isPublicReaderFallbackEpisodeEligible(nextEpisode)) {
    return { status: "unavailable" };
  }

  return {
    status: "ready",
    payload: {
      series,
      episode,
      previousEpisode,
      nextEpisode,
    },
  };
}

function StatusSurface({
  locale,
  seriesId,
  episodeNumber,
  kind,
}: Props & { kind: "loading" | "unavailable" | "r18-blocked" }) {
  const copy = COPY[locale];
  const title =
    kind === "loading"
      ? copy.loadingTitle
      : kind === "r18-blocked"
        ? copy.r18Title
        : copy.unavailableTitle;
  const body =
    kind === "loading"
      ? copy.loadingBody
      : kind === "r18-blocked"
        ? copy.r18Body
        : copy.unavailableBody;

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <section className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-[11px] tracking-[0.22em] text-neutral-500">
            {copy.eyebrow}
          </p>
          <h1 className="mt-3 text-2xl font-bold">{title}</h1>
          <p className="mt-4 text-sm leading-8 text-neutral-700">{body}</p>
          {kind !== "loading" ? (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={localizePath(buildReadHref(seriesId, episodeNumber), locale)}
                className="rounded-full border border-black/10 bg-neutral-100 px-4 py-2.5 text-sm font-medium text-black"
              >
                {copy.retry}
              </Link>
              <Link
                href={localizePath(
                  `/works/${encodeURIComponent(seriesId)}`,
                  locale
                )}
                className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-medium text-black"
              >
                {copy.work}
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export default function PublicReaderBrowserFallback(props: Props) {
  const { locale, seriesId, episodeNumber } = props;
  const copy = COPY[locale];
  const [state, setState] = useState<FallbackState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => controller.abort(),
      FALLBACK_TIMEOUT_MS
    );

    void loadPublicFallback(seriesId, episodeNumber, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setState(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ status: "unavailable" });
        }
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [episodeNumber, seriesId]);

  if (state.status === "loading") {
    return <StatusSurface {...props} kind="loading" />;
  }

  if (state.status === "unavailable") {
    return <StatusSurface {...props} kind="unavailable" />;
  }

  if (state.status === "r18-blocked") {
    return <StatusSurface {...props} kind="r18-blocked" />;
  }

  const { series, episode, previousEpisode, nextEpisode } = state.payload;
  const seriesTitle = pickText(series.title) || copy.untitled;
  const currentEpisodeNumber = getEpisodeNumber(episode) || episodeNumber;
  const episodeTitle =
    pickText(episode.title) || copy.episode(currentEpisodeNumber);
  const body = getEpisodeBody(episode);
  const previousNumber = previousEpisode
    ? getEpisodeNumber(previousEpisode)
    : null;
  const nextNumber = nextEpisode ? getEpisodeNumber(nextEpisode) : null;

  return (
    <main className="min-h-screen bg-white pb-16 text-black">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-neutral-800">
          <p className="text-[11px] tracking-[0.22em] text-neutral-500">
            {copy.eyebrow}
          </p>
          <p className="mt-2">{copy.readyNotice}</p>
        </section>

        <header className="mt-6 rounded-[28px] border border-black/10 bg-white px-5 py-6 shadow-sm sm:px-8">
          <Link
            href={localizePath(
              `/works/${encodeURIComponent(seriesId)}`,
              locale
            )}
            className="text-sm text-neutral-600 hover:text-black"
          >
            {seriesTitle}
          </Link>
          <h1 className="mt-2 text-xl font-semibold sm:text-2xl">
            {episodeTitle}
          </h1>
        </header>

        <article className="mt-6 whitespace-pre-wrap rounded-[28px] border border-black/10 bg-white p-5 text-[1.06rem] leading-[2.05] shadow-sm sm:p-8">
          {body}
        </article>

        <nav className="mt-6 flex items-center justify-between gap-3 text-sm">
          {previousNumber ? (
            <Link
              href={localizePath(
                buildReadHref(seriesId, previousNumber),
                locale
              )}
              className="rounded-full border border-black/10 bg-neutral-100 px-4 py-2.5 font-medium text-black"
            >
              {copy.previous}
            </Link>
          ) : (
            <span />
          )}
          {nextNumber ? (
            <Link
              href={localizePath(buildReadHref(seriesId, nextNumber), locale)}
              className="rounded-full border border-black/10 bg-neutral-100 px-4 py-2.5 font-medium text-black"
            >
              {copy.next}
            </Link>
          ) : null}
        </nav>
      </div>
    </main>
  );
}
