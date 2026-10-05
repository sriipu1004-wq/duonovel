import Link from "next/link";
import {
  getCachedPublicBaseWorkCards,
  getCachedPublicRecordingAggregates,
} from "@/lib/publicWorks";
import { runReadOnlyWithRetry } from "@/lib/reliability/readOnly";

export const dynamic = "force-dynamic";

type RankingItem = {
  id: string;
  title: string;
  snippet: string;
  totalLikes: number;
  totalPlays: number;
  recordingCount: number;
  episodeCount: number;
};

export default async function RankingPage() {
  let errorMessage = "";
  let partialWarning = false;
  let workCards: Awaited<ReturnType<typeof getCachedPublicBaseWorkCards>> = [];
  try {
    workCards = await runReadOnlyWithRetry(
      () =>
        getCachedPublicBaseWorkCards({
          visibility: "all",
          ignoreContentLanguageFilter: true,
          ignorePublicSearchLanguageFilter: true,
          prioritizeForUiLocale: false,
        }),
      { operation: "ranking public works", timeoutMs: 3000, retries: 0 }
    );
  } catch (error) {
    console.error(
      "[ranking] public works unavailable",
      error instanceof Error ? error.message : String(error)
    );
    errorMessage = "ランキングの取得中にエラーが発生しました。";
  }

  let recordingAggregateMap = new Map<
    string,
    {
      totalRecordingLikes: number;
      totalRecordingPlays: number;
      totalRecordingCount: number;
    }
  >();
  if (workCards.length > 0) {
    try {
      const aggregates = await runReadOnlyWithRetry(
        () =>
          getCachedPublicRecordingAggregates(
            workCards.map((work) => work.seriesId)
          ),
        { operation: "ranking recording aggregates", timeoutMs: 2000, retries: 0 }
      );
      recordingAggregateMap = new Map(
        aggregates.map((aggregate) => [aggregate.seriesId, aggregate])
      );
    } catch (error) {
      console.warn(
        "[ranking] recording aggregates unavailable",
        error instanceof Error ? error.message : String(error)
      );
      partialWarning = true;
    }
  }

  const rankingItems: RankingItem[] = workCards
    .map((work) => {
      const recordingStats = recordingAggregateMap.get(work.seriesId) ?? {
        totalRecordingLikes: 0,
        totalRecordingPlays: 0,
        totalRecordingCount: 0,
      };
      return {
        id: work.seriesId,
        title: work.title,
        snippet: work.summary,
        totalLikes: recordingStats.totalRecordingLikes,
        totalPlays: recordingStats.totalRecordingPlays,
        recordingCount: recordingStats.totalRecordingCount,
        episodeCount: work.episodeCount,
      };
    })
    .sort((a, b) => {
      if (b.totalLikes !== a.totalLikes) return b.totalLikes - a.totalLikes;
      if (b.totalPlays !== a.totalPlays) return b.totalPlays - a.totalPlays;
      if (b.recordingCount !== a.recordingCount) {
        return b.recordingCount - a.recordingCount;
      }
      if (b.episodeCount !== a.episodeCount) {
        return b.episodeCount - a.episodeCount;
      }
      return a.title.localeCompare(b.title, "ja");
    });

  return (
    <main className="min-h-screen bg-[#050510] px-6 py-8 text-[#f5f5f5]">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/" className="hover:text-neutral-300">
            TOP
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-300">ランキング</span>
        </div>

        <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs tracking-[0.24em] text-neutral-500">
                RANKING
              </p>
              <h1 className="mt-3 text-3xl font-bold text-white">
                人気作品ランキング
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-300">
                今は最小版として、公開朗読のいいね数、再生数、公開朗読数、公開話数の順で並べています。
                日間・週間ではなく、まずは人気作品一覧として成立させるための土台です。
              </p>
            </div>

            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300">
              作品数: {rankingItems.length}件
            </div>
          </div>
        </section>

        <section className="mt-8">
          {errorMessage ? (
            <div className="rounded-[24px] border border-red-400/20 bg-red-400/10 p-4 text-sm leading-7 text-red-200">
              {errorMessage}
            </div>
          ) : null}

          {partialWarning ? (
            <div className="mb-4 rounded-[24px] border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm leading-7 text-yellow-100">
              一部の補助データを取得できなかったため、暫定的なランキング表示になっています。
            </div>
          ) : null}

          {!errorMessage && rankingItems.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-6 text-sm leading-7 text-neutral-400">
              まだランキングに表示できる作品がありません。
            </div>
          ) : null}

          {rankingItems.length > 0 ? (
            <div className="grid gap-4">
              {rankingItems.map((item, index) => (
                <article
                  key={item.id}
                  className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-black">
                          #{index + 1}
                        </span>
                        <p className="text-xs tracking-[0.18em] text-neutral-500">
                          WORK RANKING
                        </p>
                      </div>

                      <h2 className="mt-3 text-xl font-semibold text-white">
                        {item.title}
                      </h2>

                      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-300">
                        {item.snippet}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-400">
                        <span className="rounded-full border border-white/10 px-3 py-1">
                          いいね {item.totalLikes}
                        </span>
                        <span className="rounded-full border border-white/10 px-3 py-1">
                          再生 {item.totalPlays}
                        </span>
                        <span className="rounded-full border border-white/10 px-3 py-1">
                          公開朗読 {item.recordingCount}件
                        </span>
                        <span className="rounded-full border border-white/10 px-3 py-1">
                          公開話数 {item.episodeCount}話
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <Link
                        href={`/works/${item.id}`}
                        className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white px-4 text-sm font-semibold text-black transition hover:opacity-90"
                      >
                        作品ページへ
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}