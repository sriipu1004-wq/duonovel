import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type PageProps = {
  params: Promise<{ seriesId: string }>;
};

type SeriesRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  tags?: string[] | string | null;
  bgm_title?: string | null;
  bgm_audio_path?: string | null;
};

type EpisodeRow = Record<string, unknown> & {
  id: string;
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
      .filter((tag) => tag.length > 0);
  }

  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw
      .split(/[\n,、]/)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  return [];
}

async function fetchEpisodesBySeriesId(seriesId: string): Promise<EpisodeRow[]> {
  const firstTry = await supabase
    .from("episodes")
    .select("id")
    .eq("series_id", seriesId);

  if (!firstTry.error) {
    return (firstTry.data ?? []) as EpisodeRow[];
  }

  const secondTry = await supabase
    .from("episodes")
    .select("id")
    .eq("seriesId", seriesId);

  if (!secondTry.error) {
    return (secondTry.data ?? []) as EpisodeRow[];
  }

  return [];
}

function ManageLinkCard({
  href,
  title,
  description,
  badge,
}: {
  href: string;
  title: string;
  description: string;
  badge: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[28px] border border-white/10 bg-black/20 p-5 transition hover:border-white/20 hover:bg-white/[0.04]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-neutral-500">
            MANAGE
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white transition group-hover:text-neutral-100">
            {title}
          </h2>
        </div>

        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300">
          {badge}
        </span>
      </div>

      <p className="mt-4 text-sm leading-7 text-neutral-400">{description}</p>

      <div className="mt-5 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition group-hover:bg-white group-hover:text-black">
        開く
      </div>
    </Link>
  );
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

export default async function ManageSeriesHubPage({ params }: PageProps) {
  const { seriesId } = await params;

  const { data: seriesData, error: seriesError } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .single();

  if (seriesError || !seriesData) {
    notFound();
  }

  const series = seriesData as SeriesRow;
  const seriesTitle = pickText(series.title) || "無題";
  const summary =
    pickText(series.summary, series.description) ||
    "作品単位で管理機能へ入るための最小ハブ。";
  const tags = parseTags(series.tags);
  const episodes = await fetchEpisodesBySeriesId(seriesId);
  const hasSeriesBgm =
    pickText(series.bgm_title, series.bgm_audio_path).length > 0;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-300">作品管理ハブ</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              DUONOVEL MANAGE HUB
            </p>

            <h1 className="mt-3 text-3xl font-bold text-white">{seriesTitle}</h1>

            <p className="mt-3 text-sm leading-7 text-neutral-400">{summary}</p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/works/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                作品ページを見る
              </Link>

              <Link
                href={`/manage/bgm/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                BGM管理へ
              </Link>

              <Link
                href={`/manage/tags/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                タグ管理へ
              </Link>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="EPISODES"
                value={`${episodes.length}話`}
                sub="作品に紐づく話数"
              />
              <StatCard
                label="TAGS"
                value={`${tags.length}件`}
                sub="series.tags の現在件数"
              />
              <StatCard
                label="SERIES BGM"
                value={hasSeriesBgm ? "設定あり" : "未設定"}
                sub="作品共通BGMの現在状態"
              />
            </div>

            <section className="grid gap-4 md:grid-cols-2">
              <ManageLinkCard
                href={`/manage/bgm/${seriesId}`}
                title="BGM管理"
                description="作品共通BGMと、各話BGMの設定へ進む。"
                badge="BGM"
              />

              <ManageLinkCard
                href={`/manage/tags/${seriesId}`}
                title="タグ管理"
                description="作品タグ canonical source の series.tags を編集する。"
                badge="TAGS"
              />
            </section>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                CURRENT TAGS
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                現在の作品タグ
              </h2>

              <div className="mt-4 flex flex-wrap gap-2">
                {tags.length > 0 ? (
                  tags.map((tag, index) => (
                    <span
                      key={`${tag}-${index}`}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-sm text-neutral-200"
                    >
                      #{tag}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-sm text-neutral-500">
                    タグ未設定
                  </span>
                )}
              </div>

              <p className="mt-4 text-sm leading-7 text-neutral-400">
                今回の管理ハブは最小版。管理対象は BGM とタグの2導線に絞っている。
              </p>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}