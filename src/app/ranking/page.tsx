import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type SeriesRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  catch_copy?: string | null;
  synopsis?: string | null;
  body?: string | null;
};

type RecordingRow = Record<string, unknown> & {
  id: string;
  series_id?: string | null;
  seriesId?: string | null;
  like_count?: number | string | null;
  likes_count?: number | string | null;
  play_count?: number | string | null;
  plays_count?: number | string | null;
  is_public?: boolean | null;
  public?: boolean | null;
};

type EpisodeRow = Record<string, unknown> & {
  id: string;
  series_id?: string | null;
  seriesId?: string | null;
  is_published?: boolean | null;
  published?: boolean | null;
};

type RankingItem = {
  id: string;
  title: string;
  snippet: string;
  totalLikes: number;
  totalPlays: number;
  recordingCount: number;
  episodeCount: number;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function getLinkedSeriesId(row: Record<string, unknown>): string {
  const raw = row.series_id ?? row.seriesId;
  return typeof raw === "string" ? raw : "";
}

function getNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function isPublicRecording(recording: RecordingRow): boolean {
  if (recording.is_public === false) return false;
  if (recording.public === false) return false;
  return true;
}

function isPublishedEpisode(episode: EpisodeRow): boolean {
  if (episode.is_published === false) return false;
  if (episode.published === false) return false;
  return true;
}

function pickSnippet(series: SeriesRow): string {
  return (
    pickText(
      series.summary,
      series.description,
      series.catch_copy,
      series.synopsis,
      series.body
    ) || "この作品にはまだ説明文が登録されていません。"
  );
}

export default async function RankingPage() {
  const [
    { data: seriesData, error: seriesError },
    { data: recordingsData, error: recordingsError },
    { data: episodesData, error: episodesError },
  ] = await Promise.all([
    supabase.from("series").select("*").limit(100),
    supabase.from("recordings").select("*").limit(500),
    supabase.from("episodes").select("*").limit(500),
  ]);

  let errorMessage = "";
  if (seriesError) {
    console.error("ランキング用 series 取得エラー:", seriesError);
    errorMessage = "ランキングの取得中にエラーが発生しました。";
  }

  if (recordingsError) {
    console.error("ランキング用 recordings 取得エラー:", recordingsError);
  }

  if (episodesError) {
    console.error("ランキング用 episodes 取得エラー:", episodesError);
  }

  const seriesRows = ((seriesData ?? []) as SeriesRow[]).filter(
    (series) => typeof series.id === "string" && series.id.length > 0
  );

  const publicRecordings = ((recordingsData ?? []) as RecordingRow[]).filter(
    (recording) =>
      typeof recording.id === "string" &&
      recording.id.length > 0 &&
      isPublicRecording(recording)
  );

  const publishedEpisodes = ((episodesData ?? []) as EpisodeRow[]).filter(
    (episode) =>
      typeof episode.id === "string" &&
      episode.id.length > 0 &&
      isPublishedEpisode(episode)
  );

  const recordingStatMap = new Map<
    string,
    { totalLikes: number; totalPlays: number; recordingCount: number }
  >();

  for (const recording of publicRecordings) {
    const seriesId = getLinkedSeriesId(recording);
    if (!seriesId) continue;

    const current = recordingStatMap.get(seriesId) ?? {
      totalLikes: 0,
      totalPlays: 0,
      recordingCount: 0,
    };

    current.totalLikes += getNumber(
      recording.like_count ?? recording.likes_count ?? 0
    );
    current.totalPlays += getNumber(
      recording.play_count ?? recording.plays_count ?? 0
    );
    current.recordingCount += 1;

    recordingStatMap.set(seriesId, current);
  }

  const episodeCountMap = new Map<string, number>();

  for (const episode of publishedEpisodes) {
    const seriesId = getLinkedSeriesId(episode);
    if (!seriesId) continue;

    episodeCountMap.set(seriesId, (episodeCountMap.get(seriesId) ?? 0) + 1);
  }

  const rankingItems: RankingItem[] = seriesRows
    .map((series) => {
      const recordingStats = recordingStatMap.get(series.id) ?? {
        totalLikes: 0,
        totalPlays: 0,
        recordingCount: 0,
      };

      return {
        id: series.id,
        title: pickText(series.title) || "無題",
        snippet: pickSnippet(series),
        totalLikes: recordingStats.totalLikes,
        totalPlays: recordingStats.totalPlays,
        recordingCount: recordingStats.recordingCount,
        episodeCount: episodeCountMap.get(series.id) ?? 0,
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

  const partialWarning =
    !errorMessage && (Boolean(recordingsError) || Boolean(episodesError));

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