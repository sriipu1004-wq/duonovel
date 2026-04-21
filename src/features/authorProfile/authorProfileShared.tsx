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
  x_url?: string | null;
  xUrl?: string | null;
  note_url?: string | null;
  noteUrl?: string | null;
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

type SurfaceTone = "dark" | "light";

function toTimestamp(value: unknown): number {
  if (typeof value !== "string" || !value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function safeDecodeRouteParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

function getSurfaceStyles(surface: SurfaceTone) {
  if (surface === "light") {
    return {
      heroSection:
        "overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm",
      heroHeader: "border-b border-black/10 px-5 py-6 sm:px-8",
      eyebrow: "text-xs tracking-[0.22em] text-neutral-500",
      heroTitle: "mt-3 text-3xl font-bold text-black sm:text-4xl",
      heroDescription:
        "mt-4 whitespace-pre-wrap text-sm leading-7 text-neutral-600 sm:text-base",
      badge:
        "rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-xs text-neutral-700",
      primaryAction:
        "rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800",
      secondaryAction:
        "rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50",
      notice:
        "mt-5 rounded-[24px] border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-neutral-800",
      statCard: "rounded-[28px] border border-black/10 bg-neutral-50 p-5",
      statLabel: "text-xs tracking-[0.18em] text-neutral-500",
      statValue: "mt-2 text-3xl font-semibold text-black",
      statSub: "mt-2 text-sm text-neutral-600",
      section: "rounded-[28px] border border-black/10 bg-white p-5 shadow-sm",
      sectionEyebrow: "text-xs tracking-[0.18em] text-neutral-500",
      sectionTitle: "mt-2 text-xl font-semibold text-black",
      sectionDescription: "mt-3 text-sm leading-7 text-neutral-600",
      headerAction:
        "rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50",
      empty:
        "rounded-2xl border border-dashed border-black/15 bg-neutral-50 px-4 py-4 text-sm leading-7 text-neutral-600",
      article: "rounded-[28px] border border-black/10 bg-white p-5",
      articleTitle: "mt-2 text-2xl font-semibold text-black",
      articleSummary:
        "mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-600",
      pill:
        "rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-xs text-neutral-600",
      workLink:
        "rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50",
      readLink:
        "rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-black transition hover:bg-sky-100",
      mutedPill:
        "rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-500",
    };
  }

  return {
    heroSection:
      "overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl",
    heroHeader: "border-b border-white/10 px-5 py-6 sm:px-8",
    eyebrow: "text-xs tracking-[0.22em] text-neutral-500",
    heroTitle: "mt-3 text-3xl font-bold text-white sm:text-4xl",
    heroDescription:
      "mt-4 whitespace-pre-wrap text-sm leading-7 text-neutral-300 sm:text-base",
    badge:
      "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-neutral-300",
    primaryAction:
      "rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90",
    secondaryAction:
      "rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black",
    notice:
      "mt-5 rounded-[24px] border border-sky-400/20 bg-sky-400/10 p-4 text-sm leading-7 text-sky-200",
    statCard: "rounded-[28px] border border-white/10 bg-black/20 p-5",
    statLabel: "text-xs tracking-[0.18em] text-neutral-500",
    statValue: "mt-2 text-3xl font-semibold text-white",
    statSub: "mt-2 text-sm text-neutral-400",
    section: "rounded-[28px] border border-white/10 bg-black/20 p-5",
    sectionEyebrow: "text-xs tracking-[0.18em] text-neutral-500",
    sectionTitle: "mt-2 text-xl font-semibold text-white",
    sectionDescription: "mt-3 text-sm leading-7 text-neutral-400",
    headerAction:
      "rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black",
    empty:
      "rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-neutral-400",
    article: "rounded-[28px] border border-white/10 bg-white/[0.03] p-5",
    articleTitle: "mt-2 text-2xl font-semibold text-white",
    articleSummary:
      "mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-400",
    pill:
      "rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-400",
    workLink:
      "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black",
    readLink:
      "rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90",
    mutedPill:
      "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-500",
  };
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
  return pickText(user?.bio, user?.profile, user?.description) || "自己紹介未記入";
}

function normalizeExternalUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "";
  }

  const trimmed = value.trim();

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

export function resolveAuthorXUrl(user?: UserRow | null): string {
  return normalizeExternalUrl(pickText(user?.x_url, user?.xUrl));
}

export function resolveAuthorNoteUrl(user?: UserRow | null): string {
  return normalizeExternalUrl(pickText(user?.note_url, user?.noteUrl));
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
  const normalizedAuthorId = safeDecodeRouteParam(authorId);

  if (!isUuidLike(normalizedAuthorId)) {
    return null;
  }

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", normalizedAuthorId)
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
  const normalizedAuthorId = safeDecodeRouteParam(authorId);

  if (!isUuidLike(normalizedAuthorId)) {
    return [];
  }

  const [byAuthorId, byUserId] = await Promise.all([
    supabase
      .from("series")
      .select("*")
      .eq("author_id", normalizedAuthorId)
      .order("created_at", { ascending: false }),
    supabase
      .from("series")
      .select("*")
      .eq("user_id", normalizedAuthorId)
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
    const publishedEpisodes = episodes.filter((episode) => isPublishedEpisode(episode));

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
      latestEpisodeNumber: latestEpisode ? getEpisodeNumber(latestEpisode) : null,
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
  extraContent,
  surface = "dark",
}: {
  eyebrow: string;
  title: string;
  description: string;
  badges?: HeroBadge[];
  actions?: HeroAction[];
  stats?: HeroStat[];
  notice?: string;
  extraContent?: React.ReactNode;
  surface?: SurfaceTone;
}) {
  const styles = getSurfaceStyles(surface);

  return (
    <section className={styles.heroSection}>
      <div className={styles.heroHeader}>
        <p className={styles.eyebrow}>{eyebrow}</p>

        <h1 className={styles.heroTitle}>{title}</h1>

        <p className={styles.heroDescription}>{description}</p>

        {badges && badges.length > 0 ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {badges.map((badge) => (
              <span key={badge.label} className={styles.badge}>
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
                    ? styles.primaryAction
                    : styles.secondaryAction
                }
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}

        {notice ? <div className={styles.notice}>{notice}</div> : null}

        {extraContent ? <div className="mt-5">{extraContent}</div> : null}
      </div>

      {stats && stats.length > 0 ? (
        <div className="grid gap-4 px-5 py-6 sm:px-8 md:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className={styles.statCard}>
              <p className={styles.statLabel}>{stat.label}</p>
              <p className={styles.statValue}>{stat.value}</p>
              <p className={styles.statSub}>{stat.sub}</p>
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
  surface = "dark",
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
  surface?: SurfaceTone;
}) {
  const styles = getSurfaceStyles(surface);

  return (
    <section className={styles.section}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={styles.sectionEyebrow}>{eyebrow}</p>
          <h2 className={styles.sectionTitle}>{title}</h2>
          {description ? <p className={styles.sectionDescription}>{description}</p> : null}
        </div>

        {headerAction ? (
          <Link href={headerAction.href} className={styles.headerAction}>
            {headerAction.label}
          </Link>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4">
        {cards.length === 0 ? (
          <div className={styles.empty}>{emptyMessage}</div>
        ) : (
          cards.map((card) => {
            const titleText = pickText(card.series.title) || "無題";
            const summary = getProfileSeriesSummary(card.series);

            return (
              <article key={card.series.id} className={styles.article}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <p className={styles.sectionEyebrow}>SERIES</p>
                    <h3 className={styles.articleTitle}>{titleText}</h3>
                    <p className={styles.articleSummary}>{summary}</p>
                  </div>

                  {mode === "public" ? (
                    <div className="flex flex-wrap gap-2">
                      <span className={styles.pill}>公開話数 {card.publishedCount}話</span>
                      {card.latestPublishedEpisodeNumber !== null ? (
                        <span className={styles.pill}>
                          最新公開 第{card.latestPublishedEpisodeNumber}話
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <span className={styles.pill}>総話数 {card.totalEpisodes}</span>
                      <span className={styles.pill}>公開中 {card.publishedCount}</span>
                      <span className={styles.pill}>
                        最新話{" "}
                        {card.latestEpisodeNumber !== null
                          ? `第${card.latestEpisodeNumber}話`
                          : "未作成"}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href={buildWorksHref(card.series.id)} className={styles.workLink}>
                    作品ページへ
                  </Link>

                  {mode === "public" ? (
                    card.firstPublishedEpisodeNumber !== null ? (
                      <Link
                        href={buildReadHref(card.series.id, card.firstPublishedEpisodeNumber)}
                        className={styles.readLink}
                      >
                        第1話から読む
                      </Link>
                    ) : (
                      <span className={styles.mutedPill}>公開話なし</span>
                    )
                  ) : (
                    <Link
                      href={`/write/series/${card.series.id}`}
                      className={styles.workLink}
                    >
                      作品ワークスペースへ
                    </Link>
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