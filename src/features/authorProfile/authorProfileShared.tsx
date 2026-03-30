import Link from "next/link";
import {
  getEpisodeNumber,
  isPublishedEpisode,
  pickText,
  sortEpisodes,
  type EpisodeRow as BaseEpisodeRow,
  type SeriesRow as BaseSeriesRow,
} from "@/features/write/writeShared";

type SupabaseLike = {
  from: (table: string) => any;
};

export type UserRow = Record<string, unknown> & {
  id: string;
  display_name?: string | null;
  username?: string | null;
  pen_name?: string | null;
  name?: string | null;
  bio?: string | null;
  profile?: string | null;
  description?: string | null;
};

export type SeriesRow = BaseSeriesRow & {
  user_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EpisodeRow = BaseEpisodeRow;

export type AuthorSeriesCard = {
  series: SeriesRow;
  episodes: EpisodeRow[];
  totalEpisodes: number;
  publishedCount: number;
  latestEpisodeNumber: number | null;
  latestPublishedEpisodeNumber: number | null;
  firstPublishedEpisodeNumber: number | null;
};

type HeroBadge = {
  label: string;
};

type HeroAction = {
  href: string;
  label: string;
  tone?: "primary" | "secondary";
};

type HeroStat = {
  label: string;
  value: string | number;
  sub: string;
};

function toTimestamp(value: unknown): number {
  if (typeof value !== "string" || !value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function buildAuthorPageHref(authorId: string): string {
  return `/authors/${encodeURIComponent(authorId)}`;
}

export function buildWorksHref(seriesId: string): string {
  return `/works/${seriesId}`;
}

export function buildReadHref(seriesId: string, episodeNumber: number): string {
  return `/read/${seriesId}/${episodeNumber}`;
}

export function resolveAuthorName(
  user?: UserRow | null,
  fallback?: unknown
): string {
  return (
    pickText(
      user?.display_name,
      user?.pen_name,
      user?.username,
      user?.name,
      fallback
    ) || "作者名未設定"
  );
}

export function resolveAuthorBio(user?: UserRow | null): string {
  return (
    pickText(user?.bio, user?.profile, user?.description) ||
    "プロフィールはまだ登録されていない。"
  );
}

export function getProfileSeriesSummary(series: SeriesRow): string {
  return (
    pickText(
      series.summary,
      series.description,
      series["synopsis"],
      series["body"],
      series.catch_copy
    ) || "あらすじはまだ登録されていない。"
  );
}

export async function fetchAuthorById(
  authorId: string,
  supabase: SupabaseLike
): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", authorId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return (data as UserRow | null) ?? null;
}

export async function fetchSeriesByAuthorId(
  authorId: string,
  supabase: SupabaseLike
): Promise<SeriesRow[]> {
  const [byAuthorId, byUserId] = await Promise.all([
    supabase
      .from("series")
      .select("*")
      .eq("author_id", authorId)
      .order("created_at", { ascending: false }),
    supabase
      .from("series")
      .select("*")
      .eq("user_id", authorId)
      .order("created_at", { ascending: false }),
  ]);

  if (byAuthorId.error && byUserId.error) {
    throw new Error(
      `series の取得に失敗: ${
        byAuthorId.error?.message ?? byUserId.error?.message ?? "unknown"
      }`
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
    const timeDiff =
      toTimestamp(b.updated_at ?? b.created_at) -
      toTimestamp(a.updated_at ?? a.created_at);

    if (timeDiff !== 0) {
      return timeDiff;
    }

    return (pickText(a.title) || "無題").localeCompare(
      pickText(b.title) || "無題",
      "ja"
    );
  });
}

export async function fetchEpisodesBySeriesIds(
  seriesIds: string[],
  supabase: SupabaseLike
): Promise<EpisodeRow[]> {
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

export async function buildAuthorSeriesCards(
  seriesRows: SeriesRow[],
  supabase: SupabaseLike
): Promise<AuthorSeriesCard[]> {
  const rawEpisodes = await fetchEpisodesBySeriesIds(
    seriesRows.map((series) => series.id),
    supabase
  );

  const grouped = new Map<string, EpisodeRow[]>();

  for (const episode of rawEpisodes) {
    const seriesId = pickText(episode.series_id, episode.seriesId);
    if (!seriesId) continue;

    const current = grouped.get(seriesId) ?? [];
    current.push(episode);
    grouped.set(seriesId, current);
  }

  return seriesRows.map((series) => {
    const episodes = sortEpisodes(grouped.get(series.id) ?? []);
    const publishedEpisodes = episodes.filter(isPublishedEpisode);

    const latestEpisode = episodes.length > 0 ? episodes[episodes.length - 1] : null;
    const latestPublishedEpisode =
      publishedEpisodes.length > 0
        ? publishedEpisodes[publishedEpisodes.length - 1]
        : null;
    const firstPublishedEpisode =
      publishedEpisodes.length > 0 ? publishedEpisodes[0] : null;

    return {
      series,
      episodes,
      totalEpisodes: episodes.length,
      publishedCount: publishedEpisodes.length,
      latestEpisodeNumber: latestEpisode
        ? getEpisodeNumber(latestEpisode)
        : null,
      latestPublishedEpisodeNumber: latestPublishedEpisode
        ? getEpisodeNumber(latestPublishedEpisode)
        : null,
      firstPublishedEpisodeNumber: firstPublishedEpisode
        ? getEpisodeNumber(firstPublishedEpisode)
        : null,
    };
  });
}

export function ProfileHero({
  eyebrow,
  title,
  description,
  badges,
  actions,
  stats,
  notice,
}: {
  eyebrow: string;
  title: string;
  description: string;
  badges?: HeroBadge[];
  actions?: HeroAction[];
  stats?: HeroStat[];
  notice?: string;
}) {
  return (
    <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
      <div className="border-b border-white/10 px-5 py-6 sm:px-8">
        <p className="text-xs tracking-[0.22em] text-neutral-500">{eyebrow}</p>

        <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
          {title}
        </h1>

        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-neutral-300 sm:text-base">
          {description}
        </p>

        {badges && badges.length > 0 ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {badges.map((badge) => (
              <span
                key={badge.label}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-neutral-300"
              >
                {badge.label}
              </span>
            ))}
          </div>
        ) : null}

        {actions && actions.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-3">
            {actions.map((action) => (
              <Link
                key={`${action.href}-${action.label}`}
                href={action.href}
                className={
                  action.tone === "primary"
                    ? "rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                    : "rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                }
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}

        {notice ? (
          <div className="mt-5 rounded-[24px] border border-sky-400/20 bg-sky-400/10 p-4 text-sm leading-7 text-sky-200">
            {notice}
          </div>
        ) : null}
      </div>

      {stats && stats.length > 0 ? (
        <div className="grid gap-4 px-5 py-6 sm:px-8 md:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-[28px] border border-white/10 bg-black/20 p-5"
            >
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                {stat.label}
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {stat.value}
              </p>
              <p className="mt-2 text-sm text-neutral-400">{stat.sub}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ProfileSeriesSection({
  eyebrow,
  title,
  description,
  cards,
  emptyMessage,
  mode,
  headerAction,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  cards: AuthorSeriesCard[];
  emptyMessage: string;
  mode: "public" | "private";
  headerAction?: {
    href: string;
    label: string;
  };
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-neutral-500">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
          {description ? (
            <p className="mt-3 text-sm leading-7 text-neutral-400">
              {description}
            </p>
          ) : null}
        </div>

        {headerAction ? (
          <Link
            href={headerAction.href}
            className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
          >
            {headerAction.label}
          </Link>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4">
        {cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-neutral-400">
            {emptyMessage}
          </div>
        ) : (
          cards.map((card) => {
            const titleText = pickText(card.series.title) || "無題";
            const summary = getProfileSeriesSummary(card.series);

            return (
              <article
                key={card.series.id}
                className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <p className="text-xs tracking-[0.18em] text-neutral-500">
                      SERIES
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold text-white">
                      {titleText}
                    </h3>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-400">
                      {summary}
                    </p>
                  </div>

                  {mode === "public" ? (
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-400">
                        公開話数 {card.publishedCount}話
                      </span>
                      {card.latestPublishedEpisodeNumber !== null ? (
                        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-400">
                          最新公開 第{card.latestPublishedEpisodeNumber}話
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-400">
                        総話数 {card.totalEpisodes}
                      </span>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-400">
                        公開中 {card.publishedCount}
                      </span>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-400">
                        最新話{" "}
                        {card.latestEpisodeNumber !== null
                          ? `第${card.latestEpisodeNumber}話`
                          : "未作成"}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href={buildWorksHref(card.series.id)}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    作品ページへ
                  </Link>

                  {mode === "public" ? (
                    card.firstPublishedEpisodeNumber !== null ? (
                      <Link
                        href={buildReadHref(
                          card.series.id,
                          card.firstPublishedEpisodeNumber
                        )}
                        className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
                      >
                        第1話から読む
                      </Link>
                    ) : (
                      <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-500">
                        公開話なし
                      </span>
                    )
                  ) : (
                    <>
<>
  <Link
    href={`/write/series/${card.series.id}`}
    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
  >
    作品ワークスペースへ
  </Link>
</>
                    </>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}