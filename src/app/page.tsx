import type { Metadata } from "next";
import Link from "next/link";
import PublicWorkBoardCard from "@/components/public/PublicWorkBoardCard";
import {
  getCachedPublicBaseWorkCards,
  getCachedPublicRecordingAggregates,
} from "@/lib/publicWorks";
import { pickText } from "@/features/write/writeShared";
import PublicAdSlot from "@/components/ads/PublicAdSlot";
import { createClient as createServerClient } from "@/lib/supabase/server";

const HOME_DESCRIPTION =
  "外国語の長編を管理して読む個人本棚、多言語対訳、読み上げ、AI物語生成、Web小説の閲覧・投稿に対応した読書サービスです。";

export const metadata: Metadata = {
  title: "個人本棚・多言語対訳・AI物語・Web小説 | LIB read",
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
        <p className="text-[11px] tracking-[0.22em] text-neutral-500">{eyebrow}</p>
        <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">{title}</h2>
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

function WorkGrid({ works }: { works: WorkCard[] }) {
  if (works.length === 0) {
    return (
      <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
        条件に合う公開作品がない。
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

function ResultHeading({ mode, tag }: { mode: string; tag: string }) {
  if (mode === "latest") {
    return { title: "新着更新の結果", description: "新着更新順で表示中。" };
  }
  if (mode === "weekly-new") {
    return { title: "週間新作おすすめの結果", description: "新作寄りの順で表示中。" };
  }
  if (mode === "overall-popular") {
    return { title: "総合人気順の結果", description: "公開中作品を人気寄りの順で表示中。" };
  }
  if (mode === "narration-popular") {
    return { title: "朗読視聴人気順の結果", description: "朗読視聴寄りの順で表示中。" };
  }
  if (mode === "tag" && tag) {
    return { title: `${tag} の結果`, description: "タグ一致作品を人気寄りの順で表示中。" };
  }
  return { title: "検索結果", description: "条件に合う公開作品を表示中。" };
}

export default async function PublicTopPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const mode = pickText(resolvedSearchParams?.mode);
  const tag = pickText(resolvedSearchParams?.tag);

  const [baseWorkCards, authSupabase] = await Promise.all([
    getCachedPublicBaseWorkCards(),
    createServerClient(),
  ]);
  const [recordingAggregates, authResult] = await Promise.all([
    getCachedPublicRecordingAggregates(baseWorkCards.map((work) => work.seriesId)),
    authSupabase.auth.getUser(),
  ]);
  const currentUser = authResult.data.user;

  const recordingAggregateMap = new Map(
    recordingAggregates.map((aggregate) => [aggregate.seriesId, aggregate])
  );
  const workCards: WorkCard[] = baseWorkCards.map((work) => {
    const aggregate = recordingAggregateMap.get(work.seriesId) ?? {
      totalRecordingLikes: 0,
      totalRecordingPlays: 0,
      totalRecordingCount: 0,
    };
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
      popularityScore:
        aggregate.totalRecordingPlays * 3 +
        aggregate.totalRecordingLikes * 10 +
        aggregate.totalRecordingCount * 5 +
        work.episodeCount,
    };
  });

  let bookmarkedSeriesIds = new Set<string>();
  if (currentUser) {
    const { data } = await authSupabase
      .from("user_series_bookmarks")
      .select("series_id")
      .eq("user_id", currentUser.id);
    bookmarkedSeriesIds = new Set(
      (data ?? [])
        .map((row) => (typeof row.series_id === "string" ? row.series_id : ""))
        .filter((value) => value.length > 0)
    );
  }

  const latestWorks = sortLatest(workCards).slice(0, 4);
  const weeklyNewWorks = sortWeeklyNew(workCards).slice(0, 4);
  const overallPopularWorks = sortOverallPopular(workCards).slice(0, 4);
  const narrationPopularWorks = sortNarrationPopular(workCards).slice(0, 4);
  const bookmarkedWorks = sortLatest(
    workCards.filter((work) => bookmarkedSeriesIds.has(work.seriesId))
  ).slice(0, 4);

  const filteredForResults =
    mode === "tag" && tag ? workCards.filter((work) => work.tags.includes(tag)) : workCards;
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
          <div className="max-w-5xl">
            <p className="text-[11px] tracking-[0.24em] text-neutral-500">NOVEL / READ / LISTEN / LEARN</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-black/10 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">無料枠あり</span>
              <span className="rounded-full border border-black/10 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">個人本棚 / 多言語対訳 / 読み上げ / AI生成</span>
            </div>
            <h1 className="mt-4 text-3xl font-bold leading-tight text-black sm:text-4xl xl:text-5xl">
              読む、聴く、学ぶ。
              <br />
              外国語の長編を、自分の本棚で読み続ける。多言語対訳、読み上げ、AI物語、Web小説にも対応。
            </h1>
            <p className="mt-5 max-w-4xl text-sm leading-8 text-neutral-700 sm:text-[15px]">
              PDF・EPUB・TXT・DOCXを作品単位で取り込み、章・話ごとの読書位置、対訳、栞を管理できます。公開作品を読む・聴く・投稿する機能と、時間に合わせたAI物語生成も同じ場所で利用できます。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/generate" className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800">物語を生成する</Link>
              <Link href="/library" className="rounded-full border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-medium text-violet-900 transition hover:bg-violet-100">個人本棚を開く</Link>
              <Link href="/search" className="rounded-full border border-black/10 bg-neutral-100 px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-200">作品を探す</Link>
              <Link href="/write" className="rounded-full border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-medium text-black transition hover:bg-sky-100">作品を投稿する</Link>
              <Link href="/record" className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50">作品を朗読する</Link>
            </div>
            <div className="mt-8">
              <p className="text-[11px] tracking-[0.22em] text-neutral-500">目次</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <ExploreChip href="#prelaunch-summary" label="LIB read の特徴" />
                <ExploreChip href="#subscription" label="月額680円サブスク" />
                <ExploreChip href="#bookmark-updates" label="ブックマーク更新" />
                <ExploreChip href="#latest" label="新着更新" />
                <ExploreChip href="#weekly-new" label="週間新作おすすめ" />
                <ExploreChip href="#overall-popular" label="総合人気順" />
                <ExploreChip href="#narration-popular" label="朗読視聴人気順" />
              </div>
            </div>
          </div>
        </section>

        <section id="subscription" className="pt-10">
          <div className="overflow-hidden rounded-[28px] bg-neutral-950 px-5 py-7 text-white sm:px-8 sm:py-9">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-3xl">
                <p className="text-[11px] tracking-[0.22em] text-sky-300">MONTHLY SUBSCRIPTION</p>
                <h2 className="mt-2 text-2xl font-bold">月額680円で、長編の対訳を止めずに読む。</h2>
                <p className="mt-3 text-sm leading-7 text-neutral-300">
                  単語解説は無制限。AI物語は1日10回、対訳生成は1日30回へ拡大し、読書中に次話の対訳を1話だけ先読みします。
                </p>
              </div>
              <Link href="/subscription" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-100">
                無料版との違いを見る
              </Link>
            </div>
          </div>
        </section>

        <section id="prelaunch-summary" className="pt-10">
          <div className="rounded-[24px] border border-black/10 bg-neutral-50 p-5 sm:p-6">
            <p className="text-[11px] tracking-[0.22em] text-neutral-500">WHY LIB READ</p>
            <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">LIB read の特徴</h2>
            <p className="mt-2 text-sm leading-7 text-neutral-600">長編を読む・聴く・作る・学ぶための機能を、作品単位で管理する。</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-black/10 bg-white p-4">
                <p className="text-sm font-semibold text-black">個人本棚</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">自分で用意したPDF・EPUB・TXT・DOCXを取り込み、長編を章・話単位で管理して続きから読める。</p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-white p-4">
                <p className="text-sm font-semibold text-black">多言語対訳</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">原文と訳文を上下で同期し、語の意味・品詞も確認できる。保存済み対訳は再利用する。</p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-white p-4">
                <p className="text-sm font-semibold text-black">読み上げ・栞</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">ブラウザ読み上げと投稿朗読に対応。読書位置や栞、表示・朗読設定を保持する。</p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-white p-4">
                <p className="text-sm font-semibold text-black">AI物語・投稿</p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">読む時間に合わせた物語を生成し、保存後は作品ワークスペースで編集・続編生成・投稿ができる。</p>
              </div>
            </div>
          </div>
        </section>

        <section id="bookmark-updates" className="pt-10">
          <SectionHeading
            eyebrow="BOOKMARK UPDATES"
            title="ブックマーク更新"
            description={currentUser ? "ブックマークした作品のうち、最近更新された作品。" : "ログインすると、ブックマークした作品の更新をここで確認できる。"}
            moreHref={currentUser ? "/search?saved=bookmarked-works&order=updated" : "/login?next=/"}
          />
          {currentUser ? (
            <WorkGrid works={bookmarkedWorks} />
          ) : (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
              ブックマーク更新を表示するにはログインが必要。{" "}
              <Link href="/login?next=/" className="font-medium text-black underline underline-offset-4">ログインする</Link>
            </div>
          )}
        </section>

        <section id="latest" className="pt-10">
          <SectionHeading eyebrow="LATEST UPDATES" title="新着更新" description="最近更新された公開作品。" moreHref={buildMoreHref("latest")} />
          <WorkGrid works={latestWorks} />
        </section>
        <section id="weekly-new" className="pt-12">
          <SectionHeading eyebrow="WEEKLY NEW RECOMMEND" title="週間新作おすすめ" description="新しめの作品から入りやすくする。" moreHref={buildMoreHref("weekly-new")} />
          <WorkGrid works={weeklyNewWorks} />
        </section>
        <section id="overall-popular" className="pt-12">
          <SectionHeading eyebrow="OVERALL POPULAR" title="総合人気順" description="現時点の人気寄り順で公開作品を表示。" moreHref={buildMoreHref("overall-popular")} />
          <WorkGrid works={overallPopularWorks} />
        </section>
        <section id="narration-popular" className="pt-12">
          <SectionHeading eyebrow="NARRATION POPULAR" title="朗読視聴人気順" description="朗読視聴寄りの順で公開作品を表示。" moreHref={buildMoreHref("narration-popular")} />
          <WorkGrid works={narrationPopularWorks} />
        </section>

        {mode ? (
          <section id="results" className="pt-12">
            <div className="border-b border-black/10 pb-3">
              <p className="text-[11px] tracking-[0.22em] text-neutral-500">RESULTS</p>
              <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">{resultHeading.title}</h2>
              <p className="mt-2 text-sm leading-7 text-neutral-600">{resultHeading.description}</p>
            </div>
            <WorkGrid works={resultWorks} />
          </section>
        ) : null}

        <section id="home-ad-slot" className="pt-12"><PublicAdSlot slotId="home-bottom" minHeightClassName="min-h-[88px]" /></section>
        <section id="home-links" className="pt-6">
          <div className="border-t border-black/10 pt-4 text-[11px] leading-6 text-neutral-500">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1"><span className="text-neutral-400">サービス案内</span><Link href="/guide" className="transition hover:text-black">使い方</Link><Link href="/faq" className="transition hover:text-black">FAQ</Link></div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1"><span className="text-neutral-400">運営情報</span><Link href="/status" className="transition hover:text-black">運営状況</Link><Link href="/news" className="transition hover:text-black">お知らせ</Link></div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1"><span className="text-neutral-400">規約・連絡</span><Link href="/terms" className="transition hover:text-black">利用規約</Link><Link href="/privacy" className="transition hover:text-black">プライバシーポリシー</Link><Link href="/commercial-transactions" className="transition hover:text-black">特定商取引法に基づく表記</Link><Link href="/contact" className="transition hover:text-black">お問い合わせ</Link></div>
          </div>
        </section>
      </div>
    </main>
  );
}
