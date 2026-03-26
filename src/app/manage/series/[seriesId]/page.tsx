import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";

type PageProps = {
  params: Promise<{ seriesId: string }>;
};

type RecordingPermissionMode = "open" | "closed" | "approval_required";
type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

type SeriesRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  tags?: string[] | string | null;
  bgm_title?: string | null;
  bgm_audio_path?: string | null;
  recording_permission_mode?: RecordingPermissionMode | null;
};

type EpisodeRow = Record<string, unknown> & {
  id: string;
};

type RecordingRequestSummaryRow = Record<string, unknown> & {
  id: string;
  status?: RequestStatus | null;
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

async function fetchEpisodesBySeriesId(
  supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"],
  seriesId: string
): Promise<EpisodeRow[]> {
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

async function fetchRecordingRequestsBySeriesId(
  supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"],
  seriesId: string
): Promise<RecordingRequestSummaryRow[]> {
  const { data, error } = await supabase
    .from("series_recording_requests")
    .select("id, status")
    .eq("series_id", seriesId);

  if (error) {
    return [];
  }

  return (data ?? []) as RecordingRequestSummaryRow[];
}

function getRecordingPermissionLabel(
  mode: RecordingPermissionMode | null | undefined
): string {
  if (mode === "open") return "無条件許可";
  if (mode === "approval_required") return "承認制";
  return "非許可";
}

function getRecordingPermissionSub(
  mode: RecordingPermissionMode | null | undefined
): string {
  if (mode === "open") {
    return "朗読者は申請なしで朗読制作へ進める";
  }
  if (mode === "approval_required") {
    return "朗読者は申請後、承認されるまで開始できない";
  }
  return "朗読募集なし。朗読制作ページでは非表示想定";
}

function normalizeRequestStatus(value: unknown): RequestStatus | null {
  if (value === "pending") return "pending";
  if (value === "approved") return "approved";
  if (value === "rejected") return "rejected";
  if (value === "cancelled") return "cancelled";
  return null;
}

function countPendingRequests(requests: RecordingRequestSummaryRow[]): number {
  return requests.filter(
    (request) => normalizeRequestStatus(request.status) === "pending"
  ).length;
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
  const nextPath = `/manage/series/${seriesId}`;
  const { supabase } = await requireOwnedSeries(seriesId, nextPath);

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
  const episodes = await fetchEpisodesBySeriesId(supabase, seriesId);
  const hasSeriesBgm =
    pickText(series.bgm_title, series.bgm_audio_path).length > 0;
  const recordingPermissionMode = series.recording_permission_mode ?? "closed";
  const recordingRequests = await fetchRecordingRequestsBySeriesId(
    supabase,
    seriesId
  );
  const pendingRequestCount = countPendingRequests(recordingRequests);

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
                href="/manage"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                管理トップへ
              </Link>

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

              <Link
                href={`/manage/recording-permission/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                朗読許可管理へ
              </Link>

              <Link
                href={`/manage/recording-requests/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                朗読申請一覧へ
              </Link>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
              <StatCard
                label="RECORDING"
                value={getRecordingPermissionLabel(recordingPermissionMode)}
                sub="作品ごとの朗読可否ルール"
              />
              <StatCard
                label="REQUESTS"
                value={`${pendingRequestCount}件`}
                sub="現在 pending の申請数"
              />
            </div>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

              <ManageLinkCard
                href={`/manage/recording-permission/${seriesId}`}
                title="朗読許可管理"
                description="作品ごとの朗読可否を、無条件許可・非許可・承認制の3状態で管理する。"
                badge="RECORDING"
              />

              <ManageLinkCard
                href={`/manage/recording-requests/${seriesId}`}
                title="朗読申請一覧"
                description="承認制作品に届いた朗読申請を一覧で確認する。今回は閲覧まで。"
                badge="REQUESTS"
              />
            </section>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                RECORDING RULE
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                現在の朗読可否
              </h2>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
                現在値:{" "}
                <span className="font-semibold text-white">
                  {getRecordingPermissionLabel(recordingPermissionMode)}
                </span>
                <br />
                {getRecordingPermissionSub(recordingPermissionMode)}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                REQUEST QUEUE
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                朗読申請の現在地
              </h2>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
                pending: {pendingRequestCount} 件
                <br />
                総申請数: {recordingRequests.length} 件
                <br />
                詳細確認は「朗読申請一覧」から行う。
              </div>
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
                今回の管理ハブは最小版。管理対象は BGM / タグ / 朗読許可 /
                朗読申請一覧 の4導線。
              </p>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}