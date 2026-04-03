import Link from "next/link";
import PublicWorkBoardCard from "@/components/public/PublicWorkBoardCard";
import { supabase } from "@/lib/supabaseClient";
import {
  getEpisodeNumber,
  getEpisodePostedAtValue,
  getSeriesPublicationStatus,
  getSeriesSummary,
  isEpisodePubliclyVisible,
  pickText,
  sortEpisodes,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";

type PageProps = {
  searchParams?: Promise<{
    mode?: string;
    tag?: string;
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
  like_count?: number | null;
  likes_count?: number | null;
  play_count?: number | null;
  plays_count?: number | null;
  is_public?: boolean | null;
  public?: boolean | null;
};

type WorkCard = {
  seriesId: string;
  title: string;
  summary: string;
  authorName: string;
  authorId: string | null;
  episodeCount: number;
  firstEpisodeNumber: number | null;
  latestPostedLabel: string;
  latestPostedAtValue: number;
  createdAtValue: number;
  tags: string[];
  totalRecordingLikes: number;
  totalRecordingPlays: number;
  totalRecordingCount: number;
  popularityScore: number;
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

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "日付未設定";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "日付未設定";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function toTimeValue(value: unknown): number {
  if (typeof value !== "string" || value.trim().length === 0) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseTagList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0)
      .map((item) => (item.startsWith("#") ? item : `#${item}`));
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value
      .split(/[,、\s]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .map((item) => (item.startsWith("#") ? item : `#${item}`));
  }

  return [];
}

function getSeriesTags(series: SeriesRow): string[] {
  const candidates = [
    series["tags"],
    series["tag_list"],
    series["tagList"],
    series["genres"],
    series["genre"],
    series["keywords"],
  ];

  for (const candidate of candidates) {
    const parsed = parseTagList(candidate);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [];
}

function buildReadHref(seriesId: string, episodeNumber: number): string {
  return `/read/${seriesId}/${episodeNumber}`;
}

function buildWorkHref(seriesId: string): string {
  return `/works/${seriesId}`;
}

function buildAuthorHref(authorId: string): string {
  return `/authors/${encodeURIComponent(authorId)}`;
}

function buildMoreHref(mode: string): string {
  const query = new URLSearchParams();
  query.set("mode", mode);
  return `/?${query.toString()}#results`;
}

async function fetchPublicSeries(): Promise<SeriesRow[]> {
  const { data, error } = await supabase
    .from("series")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    throw new Error(`series の取得に失敗: ${error.message}`);
  }

  return ((data ?? []) as SeriesRow[]).filter(
    (series) => getSeriesPublicationStatus(series) === "public"
  );
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

  if (!secondTry.error) {
    return (secondTry.data ?? []) as EpisodeRow[];
  }

  return [];
}

async function fetchAuthorMap(authorIds: string[]): Promise<Map<string, UserRow>> {
  if (authorIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .in("id", authorIds);

  if (error) {
    return new Map();
  }

  return new Map(((data ?? []) as UserRow[]).map((user) => [user.id, user]));
}

async function fetchPublicRecordings(): Promise<RecordingRow[]> {
  const firstTry = await supabase.from("recordings").select("*");

  if (!firstTry.error) {
    return ((firstTry.data ?? []) as RecordingRow[]).filter(isPublicRecording);
  }

  return [];
}

function buildRecordingAggregateMap(recordings: RecordingRow[]) {
  const aggregate = new Map<
    string,
    {
      totalRecordingLikes: number;
      totalRecordingPlays: number;
      totalRecordingCount: number;
    }
  >();

  for (const recording of recordings) {
    const seriesId =
      pickText(recording.series_id, recording.seriesId) || null;

    if (!seriesId) continue;

    const current = aggregate.get(seriesId) ?? {
      totalRecordingLikes: 0,
      totalRecordingPlays: 0,
      totalRecordingCount: 0,
    };

    current.totalRecordingLikes += getRecordingLikes(recording);
    current.totalRecordingPlays += getRecordingPlays(recording);
    current.totalRecordingCount += 1;

    aggregate.set(seriesId, current);
  }

  return aggregate;
}

function SectionHeading({
  eyebrow,
  title,
  description,
  moreHref,
}: {
  eyebrow: string;
  title: string;
  description: string;
  moreHref: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-3">
      <div>
        <p className="text-[11px] tracking-[0.22em] text-neutral-500">{eyebrow}</p>
        <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">{title}</h2>
        <p className="mt-2 text-sm leading-7 text-neutral-600">{description}</p>
      </div>

      <Link
        href={moreHref}
        className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
      >
        さらに表示
      </Link>
    </div>
  );
}

function ExploreChip({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-black"
    >
      {label}
    </Link>
  );
}

function sortLatest(works: WorkCard[]) {
  return [...works].sort((a, b) => b.latestPostedAtValue - a.latestPostedAtValue);
}

function sortWeeklyNew(works: WorkCard[]) {
  const now = Date.now();
  const twoWeeks = 1000 * 60 * 60 * 24 * 14;

  const recent = works.filter((work) => now - work.createdAtValue <= twoWeeks);
  const target = recent.length > 0 ? recent : works;

  return [...target].sort((a, b) => {
    if (b.createdAtValue !== a.createdAtValue) {
      return b.createdAtValue - a.createdAtValue;
    }
    return b.latestPostedAtValue - a.latestPostedAtValue;
  });
}

function sortOverallPopular(works: WorkCard[]) {
  return [...works].sort((a, b) => {
    if (b.popularityScore !== a.popularityScore) {
      return b.popularityScore - a.popularityScore;
    }
    return b.latestPostedAtValue - a.latestPostedAtValue;
  });
}

function sortNarrationPopular(works: WorkCard[]) {
  return [...works].sort((a, b) => {
    if (b.totalRecordingPlays !== a.totalRecordingPlays) {
      return b.totalRecordingPlays - a.totalRecordingPlays;
    }
    if (b.totalRecordingLikes !== a.totalRecordingLikes) {
      return b.totalRecordingLikes - a.totalRecordingLikes;
    }
    return b.latestPostedAtValue - a.latestPostedAtValue;
  });
}

function ResultHeading({
  mode,
  tag,
}: {
  mode: string;
  tag: string;
}) {
  if (mode === "latest") {
    return {
      title: "新着更新の結果",
      description: "新着更新順で表示中。",
    };
  }

  if (mode === "weekly-new") {
    return {
      title: "週間新作おすすめの結果",
      description: "新作寄りの順で表示中。",
    };
  }

  if (mode === "overall-popular") {
    return {
      title: "総合人気順の結果",
      description: "公開中作品を人気寄りの順で表示中。",
    };
  }

  if (mode === "narration-popular") {
    return {
      title: "朗読視聴人気順の結果",
      description: "朗読視聴寄りの順で表示中。",
    };
  }

  if (mode === "tag" && tag) {
    return {
      title: `${tag} の結果`,
      description: "タグ一致作品を人気寄りの順で表示中。",
    };
  }

  return {
    title: "検索結果",
    description: "条件に合う公開作品を表示中。",
  };
}

export default async function PublicTopPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const mode = pickText(resolvedSearchParams?.mode);
  const tag = pickText(resolvedSearchParams?.tag);

  const publicSeries = await fetchPublicSeries();
  const publicRecordings = await fetchPublicRecordings();
  const recordingAggregateMap = buildRecordingAggregateMap(publicRecordings);

  const authorIds = Array.from(
    new Set(
      publicSeries
        .map((series) =>
          pickText(series.author_id, series["user_id"], series["userId"])
        )
        .filter((value): value is string => !!value)
    )
  );

  const authorMap = await fetchAuthorMap(authorIds);

  const workCards = (
    await Promise.all(
      publicSeries.map(async (series) => {
        const publicEpisodes = sortEpisodes(
          (await fetchEpisodesBySeriesId(series.id)).filter((episode) =>
            isEpisodePubliclyVisible(episode)
          )
        );

        if (publicEpisodes.length === 0) {
          return null;
        }

        const firstEpisode = publicEpisodes[0] ?? null;
        const latestEpisode = publicEpisodes[publicEpisodes.length - 1] ?? null;

        const authorId = pickText(
          series.author_id,
          series["user_id"],
          series["userId"]
        ) || null;

        const author = authorId ? authorMap.get(authorId) : null;

        const latestPostedRaw = latestEpisode
          ? getEpisodePostedAtValue(latestEpisode)
          : null;

        const latestPostedAtValue = latestPostedRaw
          ? new Date(latestPostedRaw).getTime()
          : 0;

        const createdAtValue = toTimeValue(series["created_at"]);
        const tags = getSeriesTags(series);

        const recordingAgg = recordingAggregateMap.get(series.id) ?? {
          totalRecordingLikes: 0,
          totalRecordingPlays: 0,
          totalRecordingCount: 0,
        };

        const popularityScore =
          recordingAgg.totalRecordingPlays * 3 +
          recordingAgg.totalRecordingLikes * 10 +
          recordingAgg.totalRecordingCount * 5 +
          publicEpisodes.length;

        return {
          seriesId: series.id,
          title: pickText(series.title) || "無題",
          summary:
            getSeriesSummary(series) || "あらすじはまだ登録されていません。",
          authorName:
            pickText(
              author?.display_name,
              author?.pen_name,
              author?.username,
              author?.name,
              series["author_name"]
            ) || "作者名未設定",
          authorId,
          episodeCount: publicEpisodes.length,
          firstEpisodeNumber: firstEpisode
            ? getEpisodeNumber(firstEpisode)
            : null,
          latestPostedLabel: formatDate(latestPostedRaw),
          latestPostedAtValue,
          createdAtValue,
          tags,
          totalRecordingLikes: recordingAgg.totalRecordingLikes,
          totalRecordingPlays: recordingAgg.totalRecordingPlays,
          totalRecordingCount: recordingAgg.totalRecordingCount,
          popularityScore,
        } satisfies WorkCard;
      })
    )
  ).filter((card): card is WorkCard => !!card);

  const latestWorks = sortLatest(workCards).slice(0, 4);
  const weeklyNewWorks = sortWeeklyNew(workCards).slice(0, 4);
  const overallPopularWorks = sortOverallPopular(workCards).slice(0, 4);
  const narrationPopularWorks = sortNarrationPopular(workCards).slice(0, 4);

  const filteredForResults =
    mode === "tag" && tag
      ? workCards.filter((work) => work.tags.includes(tag))
      : workCards;

  const resultWorks =
    mode === "latest"
      ? sortLatest(filteredForResults)
      : mode === "weekly-new"
        ? sortWeeklyNew(filteredForResults)
        : mode === "overall-popular"
          ? sortOverallPopular(filteredForResults)
          : mode === "narration-popular"
            ? sortNarrationPopular(filteredForResults)
            : mode === "tag"
              ? sortOverallPopular(filteredForResults)
              : [];

  const resultHeading = ResultHeading({ mode, tag });

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <section className="border-b border-black/10 pb-10">
          <div className="grid gap-8 xl:grid-cols-[1.55fr_0.9fr] xl:items-start">
            <div>
              <p className="text-[11px] tracking-[0.24em] text-neutral-500">
                FREE / NOVEL / READ / LISTEN
              </p>

              <h1 className="mt-4 text-3xl font-bold leading-tight text-black sm:text-4xl xl:text-5xl">
                小説投稿サイトの基盤を保ったまま、
                <br />
                朗読や文字、背景自体の編集など、
                <br />
                表現の幅を広げることを目的とした完全無料サイト。
              </h1>

              <p className="mt-5 max-w-4xl text-sm leading-8 text-neutral-700 sm:text-[15px]">
                LIB read は完全無料で使える小説投稿サイトです。朗読や、文字、背景自体の編集などを扱いながら、
                小説投稿サイトというプラットホームを保ちつつ、文字、あるいは言語自体を主体として、
                表現の幅の可能性を模索することを目的の一つとしています。もちろん従来の小説投稿サイトと同じ使い方をしても全く支障ありませんし、
                朗読視聴だけを目的に使っていただいても構いません。「読む」「聞く」「書いて、ついでにささやかながらなにか演出をつけてみる」
                「好きな作品を声に出して読んで、誰かに聞いてもらう」など、自分のしてみたいことをやってみてください。
              </p>

              <div className="mt-8">
                <p className="text-[11px] tracking-[0.22em] text-neutral-500">
                  目次
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ExploreChip href="#latest" label="新着更新" />
                  <ExploreChip href="#weekly-new" label="週間新作おすすめ" />
                  <ExploreChip href="#overall-popular" label="総合人気順" />
                  <ExploreChip href="#narration-popular" label="朗読視聴人気順" />
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-black/10 bg-neutral-50 p-4 sm:p-5">
              <p className="text-[11px] tracking-[0.18em] text-neutral-500">
                explain
              </p>
              <h2 className="mt-3 text-xl font-bold leading-tight text-black sm:text-2xl">
                概要
              </h2>

              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-sm font-semibold text-black">読む</p>
                  <p className="mt-2 text-sm leading-7 text-neutral-600">
                    ただ好きな作品を従来通りに楽しんだり、取り付けられた演出でより深く没入してみてみたり。
                  </p>
                </div>

                <div className="rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-sm font-semibold text-black">聞く</p>
                  <p className="mt-2 text-sm leading-7 text-neutral-600">
                    電車での暇つぶしや作業、散歩中のお供にでも。
                  </p>
                </div>

                <div className="rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-sm font-semibold text-black">書く</p>
                  <p className="mt-2 text-sm leading-7 text-neutral-600">
                    頭の中にある構想を文字へと抽出して、添え物のようになにか演出を追加してみたり。
                  </p>
                </div>

                <div className="rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-sm font-semibold text-black">読み上げる</p>
                  <p className="mt-2 text-sm leading-7 text-neutral-600">
                    お気に入りの作品への気持ちを朗読にて表現する等。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="latest" className="pt-10">
          <SectionHeading
            eyebrow="LATEST UPDATES"
            title="新着更新"
            description="最近更新された公開作品。"
            moreHref={buildMoreHref("latest")}
          />

          {latestWorks.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
              まだ公開作品がない。
            </div>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-2">
              {latestWorks.map((work) => (
                <PublicWorkBoardCard
                  key={work.seriesId}
                  title={work.title}
                  workHref={buildWorkHref(work.seriesId)}
                  authorName={work.authorName}
                  authorHref={work.authorId ? buildAuthorHref(work.authorId) : undefined}
                  latestPostedLabel={work.latestPostedLabel}
                  summary={work.summary}
                  firstReadHref={
                    work.firstEpisodeNumber
                      ? buildReadHref(work.seriesId, work.firstEpisodeNumber)
                      : undefined
                  }
                  tags={work.tags}
                />
              ))}
            </div>
          )}
        </section>

        <section id="weekly-new" className="pt-12">
          <SectionHeading
            eyebrow="WEEKLY NEW RECOMMEND"
            title="週間新作おすすめ"
            description="新しめの作品から入りやすくする。"
            moreHref={buildMoreHref("weekly-new")}
          />

          {weeklyNewWorks.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
              まだ公開作品がない。
            </div>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-2">
              {weeklyNewWorks.map((work) => (
                <PublicWorkBoardCard
                  key={work.seriesId}
                  title={work.title}
                  workHref={buildWorkHref(work.seriesId)}
                  authorName={work.authorName}
                  authorHref={work.authorId ? buildAuthorHref(work.authorId) : undefined}
                  latestPostedLabel={work.latestPostedLabel}
                  summary={work.summary}
                  firstReadHref={
                    work.firstEpisodeNumber
                      ? buildReadHref(work.seriesId, work.firstEpisodeNumber)
                      : undefined
                  }
                  tags={work.tags}
                />
              ))}
            </div>
          )}
        </section>

        <section id="overall-popular" className="pt-12">
          <SectionHeading
            eyebrow="OVERALL POPULAR"
            title="総合人気順"
            description="現時点の人気寄り順で公開作品を表示。"
            moreHref={buildMoreHref("overall-popular")}
          />

          {overallPopularWorks.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
              まだ公開作品がない。
            </div>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-2">
              {overallPopularWorks.map((work) => (
                <PublicWorkBoardCard
                  key={work.seriesId}
                  title={work.title}
                  workHref={buildWorkHref(work.seriesId)}
                  authorName={work.authorName}
                  authorHref={work.authorId ? buildAuthorHref(work.authorId) : undefined}
                  latestPostedLabel={work.latestPostedLabel}
                  summary={work.summary}
                  firstReadHref={
                    work.firstEpisodeNumber
                      ? buildReadHref(work.seriesId, work.firstEpisodeNumber)
                      : undefined
                  }
                  tags={work.tags}
                />
              ))}
            </div>
          )}
        </section>

        <section id="narration-popular" className="pt-12">
          <SectionHeading
            eyebrow="NARRATION POPULAR"
            title="朗読視聴人気順"
            description="朗読視聴寄りの順で公開作品を表示。"
            moreHref={buildMoreHref("narration-popular")}
          />

          {narrationPopularWorks.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
              まだ公開作品がない。
            </div>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-2">
              {narrationPopularWorks.map((work) => (
                <PublicWorkBoardCard
                  key={work.seriesId}
                  title={work.title}
                  workHref={buildWorkHref(work.seriesId)}
                  authorName={work.authorName}
                  authorHref={work.authorId ? buildAuthorHref(work.authorId) : undefined}
                  latestPostedLabel={work.latestPostedLabel}
                  summary={work.summary}
                  firstReadHref={
                    work.firstEpisodeNumber
                      ? buildReadHref(work.seriesId, work.firstEpisodeNumber)
                      : undefined
                  }
                  tags={work.tags}
                />
              ))}
            </div>
          )}
        </section>

        {mode ? (
          <section id="results" className="pt-12">
            <div className="border-b border-black/10 pb-3">
              <p className="text-[11px] tracking-[0.22em] text-neutral-500">
                RESULTS
              </p>
              <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">
                {resultHeading.title}
              </h2>
              <p className="mt-2 text-sm leading-7 text-neutral-600">
                {resultHeading.description}
              </p>
            </div>

            {resultWorks.length === 0 ? (
              <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
                条件に合う公開作品がない。
              </div>
            ) : (
              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-2">
                {resultWorks.map((work) => (
                  <PublicWorkBoardCard
                    key={work.seriesId}
                    title={work.title}
                    workHref={buildWorkHref(work.seriesId)}
                    authorName={work.authorName}
                    authorHref={work.authorId ? buildAuthorHref(work.authorId) : undefined}
                    latestPostedLabel={work.latestPostedLabel}
                    summary={work.summary}
                    firstReadHref={
                      work.firstEpisodeNumber
                        ? buildReadHref(work.seriesId, work.firstEpisodeNumber)
                        : undefined
                    }
                    tags={work.tags}
                  />
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}