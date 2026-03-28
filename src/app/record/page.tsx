import type { ReactNode } from "react";
import Link from "next/link";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import {
  buildRecordingEntryPath,
  buildRecordingRequestPath,
  buildWorkPath,
  normalizeRecordingPermissionMode,
  type RecordingPermissionMode,
} from "@/lib/recording/recordingEntry";

type PageProps = {
  searchParams?: Promise<{
    seriesId?: string;
  }>;
};

type LoggedInResult = Awaited<ReturnType<typeof requireLoggedInUser>>;
type SupabaseClient = LoggedInResult["supabase"];

type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

type SeriesRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  catch_copy?: string | null;
  overview?: string | null;
  recording_permission_mode?: RecordingPermissionMode | null;
  created_at?: string | null;
};

type RecordingRequestRow = Record<string, unknown> & {
  id: string;
  series_id?: string | null;
  status?: RequestStatus | null;
  request_message?: string | null;
  created_at?: string | null;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

function getSeriesSummary(series: SeriesRow): string {
  return (
    pickText(
      series.summary,
      series.description,
      series.catch_copy,
      series.overview
    ) || "作品概要はまだ設定されていない。"
  );
}

function normalizeRequestStatus(value: unknown): RequestStatus | null {
  if (value === "pending") return "pending";
  if (value === "approved") return "approved";
  if (value === "rejected") return "rejected";
  if (value === "cancelled") return "cancelled";
  return null;
}

function getRequestStatusLabel(status: RequestStatus | null): string {
  if (status === "pending") return "申請中";
  if (status === "approved") return "承認済み";
  if (status === "rejected") return "却下";
  if (status === "cancelled") return "取消済み";
  return "未申請";
}

function getRequestStatusClass(status: RequestStatus | null): string {
  if (status === "pending") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  }
  if (status === "approved") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }
  if (status === "rejected") {
    return "border-red-400/20 bg-red-400/10 text-red-200";
  }
  if (status === "cancelled") {
    return "border-white/10 bg-white/5 text-neutral-300";
  }
  return "border-white/10 bg-white/5 text-neutral-500";
}

function getPermissionLabel(mode: RecordingPermissionMode): string {
  if (mode === "open") return "自由朗読";
  if (mode === "approval_required") return "承認制";
  return "朗読停止";
}

function getPermissionDescription(mode: RecordingPermissionMode): string {
  if (mode === "open") {
    return "ログイン済みなら、そのまま朗読制作へ進める。";
  }
  if (mode === "approval_required") {
    return "まず申請し、承認済みになった作品だけ朗読制作へ進める。";
  }
  return "この作品では第三者朗読を受け付けていない。";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "未記録";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP");
}

function getCreatedAtScore(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

async function fetchDiscoverableSeries(
  supabase: SupabaseClient
): Promise<SeriesRow[]> {
  const firstTry = await supabase
    .from("series")
    .select("*")
    .in("recording_permission_mode", ["open", "approval_required"])
    .order("created_at", { ascending: false });

  if (!firstTry.error) {
    return (firstTry.data ?? []) as SeriesRow[];
  }

  const secondTry = await supabase
    .from("series")
    .select("*")
    .order("created_at", { ascending: false });

  if (secondTry.error) {
    throw new Error(`series の取得に失敗: ${secondTry.error.message}`);
  }

  return ((secondTry.data ?? []) as SeriesRow[]).filter((series) => {
    const mode = normalizeRecordingPermissionMode(series.recording_permission_mode);
    return mode === "open" || mode === "approval_required";
  });
}

async function fetchMyRecordingRequests(
  userId: string,
  supabase: SupabaseClient
): Promise<RecordingRequestRow[]> {
  const { data, error } = await supabase
    .from("series_recording_requests")
    .select("*")
    .eq("requester_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`series_recording_requests の取得に失敗: ${error.message}`);
  }

  return (data ?? []) as RecordingRequestRow[];
}

function buildLatestRequestMap(
  requests: RecordingRequestRow[]
): Map<string, RecordingRequestRow> {
  const latestMap = new Map<string, RecordingRequestRow>();

  for (const request of requests) {
    const seriesId = pickText(request.series_id);
    if (!seriesId) continue;

    const existing = latestMap.get(seriesId);
    if (!existing) {
      latestMap.set(seriesId, request);
      continue;
    }

    if (
      getCreatedAtScore(request.created_at) >
      getCreatedAtScore(existing.created_at)
    ) {
      latestMap.set(seriesId, request);
    }
  }

  return latestMap;
}

function SectionCard({
  label,
  title,
  description,
  children,
}: {
  label: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
      <p className="text-xs tracking-[0.18em] text-neutral-500">{label}</p>
      <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
      {description ? (
        <p className="mt-3 text-sm leading-7 text-neutral-400">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function RecordPortalPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const focusedSeriesId = pickText(resolvedSearchParams?.seriesId);

  const { supabase, user } = await requireLoggedInUser("/record");
  const discoverableSeries = await fetchDiscoverableSeries(supabase);
  const myRequests = await fetchMyRecordingRequests(user.id, supabase);
  const latestRequestMap = buildLatestRequestMap(myRequests);

  const openSeries = discoverableSeries.filter((series) => {
    return normalizeRecordingPermissionMode(series.recording_permission_mode) === "open";
  });

  const approvalSeries = discoverableSeries.filter((series) => {
    return (
      normalizeRecordingPermissionMode(series.recording_permission_mode) ===
      "approval_required"
    );
  });

  const readySeries = discoverableSeries.filter((series) => {
    const mode = normalizeRecordingPermissionMode(series.recording_permission_mode);
    if (mode === "open") return true;

    const latestRequest = latestRequestMap.get(series.id);
    return normalizeRequestStatus(latestRequest?.status) === "approved";
  });

  const latestRequestEntries = Array.from(latestRequestMap.entries())
    .map(([seriesId, request]) => {
      const series = discoverableSeries.find((item) => item.id === seriesId);
      return {
        seriesId,
        request,
        seriesTitle: series ? pickText(series.title) || "無題" : "作品不明",
      };
    })
    .sort((a, b) => {
      return (
        getCreatedAtScore(b.request.created_at) -
        getCreatedAtScore(a.request.created_at)
      );
    });

  const focusedSeries = focusedSeriesId
    ? discoverableSeries.find((series) => series.id === focusedSeriesId) ?? null
    : null;

  const focusedLatestRequest = focusedSeries
    ? latestRequestMap.get(focusedSeries.id) ?? null
    : null;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/mypage" className="hover:text-neutral-300">
            マイページ
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-300">朗読ページ</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ RECORD PORTAL
            </p>

            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              朗読するための入口
            </h1>

            <p className="mt-4 max-w-4xl text-sm leading-7 text-neutral-300 sm:text-base">
              ここでは第三者朗読に関するアクションだけをまとめて扱う。
              作品ページでは朗読可否を確認し、このページで申請、承認状況確認、朗読制作開始へ進む。
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-neutral-300">
                signed in: {pickText(user.email) || "ログイン中"}
              </span>

              <Link
                href="/mypage"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                マイページへ
              </Link>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">
                  OPEN
                </p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {openSeries.length}
                </p>
                <p className="mt-2 text-sm text-neutral-400">
                  申請なしで朗読制作へ進める作品数
                </p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">
                  APPROVAL
                </p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {approvalSeries.length}
                </p>
                <p className="mt-2 text-sm text-neutral-400">
                  承認制で申請が必要な作品数
                </p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">
                  READY
                </p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {readySeries.length}
                </p>
                <p className="mt-2 text-sm text-neutral-400">
                  今すぐ朗読制作へ進める作品数
                </p>
              </div>
            </section>

            {focusedSeries ? (
              <SectionCard
                label="FOCUS"
                title="この作品の朗読導線"
                description="作品ページから来た時の最小入口。ここから申請か制作開始へ分岐する。"
              >
                <article className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-2xl font-semibold text-white">
                          {pickText(focusedSeries.title) || "無題"}
                        </h3>
                        <span
                          className={[
                            "rounded-full border px-3 py-1 text-sm",
                            normalizeRecordingPermissionMode(
                              focusedSeries.recording_permission_mode
                            ) === "approval_required"
                              ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
                              : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
                          ].join(" ")}
                        >
                          {getPermissionLabel(
                            normalizeRecordingPermissionMode(
                              focusedSeries.recording_permission_mode
                            )
                          )}
                        </span>
                        <span
                          className={[
                            "rounded-full border px-3 py-1 text-sm",
                            getRequestStatusClass(
                              normalizeRequestStatus(focusedLatestRequest?.status)
                            ),
                          ].join(" ")}
                        >
                          {getRequestStatusLabel(
                            normalizeRequestStatus(focusedLatestRequest?.status)
                          )}
                        </span>
                      </div>

                      <p className="mt-3 text-sm leading-7 text-neutral-400">
                        {getPermissionDescription(
                          normalizeRecordingPermissionMode(
                            focusedSeries.recording_permission_mode
                          )
                        )}
                      </p>

                      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-300">
                        {getSeriesSummary(focusedSeries)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Link
                        href={buildWorkPath(focusedSeries.id)}
                        className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                      >
                        作品ページへ
                      </Link>

                      {normalizeRecordingPermissionMode(
                        focusedSeries.recording_permission_mode
                      ) === "open" ||
                      normalizeRequestStatus(focusedLatestRequest?.status) ===
                        "approved" ? (
                        <Link
                          href={buildRecordingEntryPath(focusedSeries.id)}
                          className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                        >
                          朗読制作へ
                        </Link>
                      ) : (
                        <Link
                          href={buildRecordingRequestPath(focusedSeries.id)}
                          className="rounded-full border border-amber-400/20 bg-amber-400/10 px-5 py-3 text-sm text-amber-200 transition hover:bg-amber-400/20"
                        >
                          朗読申請へ
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              </SectionCard>
            ) : null}

            <SectionCard
              label="READY TO RECORD"
              title="今すぐ朗読制作へ進める作品"
              description="自由朗読作品と、自分が承認済みになっている作品をここにまとめる。"
            >
              <div className="grid gap-4">
                {readySeries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-neutral-400">
                    今すぐ制作へ進める作品はまだない。
                    承認制作品は下の一覧から申請し、承認済みになったらここへ出る。
                  </div>
                ) : (
                  readySeries.map((series) => {
                    const latestRequest = latestRequestMap.get(series.id);
                    const mode = normalizeRecordingPermissionMode(
                      series.recording_permission_mode
                    );

                    return (
                      <article
                        key={series.id}
                        className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="max-w-3xl">
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="text-xl font-semibold text-white">
                                {pickText(series.title) || "無題"}
                              </h3>
                              <span
                                className={[
                                  "rounded-full border px-3 py-1 text-sm",
                                  mode === "open"
                                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                                    : "border-sky-400/20 bg-sky-400/10 text-sky-200",
                                ].join(" ")}
                              >
                                {mode === "open" ? "自由朗読" : "承認済み"}
                              </span>
                              {mode === "approval_required" ? (
                                <span
                                  className={[
                                    "rounded-full border px-3 py-1 text-sm",
                                    getRequestStatusClass(
                                      normalizeRequestStatus(latestRequest?.status)
                                    ),
                                  ].join(" ")}
                                >
                                  {getRequestStatusLabel(
                                    normalizeRequestStatus(latestRequest?.status)
                                  )}
                                </span>
                              ) : null}
                            </div>

                            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-400">
                              {getSeriesSummary(series)}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <Link
                              href={buildWorkPath(series.id)}
                              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                            >
                              作品ページ
                            </Link>
                            <Link
                              href={buildRecordingEntryPath(series.id)}
                              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
                            >
                              朗読制作へ
                            </Link>
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </SectionCard>

            <SectionCard
              label="APPROVAL REQUIRED"
              title="承認制作品"
              description="申請、申請中確認、承認済みからの制作開始をここで扱う。"
            >
              <div className="grid gap-4">
                {approvalSeries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-neutral-400">
                    承認制作品はまだない。
                  </div>
                ) : (
                  approvalSeries.map((series) => {
                    const latestRequest = latestRequestMap.get(series.id);
                    const latestStatus = normalizeRequestStatus(latestRequest?.status);

                    return (
                      <article
                        key={series.id}
                        className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="max-w-3xl">
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="text-xl font-semibold text-white">
                                {pickText(series.title) || "無題"}
                              </h3>
                              <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-sm text-amber-200">
                                承認制
                              </span>
                              <span
                                className={[
                                  "rounded-full border px-3 py-1 text-sm",
                                  getRequestStatusClass(latestStatus),
                                ].join(" ")}
                              >
                                {getRequestStatusLabel(latestStatus)}
                              </span>
                            </div>

                            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-400">
                              {getSeriesSummary(series)}
                            </p>

                            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-neutral-400">
                              直近申請日時: {formatDateTime(latestRequest?.created_at)}
                              <br />
                              申請文:
                              <br />
                              {pickText(latestRequest?.request_message) ||
                                "まだ申請メッセージはない。"}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <Link
                              href={buildWorkPath(series.id)}
                              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                            >
                              作品ページ
                            </Link>

                            {latestStatus === "approved" ? (
                              <Link
                                href={buildRecordingEntryPath(series.id)}
                                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
                              >
                                承認済み / 制作開始
                              </Link>
                            ) : (
                              <Link
                                href={buildRecordingRequestPath(series.id)}
                                className="rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-200 transition hover:bg-amber-400/20"
                              >
                                {latestStatus === "pending"
                                  ? "申請状況を見る"
                                  : "朗読申請へ"}
                              </Link>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </SectionCard>

            <SectionCard
              label="MY REQUESTS"
              title="自分の申請状況"
              description="作品ごとの直近状態だけを出し、承認待ちか承認済みかをここで確認できるようにする。"
            >
              <div className="grid gap-4">
                {latestRequestEntries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-neutral-400">
                    まだ朗読申請はない。
                  </div>
                ) : (
                  latestRequestEntries.map(({ seriesId, request, seriesTitle }) => {
                    const latestStatus = normalizeRequestStatus(request.status);

                    return (
                      <article
                        key={seriesId}
                        className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="text-lg font-semibold text-white">
                                {seriesTitle}
                              </h3>
                              <span
                                className={[
                                  "rounded-full border px-3 py-1 text-sm",
                                  getRequestStatusClass(latestStatus),
                                ].join(" ")}
                              >
                                {getRequestStatusLabel(latestStatus)}
                              </span>
                            </div>

                            <p className="mt-3 text-sm leading-7 text-neutral-400">
                              直近申請日時: {formatDateTime(request.created_at)}
                            </p>

                            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-neutral-300">
                              {pickText(request.request_message) ||
                                "申請メッセージは未入力。"}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <Link
                              href={buildWorkPath(seriesId)}
                              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                            >
                              作品ページ
                            </Link>

                            {latestStatus === "approved" ? (
                              <Link
                                href={buildRecordingEntryPath(seriesId)}
                                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
                              >
                                制作開始
                              </Link>
                            ) : (
                              <Link
                                href={buildRecordingRequestPath(seriesId)}
                                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                              >
                                申請ページを開く
                              </Link>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </SectionCard>
          </div>
        </section>
      </div>
    </main>
  );
}