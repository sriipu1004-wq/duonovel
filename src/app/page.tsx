import Link from "next/link";
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

type UserRow = Record<string, unknown> & {
  id: string;
  display_name?: string | null;
  username?: string | null;
  pen_name?: string | null;
  name?: string | null;
};

type WorkCard = {
  seriesId: string;
  title: string;
  summary: string;
  authorName: string;
  episodeCount: number;
  firstEpisodeNumber: number | null;
  latestEpisodeNumber: number | null;
  latestPostedLabel: string;
  latestPostedAtValue: number;
};

async function fetchPublicSeries(): Promise<SeriesRow[]> {
  const { data, error } = await supabase
    .from("series")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);

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

function buildReadHref(seriesId: string, episodeNumber: number): string {
  return `/read/${seriesId}/${episodeNumber}`;
}

function buildWorkHref(seriesId: string): string {
  return `/works/${seriesId}`;
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

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-black/10 pb-3">
      <p className="text-[11px] tracking-[0.22em] text-neutral-500">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">{title}</h2>
      <p className="mt-2 text-sm leading-7 text-neutral-600">{description}</p>
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

function CompactWorkCard({ work }: { work: WorkCard }) {
  return (
    <article className="rounded-[22px] border border-black/10 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm text-neutral-500">作者 {work.authorName}</p>
        <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-[11px] text-neutral-600">
          更新 {work.latestPostedLabel}
        </span>
      </div>

      <h3 className="mt-2 line-clamp-2 text-base font-semibold leading-tight text-black sm:text-lg">
        {work.title}
      </h3>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-600">
        <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1">
          {work.episodeCount}話
        </span>
        <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1">
          最初 {work.firstEpisodeNumber ? `第${work.firstEpisodeNumber}話` : "未設定"}
        </span>
        <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1">
          最新 {work.latestEpisodeNumber ? `第${work.latestEpisodeNumber}話` : "未設定"}
        </span>
      </div>

      <p className="mt-3 line-clamp-3 text-sm leading-7 text-neutral-600">
        {work.summary}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={buildWorkHref(work.seriesId)}
          className="rounded-full border border-black/10 bg-white px-3.5 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
        >
          作品ページ
        </Link>

        {work.firstEpisodeNumber ? (
          <Link
            href={buildReadHref(work.seriesId, work.firstEpisodeNumber)}
            className="rounded-full border border-black/10 bg-neutral-200 px-3.5 py-2 text-sm font-medium text-black transition hover:bg-neutral-300"
          >
            第1話から読む
          </Link>
        ) : (
          <span className="rounded-full border border-black/10 bg-neutral-50 px-3.5 py-2 text-sm text-neutral-500">
            未公開
          </span>
        )}
      </div>
    </article>
  );
}

function DenseListRow({
  work,
  rank,
}: {
  work: WorkCard;
  rank?: number;
}) {
  return (
    <article className="rounded-[20px] border border-black/10 bg-white px-4 py-4">
      <div className="flex items-start gap-3">
        {typeof rank === "number" ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/10 bg-neutral-50 text-sm font-semibold text-black">
            {rank}
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="line-clamp-1 text-base font-semibold leading-tight text-black">
              {work.title}
            </h3>
            <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1 text-[11px] text-neutral-600">
              {work.episodeCount}話
            </span>
            <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1 text-[11px] text-neutral-600">
              {work.latestPostedLabel}
            </span>
          </div>

          <p className="mt-1 text-sm text-neutral-500">作者 {work.authorName}</p>
          <p className="mt-2 line-clamp-2 text-sm leading-7 text-neutral-600">
            {work.summary}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={buildWorkHref(work.seriesId)}
              className="rounded-full border border-black/10 bg-white px-3.5 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
            >
              作品ページ
            </Link>

            {work.firstEpisodeNumber ? (
              <Link
                href={buildReadHref(work.seriesId, work.firstEpisodeNumber)}
                className="rounded-full border border-black/10 bg-neutral-200 px-3.5 py-2 text-sm font-medium text-black transition hover:bg-neutral-300"
              >
                第1話から読む
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export default async function PublicTopPage() {
  const publicSeries = await fetchPublicSeries();

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
        );

        const author = authorId ? authorMap.get(authorId) : null;

        const latestPostedRaw = latestEpisode
          ? getEpisodePostedAtValue(latestEpisode)
          : null;

        const latestPostedAtValue = latestPostedRaw
          ? new Date(latestPostedRaw).getTime()
          : 0;

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
          episodeCount: publicEpisodes.length,
          firstEpisodeNumber: firstEpisode
            ? getEpisodeNumber(firstEpisode)
            : null,
          latestEpisodeNumber: latestEpisode
            ? getEpisodeNumber(latestEpisode)
            : null,
          latestPostedLabel: formatDate(latestPostedRaw),
          latestPostedAtValue,
        } satisfies WorkCard;
      })
    )
  )
    .filter((card): card is WorkCard => !!card)
    .sort((a, b) => b.latestPostedAtValue - a.latestPostedAtValue);

  const latestWorks = [...workCards].slice(0, 6);
  const firstReadableWorks = [...workCards].slice(0, 5);
  const longReadWorks = [...workCards]
    .sort((a, b) => {
      if (b.episodeCount !== a.episodeCount) {
        return b.episodeCount - a.episodeCount;
      }
      return b.latestPostedAtValue - a.latestPostedAtValue;
    })
    .slice(0, 5);

  const allVisibleWorks = [...workCards].slice(0, 12);

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
                完全無料。
                <br />
                小説投稿サイトの見やすさを保ったまま、
                <br />
                文字でできる表現の幅を広げる。
              </h1>

              <p className="mt-5 max-w-3xl text-sm leading-8 text-neutral-700 sm:text-[15px]">
                LIB read は、完全無料で使える小説投稿サイト。
                朗読や、文字、背景自体の編集などを扱いながら、
                小説投稿サイトというプラットホームを保ちつつ、
                文字でできる表現の幅を広げたい。
                まずは作品を探しやすく、目次に入りやすく、本文へ進みやすいことを優先する。
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="#latest"
                  className="rounded-full border border-black/10 bg-neutral-200 px-5 py-3 text-sm font-medium text-black transition hover:bg-neutral-300"
                >
                  公開中の作品を見る
                </Link>

                <Link
                  href="/write"
                  className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
                >
                  投稿する
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap gap-2">
                <ExploreChip href="#latest" label="新着更新" />
                <ExploreChip href="#firstread" label="まず読める作品" />
                <ExploreChip href="#longread" label="話数が多い作品" />
                <ExploreChip href="#allworks" label="公開中一覧" />
              </div>
            </div>

            <div className="rounded-[24px] border border-black/10 bg-neutral-50 p-4 sm:p-5">
              <p className="text-[11px] tracking-[0.18em] text-neutral-500">
                入口
              </p>
              <h2 className="mt-3 text-xl font-bold leading-tight text-black sm:text-2xl">
                最初は説明、
                <br />
                下に行くほど作品を探せる。
              </h2>

              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-sm font-semibold text-black">まずサイトの趣旨を知る</p>
                  <p className="mt-2 text-sm leading-7 text-neutral-600">
                    何が無料で、何ができるかを最初に短く伝える。
                  </p>
                </div>

                <div className="rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-sm font-semibold text-black">すぐ下で作品を探す</p>
                  <p className="mt-2 text-sm leading-7 text-neutral-600">
                    新着更新、まず読める作品、長く読める作品から入れる。
                  </p>
                </div>

                <div className="rounded-2xl border border-black/10 bg-white p-4">
                  <p className="text-sm font-semibold text-black">目次から本文へ進む</p>
                  <p className="mt-2 text-sm leading-7 text-neutral-600">
                    作品ページでは目次を主役にして、本文へすぐ進める。
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
            description="最近動いている作品から入りやすくする。"
          />

          {latestWorks.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
              まだ公開作品がない。
            </div>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {latestWorks.map((work) => (
                <CompactWorkCard key={work.seriesId} work={work} />
              ))}
            </div>
          )}
        </section>

        <section id="firstread" className="pt-12">
          <SectionHeading
            eyebrow="START READING"
            title="まず読める作品"
            description="作品ページか第1話へすぐ入りやすい作品を並べる。"
          />

          {firstReadableWorks.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
              まだ公開作品がない。
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {firstReadableWorks.map((work) => (
                <DenseListRow key={work.seriesId} work={work} />
              ))}
            </div>
          )}
        </section>

        <section id="longread" className="pt-12">
          <SectionHeading
            eyebrow="LONG READ"
            title="話数が多い作品"
            description="長く読める作品を上から見つけやすくする。"
          />

          {longReadWorks.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
              まだ公開作品がない。
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {longReadWorks.map((work, index) => (
                <DenseListRow
                  key={work.seriesId}
                  work={work}
                  rank={index + 1}
                />
              ))}
            </div>
          )}
        </section>

        <section id="allworks" className="pt-12">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-4">
            <div>
              <p className="text-[11px] tracking-[0.22em] text-neutral-500">
                PUBLIC WORKS
              </p>
              <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">
                公開中の作品一覧
              </h2>
              <p className="mt-2 text-sm leading-7 text-neutral-600">
                作品ページと第1話への入口をまとめて置く。
              </p>
            </div>

            <div className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
              表示作品 {allVisibleWorks.length}件
            </div>
          </div>

          {allVisibleWorks.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
              まだ公開作品がない。
            </div>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {allVisibleWorks.map((work) => (
                <CompactWorkCard key={work.seriesId} work={work} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}