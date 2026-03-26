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

export default async function WriteTopPage() {
  const { supabase, user } = await requireLoggedInUser("/write");
  const seriesList = await fetchOwnedSeries(user.id, supabase);

  const seriesCards = await Promise.all(
    seriesList.map(async (series) => {
      const episodes = sortEpisodes(await fetchEpisodesBySeriesId(series.id, supabase));
      const publishedCount = episodes.filter(isPublishedEpisode).length;
      const latestEpisode = episodes.length > 0 ? episodes[episodes.length - 1] : null;

      return {
        series,
        episodes,
        publishedCount,
        latestEpisodeNumber: latestEpisode ? getEpisodeNumber(latestEpisode) : null,
      };
    })
  );

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-300">執筆トップ</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">LIB READ WRITE</p>
            <h1 className="mt-3 text-3xl font-bold text-white">執筆ページ最小版</h1>
            <p className="mt-3 text-sm leading-7 text-neutral-400">
              ここでは作品作成、話追加、本文編集、公開/下書きの最小導線を扱う。
              作品設定、BGM、タグ、朗読許可などは管理画面側に分離する。
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/write/series/new"
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
              >
                新しい作品を作る
              </Link>

              <Link
                href="/manage"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                管理トップへ
              </Link>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">SERIES</p>
                <p className="mt-2 text-3xl font-semibold text-white">{seriesCards.length}</p>
                <p className="mt-2 text-sm text-neutral-400">自分が持っている作品数</p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">EPISODES</p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {seriesCards.reduce((sum, card) => sum + card.episodes.length, 0)}
                </p>
                <p className="mt-2 text-sm text-neutral-400">全作品の話数合計</p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">PUBLISHED</p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {seriesCards.reduce((sum, card) => sum + card.publishedCount, 0)}
                </p>
                <p className="mt-2 text-sm text-neutral-400">公開中の話数合計</p>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-neutral-500">MY SERIES</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">自分の作品一覧</h2>
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
                  seriesCards.map(({ series, episodes, publishedCount, latestEpisodeNumber }) => (
                    <article
                      key={series.id}
                      className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="max-w-3xl">
                          <p className="text-xs tracking-[0.18em] text-neutral-500">SERIES</p>
                          <h3 className="mt-2 text-2xl font-semibold text-white">
                            {pickText(series.title) || "無題"}
                          </h3>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-400">
                            {getSeriesSummary(series) || "あらすじ未設定"}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <Link
                            href={`/write/series/${series.id}`}
                            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                          >
                            執筆を開く
                          </Link>
                          <Link
                            href={`/manage/series/${series.id}`}
                            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                          >
                            管理へ
                          </Link>
                          <Link
                            href={`/write/series/${series.id}/episodes/new`}
                            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                          >
                            話を追加
                          </Link>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
                          総話数: <span className="font-semibold text-white">{episodes.length}</span>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
                          公開中: <span className="font-semibold text-white">{publishedCount}</span>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
                          最新話:{" "}
                          <span className="font-semibold text-white">
                            {latestEpisodeNumber ? `第${latestEpisodeNumber}話` : "未作成"}
                          </span>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
