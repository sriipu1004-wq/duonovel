import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type PageProps = {
  params: Promise<{ authorId: string }>;
};

type UserRow = Record<string, unknown> & {
  id: string;
  display_name?: string | null;
  username?: string | null;
  pen_name?: string | null;
  name?: string | null;
  bio?: string | null;
  profile?: string | null;
  description?: string | null;
};

type SeriesRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  catch_copy?: string | null;
  author_id?: string | null;
  user_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type EpisodeRow = Record<string, unknown> & {
  id: string;
  series_id?: string | null;
  seriesId?: string | null;
  episode_number?: number | null;
  episodeNumber?: number | null;
  is_published?: boolean | null;
  published?: boolean | null;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

function getEpisodeNumber(episode: EpisodeRow): number {
  const raw = episode.episode_number ?? episode.episodeNumber ?? 0;
  if (typeof raw === "number") return raw;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isPublishedEpisode(episode: EpisodeRow): boolean {
  if (episode.is_published === false) return false;
  if (episode.published === false) return false;
  return true;
}

function buildWorksHref(seriesId: string): string {
  return `/works/${seriesId}`;
}

function buildReadHref(seriesId: string, episodeNumber: number): string {
  return `/read/${seriesId}/${episodeNumber}`;
}

function toTimestamp(value: unknown): number {
  if (typeof value !== "string" || !value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

async function fetchSeriesByAuthorId(authorId: string): Promise<SeriesRow[]> {
  const [byAuthorId, byUserId] = await Promise.all([
    supabase.from("series").select("*").eq("author_id", authorId),
    supabase.from("series").select("*").eq("user_id", authorId),
  ]);

  if (byAuthorId.error && byUserId.error) {
    throw new Error(
      `series の取得に失敗: ${byAuthorId.error?.message ?? byUserId.error?.message ?? "unknown"}`
    );
  }

  const merged = new Map<string, SeriesRow>();

  for (const row of (byAuthorId.data ?? []) as SeriesRow[]) {
    merged.set(row.id, row);
  }

  for (const row of (byUserId.data ?? []) as SeriesRow[]) {
    merged.set(row.id, row);
  }

  return Array.from(merged.values()).sort((a, b) => {
    const timeDiff = toTimestamp(b.updated_at ?? b.created_at) - toTimestamp(a.updated_at ?? a.created_at);
    if (timeDiff !== 0) return timeDiff;

    const aTitle = pickText(a.title) || "無題";
    const bTitle = pickText(b.title) || "無題";
    return aTitle.localeCompare(bTitle, "ja");
  });
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

export default async function AuthorPage({ params }: PageProps) {
  const { authorId } = await params;

  const { data: authorData } = await supabase
    .from("users")
    .select("*")
    .eq("id", authorId)
    .maybeSingle();

  const author = (authorData as UserRow | null) ?? null;
  const works = await fetchSeriesByAuthorId(authorId);

  if (!author && works.length === 0) {
    notFound();
  }

  const authorName =
    pickText(
      author?.display_name,
      author?.pen_name,
      author?.username,
      author?.name
    ) || "作者名未設定";

  const authorBio =
    pickText(author?.bio, author?.profile, author?.description) || "プロフィールはまだ登録されていない。";

  const seriesIds = works.map((work) => work.id);
  const rawEpisodes = await fetchEpisodesBySeriesIds(seriesIds);
  const publishedEpisodes = rawEpisodes.filter(isPublishedEpisode);

  const episodeCountMap = new Map<string, number>();
  const firstEpisodeNumberMap = new Map<string, number>();

  for (const episode of publishedEpisodes) {
    const seriesId = pickText(episode.series_id, episode.seriesId);
    if (!seriesId) continue;

    episodeCountMap.set(seriesId, (episodeCountMap.get(seriesId) ?? 0) + 1);

    const episodeNumber = getEpisodeNumber(episode);
    const existing = firstEpisodeNumberMap.get(seriesId);

    if (existing === undefined || episodeNumber < existing) {
      firstEpisodeNumberMap.set(seriesId, episodeNumber);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/" className="hover:text-neutral-300">
            TOP
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-300">作者ページ</span>
        </div>

        <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] px-5 py-6 shadow-2xl lg:px-8 lg:py-8">
          <p className="text-xs tracking-[0.22em] text-neutral-500">AUTHOR</p>
          <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">{authorName}</h1>
          <p className="mt-5 whitespace-pre-wrap text-[15px] leading-8 text-neutral-300">
            {authorBio}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300">
              公開作品 {works.length}件
            </div>
            <Link
              href="/"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
            >
              TOPへ
            </Link>
          </div>
        </section>

        <section className="mt-6 rounded-[32px] border border-white/10 bg-black/20 p-5 lg:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.18em] text-neutral-500">WORKS</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">この作者の作品</h2>
            </div>

            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-400">
              最小版
            </div>
          </div>

          {works.length === 0 ? (
            <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-neutral-400">
              まだ公開作品がない。
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              {works.map((work) => {
                const workTitle = pickText(work.title) || "無題";
                const workSummary =
                  pickText(
                    work.summary,
                    work.description,
                    work["synopsis"],
                    work["body"],
                    work.catch_copy
                  ) || "あらすじはまだ登録されていない。";
                const episodeCount = episodeCountMap.get(work.id) ?? 0;
                const firstEpisodeNumber = firstEpisodeNumberMap.get(work.id);

                return (
                  <article
                    key={work.id}
                    className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-xl font-semibold text-white">{workTitle}</h3>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-400">
                          {workSummary}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-500">
                          公開話数 {episodeCount}話
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <Link
                        href={buildWorksHref(work.id)}
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                      >
                        作品ページへ
                      </Link>

                      {firstEpisodeNumber !== undefined ? (
                        <Link
                          href={buildReadHref(work.id, firstEpisodeNumber)}
                          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
                        >
                          第1話から読む
                        </Link>
                      ) : (
                        <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-500">
                          公開話なし
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}