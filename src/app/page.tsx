import Link from "next/link";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import {
  getEpisodeNumber,
  getSeriesSummary,
  isPublishedEpisode,
  pickText,
  sortEpisodes,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";

async function fetchOwnedSeries(
  userId: string,
  supabase: Awaited<ReturnType<typeof requireLoggedInUser>>["supabase"]
) {
  const { data, error } = await supabase
    .from("series")
    .select("*")
    .eq("author_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`series の取得に失敗: ${error.message}`);
  }

  return (data ?? []) as SeriesRow[];
}

async function fetchEpisodesBySeriesId(
  seriesId: string,
  supabase: Awaited<ReturnType<typeof requireLoggedInUser>>["supabase"]
): Promise<EpisodeRow[]> {
  const firstTry = await supabase.from("episodes").select("*").eq("series_id", seriesId);
  if (!firstTry.error) {
    return (firstTry.data ?? []) as EpisodeRow[];
  }

  const secondTry = await supabase.from("episodes").select("*").eq("seriesId", seriesId);
  if (!secondTry.error) {
    return (secondTry.data ?? []) as EpisodeRow[];
  }

  return [];
}

function buildSeriesState(episodes: EpisodeRow[], publishedCount: number) {
  if (episodes.length === 0) {
    return "準備中";
  }

  if (publishedCount === 0) {
    return "執筆中";
  }

  if (publishedCount < episodes.length) {
    return "公開 + 下書き";
  }

  return "公開中";
}

function buildNextAction(seriesId: string, episodes: EpisodeRow[]) {
  const latestEpisode = episodes.length > 0 ? episodes[episodes.length - 1] : null;
  const latestDraft =
    [...episodes].reverse().find((episode) => !isPublishedEpisode(episode)) ?? null;

  if (episodes.length === 0) {
    return {
      label: "1話目を作る",
      href: `/write/series/${seriesId}/episodes/new`,
      description: "まずはこの作品の最初の話を書く。",
    };
  }

  if (latestDraft) {
    const episodeNumber = getEpisodeNumber(latestDraft);
    return {
      label: `下書き中の第${episodeNumber}話を続ける`,
      href: `/write/series/${seriesId}/episodes/${latestDraft.id}`,
      description: "まだ公開していない話を仕上げる。",
    };
  }

  if (latestEpisode) {
    const nextNumber = getEpisodeNumber(latestEpisode) + 1;
    return {
      label: `第${nextNumber}話を追加する`,
      href: `/write/series/${seriesId}/episodes/new`,
      description: "公開済みの続きとして次の話を書く。",
    };
  }

  return {
    label: "作品ワークスペースを開く",
    href: `/write/series/${seriesId}`,
    description: "作品情報と話一覧を確認する。",
  };
}

export default async function WriteTopPage() {
  const { supabase, user } = await requireLoggedInUser("/write");
  const seriesList = await fetchOwnedSeries(user.id, supabase);

  const seriesCards = await Promise.all(
    seriesList.map(async (series) => {
      const episodes = sortEpisodes(await fetchEpisodesBySeriesId(series.id, supabase));
      const publishedCount = episodes.filter(
  (episode) => isPublishedEpisode(episode)
).length;
      const draftCount = episodes.length - publishedCount;
      const latestEpisode = episodes.length > 0 ? episodes[episodes.length - 1] : null;
      const latestDraft =
        [...episodes].reverse().find((episode) => !isPublishedEpisode(episode)) ?? null;
      const nextAction = buildNextAction(series.id, episodes);

      return {
        series,
        episodes,
        publishedCount,
        draftCount,
        latestEpisode,
        latestDraft,
        latestEpisodeNumber: latestEpisode ? getEpisodeNumber(latestEpisode) : null,
        stateLabel: buildSeriesState(episodes, publishedCount),
        nextAction,
      };
    })
  );

  const totalEpisodes = seriesCards.reduce((sum, card) => sum + card.episodes.length, 0);
  const totalPublished = seriesCards.reduce((sum, card) => sum + card.publishedCount, 0);
  const totalDrafts = seriesCards.reduce((sum, card) => sum + card.draftCount, 0);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-300">作品ワークスペース一覧</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">LIB READ WRITE</p>
            <h1 className="mt-3 text-3xl font-bold text-white">
              作品ワークスペース一覧
            </h1>
            <p className="mt-3 text-sm leading-7 text-neutral-400">
              ここは新規作品作成と、自分の作品ワークスペース一覧の入口。
              作者向けの実作業は作品ワークスペースへ寄せ、
              1話目作成、次話追加、本文編集、作品情報、作品共通BGM、基本演出をそこから進める。
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/write/series/new"
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
              >
                新しい作品を作る
              </Link>

              <Link
                href="/mypage"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                マイページへ
              </Link>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <section className="grid gap-4 md:grid-cols-4">
              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">SERIES</p>
                <p className="mt-2 text-3xl font-semibold text-white">{seriesCards.length}</p>
                <p className="mt-2 text-sm text-neutral-400">自分が持っている作品数</p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">EPISODES</p>
                <p className="mt-2 text-3xl font-semibold text-white">{totalEpisodes}</p>
                <p className="mt-2 text-sm text-neutral-400">全作品の話数合計</p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">PUBLISHED</p>
                <p className="mt-2 text-3xl font-semibold text-white">{totalPublished}</p>
                <p className="mt-2 text-sm text-neutral-400">公開中の話数合計</p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">DRAFT</p>
                <p className="mt-2 text-3xl font-semibold text-white">{totalDrafts}</p>
                <p className="mt-2 text-sm text-neutral-400">まだ公開していない話数</p>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">START GUIDE</p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                このページでやること
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold text-white">1. 作品を作る</p>
                  <p className="mt-2 text-sm leading-7 text-neutral-400">
                    まずはタイトルとあらすじだけで作品を作る。
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold text-white">
                    2. 作品ワークスペースを開く
                  </p>
                  <p className="mt-2 text-sm leading-7 text-neutral-400">
                    作品ごとの作業本体へ入り、話追加や作品の肉付けを進める。
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold text-white">3. 本文編集へ進む</p>
                  <p className="mt-2 text-sm leading-7 text-neutral-400">
                    各話ページで本文を編集し、必要に応じてワークスペースへ戻る。
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-neutral-500">MY SERIES</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">自分の作品一覧</h2>
                  <p className="mt-2 text-sm leading-7 text-neutral-400">
                    各作品カードから、その作品のワークスペースか、今やるべき本文作業へ直接入る。
                  </p>
                </div>

                <Link
                  href="/write/series/new"
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                >
                  作品を追加
                </Link>
              </div>

              <div className="mt-4 grid gap-4">
                {seriesCards.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-neutral-400">
                    まだ作品がない。まずは「新しい作品を作る」から1本目を作成する。
                  </div>
                ) : (
                  seriesCards.map(
                    ({
                      series,
                      episodes,
                      publishedCount,
                      draftCount,
                      latestEpisode,
                      latestDraft,
                      latestEpisodeNumber,
                      stateLabel,
                      nextAction,
                    }) => (
                      <article
                        key={series.id}
                        className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="max-w-3xl">
                            <div className="flex flex-wrap items-center gap-3">
                              <p className="text-xs tracking-[0.18em] text-neutral-500">SERIES</p>
                              <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-neutral-300">
                                {stateLabel}
                              </span>
                            </div>

                            <h3 className="mt-2 text-2xl font-semibold text-white">
                              {pickText(series.title) || "無題"}
                            </h3>

                            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-400">
                              {getSeriesSummary(series) || "あらすじ未設定"}
                            </p>

                            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                              <p className="text-xs tracking-[0.18em] text-neutral-500">NEXT STEP</p>
                              <p className="mt-2 text-base font-semibold text-white">
                                {nextAction.label}
                              </p>
                              <p className="mt-2 text-sm leading-7 text-neutral-400">
                                {nextAction.description}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <Link
                              href={nextAction.href}
                              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
                            >
                              {nextAction.label}
                            </Link>

                            <Link
                              href={`/write/series/${series.id}`}
                              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                            >
                              作品ワークスペース
                            </Link>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-4">
                          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
                            総話数: <span className="font-semibold text-white">{episodes.length}</span>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
                            公開中: <span className="font-semibold text-white">{publishedCount}</span>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
                            下書き: <span className="font-semibold text-white">{draftCount}</span>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
                            最新話:{" "}
                            <span className="font-semibold text-white">
                              {latestEpisodeNumber ? `第${latestEpisodeNumber}話` : "未作成"}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                            <p className="text-xs tracking-[0.18em] text-neutral-500">LATEST DRAFT</p>
                            <p className="mt-2 text-base font-semibold text-white">
                              {latestDraft
                                ? `第${getEpisodeNumber(latestDraft)}話`
                                : "下書きはなし"}
                            </p>
                            <p className="mt-2 text-sm leading-7 text-neutral-400">
                              {latestDraft
                                ? "まだ公開していない話がある。続きを書くならここから入る。"
                                : "未公開の話はない。次の話を追加して続きへ進める。"}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                            <p className="text-xs tracking-[0.18em] text-neutral-500">PUBLIC VIEW</p>
                            <p className="mt-2 text-base font-semibold text-white">
                              {publishedCount > 0 ? "読者向け表示あり" : "まだ未公開"}
                            </p>
                            <p className="mt-2 text-sm leading-7 text-neutral-400">
                              {publishedCount > 0
                                ? "公開済みの話があるので、作品ページや読む画面で見え方を確認できる。"
                                : "読者に見える状態の話はまだない。まずは1話公開を目標にする。"}
                            </p>

                            <div className="mt-3 flex flex-wrap gap-3">
                              <Link
                                href={`/works/${series.id}`}
                                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                              >
                                作品ページを見る
                              </Link>

                              {latestEpisode ? (
                                <Link
                                  href={`/write/series/${series.id}/episodes/${latestEpisode.id}`}
                                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                                >
                                  最新話を編集
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </article>
                    )
                  )
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}