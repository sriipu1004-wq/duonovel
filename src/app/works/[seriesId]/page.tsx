import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ContinueReadingCard from "@/features/bookmark/ContinueReadingCard";

type PageProps = {
  params: Promise<{ seriesId: string }>;
  searchParams?: Promise<{
    tab?: string;
    readerKey?: string;
    readerName?: string;
  }>;
};

type SeriesRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  catch_copy?: string | null;
  author_id?: string | null;
  user_id?: string | null;
};

type UserRow = Record<string, unknown> & {
  id: string;
  display_name?: string | null;
  username?: string | null;
  pen_name?: string | null;
  name?: string | null;
};

type EpisodeRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  episode_number?: number | null;
  episodeNumber?: number | null;
  is_published?: boolean | null;
  published?: boolean | null;
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

function buildAuthorHref(authorId: string): string {
  return `/authors/${encodeURIComponent(authorId)}`;
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
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs tracking-[0.18em] text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {sub ? <p className="mt-2 text-sm text-neutral-400">{sub}</p> : null}
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
        "rounded-full px-4 py-2 text-sm font-medium transition",
        active
          ? "bg-white text-black"
          : "border border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function BottomControlButton({
  label,
  disabled = true,
}: {
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="flex h-11 min-w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-neutral-300 disabled:opacity-70"
    >
      {label}
    </button>
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
  const authorId = pickText(series.author_id, series.user_id, series["userId"]);

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

  const episodes = rawEpisodes
    .filter(isPublishedEpisode)
    .sort((a, b) => getEpisodeNumber(a) - getEpisodeNumber(b));

  const firstEpisode = episodes[0] ?? null;
  const firstEpisodeNumber = firstEpisode ? getEpisodeNumber(firstEpisode) : null;

  const { recordings, fetchErrorMessage } = await fetchRecordingsBySeriesId(seriesId);
  const readerCards = buildReaderCards(recordings);

  const seriesTitle = pickText(series.title) || "無題";
  const authorName =
    pickText(
      author?.display_name,
      author?.pen_name,
      author?.username,
      author?.name,
      series["author_name"]
    ) || "作者名未設定";

  const summary =
    pickText(
      series.summary,
      series.description,
      series["synopsis"],
      series["body"],
      series.catch_copy
    ) || "あらすじはまだ登録されていません。";

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/" className="hover:text-neutral-300">
            TOP
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-300">作品ページ</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="grid gap-6 border-b border-white/10 px-5 py-6 lg:grid-cols-[1.6fr_0.9fr] lg:px-8 lg:py-8">
            <div>
              <p className="text-xs tracking-[0.25em] text-neutral-500">
                DUONOVEL WORK
              </p>

              <h1 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-4xl">
                {seriesTitle}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-neutral-400">
                <span>作者</span>

                {authorId ? (
                  <Link
                    href={buildAuthorHref(authorId)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    {authorName}
                  </Link>
                ) : (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-neutral-200">
                    {authorName}
                  </span>
                )}
              </div>

              <p className="mt-6 whitespace-pre-wrap text-[15px] leading-8 text-neutral-300">
                {summary}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                {firstEpisodeNumber !== null ? (
                  <Link
                    href={buildReadHref(
                      seriesId,
                      firstEpisodeNumber,
                      selectedReaderKey,
                      selectedReaderName
                    )}
                    className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                  >
                    第1話から読む
                  </Link>
                ) : (
                  <span className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-500">
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
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white/10"
                >
                  目次を見る
                </Link>

                <Link
                  href={buildWorksHref(
                    seriesId,
                    "readers",
                    selectedReaderKey,
                    selectedReaderName
                  )}
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white/10"
                >
                  朗読者を見る
                </Link>

                {authorId ? (
                  <Link
                    href={buildAuthorHref(authorId)}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    作者ページへ
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              <StatCard
                label="EPISODES"
                value={`${episodes.length}話`}
                sub="公開中エピソード数"
              />
              <StatCard
                label="READERS"
                value={`${readerCards.length}人`}
                sub="公開中の朗読者数"
              />
              <StatCard
                label="EFFECT"
                value="後で追加"
                sub="BGM / 色反転 / 演出をここから拡張"
              />
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 lg:grid-cols-[1.1fr_1.9fr] lg:px-8">
            <aside className="space-y-5">
              <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs tracking-[0.18em] text-neutral-500">
                      CONTINUE
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-white">
                      続きから読む
                    </h2>
                  </div>
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                    DB優先
                  </div>
                </div>

                <ContinueReadingCard
                  seriesId={seriesId}
                  fallbackEpisodeNumber={firstEpisodeNumber}
                  fallbackReaderKey={selectedReaderKey}
                  fallbackReaderName={selectedReaderName}
                />
              </section>

              <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">
                  SETTINGS
                </p>
                <h2 className="mt-2 text-lg font-semibold text-white">
                  配布・設定エリア
                </h2>

                <div className="mt-4 space-y-3">
                  <button
                    type="button"
                    disabled
                    className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-neutral-500"
                  >
                    <span>朗読音声をダウンロード</span>
                    <span>許可制</span>
                  </button>

                  <button
                    type="button"
                    disabled
                    className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-neutral-500"
                  >
                    <span>本文PDFを入手</span>
                    <span>許可制</span>
                  </button>
                </div>

                <p className="mt-4 text-sm leading-7 text-neutral-400">
                  今は見た目だけ。あとで作者・朗読者の許可フラグと繋ぐ。
                </p>
              </section>
            </aside>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    INDEX
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
                    目次 / 朗読者
                  </h2>
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
                    <div className="mb-4 rounded-[24px] border border-sky-400/20 bg-sky-400/10 p-4 text-sm text-sky-200">
                      選択中の朗読者: {selectedReaderName}
                    </div>
                  ) : (
                    <div className="mb-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-400">
                      朗読者を固定したい時は、朗読者タブから選んで目次へ戻る
                    </div>
                  )}

                  <div className="overflow-hidden rounded-[24px] border border-white/10">
                    {episodes.length === 0 ? (
                      <div className="p-6 text-neutral-500">
                        まだ公開されている話がない
                      </div>
                    ) : (
                      <ul className="divide-y divide-white/10">
                        {episodes.map((episode) => {
                          const episodeNumber = getEpisodeNumber(episode);
                          const episodeTitle =
                            pickText(episode.title, episode["episode_title"]) ||
                            `第${episodeNumber}話`;

                          return (
                            <li key={episode.id}>
                              <Link
                                href={buildReadHref(
                                  seriesId,
                                  episodeNumber,
                                  selectedReaderKey,
                                  selectedReaderName
                                )}
                                className="group flex items-center justify-between gap-4 px-4 py-4 transition hover:bg-white/[0.04] sm:px-5"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-3">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm text-neutral-300">
                                      {episodeNumber}
                                    </span>
                                    <div className="min-w-0">
                                      <p className="text-sm text-neutral-500">
                                        第{episodeNumber}話
                                      </p>
                                      <p className="truncate text-base font-medium text-white">
                                        {episodeTitle}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300 transition group-hover:bg-white group-hover:text-black">
                                  読む
                                </div>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-5 grid gap-4">
                  {fetchErrorMessage ? (
                    <div className="rounded-[24px] border border-red-400/20 bg-red-400/10 p-4 text-sm leading-7 text-red-200">
                      {fetchErrorMessage}
                    </div>
                  ) : null}

                  {readerCards.length === 0 ? (
                    <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-neutral-400">
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
                            "rounded-[24px] border bg-white/[0.03] p-4",
                            isSelected
                              ? "border-sky-400/30 ring-1 ring-sky-400/20"
                              : "border-white/10",
                          ].join(" ")}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-black">
                                  #{reader.rank}
                                </span>

                                <Link
                                  href={buildReaderHref(reader.readerKey, reader.name)}
                                  className="text-lg font-semibold text-white transition hover:text-neutral-300"
                                >
                                  {reader.name}
                                </Link>

                                {isSelected ? (
                                  <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-200">
                                    選択中
                                  </span>
                                ) : null}
                              </div>

                              <div className="mt-3 flex flex-wrap gap-2">
                                {reader.tags.length > 0 ? (
                                  reader.tags.map((tag) => (
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
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Link
                                href={buildReaderHref(reader.readerKey, reader.name)}
                                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
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
                                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
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
                                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                                >
                                  この朗読で再生
                                </Link>
                              ) : null}
                            </div>
                          </div>

                          <p className="mt-4 text-sm leading-7 text-neutral-400">
                            {reader.description}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-500">
                            <span className="rounded-full border border-white/10 px-3 py-1">
                              公開朗読 {reader.recordingCount}件
                            </span>
                            <span className="rounded-full border border-white/10 px-3 py-1">
                              いいね {reader.totalLikes}
                            </span>
                            <span className="rounded-full border border-white/10 px-3 py-1">
                              再生 {reader.totalPlays}
                            </span>
                            <span className="rounded-full border border-white/10 px-3 py-1">
                              DL {reader.allowDownload ? "可" : "不可"}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}

                  <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-4 text-sm leading-7 text-neutral-500">
                    今の人気順は like_count、次に play_count で並べている。
                  </div>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-[#0a0a0a]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-400">
              栞
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-400">
              途中話数表示は次回
            </div>
          </div>

          <div className="flex items-center gap-2">
            <BottomControlButton label="🔖" />
            <BottomControlButton label="↺15" />

            {firstEpisodeNumber !== null ? (
              <Link
                href={buildReadHref(
                  seriesId,
                  firstEpisodeNumber,
                  selectedReaderKey,
                  selectedReaderName
                )}
                className="flex h-11 min-w-24 items-center justify-center rounded-2xl border border-white/10 bg-white px-4 text-sm font-semibold text-black transition hover:opacity-90"
              >
                ▶ 再生
              </Link>
            ) : (
              <BottomControlButton label="▶ 再生" />
            )}

            <BottomControlButton label="15↻" />
            <BottomControlButton label="⚙" />
          </div>
        </div>
      </div>
    </main>
  );
}