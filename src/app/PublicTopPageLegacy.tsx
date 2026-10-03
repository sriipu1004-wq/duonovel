import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import PublicWorkBoardCard from "@/components/public/PublicWorkBoardCard";
import {
  getCachedPublicBaseWorkCards,
  getCachedPublicRecordingAggregates,
} from "@/lib/publicWorks";
import { pickText } from "@/features/write/writeShared";
import PublicAdSlot from "@/components/ads/PublicAdSlot";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { isSubscriber } from "@/lib/aiUsage/aiUsage.server";
import { getUiLocale } from "@/i18n/server";
import { homeDictionaries, type HomeDictionary } from "@/i18n/dictionaries/home";
import { localizePath } from "@/i18n/navigation";
import { localizeTagLabel } from "@/i18n/tagLabels";
import type { UiLocale } from "@/i18n/config";
import { runReadOnlyWithRetry } from "@/lib/reliability/readOnly";

const HOME_DESCRIPTION =
  "外国語の長編を管理して読む個人本棚、多言語対訳、読み上げ、Web小説の閲覧・投稿に対応した読書サービスです。";

export const metadata: Metadata = {
  title: "個人本棚・多言語対訳・Web小説 | LIB read",
  description: HOME_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "LIB read",
    url: "/",
    title: "読む、聴く、学ぶ。 | LIB read",
    description: HOME_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "読む、聴く、学ぶ。 | LIB read",
    description: HOME_DESCRIPTION,
    images: ["/opengraph-image"],
  },
};

type PageProps = {
  searchParams?: Promise<{
    mode?: string;
    tag?: string;
  }>;
};

type WorkCard = {
  seriesId: string;
  title: string;
  summary: string;
  authorName: string;
  authorId: string | null;
  episodeCount: number;
  firstEpisodeNumber: number | null;
  latestPostedLabel: string;
  latestPostedAtValue: number;
  createdAtValue: number;
  tags: string[];
  totalRecordingLikes: number;
  totalRecordingPlays: number;
  totalRecordingCount: number;
  popularityScore: number;
};

const fallbackLabels: Record<UiLocale, { untitled: string; unknownAuthor: string }> = {
  ja: { untitled: "無題", unknownAuthor: "作者名未設定" },
  en: { untitled: "Untitled", unknownAuthor: "Unknown author" },
  ko: { untitled: "제목 없음", unknownAuthor: "작가명 없음" },
};

function buildReadHref(seriesId: string, episodeNumber: number): string {
  return `/read/${seriesId}/${episodeNumber}`;
}

function buildWorkHref(seriesId: string): string {
  return `/works/${seriesId}`;
}

function buildAuthorHref(authorId: string): string {
  return `/authors/${encodeURIComponent(authorId)}`;
}

function buildMoreHref(mode: string): string {
  const query = new URLSearchParams();
  query.set("sort", mode);
  return `/search?${query.toString()}`;
}

function formatLatestPostedLabel(
  value: number,
  locale: UiLocale,
  fallback: string
): string {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  const dateLocale = locale === "ja" ? "ja-JP" : locale === "ko" ? "ko-KR" : "en-US";
  return new Intl.DateTimeFormat(dateLocale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

function SectionHeading({
  eyebrow,
  title,
  description,
  moreHref,
  showMore,
}: {
  eyebrow: string;
  title: string;
  description: string;
  moreHref: string;
  showMore: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-3">
      <div>
        <p className="text-[11px] tracking-[0.22em] text-neutral-500">{eyebrow}</p>
        <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">{title}</h2>
        <p className="mt-2 text-sm leading-7 text-neutral-600">{description}</p>
      </div>
      <Link
        href={moreHref}
        className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
      >
        {showMore}
      </Link>
    </div>
  );
}

function ExploreChip({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-black"
    >
      {label}
    </Link>
  );
}

function sortLatest(works: WorkCard[]) {
  return [...works].sort((a, b) => b.latestPostedAtValue - a.latestPostedAtValue);
}

function sortWeeklyNew(works: WorkCard[]) {
  const twoWeeks = 1000 * 60 * 60 * 24 * 14;
  const recent = works.filter((work) => Date.now() - work.createdAtValue <= twoWeeks);
  const target = recent.length > 0 ? recent : works;

  return [...target].sort((a, b) => {
    if (b.createdAtValue !== a.createdAtValue) {
      return b.createdAtValue - a.createdAtValue;
    }
    return b.latestPostedAtValue - a.latestPostedAtValue;
  });
}

function sortOverallPopular(works: WorkCard[]) {
  return [...works].sort((a, b) => {
    if (b.popularityScore !== a.popularityScore) {
      return b.popularityScore - a.popularityScore;
    }
    return b.latestPostedAtValue - a.latestPostedAtValue;
  });
}

function sortNarrationPopular(works: WorkCard[]) {
  return [...works].sort((a, b) => {
    if (b.totalRecordingPlays !== a.totalRecordingPlays) {
      return b.totalRecordingPlays - a.totalRecordingPlays;
    }
    if (b.totalRecordingLikes !== a.totalRecordingLikes) {
      return b.totalRecordingLikes - a.totalRecordingLikes;
    }
    return b.latestPostedAtValue - a.latestPostedAtValue;
  });
}

function WorkGrid({ works, emptyLabel }: { works: WorkCard[]; emptyLabel: string }) {
  if (works.length === 0) {
    return (
      <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-3 md:grid-cols-2">
      {works.map((work) => (
        <PublicWorkBoardCard
          key={work.seriesId}
          title={work.title}
          workHref={buildWorkHref(work.seriesId)}
          authorName={work.authorName}
          authorHref={work.authorId ? buildAuthorHref(work.authorId) : undefined}
          latestPostedLabel={work.latestPostedLabel}
          summary={work.summary}
          firstReadHref={
            work.firstEpisodeNumber
              ? buildReadHref(work.seriesId, work.firstEpisodeNumber)
              : undefined
          }
          tags={work.tags}
        />
      ))}
    </div>
  );
}

function ResultHeading({
  mode,
  tag,
  locale,
  dictionary,
}: {
  mode: string;
  tag: string;
  locale: UiLocale;
  dictionary: HomeDictionary;
}) {
  if (mode === "latest") {
    return {
      title: dictionary.resultsLatestTitle,
      description: dictionary.resultsLatestDescription,
    };
  }
  if (mode === "weekly-new") {
    return {
      title: dictionary.resultsWeeklyTitle,
      description: dictionary.resultsWeeklyDescription,
    };
  }
  if (mode === "overall-popular") {
    return {
      title: dictionary.resultsOverallTitle,
      description: dictionary.resultsOverallDescription,
    };
  }
  if (mode === "narration-popular") {
    return {
      title: dictionary.resultsNarrationTitle,
      description: dictionary.resultsNarrationDescription,
    };
  }
  if (mode === "tag" && tag) {
    const displayTag = localizeTagLabel(tag, locale);
    return {
      title: dictionary.tagResultTitle(displayTag),
      description: dictionary.tagResultDescription(displayTag),
    };
  }
  return {
    title: dictionary.resultsLatestTitle,
    description: dictionary.resultsLatestDescription,
  };
}

function getDiscoveryLinks(locale: UiLocale, dictionary: HomeDictionary) {
  if (locale === "ja") {
    return [
      { href: "/english-novel-reader", title: dictionary.readerGuideTitle, description: dictionary.readerGuideDescription },
      { href: "/web-novel-language-learning", title: dictionary.learningGuideTitle, description: dictionary.learningGuideDescription },
      { href: "/pdf-bilingual-reader", title: dictionary.fileGuideTitle, description: dictionary.fileGuideDescription },
      { href: "/subscription", title: dictionary.pricingGuideTitle, description: dictionary.pricingGuideDescription },
    ];
  }

  return [
    { href: localizePath("/japanese-novel-reader", locale), title: dictionary.readerGuideTitle, description: dictionary.readerGuideDescription },
    { href: localizePath("/learn-japanese-with-web-novels", locale), title: dictionary.learningGuideTitle, description: dictionary.learningGuideDescription },
    { href: localizePath("/pdf-epub-bilingual-reader", locale), title: dictionary.fileGuideTitle, description: dictionary.fileGuideDescription },
    { href: localizePath("/subscription", locale), title: dictionary.pricingGuideTitle, description: dictionary.pricingGuideDescription },
  ];
}

type HomeViewerState = {
  authAvailable: boolean;
  subscriberAvailable: boolean;
  bookmarksAvailable: boolean;
  signedIn: boolean;
  subscriber: boolean;
  bookmarkedSeriesIds: Set<string>;
};

async function loadHomeViewerState(): Promise<HomeViewerState> {
  try {
    const authSupabase = await createServerClient();
    const authResult = await runReadOnlyWithRetry(
      async () => {
        const result = await authSupabase.auth.getUser();
        if (result.error) throw result.error;
        return result;
      },
      { operation: "home auth", timeoutMs: 2000, retries: 1 }
    );
    const user = authResult.data.user;

    if (!user) {
      return {
        authAvailable: true,
        subscriberAvailable: true,
        bookmarksAvailable: true,
        signedIn: false,
        subscriber: false,
        bookmarkedSeriesIds: new Set(),
      };
    }

    const [subscriberResult, bookmarkResult] = await Promise.allSettled([
      runReadOnlyWithRetry(
        () => isSubscriber(user.id),
        { operation: "home subscriber", timeoutMs: 2000, retries: 1 }
      ),
      runReadOnlyWithRetry(
        async () => {
          const result = await authSupabase
            .from("user_series_bookmarks")
            .select("series_id")
            .eq("user_id", user.id);
          if (result.error) throw result.error;
          return result.data ?? [];
        },
        { operation: "home bookmarks", timeoutMs: 2000, retries: 1 }
      ),
    ]);

    if (subscriberResult.status === "rejected") {
      console.warn("[home] subscriber state unavailable");
    }
    if (bookmarkResult.status === "rejected") {
      console.warn("[home] bookmark state unavailable");
    }

    const bookmarkRows =
      bookmarkResult.status === "fulfilled"
        ? (bookmarkResult.value as Array<{ series_id?: string | null }>)
        : [];

    return {
      authAvailable: true,
      subscriberAvailable: subscriberResult.status === "fulfilled",
      bookmarksAvailable: bookmarkResult.status === "fulfilled",
      signedIn: true,
      subscriber:
        subscriberResult.status === "fulfilled" ? subscriberResult.value : false,
      bookmarkedSeriesIds: new Set(
        bookmarkRows
          .map((row) => (typeof row.series_id === "string" ? row.series_id : ""))
          .filter((value) => value.length > 0)
      ),
    };
  } catch (error) {
    console.warn(
      "[home] viewer state unavailable",
      error instanceof Error ? error.message : String(error)
    );
    return {
      authAvailable: false,
      subscriberAvailable: false,
      bookmarksAvailable: false,
      signedIn: false,
      subscriber: false,
      bookmarkedSeriesIds: new Set(),
    };
  }
}

type HomeRecordingSnapshot = {
  available: boolean;
  aggregateMap: Map<
    string,
    {
      totalRecordingLikes: number;
      totalRecordingPlays: number;
      totalRecordingCount: number;
    }
  >;
};

async function loadHomeWorkCards(
  locale: UiLocale,
  dictionary: HomeDictionary
): Promise<WorkCard[]> {
  const baseWorkCards = await runReadOnlyWithRetry(
    () => getCachedPublicBaseWorkCards(),
    { operation: "home public works", timeoutMs: 2500, retries: 0 }
  );

  return baseWorkCards.map((work) => {
    const title =
      work.title === "無題" ? fallbackLabels[locale].untitled : work.title;
    const authorName =
      work.authorName === "作者名未設定"
        ? fallbackLabels[locale].unknownAuthor
        : work.authorName;
    const summary =
      work.summary === "あらすじはまだ登録されていません。" ? "" : work.summary;
    return {
      seriesId: work.seriesId,
      title,
      summary,
      authorName,
      authorId: work.authorId,
      episodeCount: work.episodeCount,
      firstEpisodeNumber: work.firstEpisodeNumber,
      latestPostedLabel: formatLatestPostedLabel(
        work.latestPostedAtValue,
        locale,
        dictionary.dateUnknown
      ),
      latestPostedAtValue: work.latestPostedAtValue,
      createdAtValue: work.createdAtValue,
      tags: work.tags,
      totalRecordingLikes: 0,
      totalRecordingPlays: 0,
      totalRecordingCount: 0,
      popularityScore: work.episodeCount,
    };
  });
}

async function loadHomeRecordingSnapshot(
  workCardsPromise: Promise<WorkCard[]>
): Promise<HomeRecordingSnapshot> {
  try {
    const workCards = await workCardsPromise;
    const recordingAggregates = await runReadOnlyWithRetry(
      () =>
        getCachedPublicRecordingAggregates(
          workCards.map((work) => work.seriesId)
        ),
      { operation: "home recording aggregates", timeoutMs: 1500, retries: 0 }
    );

    return {
      available: true,
      aggregateMap: new Map(
        recordingAggregates.map((aggregate) => [aggregate.seriesId, aggregate])
      ),
    };
  } catch (error) {
    console.warn(
      "[home] recording aggregates unavailable",
      error instanceof Error ? error.message : String(error)
    );
    return { available: false, aggregateMap: new Map() };
  }
}

function withHomeRecordingMetrics(
  workCards: WorkCard[],
  snapshot: HomeRecordingSnapshot
): WorkCard[] {
  return workCards.map((work) => {
    const aggregate = snapshot.aggregateMap.get(work.seriesId) ?? {
      totalRecordingLikes: 0,
      totalRecordingPlays: 0,
      totalRecordingCount: 0,
    };

    return {
      ...work,
      totalRecordingLikes: aggregate.totalRecordingLikes,
      totalRecordingPlays: aggregate.totalRecordingPlays,
      totalRecordingCount: aggregate.totalRecordingCount,
      popularityScore:
        aggregate.totalRecordingPlays * 3 +
        aggregate.totalRecordingLikes * 10 +
        aggregate.totalRecordingCount * 5 +
        work.episodeCount,
    };
  });
}

function HomeSectionUnavailable({ locale }: { locale: UiLocale }) {
  const message =
    locale === "en"
      ? "This section is temporarily unavailable. Other public content remains available."
      : locale === "ko"
        ? "이 섹션은 일시적으로 사용할 수 없습니다. 다른 공개 콘텐츠는 계속 이용할 수 있습니다."
        : "この欄は一時的に利用できない。他の公開コンテンツは引き続き利用できる。";
  return (
    <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
      {message}
    </div>
  );
}

function HomeSingleSectionFallback({ id }: { id: string }) {
  return (
    <section id={id} className="pt-10" aria-busy="true">
      <div className="border-b border-black/10 pb-3">
        <div className="h-3 w-32 rounded-full bg-neutral-100" />
        <div className="mt-3 h-7 w-56 rounded-full bg-neutral-100" />
      </div>
      <div className="mt-6 h-28 rounded-[24px] border border-black/10 bg-neutral-50" />
    </section>
  );
}

function HomeWorkSectionsFallback({ mode }: { mode: string }) {
  const sectionIds = [
    "bookmark-updates",
    "latest",
    "weekly-new",
    "overall-popular",
    "narration-popular",
    ...(mode ? ["results"] : []),
  ];
  return (
    <>
      {sectionIds.map((id) => (
        <HomeSingleSectionFallback key={id} id={id} />
      ))}
    </>
  );
}

async function HomeBookmarkSection({
  workCards,
  viewerStatePromise,
  locale,
  dictionary,
}: {
  workCards: WorkCard[];
  viewerStatePromise: Promise<HomeViewerState>;
  locale: UiLocale;
  dictionary: HomeDictionary;
}) {
  const viewerState = await viewerStatePromise;
  const loginHref = `${localizePath("/login", locale)}?next=${encodeURIComponent(
    localizePath("/", locale)
  )}`;
  const bookmarkedWorks = sortLatest(
    workCards.filter((work) =>
      viewerState.bookmarkedSeriesIds.has(work.seriesId)
    )
  ).slice(0, 4);
  const personalizationUnavailable =
    !viewerState.authAvailable ||
    (viewerState.signedIn && !viewerState.bookmarksAvailable);

  return (
    <section id="bookmark-updates" className="pt-10">
      <SectionHeading
        eyebrow="BOOKMARK UPDATES"
        title={dictionary.bookmarkTitle}
        description={
          viewerState.signedIn
            ? dictionary.bookmarkSignedIn
            : dictionary.bookmarkSignedOut
        }
        moreHref={
          viewerState.signedIn
            ? localizePath(
                "/search?saved=bookmarked-works&order=updated",
                locale
              )
            : loginHref
        }
        showMore={dictionary.showMore}
      />
      {personalizationUnavailable ? (
        <HomeSectionUnavailable locale={locale} />
      ) : viewerState.signedIn ? (
        <WorkGrid works={bookmarkedWorks} emptyLabel={dictionary.noWorks} />
      ) : (
        <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
          {dictionary.bookmarkLoginPrompt}{" "}
          <Link
            href={loginHref}
            className="font-medium text-black underline underline-offset-4"
          >
            {dictionary.login}
          </Link>
        </div>
      )}
    </section>
  );
}

async function HomePopularitySections({
  workCards,
  recordingSnapshotPromise,
  locale,
  dictionary,
}: {
  workCards: WorkCard[];
  recordingSnapshotPromise: Promise<HomeRecordingSnapshot>;
  locale: UiLocale;
  dictionary: HomeDictionary;
}) {
  const snapshot = await recordingSnapshotPromise;

  if (!snapshot.available) {
    return (
      <>
        <section id="overall-popular" className="pt-12">
          <SectionHeading
            eyebrow="OVERALL POPULAR"
            title={dictionary.overallTitle}
            description={dictionary.overallDescription}
            moreHref={localizePath(buildMoreHref("overall-popular"), locale)}
            showMore={dictionary.showMore}
          />
          <HomeSectionUnavailable locale={locale} />
        </section>
        <section id="narration-popular" className="pt-12">
          <SectionHeading
            eyebrow="NARRATION POPULAR"
            title={dictionary.narrationTitle}
            description={dictionary.narrationDescription}
            moreHref={localizePath(buildMoreHref("narration-popular"), locale)}
            showMore={dictionary.showMore}
          />
          <HomeSectionUnavailable locale={locale} />
        </section>
      </>
    );
  }

  const enrichedWorks = withHomeRecordingMetrics(workCards, snapshot);
  const overallPopularWorks = sortOverallPopular(enrichedWorks).slice(0, 4);
  const narrationPopularWorks = sortNarrationPopular(enrichedWorks).slice(0, 4);
  return (
    <>
      <section id="overall-popular" className="pt-12">
        <SectionHeading
          eyebrow="OVERALL POPULAR"
          title={dictionary.overallTitle}
          description={dictionary.overallDescription}
          moreHref={localizePath(buildMoreHref("overall-popular"), locale)}
          showMore={dictionary.showMore}
        />
        <WorkGrid works={overallPopularWorks} emptyLabel={dictionary.noWorks} />
      </section>
      <section id="narration-popular" className="pt-12">
        <SectionHeading
          eyebrow="NARRATION POPULAR"
          title={dictionary.narrationTitle}
          description={dictionary.narrationDescription}
          moreHref={localizePath(buildMoreHref("narration-popular"), locale)}
          showMore={dictionary.showMore}
        />
        <WorkGrid works={narrationPopularWorks} emptyLabel={dictionary.noWorks} />
      </section>
    </>
  );
}

async function HomeResultsSection({
  workCards,
  recordingSnapshotPromise,
  mode,
  tag,
  locale,
  dictionary,
}: {
  workCards: WorkCard[];
  recordingSnapshotPromise: Promise<HomeRecordingSnapshot>;
  mode: string;
  tag: string;
  locale: UiLocale;
  dictionary: HomeDictionary;
}) {
  const filtered =
    mode === "tag" && tag
      ? workCards.filter((work) => work.tags.includes(tag))
      : workCards;
  let resultWorks: WorkCard[] = [];
  let metricsAvailable = true;

  if (mode === "latest") {
    resultWorks = sortLatest(filtered);
  } else if (mode === "weekly-new") {
    resultWorks = sortWeeklyNew(filtered);
  } else if (
    mode === "overall-popular" ||
    mode === "narration-popular" ||
    mode === "tag"
  ) {
    const snapshot = await recordingSnapshotPromise;
    metricsAvailable = snapshot.available;
    if (snapshot.available) {
      const enriched = withHomeRecordingMetrics(filtered, snapshot);
      resultWorks =
        mode === "narration-popular"
          ? sortNarrationPopular(enriched)
          : sortOverallPopular(enriched);
    }
  }

  const resultHeading = ResultHeading({ mode, tag, locale, dictionary });

  return (
    <section id="results" className="pt-12">
      <div className="border-b border-black/10 pb-3">
        <p className="text-[11px] tracking-[0.22em] text-neutral-500">
          {dictionary.resultsEyebrow}
        </p>
        <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">
          {resultHeading.title}
        </h2>
        <p className="mt-2 text-sm leading-7 text-neutral-600">
          {resultHeading.description}
        </p>
      </div>
      {metricsAvailable ? (
        <WorkGrid works={resultWorks} emptyLabel={dictionary.noWorks} />
      ) : (
        <HomeSectionUnavailable locale={locale} />
      )}
    </section>
  );
}

async function HomeWorkSections({
  workCardsPromise,
  viewerStatePromise,
  recordingSnapshotPromise,
  mode,
  tag,
  locale,
  dictionary,
}: {
  workCardsPromise: Promise<WorkCard[]>;
  viewerStatePromise: Promise<HomeViewerState>;
  recordingSnapshotPromise: Promise<HomeRecordingSnapshot>;
  mode: string;
  tag: string;
  locale: UiLocale;
  dictionary: HomeDictionary;
}) {
  let workCards: WorkCard[];
  try {
    workCards = await workCardsPromise;
  } catch (error) {
    console.warn(
      "[home] public work cards unavailable",
      error instanceof Error ? error.message : String(error)
    );
    return (
      <section id="latest" className="pt-10">
        <SectionHeading
          eyebrow="LATEST UPDATES"
          title={dictionary.latestTitle}
          description={dictionary.latestDescription}
          moreHref={localizePath(buildMoreHref("latest"), locale)}
          showMore={dictionary.showMore}
        />
        <HomeSectionUnavailable locale={locale} />
      </section>
    );
  }

  const latestWorks = sortLatest(workCards).slice(0, 4);
  const weeklyNewWorks = sortWeeklyNew(workCards).slice(0, 4);

  return (
    <>
      <Suspense fallback={<HomeSingleSectionFallback id="bookmark-updates" />}>
        <HomeBookmarkSection
          workCards={workCards}
          viewerStatePromise={viewerStatePromise}
          locale={locale}
          dictionary={dictionary}
        />
      </Suspense>

      <section id="latest" className="pt-10">
        <SectionHeading
          eyebrow="LATEST UPDATES"
          title={dictionary.latestTitle}
          description={dictionary.latestDescription}
          moreHref={localizePath(buildMoreHref("latest"), locale)}
          showMore={dictionary.showMore}
        />
        <WorkGrid works={latestWorks} emptyLabel={dictionary.noWorks} />
      </section>

      <section id="weekly-new" className="pt-12">
        <SectionHeading
          eyebrow="WEEKLY NEW RECOMMEND"
          title={dictionary.weeklyTitle}
          description={dictionary.weeklyDescription}
          moreHref={localizePath(buildMoreHref("weekly-new"), locale)}
          showMore={dictionary.showMore}
        />
        <WorkGrid works={weeklyNewWorks} emptyLabel={dictionary.noWorks} />
      </section>
      <Suspense
        fallback={
          <>
            <HomeSingleSectionFallback id="overall-popular" />
            <HomeSingleSectionFallback id="narration-popular" />
          </>
        }
      >
        <HomePopularitySections
          workCards={workCards}
          recordingSnapshotPromise={recordingSnapshotPromise}
          locale={locale}
          dictionary={dictionary}
        />
      </Suspense>

      {mode ? (
        <Suspense fallback={<HomeSingleSectionFallback id="results" />}>
          <HomeResultsSection
            workCards={workCards}
            recordingSnapshotPromise={recordingSnapshotPromise}
            mode={mode}
            tag={tag}
            locale={locale}
            dictionary={dictionary}
          />
        </Suspense>
      ) : null}
    </>
  );
}

async function HomeSubscriptionChip({
  viewerStatePromise,
  dictionary,
}: {
  viewerStatePromise: Promise<HomeViewerState>;
  dictionary: HomeDictionary;
}) {
  const viewerState = await viewerStatePromise;
  if (!viewerState.authAvailable || !viewerState.subscriberAvailable) return null;
  return viewerState.subscriber ? null : (
    <ExploreChip href="#subscription" label={dictionary.subscriptionChip} />
  );
}

async function HomeSubscriptionSection({
  viewerStatePromise,
  locale,
  dictionary,
}: {
  viewerStatePromise: Promise<HomeViewerState>;
  locale: UiLocale;
  dictionary: HomeDictionary;
}) {
  const viewerState = await viewerStatePromise;
  if (
    !viewerState.authAvailable ||
    !viewerState.subscriberAvailable ||
    viewerState.subscriber
  ) {
    return null;
  }
  return (
    <section id="subscription" className="pt-10">
      <div className="overflow-hidden rounded-[28px] bg-neutral-950 px-5 py-7 text-white sm:px-8 sm:py-9">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] tracking-[0.22em] text-sky-300">{dictionary.subscriptionEyebrow}</p>
            <h2 className="mt-2 text-2xl font-bold">{dictionary.subscriptionTitle}</h2>
            <p className="mt-3 text-sm leading-7 text-neutral-300">{dictionary.subscriptionDescription}</p>
          </div>
          <Link href={localizePath("/subscription", locale)} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-100">
            {dictionary.subscriptionCta}
          </Link>
        </div>
      </div>
    </section>
  );
}

export default async function PublicTopPage({ searchParams }: PageProps) {
  const locale = await getUiLocale();
  const dictionary = homeDictionaries[locale];
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const mode = pickText(resolvedSearchParams?.mode);
  const tag = pickText(resolvedSearchParams?.tag);

  const viewerStatePromise = loadHomeViewerState();
  const workCardsPromise = loadHomeWorkCards(locale, dictionary);
  const recordingSnapshotPromise = loadHomeRecordingSnapshot(workCardsPromise);
  const discoveryLinks = getDiscoveryLinks(locale, dictionary);

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <section className="border-b border-black/10 pb-10">
          <div className="max-w-5xl">
            <p className="text-[11px] tracking-[0.24em] text-neutral-500">{dictionary.eyebrow}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-black/10 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">{dictionary.freeBadge}</span>
              <span className="rounded-full border border-black/10 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">{dictionary.featureBadge}</span>
            </div>
            <h1 className="mt-4 text-3xl font-bold leading-tight text-black sm:text-4xl xl:text-5xl">
              {dictionary.title}
            </h1>
            <p className="mt-5 max-w-4xl text-base leading-8 text-neutral-800 sm:text-lg">
              {dictionary.lead}
            </p>
            <p className="mt-3 max-w-4xl text-sm leading-8 text-neutral-700 sm:text-[15px]">
              {dictionary.description}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={localizePath("/library", locale)} className="rounded-full border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-medium text-violet-900 transition hover:bg-violet-100">{dictionary.library}</Link>
              <Link href={localizePath("/search", locale)} className="rounded-full border border-black/10 bg-neutral-100 px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-200">{dictionary.explore}</Link>
              <Link href={localizePath("/write", locale)} className="rounded-full border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-medium text-black transition hover:bg-sky-100">{dictionary.write}</Link>
              <Link href={localizePath("/record", locale)} className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50">{dictionary.narrate}</Link>
            </div>
            <div className="mt-8">
              <p className="text-[11px] tracking-[0.22em] text-neutral-500">{dictionary.toc}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <ExploreChip href="#prelaunch-summary" label={dictionary.featuresChip} />
                <Suspense fallback={null}>
                  <HomeSubscriptionChip
                    viewerStatePromise={viewerStatePromise}
                    dictionary={dictionary}
                  />
                </Suspense>
                <ExploreChip href="#bookmark-updates" label={dictionary.bookmarkChip} />
                <ExploreChip href="#latest" label={dictionary.latestChip} />
                <ExploreChip href="#weekly-new" label={dictionary.weeklyChip} />
                <ExploreChip href="#overall-popular" label={dictionary.overallChip} />
                <ExploreChip href="#narration-popular" label={dictionary.narrationChip} />
              </div>
            </div>
          </div>
        </section>

        <Suspense fallback={null}>
          <HomeSubscriptionSection
            viewerStatePromise={viewerStatePromise}
            locale={locale}
            dictionary={dictionary}
          />
        </Suspense>

        <section id="prelaunch-summary" className="pt-10">
          <div className="rounded-[24px] border border-black/10 bg-neutral-50 p-5 sm:p-6">
            <p className="text-[11px] tracking-[0.22em] text-neutral-500">{dictionary.whyEyebrow}</p>
            <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">{dictionary.features}</h2>
            <p className="mt-2 text-sm leading-7 text-neutral-600">{dictionary.featuresBody}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {[
                [dictionary.privateLibraryTitle, dictionary.privateLibraryBody],
                [dictionary.bilingualTitle, dictionary.bilingualBody],
                [dictionary.ttsTitle, dictionary.ttsBody],
                [dictionary.aiTitle, dictionary.aiBody],
              ].map(([title, body]) => (
                <div key={title} className="rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-sm font-semibold text-black">{title}</p>
                  <p className="mt-2 text-sm leading-7 text-neutral-600">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pt-10" aria-labelledby="reading-guides-title">
          <div className="border-b border-black/10 pb-3">
            <p className="text-[11px] tracking-[0.22em] text-neutral-500">{dictionary.discoveryEyebrow}</p>
            <h2 id="reading-guides-title" className="mt-2 text-xl font-bold text-black sm:text-2xl">{dictionary.discoveryTitle}</h2>
            <p className="mt-2 text-sm leading-7 text-neutral-600">{dictionary.discoveryDescription}</p>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {discoveryLinks.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-[20px] border border-black/10 bg-neutral-50 p-4 transition hover:border-black/20 hover:bg-white">
                <p className="text-sm font-semibold text-black">{item.title}</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">{item.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <Suspense fallback={<HomeWorkSectionsFallback mode={mode} />}>
          <HomeWorkSections
            workCardsPromise={workCardsPromise}
            viewerStatePromise={viewerStatePromise}
            recordingSnapshotPromise={recordingSnapshotPromise}
            mode={mode}
            tag={tag}
            locale={locale}
            dictionary={dictionary}
          />
        </Suspense>

        <section id="home-ad-slot" className="pt-12"><PublicAdSlot slotId="home-bottom" minHeightClassName="min-h-[88px]" /></section>
        <section id="home-links" className="pt-6">
          <div className="border-t border-black/10 pt-4 text-[11px] leading-6 text-neutral-500">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-neutral-400">{dictionary.serviceInfo}</span>
              <Link href={localizePath("/guide", locale)} className="transition hover:text-black">{dictionary.guide}</Link>
              <Link href={localizePath("/faq", locale)} className="transition hover:text-black">{dictionary.faq}</Link>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-neutral-400">{dictionary.operationsInfo}</span>
              <Link href={localizePath("/status", locale)} className="transition hover:text-black">{dictionary.status}</Link>
              <Link href={localizePath("/news", locale)} className="transition hover:text-black">{dictionary.news}</Link>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-neutral-400">{dictionary.legalContact}</span>
              <Link href="/terms" className="transition hover:text-black">{dictionary.terms}</Link>
              <Link href="/privacy" className="transition hover:text-black">{dictionary.privacy}</Link>
              <Link href="/commercial-transactions" className="transition hover:text-black">{dictionary.commercial}</Link>
              <Link href="/contact" className="transition hover:text-black">{dictionary.contact}</Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
