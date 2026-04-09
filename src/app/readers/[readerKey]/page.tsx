import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { isEpisodePubliclyVisible } from "@/features/write/writeShared";

type PageProps = {
  params: Promise<{ readerKey: string }>;
  searchParams?: Promise<{ name?: string }>;
};

type RecordingRow = Record<string, unknown> & {
  id: string;
  series_id?: string | null;
  seriesId?: string | null;
  reader_id?: string | null;
  reader_user_id?: string | null;
  readerUserId?: string | null;
  reader_name?: string | null;
  narrator_name?: string | null;
  display_name?: string | null;
  speaker_name?: string | null;
  description?: string | null;
  reader_comment?: string | null;
  tags?: string[] | string | null;
  like_count?: number | null;
  likes_count?: number | null;
  play_count?: number | null;
  plays_count?: number | null;
  is_public?: boolean | null;
  public?: boolean | null;
  allow_download?: boolean | null;
};

type SeriesRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  catch_copy?: string | null;
};

type EpisodeRow = Record<string, unknown> & {
  id: string;
  series_id?: string | null;
  seriesId?: string | null;
  episode_number?: number | null;
  episodeNumber?: number | null;
  is_published?: boolean | null;
  published?: boolean | null;
  posting_status?: "draft" | "scheduled" | "posted" | null;
  postingStatus?: "draft" | "scheduled" | "posted" | null;
  scheduled_for?: string | null;
  scheduledFor?: string | null;
};

type ReaderWorkCard = {
  seriesId: string;
  title: string;
  summary: string;
  recordingCount: number;
  totalLikes: number;
  totalPlays: number;
  firstEpisodeNumber?: number;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((tag) => String(tag).trim())
      .filter((tag) => tag.length > 0)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
  }

  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw
      .split(/[,、]/)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
  }

  return [];
}

function getEpisodeNumber(episode: EpisodeRow): number {
  const raw = episode.episode_number ?? episode.episodeNumber ?? 0;
  if (typeof raw === "number") return raw;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isPublicRecording(recording: RecordingRow): boolean {
  if (recording.is_public === false) return false;
  if (recording.public === false) return false;
  return true;
}

function getRecordingLikes(recording: RecordingRow): number {
  const raw = recording.like_count ?? recording.likes_count ?? 0;
  if (typeof raw === "number") return raw;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getRecordingPlays(recording: RecordingRow): number {
  const raw = recording.play_count ?? recording.plays_count ?? 0;
  if (typeof raw === "number") return raw;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getSeriesId(recording: RecordingRow): string {
  return pickText(recording.series_id, recording.seriesId);
}

function getRecordingReaderName(recording: RecordingRow): string {
  return (
    pickText(
      recording.reader_name,
      recording.narrator_name,
      recording.display_name,
      recording.speaker_name
    ) || "名称未設定"
  );
}

function isNemoReaderName(name: string): boolean {
  return name.startsWith("VOICEVOX Nemo");
}

function getCanonicalNemoReaderKey(name: string): string {
  return `nemo:${name}`;
}

function getRecordingReaderKey(recording: RecordingRow): string {
  const name = getRecordingReaderName(recording);

  if (isNemoReaderName(name)) {
    return getCanonicalNemoReaderKey(name);
  }

  return (
    pickText(
      recording.reader_id,
      recording.reader_user_id,
      recording.readerUserId,
      recording.reader_name,
      recording.narrator_name,
      recording.display_name,
      recording.speaker_name,
      recording.id
    ) || recording.id
  );
}

function getReaderIdentity(recording: RecordingRow): { key: string; name: string } {
  const name = getRecordingReaderName(recording);
  const key = getRecordingReaderKey(recording);

  return { key, name };
}

function buildWorksHref(seriesId: string, readerKey: string, readerName?: string): string {
  const query = new URLSearchParams();
  query.set("tab", "toc");
  query.set("readerKey", readerKey);
  if (readerName) query.set("readerName", readerName);

  return `/works/${seriesId}?${query.toString()}`;
}

function buildReadHref(
  seriesId: string,
  episodeNumber: number,
  readerKey: string,
  readerName?: string
): string {
  const query = new URLSearchParams();
  query.set("readerKey", readerKey);
  if (readerName) query.set("readerName", readerName);

  return `/read/${seriesId}/${episodeNumber}?${query.toString()}`;
}

async function fetchAllRecordings(): Promise<RecordingRow[]> {
  const { data, error } = await supabase.from("recordings").select("*");

  if (error) {
    throw new Error(`recordings の取得に失敗: ${error.message}`);
  }

  return (data ?? []) as RecordingRow[];
}

async function fetchSeriesByIds(seriesIds: string[]): Promise<SeriesRow[]> {
  if (seriesIds.length === 0) return [];

  const { data, error } = await supabase
    .from("series")
    .select("*")
    .in("id", seriesIds);

  if (error) {
    throw new Error(`series の取得に失敗: ${error.message}`);
  }

  return (data ?? []) as SeriesRow[];
}

async function fetchEpisodesBySeriesIds(seriesIds: string[]): Promise<EpisodeRow[]> {
  if (seriesIds.length === 0) {
    return [];
  }

  const firstTry = await supabase
    .from("episodes")
    .select("*")
    .in("series_id", seriesIds);

  if (!firstTry.error) {
    return (firstTry.data ?? []) as EpisodeRow[];
  }

  const secondTry = await supabase
    .from("episodes")
    .select("*")
    .in("seriesId", seriesIds);

  if (secondTry.error) {
    throw new Error(`episodes の取得に失敗: ${secondTry.error.message}`);
  }

  return (secondTry.data ?? []) as EpisodeRow[];
}

export default async function ReaderPage({ params, searchParams }: PageProps) {
  const { readerKey } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const fallbackReaderName = pickText(resolvedSearchParams?.name);

  const allRecordings = await fetchAllRecordings();
  const matchedRecordings = allRecordings.filter((recording) => {
    if (!isPublicRecording(recording)) return false;

    const identity = getReaderIdentity(recording);

    if (identity.key === readerKey) {
      return true;
    }

    if (fallbackReaderName && isNemoReaderName(fallbackReaderName)) {
      return identity.name === fallbackReaderName;
    }

    return false;
  });

  const readerName =
    matchedRecordings.length > 0
      ? getReaderIdentity(matchedRecordings[0]).name
      : fallbackReaderName || "朗読者名未設定";
  const canonicalReaderKey = isNemoReaderName(readerName)
    ? getCanonicalNemoReaderKey(readerName)
   : readerKey;
 const totalLikes = matchedRecordings.reduce(
    (sum, recording) => sum + getRecordingLikes(recording),
    0
  );
  const totalPlays = matchedRecordings.reduce(
    (sum, recording) => sum + getRecordingPlays(recording),
    0
  );
  const allowDownload = matchedRecordings.some(
    (recording) => recording.allow_download === true
  );

  const description = isNemoReaderName(readerName)
    ? `公開朗読 ${matchedRecordings.length}件 / いいね ${totalLikes} / 再生 ${totalPlays}`
    : pickText(
        matchedRecordings[0]?.description,
        matchedRecordings[0]?.reader_comment
      ) ||
      `公開朗読 ${matchedRecordings.length}件 / いいね ${totalLikes} / 再生 ${totalPlays}`;

  const tagMap = new Map<string, number>();
  for (const recording of matchedRecordings) {
    for (const tag of parseTags(recording.tags)) {
      tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
    }
  }

  const tags = Array.from(tagMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tag]) => tag);

  const seriesIds = Array.from(
    new Set(
      matchedRecordings
        .map((recording) => getSeriesId(recording))
        .filter((value) => value.length > 0)
    )
  );

  const [seriesList, rawEpisodes] = await Promise.all([
    fetchSeriesByIds(seriesIds),
    fetchEpisodesBySeriesIds(seriesIds),
  ]);

  const now = new Date();
  const publicVisibleEpisodes = rawEpisodes.filter((episode) =>
    isEpisodePubliclyVisible(episode, now)
  );

  const firstEpisodeNumberMap = new Map<string, number>();

  for (const episode of publicVisibleEpisodes) {
    const seriesId = pickText(episode.series_id, episode.seriesId);
    if (!seriesId) continue;

    const episodeNumber = getEpisodeNumber(episode);
    const existing = firstEpisodeNumberMap.get(seriesId);

    if (existing === undefined || episodeNumber < existing) {
      firstEpisodeNumberMap.set(seriesId, episodeNumber);
    }
  }

  const seriesMap = new Map<string, SeriesRow>();
  for (const series of seriesList) {
    seriesMap.set(series.id, series);
  }

  const groupedWorks = new Map<string, ReaderWorkCard>();

  for (const recording of matchedRecordings) {
    const seriesId = getSeriesId(recording);
    if (!seriesId) continue;

    const series = seriesMap.get(seriesId);

    const existing = groupedWorks.get(seriesId) ?? {
      seriesId,
      title: pickText(series?.title) || "無題",
      summary:
        pickText(
          series?.summary,
          series?.description,
          series?.["synopsis"],
          series?.["body"],
          series?.catch_copy
        ) || "あらすじはまだ登録されていない。",
      recordingCount: 0,
      totalLikes: 0,
      totalPlays: 0,
      firstEpisodeNumber: firstEpisodeNumberMap.get(seriesId),
    };

    existing.recordingCount += 1;
    existing.totalLikes += getRecordingLikes(recording);
    existing.totalPlays += getRecordingPlays(recording);

    groupedWorks.set(seriesId, existing);
  }

  const workCards = Array.from(groupedWorks.values()).sort((a, b) => {
    if (b.totalLikes !== a.totalLikes) return b.totalLikes - a.totalLikes;
    if (b.totalPlays !== a.totalPlays) return b.totalPlays - a.totalPlays;
    return a.title.localeCompare(b.title, "ja");
  });

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/" className="hover:text-neutral-300">
            TOP
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-300">朗読者ページ</span>
        </div>

        <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] px-5 py-6 shadow-2xl lg:px-8 lg:py-8">
          <p className="text-xs tracking-[0.22em] text-neutral-500">READER</p>
          <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">{readerName}</h1>

          <p className="mt-5 whitespace-pre-wrap text-[15px] leading-8 text-neutral-300">
            {description}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300">
              公開朗読 {matchedRecordings.length}件
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300">
              いいね {totalLikes}
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300">
              再生 {totalPlays}
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300">
              DL {allowDownload ? "可" : "不可"}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {tags.length > 0 ? (
              tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-neutral-300"
                >
                  {tag}
                </span>
              ))
            ) : (
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-neutral-500">
                タグ未設定
              </span>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-[32px] border border-white/10 bg-black/20 p-5 lg:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.18em] text-neutral-500">WORKS</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">この朗読者の公開作品</h2>
            </div>

            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-400">
              最小版
            </div>
          </div>

          {workCards.length === 0 ? (
            <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-neutral-400">
              まだ公開中の朗読対象作品がない。
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              {workCards.map((work) => (
                <article
                  key={work.seriesId}
                  className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xl font-semibold text-white">{work.title}</h3>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-400">
                        {work.summary}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
                      <span className="rounded-full border border-white/10 px-3 py-1">
                        朗読 {work.recordingCount}件
                      </span>
                      <span className="rounded-full border border-white/10 px-3 py-1">
                        いいね {work.totalLikes}
                      </span>
                      <span className="rounded-full border border-white/10 px-3 py-1">
                        再生 {work.totalPlays}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                      href={buildWorksHref(work.seriesId, canonicalReaderKey, readerName)}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                    >
                      作品ページへ
                    </Link>

                    {work.firstEpisodeNumber !== undefined ? (
                      <Link
                        href={buildReadHref(
                          work.seriesId,
                          work.firstEpisodeNumber,
                          canonicalReaderKey,
                          readerName
                        )}
                        className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
                      >
                        この朗読で再生
                      </Link>
                    ) : (
                      <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-500">
                        公開話なし
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}