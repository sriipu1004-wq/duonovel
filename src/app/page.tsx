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
          <div className="grid gap-8 xl:grid-cols-[1.45fr_0.95fr] xl:items-start">
            <div>
              <p className="text-[11px] tracking-[0.24em] text-neutral-500">
                PRELAUNCH / NOVEL / READ / LISTEN
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                  試作公開中
                </span>
                <span className="rounded-full border border-black/10 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                  完全無料
                </span>
                <span className="rounded-full border border-black/10 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                  小説 / 朗読 / 演出
                </span>
              </div>

              <h1 className="mt-4 text-3xl font-bold leading-tight text-black sm:text-4xl xl:text-5xl">
                読む、聞く、投稿する。
                <br />
                朗読や演出も扱える小説投稿サイト。
              </h1>

              <p className="mt-5 max-w-4xl text-sm leading-8 text-neutral-700 sm:text-[15px]">
                LIB read は、小説投稿サイトとしての読みやすさを土台にしながら、
                朗読や文字・背景の演出も一緒に扱える完全無料の試作サイトです。
                まずは公開作品を読むところから入れて、朗読付き作品や、著作権切れ作品の公開がある場合はそこから、
                LIB read らしい体験の雰囲気をつかめます。
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/search"
                  className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
                >
                  作品を探す
                </Link>

                <Link
                  href="#latest"
                  className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
                >
                  公開作品を見る
                </Link>

                <Link
                  href="/guide"
                  className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
                >
                  まず使い方を見る
                </Link>

                <Link
                  href="/status"
                  className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
                >
                  現在の状態を見る
                </Link>
              </div>

              <div className="mt-8">
                <p className="text-[11px] tracking-[0.22em] text-neutral-500">
                  目次
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ExploreChip href="#prelaunch-summary" label="LIB read の特徴" />
                  <ExploreChip href="#latest" label="新着更新" />
                  <ExploreChip href="#weekly-new" label="週間新作おすすめ" />
                  <ExploreChip href="#overall-popular" label="総合人気順" />
                  <ExploreChip href="#narration-popular" label="朗読視聴人気順" />
                  <ExploreChip href="#guide-links" label="使い方・FAQ" />
                  <ExploreChip href="#status-links" label="運営状況・お知らせ" />
                  <ExploreChip href="#legal-links" label="規約・窓口" />
                  <ExploreChip href="/news" label="更新情報" />
                  <ExploreChip href="/contact" label="問い合わせ" />
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-black/10 bg-neutral-50 p-4 sm:p-5">
              <p className="text-[11px] tracking-[0.18em] text-neutral-500">
                NOW IN PROTOTYPE
              </p>
              <h2 className="mt-3 text-xl font-bold leading-tight text-black sm:text-2xl">
                今どこまで使える？
              </h2>
              <p className="mt-3 text-sm leading-7 text-neutral-600">
                LIB read は公開しながら整えている試作段階のサービスです。
                今使える範囲と、これから増やしていく部分を分けて見えるようにしている。
              </p>

              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-sm font-semibold text-black">今できること</p>
                  <p className="mt-2 text-sm leading-7 text-neutral-600">
                    公開作品を探す、読む、朗読付き作品を聞く、案内ページや規約を確認する。
                  </p>
                </div>

                <div className="rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-sm font-semibold text-black">これから増えること</p>
                  <p className="mt-2 text-sm leading-7 text-neutral-600">
                    朗読体験の向上、演出の見せ方整理、公開導線の改善、更新追跡の土台づくりを進める。
                  </p>
                </div>

                <div className="rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-sm font-semibold text-black">
                    著作権切れ作品から試せること
                  </p>
                  <p className="mt-2 text-sm leading-7 text-neutral-600">
                    著作権切れ作品の公開がある場合は、まずそこから読む・聞く・演出の雰囲気をつかみやすい。
                  </p>
                </div>

                <div className="rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-sm font-semibold text-black">更新追跡</p>
                  <p className="mt-2 text-sm leading-7 text-neutral-600">
                    今はお知らせページと運営状況ページを入口にしている。
                    通知登録の土台は今後の公開導線で整えていく。
                  </p>
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
              朗読や演出も含めて作品体験の幅を広げることを目指している。
              まずは外から見て分かる形で、その特徴を上の方にまとめている。
            </p>

            <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-black/10 bg-white p-4">
                <p className="text-sm font-semibold text-black">小説</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  探す、読む、投稿するという小説投稿サイトの基本導線を土台にしている。
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

              <div className="rounded-2xl border border-black/10 bg-white p-4">
                <p className="text-sm font-semibold text-black">試作段階</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  今使える範囲を先に見せつつ、未完成部分や今後の改善余地も明示している。
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <Link
                href="/guide"
                className="rounded-2xl border border-black/10 bg-white p-5 transition hover:border-black/20 hover:bg-neutral-50"
              >
                <p className="text-sm font-semibold text-black">初見の人向け</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  まず全体像をつかみたいときは、使い方・取り扱い説明から見る。
                </p>
              </Link>

              <Link
                href="/status"
                className="rounded-2xl border border-black/10 bg-white p-5 transition hover:border-black/20 hover:bg-neutral-50"
              >
                <p className="text-sm font-semibold text-black">今の状態を見る</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  現在使える機能、調整中の内容、今後の予定は運営状況にまとめてある。
                </p>
              </Link>

              <Link
                href="/news"
                className="rounded-2xl border border-black/10 bg-white p-5 transition hover:border-black/20 hover:bg-neutral-50"
              >
                <p className="text-sm font-semibold text-black">更新を追う</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  当面の更新追跡はお知らせページを入口にする。通知導線の土台もここにつなげやすい。
                </p>
              </Link>
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

        <section id="guide-links" className="pt-12">
          <div className="rounded-[24px] border border-black/10 bg-neutral-50 p-5 sm:p-6">
            <p className="text-[11px] tracking-[0.22em] text-neutral-500">
              GUIDE / FAQ
            </p>
            <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">
              使い方・取り扱い説明
            </h2>
            <p className="mt-2 text-sm leading-7 text-neutral-600">
              初見の人向けに、このサイトで何ができるか、どう探すか、どう読むか、朗読や演出をどう見ればいいかをまとめた。
              まず全体像をつかみたいならここから見る。
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <Link
                href="/guide"
                className="rounded-2xl border border-black/10 bg-white p-5 transition hover:border-black/20 hover:bg-neutral-50"
              >
                <p className="text-sm font-semibold text-black">使い方・取り扱い説明</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  LIB read の概要、作品の探し方、読み方、聞き方、朗読や演出の見方、試作段階についてまとめた。
                </p>
              </Link>

              <Link
                href="/faq"
                className="rounded-2xl border border-black/10 bg-white p-5 transition hover:border-black/20 hover:bg-neutral-50"
              >
                <p className="text-sm font-semibold text-black">FAQ</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  よくある疑問を短く整理した案内ページ。困ったときの入口にも使える。
                </p>
              </Link>
            </div>
          </div>
        </section>

        <section id="status-links" className="pt-12">
          <div className="rounded-[24px] border border-black/10 bg-neutral-50 p-5 sm:p-6">
            <p className="text-[11px] tracking-[0.22em] text-neutral-500">
              STATUS / NEWS
            </p>
            <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">
              運営状況・お知らせ
            </h2>
            <p className="mt-2 text-sm leading-7 text-neutral-600">
              現在どこまで使えるか、何を調整中か、最近どんな更新が入ったかをまとめた。
              試作段階の全体像を知りたいときはここから見る。
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <Link
                href="/status"
                className="rounded-2xl border border-black/10 bg-white p-5 transition hover:border-black/20 hover:bg-neutral-50"
              >
                <p className="text-sm font-semibold text-black">運営状況</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  現在使える機能、調整中の内容、既知の制限、今後の予定をまとめた。
                </p>
              </Link>

              <Link
                href="/news"
                className="rounded-2xl border border-black/10 bg-white p-5 transition hover:border-black/20 hover:bg-neutral-50"
              >
                <p className="text-sm font-semibold text-black">お知らせ</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  最近の更新履歴と、今後このサイトで更新情報を見る場所をまとめた。
                </p>
              </Link>
            </div>
          </div>
        </section>

        <section id="legal-links" className="pt-12">
          <div className="rounded-[24px] border border-black/10 bg-neutral-50 p-5 sm:p-6">
            <p className="text-[11px] tracking-[0.22em] text-neutral-500">
              POLICY / SUPPORT
            </p>
            <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">
              規約・お問い合わせ
            </h2>
            <p className="mt-2 text-sm leading-7 text-neutral-600">
              LIB read の利用条件、個人情報の取り扱い、問い合わせ窓口をまとめた。
              権利侵害申告や削除依頼を行う場合も、まずはここを確認してください。
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <Link
                href="/terms"
                className="rounded-2xl border border-black/10 bg-white p-5 transition hover:border-black/20 hover:bg-neutral-50"
              >
                <p className="text-sm font-semibold text-black">利用規約</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  禁止事項、投稿作品や朗読音声の扱い、免責などを確認できる。
                </p>
              </Link>

              <Link
                href="/privacy"
                className="rounded-2xl border border-black/10 bg-white p-5 transition hover:border-black/20 hover:bg-neutral-50"
              >
                <p className="text-sm font-semibold text-black">プライバシーポリシー</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  取得情報、利用目的、保存や問い合わせ方法を確認できる。
                </p>
              </Link>

              <Link
                href="/contact"
                className="rounded-2xl border border-black/10 bg-white p-5 transition hover:border-black/20 hover:bg-neutral-50"
              >
                <p className="text-sm font-semibold text-black">お問い合わせ</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  一般問い合わせ、権利侵害申告、削除依頼の連絡先導線。
                </p>
              </Link>
            </div>
          </div>
        </section>

        <section id="home-ad-slot" className="pt-12">
          <PublicAdSlot
            slotId="home-bottom"
            title="広告掲載予定"
            description="トップでは公開作品や案内導線を見終えた後の下部だけに限定して、読書導線を邪魔しない形で広告を載せる予定。"
            minHeightClassName="min-h-[132px]"
          />
        </section>
      </div>
    </main>
  );
}