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

type SearchPageProps = {
  searchParams?: Promise<{
    q?: string;
    tag?: string;
    sort?: string;
    mode?: string;
    genre?: string;
  }>;
};

type SortKey =
  | "latest"
  | "weekly-new"
  | "overall-popular"
  | "narration-popular";

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

type TagChip = {
  value: string;
  label: string;
  count: number;
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

function normalizeTagToken(value: string): string {
  return value.trim().replace(/^#+/, "").toLowerCase();
}

function formatTagLabel(value: string): string {
  const trimmed = value.trim().replace(/^#+/, "");
  if (!trimmed) return "";
  return `#${trimmed}`;
}

function buildSearchHref(params: {
  q?: string;
  tag?: string;
  sort?: SortKey;
}): string {
  const query = new URLSearchParams();

  if (params.q && params.q.trim().length > 0) {
    query.set("q", params.q.trim());
  }

  if (params.tag && params.tag.trim().length > 0) {
    query.set("tag", params.tag.trim());
  }

  if (params.sort) {
    query.set("sort", params.sort);
  }

  const queryString = query.toString();
  return queryString ? `/search?${queryString}` : "/search";
}

function buildSearchTarget(work: WorkCard): string {
  return [
    work.title,
    work.summary,
    work.authorName,
    work.tags.join(" "),
  ]
    .join("\n")
    .toLowerCase();
}

function buildAvailableTags(works: WorkCard[]): TagChip[] {
  const counter = new Map<string, TagChip>();

  for (const work of works) {
    const seen = new Set<string>();

    for (const tag of work.tags) {
      const normalized = normalizeTagToken(tag);
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);

      const current = counter.get(normalized);
      if (current) {
        current.count += 1;
        continue;
      }

      counter.set(normalized, {
        value: normalized,
        label: formatTagLabel(tag),
        count: 1,
      });
    }
  }

  return Array.from(counter.values())
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.value.localeCompare(b.value, "ja");
    })
    .slice(0, 24);
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

function resolveSort(value: string): SortKey {
  if (value === "latest") return "latest";
  if (value === "weekly-new") return "weekly-new";
  if (value === "narration-popular") return "narration-popular";
  return "overall-popular";
}

function getSortLabel(sort: SortKey): string {
  if (sort === "latest") return "新着更新順";
  if (sort === "weekly-new") return "週間新作おすすめ順";
  if (sort === "narration-popular") return "朗読視聴人気順";
  return "総合人気順";
}

function getSortDescription(sort: SortKey): string {
  if (sort === "latest") {
    return "最近更新された公開作品から順に表示。";
  }
  if (sort === "weekly-new") {
    return "新しめの作品から入りやすい順に表示。";
  }
  if (sort === "narration-popular") {
    return "朗読視聴寄りの人気順で表示。";
  }
  return "公開中作品を総合人気寄りの順に表示。";
}

async function fetchPublicSeries(): Promise<SeriesRow[]> {
  const { data, error } = await supabase
    .from("series")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(80);

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

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const query = pickText(resolvedSearchParams?.q);
  const selectedTag = pickText(resolvedSearchParams?.tag);
  const sort = resolveSort(
    pickText(resolvedSearchParams?.sort, resolvedSearchParams?.mode)
  );

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

  const normalizedQuery = query.trim().toLowerCase();
  const normalizedSelectedTag = normalizeTagToken(selectedTag);

  const filteredWorks = workCards.filter((work) => {
    const queryOk =
      normalizedQuery.length === 0 ||
      buildSearchTarget(work).includes(normalizedQuery);

    const tagOk =
      normalizedSelectedTag.length === 0 ||
      work.tags.some((tag) => {
        const normalizedTag = normalizeTagToken(tag);
        return (
          normalizedTag === normalizedSelectedTag ||
          normalizedTag.includes(normalizedSelectedTag) ||
          normalizedSelectedTag.includes(normalizedTag)
        );
      });

    return queryOk && tagOk;
  });

  const sortedWorks =
    sort === "latest"
      ? sortLatest(filteredWorks)
      : sort === "weekly-new"
        ? sortWeeklyNew(filteredWorks)
        : sort === "narration-popular"
          ? sortNarrationPopular(filteredWorks)
          : sortOverallPopular(filteredWorks);

  const availableTags = buildAvailableTags(workCards);
  const selectedTagLabel = selectedTag ? formatTagLabel(selectedTag) : "";
  const hasActiveFilter = query.length > 0 || selectedTag.length > 0;

  const sortOptions: Array<{ value: SortKey; label: string }> = [
    { value: "overall-popular", label: "総合人気順" },
    { value: "latest", label: "新着更新順" },
    { value: "weekly-new", label: "週間新作おすすめ順" },
    { value: "narration-popular", label: "朗読視聴人気順" },
  ];

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/" className="hover:text-black">
            TOP
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-700">公開検索</span>
        </div>

        <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm sm:p-6 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] tracking-[0.24em] text-neutral-500">
                PUBLIC SEARCH
              </p>
              <h1 className="mt-3 text-2xl font-bold leading-tight text-black sm:text-3xl">
                公開作品を探す
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-8 text-neutral-600 sm:text-[15px]">
                キーワード、タグ、並び順から公開作品を探せるページ。
                トップの「さらに表示」やタグ押下からそのまま流れ込める公開導線として使う。
              </p>
            </div>

            <Link
              href="/"
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
            >
              TOPへ戻る
            </Link>
          </div>

          <form
            action="/search"
            method="get"
            className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_220px_auto]"
          >
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="作品名 / 作者名 / あらすじなどで検索"
              className="h-12 rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-sky-200"
            />

            <input
              type="text"
              name="tag"
              defaultValue={selectedTag}
              placeholder="タグで絞る（#ありでも可）"
              className="h-12 rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-sky-200"
            />

            <select
              name="sort"
              defaultValue={sort}
              className="h-12 rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none focus:border-sky-200"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-black/10 bg-neutral-200 px-5 text-sm font-medium text-black transition hover:bg-neutral-300"
            >
              検索する
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {hasActiveFilter ? (
              <>
                {query ? (
                  <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
                    キーワード: {query}
                  </span>
                ) : null}

                {selectedTagLabel ? (
                  <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
                    タグ: {selectedTagLabel}
                  </span>
                ) : null}

                <Link
                  href={buildSearchHref({ sort })}
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
                >
                  条件をクリア
                </Link>
              </>
            ) : (
              <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-600">
                条件なしで公開作品を表示中
              </span>
            )}
          </div>

          <div className="mt-6">
            <p className="text-[11px] tracking-[0.18em] text-neutral-500">
              POPULAR TAGS
            </p>

            {availableTags.length === 0 ? (
              <p className="mt-3 text-sm leading-7 text-neutral-500">
                まだタグ候補がない。
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {availableTags.map((tag) => {
                  const active =
                    normalizeTagToken(tag.value) ===
                    normalizeTagToken(selectedTag);

                  return (
                    <Link
                      key={tag.value}
                      href={buildSearchHref({
                        q: query,
                        tag: tag.label,
                        sort,
                      })}
                      className={[
                        "rounded-full border px-3 py-2 text-sm transition",
                        active
                          ? "border-sky-200 bg-sky-50 text-black"
                          : "border-black/10 bg-white text-neutral-700 hover:border-sky-200 hover:bg-sky-50 hover:text-black",
                      ].join(" ")}
                    >
                      {tag.label}
                      <span className="ml-2 text-neutral-400">{tag.count}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-3">
            <div>
              <p className="text-[11px] tracking-[0.22em] text-neutral-500">
                RESULTS
              </p>
              <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">
                {getSortLabel(sort)}
              </h2>
              <p className="mt-2 text-sm leading-7 text-neutral-600">
                {getSortDescription(sort)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
                {sortedWorks.length}件
              </span>

              {sortOptions.map((option) => {
                const active = option.value === sort;

                return (
                  <Link
                    key={option.value}
                    href={buildSearchHref({
                      q: query,
                      tag: selectedTag,
                      sort: option.value,
                    })}
                    className={[
                      "rounded-full border px-4 py-2 text-sm transition",
                      active
                        ? "border-sky-200 bg-sky-50 text-black"
                        : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                    ].join(" ")}
                  >
                    {option.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {workCards.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
              まだ公開作品がない。
            </div>
          ) : sortedWorks.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
              条件に合う公開作品がない。
            </div>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-2">
              {sortedWorks.map((work) => (
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

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
          >
            TOPへ戻る
          </Link>

          <Link
            href="/#latest"
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
          >
            トップの一覧へ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}