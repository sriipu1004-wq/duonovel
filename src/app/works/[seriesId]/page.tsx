import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import FavoriteBookmarkButton from "@/features/bookmark/FavoriteBookmarkButton";
import SeriesReactionButton from "@/features/rating/SeriesReactionButton";
import SeriesReviewSection from "@/features/review/SeriesReviewSection";
import {
  getEpisodeNumber,
  getEpisodePostedAtValue,
  getEpisodeLastEditedAtValue,
  getSeriesPublicationStatus,
  getSeriesSummary,
  isEpisodePubliclyVisible,
  isSeriesReviewVisible,
  pickText,
  sortEpisodes,
  type EpisodeRow,
  type RecordingPermissionMode,
  type SeriesRow,
} from "@/features/write/writeShared";

type PageProps = {
  params: Promise<{ seriesId: string }>;
  searchParams?: Promise<{
    tab?: string;
    readerKey?: string;
    readerName?: string;
  }>;
};

type UserRow = Record<string, unknown> & {
  id: string;
  display_name?: string | null;
  username?: string | null;
  pen_name?: string | null;
  name?: string | null;
};

type RecordingRow = Record<string, unknown> & {
  id: string;
  series_id?: string | null;
  seriesId?: string | null;
  episode_id?: string | null;
  episodeId?: string | null;
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

type ReaderCard = {
  readerKey: string;
  name: string;
  rank: number;
  tags: string[];
  description: string;
  totalLikes: number;
  totalPlays: number;
  recordingCount: number;
  allowDownload: boolean;
};

type RelatedWorkCard = {
  seriesId: string;
  title: string;
  authorName: string;
  episodeCount: number;
  firstEpisodeNumber: number | null;
  latestPostedAtValue: number;
};

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
  tab: "toc" | "readers",
  readerKey?: string,
  readerName?: string
): string {
  const query = new URLSearchParams();
  query.set("tab", tab);

  if (readerKey) query.set("readerKey", readerKey);
  if (readerName) query.set("readerName", readerName);

  return `/works/${seriesId}?${query.toString()}`;
}

function buildReaderHref(readerKey: string, readerName?: string): string {
  const encodedKey = encodeURIComponent(readerKey);

  if (!readerName) {
    return `/readers/${encodedKey}`;
  }

  const query = new URLSearchParams();
  query.set("name", readerName);

  return `/readers/${encodedKey}?${query.toString()}`;
}

function buildRecordHubHref(seriesId: string): string {
  const query = new URLSearchParams();
  query.set("seriesId", seriesId);
  return `/record?${query.toString()}`;
}

function buildAuthorHref(authorId: string): string {
  return `/authors/${encodeURIComponent(authorId)}`;
}

function getRecordingPermissionLabel(
  mode: RecordingPermissionMode | null | undefined
): string {
  if (mode === "open") return "無条件許可";
  if (mode === "approval_required") return "承認制";
  return "非許可";
}

function getRecordingPermissionDescription(
  mode: RecordingPermissionMode | null | undefined
): string {
  if (mode === "open") {
    return "朗読ページからそのまま制作開始できる作品。";
  }
  if (mode === "approval_required") {
    return "申請と承認後に朗読制作へ進む。";
  }
  return "第三者朗読の募集は行っていない。";
}

function getRecordingPermissionBadgeClass(
  mode: RecordingPermissionMode | null | undefined
): string {
  if (mode === "open") {
    return "border-sky-200 bg-sky-50 text-black";
  }
  if (mode === "approval_required") {
    return "border-black/10 bg-neutral-100 text-neutral-700";
  }
  return "border-black/10 bg-white text-neutral-600";
}

function resolveRecordingPermissionMode(
  value: unknown
): RecordingPermissionMode {
  if (value === "open") return "open";
  if (value === "approval_required") return "approval_required";
  return "closed";
}

async function fetchEpisodesBySeriesId(seriesId: string): Promise<EpisodeRow[]> {
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

  if (secondTry.error) {
    throw new Error(`episodes の取得に失敗: ${secondTry.error.message}`);
  }

  return (secondTry.data ?? []) as EpisodeRow[];
}

async function fetchRecordingsBySeriesId(seriesId: string): Promise<{
  recordings: RecordingRow[];
  fetchErrorMessage: string | null;
}> {
  const firstTry = await supabase
    .from("recordings")
    .select("*")
    .eq("series_id", seriesId);

  if (!firstTry.error) {
    return {
      recordings: ((firstTry.data ?? []) as RecordingRow[]).filter(isPublicRecording),
      fetchErrorMessage: null,
    };
  }

  const secondTry = await supabase
    .from("recordings")
    .select("*")
    .eq("seriesId", seriesId);

  if (!secondTry.error) {
    return {
      recordings: ((secondTry.data ?? []) as RecordingRow[]).filter(isPublicRecording),
      fetchErrorMessage: null,
    };
  }

  return {
    recordings: [],
    fetchErrorMessage: `recordings の取得に失敗: ${secondTry.error.message}`,
  };
}

async function fetchPublicSeries(): Promise<SeriesRow[]> {
  const { data, error } = await supabase
    .from("series")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(36);

  if (error) {
    return [];
  }

  return ((data ?? []) as SeriesRow[]).filter(
    (series) => getSeriesPublicationStatus(series) === "public"
  );
}

function buildReaderCards(recordings: RecordingRow[]): ReaderCard[] {
  const grouped = new Map<
    string,
    {
      key: string;
      name: string;
      description: string;
      totalLikes: number;
      totalPlays: number;
      recordingCount: number;
      allowDownload: boolean;
      tagMap: Map<string, number>;
    }
  >();

  for (const recording of recordings) {
    const name =
      pickText(
        recording.reader_name,
        recording.narrator_name,
        recording.display_name,
        recording.speaker_name
      ) || "名称未設定";

    const key =
      pickText(
        recording.reader_id,
        recording.reader_user_id,
        recording.readerUserId,
        recording.reader_name,
        recording.narrator_name,
        recording.display_name,
        recording.speaker_name,
        recording.id
      ) || recording.id;

    const existing = grouped.get(key) ?? {
      key,
      name,
      description: pickText(recording.description, recording.reader_comment) || "",
      totalLikes: 0,
      totalPlays: 0,
      recordingCount: 0,
      allowDownload: false,
      tagMap: new Map<string, number>(),
    };

    existing.totalLikes += getRecordingLikes(recording);
    existing.totalPlays += getRecordingPlays(recording);
    existing.recordingCount += 1;
    existing.allowDownload = existing.allowDownload || recording.allow_download === true;

    const tags = parseTags(recording.tags);
    for (const tag of tags) {
      existing.tagMap.set(tag, (existing.tagMap.get(tag) ?? 0) + 1);
    }

    if (!existing.description) {
      existing.description = pickText(recording.description, recording.reader_comment) || "";
    }

    grouped.set(key, existing);
  }

  return Array.from(grouped.values())
    .sort((a, b) => {
      if (b.totalLikes !== a.totalLikes) return b.totalLikes - a.totalLikes;
      if (b.totalPlays !== a.totalPlays) return b.totalPlays - a.totalPlays;
      return a.name.localeCompare(b.name, "ja");
    })
    .map((reader, index) => {
      const tags = Array.from(reader.tagMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([tag]) => tag);

      const description =
        reader.description ||
        `公開朗読 ${reader.recordingCount}件 / いいね ${reader.totalLikes} / 再生 ${reader.totalPlays}`;

      return {
        readerKey: reader.key,
        name: reader.name,
        rank: index + 1,
        tags,
        description,
        totalLikes: reader.totalLikes,
        totalPlays: reader.totalPlays,
        recordingCount: reader.recordingCount,
        allowDownload: reader.allowDownload,
      };
    });
}

function formatEpisodeDate(value: string): string {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-3xl border border-black/10 bg-neutral-50 p-4">
      <p className="text-[11px] tracking-[0.18em] text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-black">{value}</p>
      {sub ? <p className="mt-2 text-sm text-neutral-600">{sub}</p> : null}
    </div>
  );
}

function TabButton({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full border px-4 py-2 text-sm font-medium transition",
        active
          ? "border-sky-200 bg-sky-50 text-black"
          : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function InfoActionRow({
  label,
  value,
  href,
  disabled,
  tone = "plain",
}: {
  label: string;
  value: string;
  href?: string;
  disabled?: boolean;
  tone?: "plain" | "accent";
}) {
  const className = [
    "flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition",
    tone === "accent"
      ? "border-black/10 bg-neutral-200 text-black hover:bg-neutral-300"
      : "border-black/10 bg-white text-neutral-800 hover:bg-neutral-50",
    disabled ? "pointer-events-none opacity-60" : "",
  ].join(" ");

  if (href && !disabled) {
    return (
      <Link href={href} className={className}>
        <span className="text-neutral-600">{label}</span>
        <span className="font-medium text-black">{value}</span>
      </Link>
    );
  }

  return (
    <div className={className}>
      <span className="text-neutral-600">{label}</span>
      <span className="font-medium text-black">{value}</span>
    </div>
  );
}

function RelatedWorkCard({
  work,
  label,
}: {
  work: RelatedWorkCard;
  label?: string;
}) {
  return (
    <article className="rounded-[20px] border border-black/10 bg-neutral-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {label ? (
          <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] text-neutral-600">
            {label}
          </span>
        ) : null}
        <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] text-neutral-600">
          {work.episodeCount}話
        </span>
      </div>

      <h3 className="mt-3 text-base font-semibold leading-tight text-black">
        {work.title}
      </h3>
      <p className="mt-1 text-sm text-neutral-500">作者 {work.authorName}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/works/${work.seriesId}`}
          className="rounded-full border border-black/10 bg-white px-3.5 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
        >
          作品ページ
        </Link>

        {work.firstEpisodeNumber ? (
          <Link
            href={`/read/${work.seriesId}/${work.firstEpisodeNumber}`}
            className="rounded-full border border-black/10 bg-neutral-200 px-3.5 py-2 text-sm font-medium text-black transition hover:bg-neutral-300"
          >
            第1話から読む
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export default async function WorkPage({ params, searchParams }: PageProps) {
  const { seriesId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const currentTab = resolvedSearchParams?.tab === "readers" ? "readers" : "toc";

  const selectedReaderKey = pickText(resolvedSearchParams?.readerKey);
  const selectedReaderName = pickText(resolvedSearchParams?.readerName);

  const { data: seriesData, error: seriesError } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .single();

  if (seriesError) {
    if (seriesError.code === "PGRST116") {
      notFound();
    }
    throw new Error(`series の取得に失敗: ${seriesError.message}`);
  }

  if (!seriesData) {
    notFound();
  }

  const series = seriesData as SeriesRow;
  if (getSeriesPublicationStatus(series) !== "public") {
    notFound();
  }

  const authorId = pickText(
    series.author_id,
    series["user_id"],
    series["userId"]
  );

  let author: UserRow | null = null;

  if (authorId) {
    const { data: userData } = await supabase
      .from("users")
      .select("*")
      .eq("id", authorId)
      .maybeSingle();

    if (userData) {
      author = userData as UserRow;
    }
  }

  const rawEpisodes = await fetchEpisodesBySeriesId(seriesId);
  const episodes = sortEpisodes(
    rawEpisodes.filter((episode) => isEpisodePubliclyVisible(episode))
  );

  if (episodes.length === 0) {
    notFound();
  }

  const firstEpisode = episodes[0] ?? null;
  const firstEpisodeNumber = firstEpisode ? getEpisodeNumber(firstEpisode) : null;

  const { recordings, fetchErrorMessage } = await fetchRecordingsBySeriesId(seriesId);
  const readerCards = buildReaderCards(recordings);

  const allPublicSeries = await fetchPublicSeries();

  const relatedBase = (
    await Promise.all(
      allPublicSeries
        .filter((item) => item.id !== seriesId)
        .map(async (item) => {
          const publicEpisodes = sortEpisodes(
            (await fetchEpisodesBySeriesId(item.id)).filter((episode) =>
              isEpisodePubliclyVisible(episode)
            )
          );

          if (publicEpisodes.length === 0) {
            return null;
          }

          const firstPublicEpisode = publicEpisodes[0] ?? null;
          const latestPublicEpisode = publicEpisodes[publicEpisodes.length - 1] ?? null;

          const itemAuthorId = pickText(
            item.author_id,
            item["user_id"],
            item["userId"]
          );

          const itemAuthorName =
            itemAuthorId && authorId && itemAuthorId === authorId
              ? pickText(
                  author?.display_name,
                  author?.pen_name,
                  author?.username,
                  author?.name,
                  item["author_name"]
                )
              : pickText(item["author_name"]);

          const latestPostedRaw = latestPublicEpisode
            ? getEpisodePostedAtValue(latestPublicEpisode)
            : null;

          return {
            seriesId: item.id,
            title: pickText(item.title) || "無題",
            authorName: itemAuthorName || "作者名未設定",
            episodeCount: publicEpisodes.length,
            firstEpisodeNumber: firstPublicEpisode
              ? getEpisodeNumber(firstPublicEpisode)
              : null,
            latestPostedAtValue: latestPostedRaw
              ? new Date(latestPostedRaw).getTime()
              : 0,
            sameAuthor: !!authorId && itemAuthorId === authorId,
          };
        })
    )
  ).filter(
    (
      item
    ): item is RelatedWorkCard & {
      sameAuthor: boolean;
    } => !!item
  );

  const authorOtherWorks = relatedBase
    .filter((item) => item.sameAuthor)
    .sort((a, b) => b.latestPostedAtValue - a.latestPostedAtValue)
    .slice(0, 4);

  const similarWorks = relatedBase
    .filter((item) => !item.sameAuthor)
    .sort((a, b) => {
      const aDiff = Math.abs(a.episodeCount - episodes.length);
      const bDiff = Math.abs(b.episodeCount - episodes.length);
      if (aDiff !== bDiff) return aDiff - bDiff;
      return b.latestPostedAtValue - a.latestPostedAtValue;
    })
    .slice(0, 4);

  const seriesTitle = pickText(series.title) || "無題";
  const authorName =
    pickText(
      author?.display_name,
      author?.pen_name,
      author?.username,
      author?.name,
      series["author_name"]
    ) || "作者名未設定";

  const summary = getSeriesSummary(series) || "あらすじはまだ登録されていません。";

  const workSelfHref = buildWorksHref(
    seriesId,
    currentTab,
    selectedReaderKey,
    selectedReaderName
  );

  const loginHref = `/login?next=${encodeURIComponent(workSelfHref)}`;

  const recordingPermissionMode = resolveRecordingPermissionMode(
    series.recording_permission_mode
  );

  const reviewsVisible = isSeriesReviewVisible(series);

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/" className="hover:text-black">
            TOP
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-700">作品ページ</span>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-sm sm:rounded-[32px]">
          <div className="border-b border-black/10 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
            <div className="grid gap-5 xl:grid-cols-[1.8fr_0.9fr] xl:items-start">
              <div>
                <p className="text-[11px] tracking-[0.25em] text-neutral-500">
                  WORK PAGE
                </p>

                <h1 className="mt-3 text-2xl font-bold leading-tight text-black sm:text-3xl xl:text-4xl">
                  {seriesTitle}
                </h1>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-neutral-600">
                  <span>作者</span>
                  {authorId ? (
                    <Link
                      href={buildAuthorHref(authorId)}
                      className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-neutral-800 transition hover:border-sky-200 hover:bg-sky-50"
                    >
                      {authorName}
                    </Link>
                  ) : (
                    <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-neutral-800">
                      {authorName}
                    </span>
                  )}
                </div>

                <p className="mt-5 whitespace-pre-wrap text-sm leading-8 text-neutral-700 sm:text-[15px]">
                  {summary}
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  {firstEpisodeNumber !== null ? (
                    <Link
                      href={buildReadHref(
                        seriesId,
                        firstEpisodeNumber,
                        selectedReaderKey,
                        selectedReaderName
                      )}
                      className="rounded-full border border-black/10 bg-neutral-200 px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-300"
                    >
                      第1話から読む
                    </Link>
                  ) : (
                    <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-500">
                      公開話なし
                    </span>
                  )}

                  <Link
                    href={buildWorksHref(
                      seriesId,
                      "toc",
                      selectedReaderKey,
                      selectedReaderName
                    )}
                    className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm text-neutral-800 transition hover:bg-neutral-50"
                  >
                    目次を見る
                  </Link>

                  <FavoriteBookmarkButton seriesId={seriesId} />
                  <SeriesReactionButton
                    seriesId={seriesId}
                    loginHref={loginHref}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <StatCard
                  label="話数"
                  value={`${episodes.length}話`}
                  sub="公開中エピソード数"
                />
                <StatCard
                  label="朗読者"
                  value={`${readerCards.length}人`}
                  sub="公開中の朗読者数"
                />
                <StatCard
                  label="導線"
                  value="作品 → 目次 → 本文"
                  sub="小説投稿サイトの流れを優先"
                />
              </div>
            </div>
          </div>

          <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <section className="rounded-[24px] border border-black/10 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] tracking-[0.18em] text-neutral-500">
                    INDEX / READERS
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-black">
                    目次 / 朗読者
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-neutral-600">
                    まずは目次から話を選び、必要なら朗読者を固定して本文へ入る。
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <TabButton
                    href={buildWorksHref(
                      seriesId,
                      "toc",
                      selectedReaderKey,
                      selectedReaderName
                    )}
                    active={currentTab === "toc"}
                    label="目次"
                  />
                  <TabButton
                    href={buildWorksHref(
                      seriesId,
                      "readers",
                      selectedReaderKey,
                      selectedReaderName
                    )}
                    active={currentTab === "readers"}
                    label="朗読者"
                  />
                </div>
              </div>

              {currentTab === "toc" ? (
                <div className="mt-5">
                  {selectedReaderName ? (
                    <div className="mb-4 rounded-[20px] border border-sky-200 bg-sky-50 p-4 text-sm text-black">
                      選択中の朗読者: {selectedReaderName}
                    </div>
                  ) : (
                    <div className="mb-4 rounded-[20px] border border-black/10 bg-neutral-50 p-4 text-sm text-neutral-600">
                      朗読者を固定したい時は、朗読者タブから選んで目次へ戻る。
                    </div>
                  )}

                  <div className="overflow-hidden rounded-[20px] border border-black/10">
                    <ul className="divide-y divide-black/10">
                      {episodes.map((episode) => {
                        const episodeNumber = getEpisodeNumber(episode);
                        const episodeTitle =
                          pickText(episode.title, episode["episode_title"]) ||
                          `第${episodeNumber}話`;

                        const postedDate = formatEpisodeDate(getEpisodePostedAtValue(episode));
                        const editedDate = formatEpisodeDate(getEpisodeLastEditedAtValue(episode));

                        return (
                          <li key={episode.id}>
                            <Link
                              href={buildReadHref(
                                seriesId,
                                episodeNumber,
                                selectedReaderKey,
                                selectedReaderName
                              )}
                              className="group flex items-center justify-between gap-4 px-4 py-4 transition hover:bg-neutral-50"
                            >
                              <div className="min-w-0">
                                <div className="flex items-start gap-3">
                                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white text-sm text-neutral-700">
                                    {episodeNumber}
                                  </span>

                                  <div className="min-w-0">
                                    <p className="text-sm text-neutral-500">
                                      第{episodeNumber}話
                                    </p>
                                    <p className="truncate text-base font-medium text-black">
                                      {episodeTitle}
                                    </p>
                                    <p className="mt-1 text-xs text-neutral-500">
                                      {postedDate ? `投稿日 ${postedDate}` : "投稿日 未設定"}
                                      {editedDate ? `（${editedDate} 編集済み）` : ""}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="shrink-0 rounded-full border border-black/10 bg-white px-3.5 py-2 text-sm text-neutral-700 transition group-hover:border-sky-200 group-hover:bg-sky-50 group-hover:text-black">
                                読む
                              </div>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="mt-5 grid gap-3">
                  {fetchErrorMessage ? (
                    <div className="rounded-[20px] border border-black/10 bg-neutral-100 p-4 text-sm leading-7 text-neutral-700">
                      {fetchErrorMessage}
                    </div>
                  ) : null}

                  {readerCards.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-black/15 bg-neutral-50 p-5 text-sm leading-7 text-neutral-600">
                      まだ公開中の朗読がない。
                    </div>
                  ) : (
                    readerCards.map((reader) => {
                      const isSelected =
                        selectedReaderKey === reader.readerKey ||
                        selectedReaderName === reader.name;

                      return (
                        <div
                          key={reader.readerKey}
                          className={[
                            "rounded-[20px] border p-4",
                            isSelected
                              ? "border-sky-200 bg-sky-50/60"
                              : "border-black/10 bg-neutral-50",
                          ].join(" ")}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-sm font-semibold text-black">
                                  #{reader.rank}
                                </span>

                                <Link
                                  href={buildReaderHref(reader.readerKey, reader.name)}
                                  className="text-base font-semibold text-black transition hover:text-neutral-700"
                                >
                                  {reader.name}
                                </Link>

                                {isSelected ? (
                                  <span className="rounded-full border border-sky-200 bg-white px-3 py-1 text-[11px] text-black">
                                    選択中
                                  </span>
                                ) : null}
                              </div>

                              <div className="mt-3 flex flex-wrap gap-2">
                                {reader.tags.length > 0 ? (
                                  reader.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="rounded-full border border-black/10 bg-white px-3 py-1 text-sm text-neutral-700"
                                    >
                                      {tag}
                                    </span>
                                  ))
                                ) : (
                                  <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-sm text-neutral-500">
                                    タグ未設定
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Link
                                href={buildReaderHref(reader.readerKey, reader.name)}
                                className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                              >
                                朗読者ページへ
                              </Link>

                              <Link
                                href={buildWorksHref(
                                  seriesId,
                                  "toc",
                                  reader.readerKey,
                                  reader.name
                                )}
                                className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                              >
                                この朗読で目次へ
                              </Link>

                              {firstEpisodeNumber !== null ? (
                                <Link
                                  href={buildReadHref(
                                    seriesId,
                                    firstEpisodeNumber,
                                    reader.readerKey,
                                    reader.name
                                  )}
                                  className="rounded-full border border-black/10 bg-neutral-200 px-4 py-2 text-sm font-medium text-black transition hover:bg-neutral-300"
                                >
                                  この朗読で再生
                                </Link>
                              ) : null}
                            </div>
                          </div>

                          <p className="mt-4 text-sm leading-7 text-neutral-600">
                            {reader.description}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-neutral-500">
                            <span className="rounded-full border border-black/10 bg-white px-3 py-1">
                              公開朗読 {reader.recordingCount}件
                            </span>
                            <span className="rounded-full border border-black/10 bg-white px-3 py-1">
                              いいね {reader.totalLikes}
                            </span>
                            <span className="rounded-full border border-black/10 bg-white px-3 py-1">
                              再生 {reader.totalPlays}
                            </span>
                            <span className="rounded-full border border-black/10 bg-white px-3 py-1">
                              DL {reader.allowDownload ? "可" : "不可"}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </section>
          </div>
        </section>

        {reviewsVisible ? (
          <div className="mt-8">
            <SeriesReviewSection
              seriesId={seriesId}
              loginHref={loginHref}
            />
          </div>
        ) : null}

        <section className="mt-8 grid gap-4 xl:grid-cols-2">
          <div className="rounded-[24px] border border-black/10 bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] tracking-[0.18em] text-neutral-500">
                  AUTHOR OTHER WORKS
                </p>
                <h2 className="mt-2 text-lg font-semibold text-black">
                  作者の他作品
                </h2>
              </div>
              <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-[11px] text-neutral-600">
                {authorOtherWorks.length}件
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              {authorOtherWorks.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-black/15 bg-neutral-50 p-4 text-sm leading-7 text-neutral-600">
                  まだ他の公開作品はない。
                </div>
              ) : (
                authorOtherWorks.map((work) => (
                  <RelatedWorkCard
                    key={work.seriesId}
                    work={work}
                    label="同作者"
                  />
                ))
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/10 bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] tracking-[0.18em] text-neutral-500">
                  SIMILAR WORKS
                </p>
                <h2 className="mt-2 text-lg font-semibold text-black">
                  類似作品候補
                </h2>
              </div>
              <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-[11px] text-neutral-600">
                {similarWorks.length}件
              </span>
            </div>

            <p className="mt-2 text-sm leading-7 text-neutral-600">
              今は安全に取れる情報だけで、話数や公開状況が近い作品を暫定表示している。
            </p>

            <div className="mt-4 grid gap-3">
              {similarWorks.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-black/15 bg-neutral-50 p-4 text-sm leading-7 text-neutral-600">
                  まだ候補に出せる公開作品がない。
                </div>
              ) : (
                similarWorks.map((work) => (
                  <RelatedWorkCard
                    key={work.seriesId}
                    work={work}
                    label="候補"
                  />
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[24px] border border-black/10 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] tracking-[0.18em] text-neutral-500">
                ABOUT THIS WORK
              </p>
              <h2 className="mt-2 text-lg font-semibold text-black">
                この作品について
              </h2>
            </div>

            <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-[11px] text-neutral-500">
              INFO
            </span>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            <div className="rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3">
              <p className="text-sm text-neutral-500">作者</p>
              <p className="mt-2 text-sm font-medium text-black">{authorName}</p>
            </div>

            <div className="rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3">
              <p className="text-sm text-neutral-500">朗読可否</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={[
                    "rounded-full border px-3 py-1 text-sm",
                    getRecordingPermissionBadgeClass(recordingPermissionMode),
                  ].join(" ")}
                >
                  {getRecordingPermissionLabel(recordingPermissionMode)}
                </span>
              </div>
              <p className="mt-3 text-sm leading-7 text-neutral-600">
                {getRecordingPermissionDescription(recordingPermissionMode)}
              </p>
            </div>

            <InfoActionRow
              label="朗読出力"
              value="朗読ページへ"
              href={recordingPermissionMode !== "closed" ? buildRecordHubHref(seriesId) : undefined}
              disabled={recordingPermissionMode === "closed"}
              tone={recordingPermissionMode !== "closed" ? "accent" : "plain"}
            />

            <InfoActionRow
              label="本文PDF化"
              value="準備中"
              disabled
            />
          </div>
        </section>
      </div>
    </main>
  );
}