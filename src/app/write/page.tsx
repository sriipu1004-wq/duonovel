import Link from "next/link";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import {
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  pickText,
  sortEpisodes,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";

async function fetchOwnedSeries(
  userId: string,
  supabase: Awaited<ReturnType<typeof requireLoggedInUser>>["supabase"]
) {
  const byAuthorId = await supabase
    .from("series")
    .select("*")
    .eq("author_id", userId)
    .order("created_at", { ascending: false });

  const byUserId = await supabase
    .from("series")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (byAuthorId.error && byUserId.error) {
    throw new Error(`series の取得に失敗: ${byAuthorId.error.message}`);
  }

  const rows = [
    ...((byAuthorId.data ?? []) as SeriesRow[]),
    ...((byUserId.data ?? []) as SeriesRow[]),
  ];

  const unique = new Map<string, SeriesRow>();

  for (const row of rows) {
    if (typeof row.id === "string" && row.id.trim().length > 0) {
      unique.set(row.id, row);
    }
  }

  return Array.from(unique.values()).sort((left, right) => {
    const leftTime = getTimeValue(left.created_at);
    const rightTime = getTimeValue(right.created_at);

    return rightTime - leftTime;
  });
}

async function fetchEpisodesBySeriesId(
  seriesId: string,
  supabase: Awaited<ReturnType<typeof requireLoggedInUser>>["supabase"]
): Promise<EpisodeRow[]> {
  const firstTry = await supabase
    .from("episodes")
    .select("*")
    .eq("series_id", seriesId);

  if (!firstTry.error) {
    return (firstTry.data ?? []) as EpisodeRow[];
  }

  const secondTry = await supabase
    .from("episodes")
    .select("*")
    .eq("seriesId", seriesId);

  if (!secondTry.error) {
    return (secondTry.data ?? []) as EpisodeRow[];
  }

  return [];
}

function getTimeValue(value: unknown): number {
  if (typeof value !== "string" || value.trim().length === 0) {
    return 0;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
}

function getSeriesTitle(series: SeriesRow): string {
  return pickText(series.title) || "無題";
}

function getSeriesSummaryText(series: SeriesRow): string {
  return pickText(series.summary, series.description, series.catch_copy);
}

function getPublicationLabel(series: SeriesRow, episodes: EpisodeRow[]): string {
  const publicationStatus = getSeriesPublicationStatus(series);

  if (publicationStatus !== "public") {
    return "非公開";
  }

  const publicVisibleCount = episodes.filter((episode) =>
    isEpisodePubliclyVisible(episode)
  ).length;

  return publicVisibleCount > 0 ? "公開" : "公開準備";
}

function getPublicationClass(series: SeriesRow, episodes: EpisodeRow[]): string {
  const publicationStatus = getSeriesPublicationStatus(series);

  if (publicationStatus !== "public") {
    return "border-neutral-200 bg-neutral-50 text-neutral-700";
  }

  const publicVisibleCount = episodes.filter((episode) =>
    isEpisodePubliclyVisible(episode)
  ).length;

  return publicVisibleCount > 0
    ? "border-sky-200 bg-sky-50 text-black"
    : "border-sky-100 bg-sky-50/60 text-neutral-700";
}

function getRecordingPermissionLabel(series: SeriesRow): string {
  const mode = pickText(
    series.recording_permission_mode,
    series.recordingPermissionMode
  );

  if (mode === "open") {
    return "朗読許可";
  }

  if (mode === "approval_required") {
    return "承認制";
  }

  return "朗読不可";
}

function getRecordingPermissionClass(series: SeriesRow): string {
  const mode = pickText(
    series.recording_permission_mode,
    series.recordingPermissionMode
  );

  if (mode === "open") {
    return "border-sky-200 bg-sky-50 text-black";
  }

  if (mode === "approval_required") {
    return "border-neutral-200 bg-white text-neutral-700";
  }

  return "border-neutral-200 bg-neutral-50 text-neutral-600";
}

function formatUpdatedLabel(series: SeriesRow): string {
  const rawValue = pickText(series.updated_at, series.created_at);
  const timestamp = getTimeValue(rawValue);

  if (timestamp <= 0) {
    return "";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

export default async function WriteTopPage() {
  const { supabase, user } = await requireLoggedInUser("/write");
  const seriesList = await fetchOwnedSeries(user.id, supabase);

  const seriesCards = await Promise.all(
    seriesList.map(async (series) => {
      const episodes = sortEpisodes(
        await fetchEpisodesBySeriesId(series.id, supabase)
      );

      return {
        series,
        episodes,
        episodeCount: episodes.length,
        publicationLabel: getPublicationLabel(series, episodes),
        publicationClass: getPublicationClass(series, episodes),
        recordingPermissionLabel: getRecordingPermissionLabel(series),
        recordingPermissionClass: getRecordingPermissionClass(series),
        updatedLabel: formatUpdatedLabel(series),
      };
    })
  );

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-700">投稿データベース</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ WRITE
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-black">
                  投稿データベース
                </h1>
                <p className="mt-3 text-sm leading-7 text-neutral-600">
                  公開前の下書きから公開中の作品まで、投稿作品をまとめて管理する。
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/write/series/new"
                  className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  新しい作品を作る
                </Link>

                <Link
                  href="/mypage"
                  className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
                >
                  マイページへ
                </Link>
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <section className="rounded-[28px] border border-black/10 bg-white p-5">
              <div>
                <p className="text-xs tracking-[0.18em] text-neutral-500">
                  MY SERIES
                </p>
                <h2 className="mt-2 text-xl font-semibold text-black">
                  作品一覧
                </h2>
              </div>

              <div className="mt-4 grid gap-4">
                {seriesCards.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-black/15 bg-neutral-50 px-4 py-4 text-sm leading-7 text-neutral-600">
                    まだ作品がない。上のボタンから新しい作品を作成できる。
                  </div>
                ) : (
                  seriesCards.map(
                    ({
                      series,
                      episodeCount,
                      publicationLabel,
                      publicationClass,
                      recordingPermissionLabel,
                      recordingPermissionClass,
                      updatedLabel,
                    }) => {
                      const title = getSeriesTitle(series);
                      const summary = getSeriesSummaryText(series);
                      const workspaceHref = `/write/series/${series.id}`;

                      return (
                        <article
                          key={series.id}
                          className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
<span
                                  className={[
                                    "rounded-full border px-3 py-1 text-xs",
                                    publicationClass,
                                  ].join(" ")}
                                >
                                  公開状況 {publicationLabel}
                                </span>

                                <span
                                  className={[
                                    "rounded-full border px-3 py-1 text-xs",
                                    recordingPermissionClass,
                                  ].join(" ")}
                                >
                                  朗読状態 {recordingPermissionLabel}
                                </span>

                                <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
                                  話数 {episodeCount}
                                </span>
                              </div>

                              <h3 className="mt-3 text-2xl font-semibold leading-tight text-black">
                                <Link
                                  href={workspaceHref}
                                  className="transition hover:text-sky-700"
                                >
                                  {title}
                                </Link>
                              </h3>

                              {summary ? (
                                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-600">
                                  {summary}
                                </p>
                              ) : null}

                              {updatedLabel ? (
                                <p className="mt-3 text-xs text-neutral-500">
                                  最終更新 {updatedLabel}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      );
                    }
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