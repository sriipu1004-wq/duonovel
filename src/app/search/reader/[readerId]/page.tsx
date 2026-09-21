import Link from "next/link";
import PublicWorkBoardCard from "@/components/public/PublicWorkBoardCard";
import {
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  pickText,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { getUiLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/navigation";
import { isR18Series } from "@/lib/contentRating";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";
import { getCachedPublicBaseWorkCards } from "@/lib/publicWorks";
import { isPublishedHumanRecording } from "@/lib/recording/humanRecordingState";
import { createAdminClient } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{ readerId: string }>;
  searchParams?: Promise<{ order?: string }>;
};

type Row = Record<string, unknown> & { id: string };

type NarratedWork = {
  id: string;
  title: string;
  summary: string;
  authorName: string;
  latestPostedLabel: string;
  updatedAt: string;
  count: number;
  likes: number;
  plays: number;
  tags: string[];
};

function text(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function time(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export default async function ReaderSearchPage({
  params,
  searchParams,
}: Props) {
  const locale = await getUiLocale();
  const copy = {
    ja: {
      breadcrumb: "朗読者",
      title: (name: string) => `${name} の公開Human narration`,
      updated: "更新順",
      popular: "人気順",
      empty: "この朗読者の公開Human narrationはまだない。",
      authorUnset: "作者名未設定",
      narratorFallback: "朗読者",
      narrationCount: (value: number) => `Human narration ${value}件`,
      likes: (value: number) => `いいね ${value}`,
      plays: (value: number) => `再生 ${value}`,
    },
    en: {
      breadcrumb: "Narrator",
      title: (name: string) => `Published human narration by ${name}`,
      updated: "Updated",
      popular: "Popular",
      empty: "This narrator has no published human narration yet.",
      authorUnset: "Author not set",
      narratorFallback: "Narrator",
      narrationCount: (value: number) => `Human narration ${value}`,
      likes: (value: number) => `Likes ${value}`,
      plays: (value: number) => `Plays ${value}`,
    },
    ko: {
      breadcrumb: "낭독자",
      title: (name: string) => `${name}의 공개 Human narration`,
      updated: "업데이트순",
      popular: "인기순",
      empty: "이 낭독자의 공개 Human narration은 아직 없습니다.",
      authorUnset: "작가 미설정",
      narratorFallback: "낭독자",
      narrationCount: (value: number) => `Human narration ${value}건`,
      likes: (value: number) => `좋아요 ${value}`,
      plays: (value: number) => `재생 ${value}`,
    },
  }[locale];

  const { readerId } = await params;
  const query = searchParams ? await searchParams : undefined;
  const order = query?.order === "popular" ? "popular" : "updated";
  const href = (value: string) => localizePath(value, locale);
  const db = createAdminClient();

  const [first, second, preference, baseWorks] = await Promise.all([
    db.from("recordings").select("*").eq("reader_id", readerId),
    db.from("recordings").select("*").eq("reader_user_id", readerId),
    getCurrentR18ViewerPreference(),
    getCachedPublicBaseWorkCards({
      visibility: "all",
      ignoreContentLanguageFilter: true,
      prioritizeForUiLocale: false,
    }),
  ]);

  const recordings = new Map<string, Row>();
  for (const row of [...(first.data ?? []), ...(second.data ?? [])] as Row[]) {
    if (row.id && isPublishedHumanRecording(row)) {
      recordings.set(row.id, row);
    }
  }

  const seriesIds = [
    ...new Set(
      [...recordings.values()]
        .map((row) => text(row.series_id, row.seriesId))
        .filter(Boolean)
    ),
  ];
  const episodeIds = [
    ...new Set(
      [...recordings.values()]
        .map((row) => text(row.episode_id, row.episodeId))
        .filter(Boolean)
    ),
  ];

  const [seriesResult, episodesResult] = await Promise.all([
    seriesIds.length
      ? db.from("series").select("*").in("id", seriesIds)
      : Promise.resolve({ data: [] as SeriesRow[] }),
    episodeIds.length
      ? db.from("episodes").select("*").in("id", episodeIds)
      : Promise.resolve({ data: [] as EpisodeRow[] }),
  ]);

  const visibleSeries = new Map<string, SeriesRow>();
  for (const row of (seriesResult.data ?? []) as SeriesRow[]) {
    if (getSeriesPublicationStatus(row) !== "public") continue;
    if (!preference.showR18Content && isR18Series(row)) continue;
    visibleSeries.set(row.id, row);
  }

  const visibleEpisodeIds = new Set<string>();
  for (const episode of (episodesResult.data ?? []) as EpisodeRow[]) {
    const parentSeriesId = pickText(episode.series_id, episode.seriesId);
    if (
      !parentSeriesId ||
      !visibleSeries.has(parentSeriesId) ||
      !isEpisodePubliclyVisible(episode, new Date())
    ) {
      continue;
    }
    visibleEpisodeIds.add(episode.id);
  }

  const baseWorkMap = new Map(
    baseWorks.map((work) => [work.seriesId, work] as const)
  );
  const works = new Map<string, NarratedWork>();
  let narratorName = "";

  for (const row of recordings.values()) {
    const seriesId = text(row.series_id, row.seriesId);
    const source = visibleSeries.get(seriesId);
    if (!seriesId || !source) continue;

    const recordingEpisodeId = text(row.episode_id, row.episodeId);
    if (!recordingEpisodeId || !visibleEpisodeIds.has(recordingEpisodeId)) {
      continue;
    }

    narratorName ||= text(row.reader_name);
    const baseWork = baseWorkMap.get(seriesId);
    const item =
      works.get(seriesId) ?? {
        id: seriesId,
        title: baseWork?.title || text(source.title) || "無題",
        summary:
          baseWork?.summary ||
          text(source.summary, source.description, source.catch_copy) ||
          "あらすじはまだ登録されていない。",
        authorName: baseWork?.authorName || copy.authorUnset,
        latestPostedLabel: baseWork?.latestPostedLabel || "",
        updatedAt: text(source.updated_at, source.created_at),
        count: 0,
        likes: 0,
        plays: 0,
        tags: baseWork?.tags ?? (Array.isArray(source.tags) ? source.tags.map(String) : []),
      };

    item.count += 1;
    item.likes += count(row.like_count ?? row.likes_count);
    item.plays += count(row.play_count ?? row.plays_count);
    works.set(seriesId, item);
  }

  const sorted = [...works.values()].sort((left, right) =>
    order === "popular"
      ? right.plays + right.likes * 10 - (left.plays + left.likes * 10)
      : time(right.updatedAt) - time(left.updatedAt)
  );
  const visibleNarratorName = narratorName || copy.narratorFallback;

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm text-neutral-500">{copy.breadcrumb}</p>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-4">
          <div>
            <p className="text-xs tracking-[0.18em] text-neutral-500">
              HUMAN NARRATION
            </p>
            <h1 className="mt-2 text-2xl font-semibold">
              {copy.title(visibleNarratorName)}
            </h1>
          </div>

          <div className="flex gap-2 text-sm">
            <Link
              href={href(
                `/search/reader/${encodeURIComponent(readerId)}?order=updated`
              )}
              className={
                order === "updated"
                  ? "rounded-full bg-black px-4 py-2 text-white"
                  : "rounded-full border border-black/10 px-4 py-2"
              }
            >
              {copy.updated}
            </Link>
            <Link
              href={href(
                `/search/reader/${encodeURIComponent(readerId)}?order=popular`
              )}
              className={
                order === "popular"
                  ? "rounded-full bg-black px-4 py-2 text-white"
                  : "rounded-full border border-black/10 px-4 py-2"
              }
            >
              {copy.popular}
            </Link>
          </div>
        </div>

        {sorted.length ? (
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {sorted.map((work) => (
              <PublicWorkBoardCard
                key={work.id}
                title={work.title}
                workHref={href(`/works/${work.id}`)}
                authorName={work.authorName}
                latestPostedLabel={work.latestPostedLabel}
                summary={work.summary}
                tags={[
                  copy.narrationCount(work.count),
                  copy.likes(work.likes),
                  copy.plays(work.plays),
                  ...work.tags,
                ]}
              />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-[28px] border border-dashed border-black/15 bg-neutral-50 p-6 text-sm text-neutral-600">
            {copy.empty}
          </div>
        )}
      </div>
    </main>
  );
}
