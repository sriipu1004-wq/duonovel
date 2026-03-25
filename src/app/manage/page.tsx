import Link from "next/link";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";

type SeriesRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  tags?: string[] | string | null;
  bgm_title?: string | null;
  bgm_audio_path?: string | null;
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

function buildManageSeriesHref(seriesId: string): string {
  return `/manage/series/${seriesId}`;
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

function ManageSeriesCard({
  seriesId,
  title,
  summary,
  tagCount,
  hasSeriesBgm,
}: {
  seriesId: string;
  title: string;
  summary: string;
  tagCount: number;
  hasSeriesBgm: boolean;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-neutral-500">
            SERIES MANAGE
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300">
            tags {tagCount}件
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300">
            BGM {hasSeriesBgm ? "設定あり" : "未設定"}
          </span>
        </div>
      </div>

      <p className="mt-4 text-sm leading-7 text-neutral-400">{summary}</p>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={buildManageSeriesHref(seriesId)}
          className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
        >
          管理ハブを開く
        </Link>

        <Link
          href={`/works/${seriesId}`}
          className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
        >
          作品ページを見る
        </Link>
      </div>
    </div>
  );
}

export default async function ManageTopPage() {
  const { supabase, user } = await requireLoggedInUser("/manage");

  const { data, error } = await supabase
    .from("series")
    .select("*")
    .eq("author_id", user.id);

  if (error) {
    throw new Error(`manage series 一覧の取得に失敗: ${error.message}`);
  }

  const seriesList = ((data ?? []) as SeriesRow[])
    .slice()
    .sort((a, b) =>
      pickText(a.title).localeCompare(pickText(b.title), "ja")
    );

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-300">管理トップ</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              DUONOVEL MANAGE
            </p>

            <h1 className="mt-3 text-3xl font-bold text-white">管理トップ</h1>

            <p className="mt-3 text-sm leading-7 text-neutral-400">
              ここは管理入口の最小整理ページ。
              まずは自分の作品一覧から、作品単位の管理ハブへ入れるようにする。
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                ホームへ
              </Link>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="OWNED SERIES"
                value={`${seriesList.length}件`}
                sub="自分が管理できる作品数"
              />
              <StatCard
                label="ENTRY"
                value="作品単位"
                sub="詳細管理は既存の /manage/series/[seriesId] に寄せる"
              />
              <StatCard
                label="TARGET"
                value="BGM / TAGS"
                sub="今回の管理入口整理対象"
              />
            </div>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                GUIDE
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                今の管理導線
              </h2>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
                `/manage` では自分の作品一覧を出す。<br />
                作品ごとの詳細管理は `/manage/series/[seriesId]` に集約する。<br />
                そこから BGM管理 と タグ管理 へ入る。
              </div>
            </section>

            <section className="grid gap-4">
              {seriesList.length > 0 ? (
                seriesList.map((series) => {
                  const title = pickText(series.title) || "無題";
                  const summary =
                    pickText(series.summary, series.description) ||
                    "作品単位の管理ハブへ入る。";
                  const tags = parseTags(series.tags);
                  const hasSeriesBgm =
                    pickText(series.bgm_title, series.bgm_audio_path).length > 0;

                  return (
                    <ManageSeriesCard
                      key={series.id}
                      seriesId={series.id}
                      title={title}
                      summary={summary}
                      tagCount={tags.length}
                      hasSeriesBgm={hasSeriesBgm}
                    />
                  );
                })
              ) : (
                <div className="rounded-[28px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-neutral-400">
                  まだ自分の管理対象作品がない。
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}