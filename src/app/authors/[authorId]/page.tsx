import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabase } from "@/lib/supabaseClient";
import AuthorFollowCard from "@/features/authorProfile/AuthorFollowCard";
import {
  ProfileHero,
  ProfileSeriesSection,
  buildAuthorSeriesCards,
  fetchAuthorById,
  fetchSeriesByAuthorId,
  resolveAuthorBio,
  resolveAuthorName,
  resolveAuthorNoteUrl,
  resolveAuthorXUrl,
} from "@/features/authorProfile/authorProfileShared";
import { fetchAuthorFollowSnapshot } from "@/lib/authorFollow";
import {
  buildReaderAuthorHref,
  getCanonicalNemoReaderKey,
  getReaderNameFromSyntheticAuthorId,
  isNemoReaderName,
} from "@/lib/readerAuthorHref";
import {
  isEpisodePubliclyVisible,
  pickText,
  type EpisodeRow,
} from "@/features/write/writeShared";
import AuthorLikeButton from "@/features/authorProfile/AuthorLikeButton";
import { fetchAuthorProfileLikeSnapshot } from "@/lib/authorProfileLike";

type PageProps = {
  params: Promise<{ authorId: string }>;
  searchParams?: Promise<{ readerName?: string }>;
};

function decodeAuthorIdParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

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
  like_count?: number | null;
  likes_count?: number | null;
  play_count?: number | null;
  plays_count?: number | null;
  is_public?: boolean | null;
  public?: boolean | null;
};

type SeriesRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  catch_copy?: string | null;
};

type NarratedWorkCard = {
  seriesId: string;
  title: string;
  summary: string;
  recordingCount: number;
  totalLikes: number;
  totalPlays: number;
  firstEpisodeNumber: number | null;
};

const adminSupabase = createAdminClient();

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

function getRecordingReaderName(recording: RecordingRow): string {
  return (
    pickText(
      recording.reader_name,
      recording.narrator_name,
      recording.display_name,
      recording.speaker_name
    ) || "朗読者名未設定"
  );
}

function getRecordingReaderKey(recording: RecordingRow): string {
  const readerName = getRecordingReaderName(recording);

  if (isNemoReaderName(readerName)) {
    return getCanonicalNemoReaderKey(readerName);
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

function getRecordingSeriesId(recording: RecordingRow): string {
  return pickText(recording.series_id, recording.seriesId);
}

async function fetchNarrationRecordingsForIdentity(args: {
  authorId: string;
  readerName: string;
}): Promise<RecordingRow[]> {
  const isSyntheticNemo = args.authorId.startsWith("nemo:");
  const results = new Map<string, RecordingRow>();

  if (isSyntheticNemo) {
    const targetReaderName =
      args.readerName || getReaderNameFromSyntheticAuthorId(args.authorId);

    if (!targetReaderName) {
      return [];
    }

    const queries = [
      () =>
        adminSupabase
          .from("recordings")
          .select("*")
          .eq("reader_name", targetReaderName),
      () =>
        adminSupabase
          .from("recordings")
          .select("*")
          .eq("narrator_name", targetReaderName),
      () =>
        adminSupabase
          .from("recordings")
          .select("*")
          .eq("display_name", targetReaderName),
      () =>
        adminSupabase
          .from("recordings")
          .select("*")
          .eq("speaker_name", targetReaderName),
    ];

    for (const run of queries) {
      const { data, error } = await run();

      if (error) {
        continue;
      }

      for (const row of (data ?? []) as RecordingRow[]) {
        if (!row?.id) continue;
        if (!isPublicRecording(row)) continue;
        if (getRecordingReaderKey(row) !== args.authorId) continue;
        results.set(row.id, row);
      }
    }

    return Array.from(results.values());
  }

  const queries = [
    () =>
      adminSupabase
        .from("recordings")
        .select("*")
        .eq("reader_id", args.authorId),
    () =>
      adminSupabase
        .from("recordings")
        .select("*")
        .eq("reader_user_id", args.authorId),
    () =>
      adminSupabase
        .from("recordings")
        .select("*")
        .eq("readerUserId", args.authorId),
  ];

  for (const run of queries) {
    const { data, error } = await run();

    if (error) {
      continue;
    }

    for (const row of (data ?? []) as RecordingRow[]) {
      if (!row?.id) continue;
      if (!isPublicRecording(row)) continue;
      results.set(row.id, row);
    }
  }

  return Array.from(results.values());
}

async function fetchSeriesByIds(seriesIds: string[]): Promise<SeriesRow[]> {
  if (seriesIds.length === 0) {
    return [];
  }

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

function buildReadHref(
  seriesId: string,
  episodeNumber: number,
  readerKey?: string,
  readerName?: string
): string {
  const query = new URLSearchParams();

  if (readerKey) query.set("readerKey", readerKey);
  if (readerName) query.set("readerName", readerName);

  const queryString = query.toString();

  return `/read/${seriesId}/${episodeNumber}${queryString ? `?${queryString}` : ""}`;
}

function buildWorksHref(
  seriesId: string,
  readerKey?: string,
  readerName?: string
): string {
  const query = new URLSearchParams();
  query.set("tab", "toc");

  if (readerKey) query.set("readerKey", readerKey);
  if (readerName) query.set("readerName", readerName);

  return `/works/${seriesId}?${query.toString()}`;
}

export default async function AuthorPage({ params, searchParams }: PageProps) {
  const { authorId: rawAuthorId } = await params;
  const authorId = decodeAuthorIdParam(rawAuthorId);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedReaderName = pickText(resolvedSearchParams?.readerName);

  const [author, works, authSupabase] = await Promise.all([
    fetchAuthorById(authorId, supabase),
    fetchSeriesByAuthorId(authorId, supabase),
    createServerClient(),
  ]);

  const seriesCards = await buildAuthorSeriesCards(works, supabase);
  const publicSeriesCards = seriesCards.filter((card) => card.publishedCount > 0);

  const {
    data: { user: currentUser },
  } = await authSupabase.auth.getUser();

  const isOwnPage = !!author && currentUser?.id === authorId;

  const narrationRecordings = await fetchNarrationRecordingsForIdentity({
    authorId,
    readerName: requestedReaderName,
  });

  const narrationSeriesIds = Array.from(
    new Set(
      narrationRecordings
        .map((recording) => getRecordingSeriesId(recording))
        .filter((value) => value.length > 0)
    )
  );

  const [narrationSeries, narrationEpisodes] = await Promise.all([
    fetchSeriesByIds(narrationSeriesIds),
    fetchEpisodesBySeriesIds(narrationSeriesIds),
  ]);

  const publicVisibleEpisodes = narrationEpisodes.filter((episode) =>
    isEpisodePubliclyVisible(episode, new Date())
  );

  const firstEpisodeNumberMap = new Map<string, number>();

  for (const episode of publicVisibleEpisodes) {
    const seriesId = pickText(episode.series_id, episode.seriesId);
    if (!seriesId) continue;

    const rawEpisodeNumber = Number(
      episode.episode_number ?? episode.episodeNumber ?? 0
    );

    if (!Number.isFinite(rawEpisodeNumber) || rawEpisodeNumber <= 0) {
      continue;
    }

    const current = firstEpisodeNumberMap.get(seriesId);

    if (current === undefined || rawEpisodeNumber < current) {
      firstEpisodeNumberMap.set(seriesId, rawEpisodeNumber);
    }
  }

  const narrationSeriesMap = new Map<string, SeriesRow>();
  for (const row of narrationSeries) {
    narrationSeriesMap.set(row.id, row);
  }

  const narratedWorksMap = new Map<string, NarratedWorkCard>();

  for (const recording of narrationRecordings) {
    const seriesId = getRecordingSeriesId(recording);
    if (!seriesId) continue;

    const series = narrationSeriesMap.get(seriesId);

    const current = narratedWorksMap.get(seriesId) ?? {
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
      firstEpisodeNumber: firstEpisodeNumberMap.get(seriesId) ?? null,
    };

    current.recordingCount += 1;
    current.totalLikes += getRecordingLikes(recording);
    current.totalPlays += getRecordingPlays(recording);

    narratedWorksMap.set(seriesId, current);
  }

  const narratedWorks = Array.from(narratedWorksMap.values()).sort((a, b) => {
    if (b.totalLikes !== a.totalLikes) return b.totalLikes - a.totalLikes;
    if (b.totalPlays !== a.totalPlays) return b.totalPlays - a.totalPlays;
    return a.title.localeCompare(b.title, "ja");
  });

  const hasNarrationSurface = narratedWorks.length > 0;
  const isSyntheticNarratorPage = !author && hasNarrationSurface;

  if (!author && publicSeriesCards.length === 0 && !hasNarrationSurface) {
    notFound();
  }

  const followSnapshot =
    author && !isSyntheticNarratorPage
      ? await fetchAuthorFollowSnapshot({
          supabase: adminSupabase,
          authorId,
          currentUserId: currentUser?.id ?? null,
        })
      : {
          followerCount: 0,
          followingCount: 0,
          isFollowing: false,
        };

  const authorLikeSnapshot =
    author && !isSyntheticNarratorPage
      ? await fetchAuthorProfileLikeSnapshot({
          supabase: adminSupabase,
          authorId,
          currentUserId: currentUser?.id ?? null,
        })
      : {
          likeCount: 0,
          isLiked: false,
        };        

  const authorName = author
    ? resolveAuthorName(author)
    : requestedReaderName || getReaderNameFromSyntheticAuthorId(authorId) || "朗読者名未設定";

  const authorBio = author
    ? resolveAuthorBio(author)
    : `公開朗読 ${narratedWorks.length}件`;

  const xUrl = author ? resolveAuthorXUrl(author) : "";
  const noteUrl = author ? resolveAuthorNoteUrl(author) : "";
  const hasExternalLinks = xUrl.length > 0 || noteUrl.length > 0;

  const readerKeyForNarration = isSyntheticNarratorPage
    ? authorId
    : authorId;

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/" className="hover:text-black">
            TOP
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-700">作者ページ</span>
        </div>

        <ProfileHero
          eyebrow="AUTHOR"
          title={authorName}
          description={authorBio}
          actions={[
            { href: "/", label: "TOPへ" },
            ...(isOwnPage
              ? [
                  { href: "/mypage", label: "マイページへ", tone: "primary" as const },
                  { href: "/write", label: "執筆ページへ" },
                ]
              : []),
          ]}
          extraContent={
            author && !isSyntheticNarratorPage ? (
              <div className="grid gap-3">
                <AuthorFollowCard
                  authorId={authorId}
                  isOwnPage={isOwnPage}
                  initialFollowerCount={followSnapshot.followerCount}
                  initialFollowingCount={followSnapshot.followingCount}
                  initialIsFollowing={followSnapshot.isFollowing}
                />

                <AuthorLikeButton
                  authorId={authorId}
                  isOwnPage={isOwnPage}
                  initialLikeCount={authorLikeSnapshot.likeCount}
                  initialIsLiked={authorLikeSnapshot.isLiked}
                  loginHref={`/login?next=${encodeURIComponent(`/authors/${authorId}`)}`}
                />
              </div>
            ) : null
          }
          surface="light"
        />

        {author && (isOwnPage || hasExternalLinks) ? (
          <section className="mt-6 rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
            <p className="text-xs tracking-[0.18em] text-neutral-500">
              EXTERNAL LINKS
            </p>
            <h2 className="mt-2 text-xl font-semibold text-black">外部リンク</h2>

            {hasExternalLinks ? (
              <div className="mt-4 flex flex-wrap gap-3">
                {xUrl ? (
                  <a
                    href={xUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
                  >
                    X
                  </a>
                ) : null}

                {noteUrl ? (
                  <a
                    href={noteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
                  >
                    note
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm leading-7 text-neutral-600">
                外部リンク未設定
              </p>
            )}
          </section>
        ) : null}

        {publicSeriesCards.length > 0 ? (
          <div className="mt-6">
            <ProfileSeriesSection
              eyebrow="WORKS"
              title="この作者の公開作品"
              cards={publicSeriesCards}
              emptyMessage="まだ公開作品がない。"
              mode="public"
              surface="light"
            />
          </div>
        ) : null}

        <section className="mt-6 rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs tracking-[0.18em] text-neutral-500">
            NARRATIONS
          </p>
          <h2 className="mt-2 text-xl font-semibold text-black">
            {author ? "この作者の朗読作品" : "この朗読者の公開作品"}
          </h2>

          {narratedWorks.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-black/15 bg-neutral-50 px-4 py-4 text-sm leading-7 text-neutral-600">
              まだ公開中の朗読作品がない。
            </div>
          ) : (
            <div className="mt-4 grid gap-4">
              {narratedWorks.map((work) => (
                <article
                  key={work.seriesId}
                  className="rounded-[28px] border border-black/10 bg-white p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                      <p className="text-xs tracking-[0.18em] text-neutral-500">
                        SERIES
                      </p>
                      <h3 className="mt-2 text-2xl font-semibold text-black">
                        {work.title}
                      </h3>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-600">
                        {work.summary}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
                        朗読 {work.recordingCount}件
                      </span>
                      <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
                        いいね {work.totalLikes}
                      </span>
                      <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
                        再生 {work.totalPlays}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                      href={buildWorksHref(
                        work.seriesId,
                        readerKeyForNarration,
                        authorName
                      )}
                      className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                    >
                      この朗読で作品ページへ
                    </Link>

                    {work.firstEpisodeNumber !== null ? (
                      <Link
                        href={buildReadHref(
                          work.seriesId,
                          work.firstEpisodeNumber,
                          readerKeyForNarration,
                          authorName
                        )}
                        className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-black transition hover:bg-sky-100"
                      >
                        この朗読で第1話へ
                      </Link>
                    ) : (
                      <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-500">
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