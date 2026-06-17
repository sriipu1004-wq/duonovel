import Link from "next/link";
import PublicWorkBoardCard from "@/components/public/PublicWorkBoardCard";
import {
  getCachedPublicBaseWorkCards,
  getCachedPublicRecordingAggregates,
} from "@/lib/publicWorks";
import { pickText } from "@/features/write/writeShared";
import PublicAdSlot from "@/components/ads/PublicAdSlot";

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

function SectionHeading({
  eyebrow,
  title,
  description,
  moreHref,
}: {
  eyebrow: string;
  title: string;
  description: string;
  moreHref: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-3">
      <div>
        <p className="text-[11px] tracking-[0.22em] text-neutral-500">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-7 text-neutral-600">{description}</p>
      </div>

      <Link
        href={moreHref}
        className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
      >
        さらに表示
      </Link>
    </div>
  );
}

function ExploreChip({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
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
  const now = Date.now();
  const twoWeeks = 1000 * 60 * 60 * 24 * 14;

  const recent = works.filter((work) => now - work.createdAtValue <= twoWeeks);
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

function ResultHeading({
  mode,
  tag,
}: {
  mode: string;
  tag: string;
}) {
  if (mode === "latest") {
    return {
      title: "新着更新の結果",
      description: "新着更新順で表示中。",
    };
  }

  if (mode === "weekly-new") {
    return {
      title: "週間新作おすすめの結果",
      description: "新作寄りの順で表示中。",
    };
  }

  if (mode === "overall-popular") {
    return {
      title: "総合人気順の結果",
      description: "公開中作品を人気寄りの順で表示中。",
    };
  }

  if (mode === "narration-popular") {
    return {
      title: "朗読視聴人気順の結果",
      description: "朗読視聴寄りの順で表示中。",
    };
  }

  if (mode === "tag" && tag) {
    return {
      title: `${tag} の結果`,
      description: "タグ一致作品を人気寄りの順で表示中。",
    };
  }

  return {
    title: "検索結果",
    description: "条件に合う公開作品を表示中。",
  };
}

export default async function PublicTopPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const mode = pickText(resolvedSearchParams?.mode);
  const tag = pickText(resolvedSearchParams?.tag);

  const baseWorkCards = await getCachedPublicBaseWorkCards();
  const recordingAggregates = await getCachedPublicRecordingAggregates(
    baseWorkCards.map((work) => work.seriesId)
  );

  const recordingAggregateMap = new Map(
    recordingAggregates.map((aggregate) => [aggregate.seriesId, aggregate])
  );

  const workCards: WorkCard[] = baseWorkCards.map((work) => {
    const aggregate = recordingAggregateMap.get(work.seriesId) ?? {
      totalRecordingLikes: 0,
      totalRecordingPlays: 0,
      totalRecordingCount: 0,
    };

    const popularityScore =
      aggregate.totalRecordingPlays * 3 +
      aggregate.totalRecordingLikes * 10 +
      aggregate.totalRecordingCount * 5 +
      work.episodeCount;

    return {
      seriesId: work.seriesId,
      title: work.title,
      summary: work.summary,
      authorName: work.authorName,
      authorId: work.authorId,
      episodeCount: work.episodeCount,
      firstEpisodeNumber: work.firstEpisodeNumber,
      latestPostedLabel: work.latestPostedLabel,
      latestPostedAtValue: work.latestPostedAtValue,
      createdAtValue: work.createdAtValue,
      tags: work.tags,
      totalRecordingLikes: aggregate.totalRecordingLikes,
      totalRecordingPlays: aggregate.totalRecordingPlays,
      totalRecordingCount: aggregate.totalRecordingCount,
      popularityScore,
    };
  });

  const latestWorks = sortLatest(workCards).slice(0, 4);
  const weeklyNewWorks = sortWeeklyNew(workCards).slice(0, 4);
  const overallPopularWorks = sortOverallPopular(workCards).slice(0, 4);
  const narrationPopularWorks = sortNarrationPopular(workCards).slice(0, 4);

  const filteredForResults =
    mode === "tag" && tag
      ? workCards.filter((work) => work.tags.includes(tag))
      : workCards;

  const resultWorks =
    mode === "latest"
      ? sortLatest(filteredForResults)
      : mode === "weekly-new"
        ? sortWeeklyNew(filteredForResults)
        : mode === "overall-popular"
          ? sortOverallPopular(filteredForResults)
          : mode === "narration-popular"
            ? sortNarrationPopular(filteredForResults)
            : mode === "tag"
              ? sortOverallPopular(filteredForResults)
              : [];

  const resultHeading = ResultHeading({ mode, tag });

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <section className="border-b border-black/10 pb-10">
          <div className="grid gap-8">
            <div className="max-w-5xl">
              <p className="text-[11px] tracking-[0.24em] text-neutral-500">
                NOVEL / READ / LISTEN
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-black/10 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                  完全無料
                </span>
                <span className="rounded-full border border-black/10 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                  小説 / 朗読
                </span>
              </div>

              <h1 className="mt-4 text-3xl font-bold leading-tight text-black sm:text-4xl xl:text-5xl">
                読む、聞く、投稿する。
                <br />
                完全無料で朗読が扱える小説投稿サイト。
              </h1>

              <p className="mt-5 max-w-4xl text-sm leading-8 text-neutral-700 sm:text-[15px]">
                LIB read は、小説投稿サイトとしての読みやすさを土台にしながら、
                朗読や文字・背景の演出も一緒に扱える完全無料の小説投稿サイトです。
                作品を読む、聞く、投稿するところまで、ログインユーザーならそのまま始められます。
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/generate"
                  className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
                >
                  物語を生成する
                </Link>
                <Link
                  href="/search"
                  className="rounded-full border border-black/10 bg-neutral-100 px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-200"
                >
                  作品を探す
                </Link>

                <Link
                  href="/write"
                  className="rounded-full border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-medium text-black transition hover:bg-sky-100"
                >
                  作品を投稿する
                </Link>

                <Link
                  href="/record"
                  className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
                >
                  作品を朗読する
                </Link>
              </div>

              <div className="mt-8">
                <p className="text-[11px] tracking-[0.22em] text-neutral-500">
                  目次
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ExploreChip href="/generate" label="物語を生成する" />
                  <ExploreChip href="/write" label="投稿する" />
                  <ExploreChip href="#prelaunch-summary" label="LIB read の特徴" />
                  <ExploreChip href="#latest" label="新着更新" />
                  <ExploreChip href="#weekly-new" label="週間新作おすすめ" />
                  <ExploreChip href="#overall-popular" label="総合人気順" />
                  <ExploreChip href="#narration-popular" label="朗読視聴人気順" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="prelaunch-summary" className="pt-10">
          <div className="rounded-[24px] border border-black/10 bg-neutral-50 p-5 sm:p-6">
            <p className="text-[11px] tracking-[0.22em] text-neutral-500">
              WHY LIB READ
            </p>
            <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">
              LIB read の特徴
            </h2>
            <p className="mt-2 text-sm leading-7 text-neutral-600">
              従来の小説投稿サイトとしての使いやすさを残しながら、
              投稿、朗読、演出まで含めて作品体験の幅を広げる。
            </p>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-black/10 bg-white p-4">
                <p className="text-sm font-semibold text-black">小説</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  探す、読む、投稿するという小説投稿サイトの基本導線を、ログインユーザーに開放している。
                </p>
              </div>

              <div className="rounded-2xl border border-black/10 bg-white p-4">
                <p className="text-sm font-semibold text-black">朗読</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  読むだけでなく、朗読付き作品を聞いたり、作品への気持ちを声で表現する入口も持たせている。
                </p>
              </div>

              <div className="rounded-2xl border border-black/10 bg-white p-4">
                <p className="text-sm font-semibold text-black">演出</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  文字や背景などの見せ方を通して、文章主体のまま表現の幅を少し広げられる。
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="latest" className="pt-10">
          <SectionHeading
            eyebrow="LATEST UPDATES"
            title="新着更新"
            description="最近更新された公開作品。"
            moreHref={buildMoreHref("latest")}
          />

          {latestWorks.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
              まだ公開作品がない。
            </div>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-2">
              {latestWorks.map((work) => (
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
          )}
        </section>

        <section id="weekly-new" className="pt-12">
          <SectionHeading
            eyebrow="WEEKLY NEW RECOMMEND"
            title="週間新作おすすめ"
            description="新しめの作品から入りやすくする。"
            moreHref={buildMoreHref("weekly-new")}
          />

          {weeklyNewWorks.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
              まだ公開作品がない。
            </div>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-2">
              {weeklyNewWorks.map((work) => (
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
          )}
        </section>

        <section id="overall-popular" className="pt-12">
          <SectionHeading
            eyebrow="OVERALL POPULAR"
            title="総合人気順"
            description="現時点の人気寄り順で公開作品を表示。"
            moreHref={buildMoreHref("overall-popular")}
          />

          {overallPopularWorks.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
              まだ公開作品がない。
            </div>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-2">
              {overallPopularWorks.map((work) => (
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
          )}
        </section>

        <section id="narration-popular" className="pt-12">
          <SectionHeading
            eyebrow="NARRATION POPULAR"
            title="朗読視聴人気順"
            description="朗読視聴寄りの順で公開作品を表示。"
            moreHref={buildMoreHref("narration-popular")}
          />

          {narrationPopularWorks.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
              まだ公開作品がない。
            </div>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-2">
              {narrationPopularWorks.map((work) => (
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
          )}
        </section>

        {mode ? (
          <section id="results" className="pt-12">
            <div className="border-b border-black/10 pb-3">
              <p className="text-[11px] tracking-[0.22em] text-neutral-500">
                RESULTS
              </p>
              <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">
                {resultHeading.title}
              </h2>
              <p className="mt-2 text-sm leading-7 text-neutral-600">
                {resultHeading.description}
              </p>
            </div>

            {resultWorks.length === 0 ? (
              <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
                条件に合う公開作品がない。
              </div>
            ) : (
              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-2">
                {resultWorks.map((work) => (
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
            )}
          </section>
        ) : null}

        <section id="home-ad-slot" className="pt-12">
          <PublicAdSlot
            slotId="home-bottom"
            minHeightClassName="min-h-[88px]"
          />
        </section>

        <section id="home-links" className="pt-6">
          <div className="border-t border-black/10 pt-4 text-[11px] leading-6 text-neutral-500">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-neutral-400">（使い方・取り扱い説明）</span>
              <Link href="/guide" className="transition hover:text-black">
                使い方
              </Link>
              <Link href="/faq" className="transition hover:text-black">
                FAQ
              </Link>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-neutral-400">（運営状況・お知らせ）</span>
              <Link href="/status" className="transition hover:text-black">
                運営状況
              </Link>
              <Link href="/news" className="transition hover:text-black">
                お知らせ
              </Link>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-neutral-400">（規約・お問い合わせ）</span>
              <Link href="/terms" className="transition hover:text-black">
                利用規約
              </Link>
              <Link href="/privacy" className="transition hover:text-black">
                プライバシーポリシー
              </Link>
              <Link href="/contact" className="transition hover:text-black">
                お問い合わせ
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}