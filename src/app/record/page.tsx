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
    q?: string;
    filter?: string;
  }>;
};

type LoggedInResult = Awaited<ReturnType<typeof requireLoggedInUser>>;
type SupabaseClient = LoggedInResult["supabase"];

type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
type RecordFilter =
  | "all"
  | "ready"
  | "open"
  | "approval"
  | "pending"
  | "approved";

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

type CatalogItem = {
  series: SeriesRow;
  summary: string;
  permissionMode: RecordingPermissionMode;
  latestRequest: RecordingRequestRow | null;
  latestStatus: RequestStatus | null;
  isReady: boolean;
  searchText: string;
};

const FILTER_OPTIONS: Array<{
  value: RecordFilter;
  label: string;
  description: string;
}> = [
  {
    value: "all",
    label: "すべて",
    description: "自由朗読と承認制をまとめて見る。",
  },
  {
    value: "ready",
    label: "すぐ朗読可",
    description: "自由朗読作品と、自分が承認済みの作品だけに絞る。",
  },
  {
    value: "open",
    label: "自由朗読",
    description: "申請なしでそのまま制作開始できる作品だけを見る。",
  },
  {
    value: "approval",
    label: "承認制",
    description: "申請が必要な作品だけを見る。",
  },
  {
    value: "pending",
    label: "申請中",
    description: "自分が申請中の作品だけを見る。",
  },
  {
    value: "approved",
    label: "承認済み",
    description: "自分が承認済みで制作開始できる作品だけを見る。",
  },
];

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

function normalizeRecordFilter(value: unknown): RecordFilter {
  if (value === "ready") return "ready";
  if (value === "open") return "open";
  if (value === "approval") return "approval";
  if (value === "pending") return "pending";
  if (value === "approved") return "approved";
  return "all";
}

function getRequestStatusLabel(status: RequestStatus | null): string {
  if (status === "pending") return "申請中";
  if (status === "approved") return "承認済み";
  if (status === "rejected") return "却下";
  if (status === "cancelled") return "取消済み";
  return "未申請";
}

function getRequestStatusDescription(status: RequestStatus | null): string {
  if (status === "pending") {
    return "作者の承認待ち。承認されたらそのまま朗読制作へ進める。";
  }
  if (status === "approved") {
    return "承認済み。今すぐ朗読制作へ進める。";
  }
  if (status === "rejected") {
    return "却下済み。内容を見直して再申請する。";
  }
  if (status === "cancelled") {
    return "申請は取り消し済み。必要なら改めて申請する。";
  }
  return "まだ申請していない。";
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

function getPermissionClass(mode: RecordingPermissionMode): string {
  if (mode === "open") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }
  if (mode === "approval_required") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  }
  return "border-white/10 bg-white/5 text-neutral-400";
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

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
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

function buildPortalPath({
  seriesId,
  q,
  filter,
}: {
  seriesId?: string;
  q?: string;
  filter?: RecordFilter;
}): string {
  const params = new URLSearchParams();

  const normalizedSeriesId = pickText(seriesId);
  const normalizedQuery = pickText(q);
  const normalizedFilter = filter ?? "all";

  if (normalizedSeriesId) {
    params.set("seriesId", normalizedSeriesId);
  }
  if (normalizedQuery) {
    params.set("q", normalizedQuery);
  }
  if (normalizedFilter !== "all") {
    params.set("filter", normalizedFilter);
  }

  const queryString = params.toString();
  return queryString ? `/record?${queryString}` : "/record";
}

function matchesFilter(item: CatalogItem, filter: RecordFilter): boolean {
  if (filter === "all") return true;
  if (filter === "ready") return item.isReady;
  if (filter === "open") return item.permissionMode === "open";
  if (filter === "approval") return item.permissionMode === "approval_required";
  if (filter === "pending") return item.latestStatus === "pending";
  if (filter === "approved") return item.latestStatus === "approved";
  return true;
}

function matchesSearch(item: CatalogItem, query: string): boolean {
  if (!query) return true;
  return item.searchText.includes(query);
}

function getPrimaryAction(item: CatalogItem): {
  href: string;
  label: string;
  className: string;
} {
  if (item.isReady) {
    return {
      href: buildRecordingEntryPath(item.series.id),
      label: "朗読制作へ",
      className:
        "rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90",
    };
  }

  if (item.latestStatus === "pending") {
    return {
      href: buildRecordingRequestPath(item.series.id),
      label: "申請状況を見る",
      className:
        "rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-200 transition hover:bg-amber-400/20",
    };
  }

  if (item.latestStatus === "rejected") {
    return {
      href: buildRecordingRequestPath(item.series.id),
      label: "再申請する",
      className:
        "rounded-full border border-red-400/20 bg-red-400/10 px-4 py-2 text-sm text-red-200 transition hover:bg-red-400/20",
    };
  }

  if (item.latestStatus === "cancelled") {
    return {
      href: buildRecordingRequestPath(item.series.id),
      label: "申請し直す",
      className:
        "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black",
    };
  }

  return {
    href: buildRecordingRequestPath(item.series.id),
    label: "朗読申請へ",
    className:
      "rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-200 transition hover:bg-amber-400/20",
  };
}

function buildCatalogItem(
  series: SeriesRow,
  latestRequestMap: Map<string, RecordingRequestRow>
): CatalogItem {
  const permissionMode = normalizeRecordingPermissionMode(
    series.recording_permission_mode
  );
  const latestRequest = latestRequestMap.get(series.id) ?? null;
  const latestStatus = normalizeRequestStatus(latestRequest?.status);
  const summary = getSeriesSummary(series);
  const isReady = permissionMode === "open" || latestStatus === "approved";

  return {
    series,
    summary,
    permissionMode,
    latestRequest,
    latestStatus,
    isReady,
    searchText: normalizeSearchText(
      [
        pickText(series.title),
        summary,
        getPermissionLabel(permissionMode),
        getPermissionDescription(permissionMode),
        getRequestStatusLabel(latestStatus),
        getRequestStatusDescription(latestStatus),
      ].join(" ")
    ),
  };
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

function RecordCatalogCard({ item }: { item: CatalogItem }) {
  const primaryAction = getPrimaryAction(item);

  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-semibold text-white">
              {pickText(item.series.title) || "無題"}
            </h3>

            <span
              className={[
                "rounded-full border px-3 py-1 text-sm",
                getPermissionClass(item.permissionMode),
              ].join(" ")}
            >
              {getPermissionLabel(item.permissionMode)}
            </span>

            <span
              className={[
                "rounded-full border px-3 py-1 text-sm",
                getRequestStatusClass(item.latestStatus),
              ].join(" ")}
            >
              自分: {getRequestStatusLabel(item.latestStatus)}
            </span>

            {item.isReady ? (
              <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-sm text-sky-200">
                すぐ朗読可
              </span>
            ) : null}
          </div>

          <p className="mt-3 text-sm leading-7 text-neutral-400">
            {getPermissionDescription(item.permissionMode)}
          </p>

          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-300">
            {item.summary}
          </p>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-neutral-400">
            許可状態: {getPermissionLabel(item.permissionMode)}
            <br />
            自分の状態: {getRequestStatusDescription(item.latestStatus)}
            <br />
            直近申請日時: {formatDateTime(item.latestRequest?.created_at)}
            <br />
            申請文:
            <br />
            {pickText(item.latestRequest?.request_message) ||
              "まだ申請メッセージはない。"}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={buildWorkPath(item.series.id)}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
          >
            作品ページ
          </Link>

          <Link href={primaryAction.href} className={primaryAction.className}>
            {primaryAction.label}
          </Link>
        </div>
      </div>
    </article>
  );
}

export default async function RecordPortalPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const focusedSeriesId = pickText(resolvedSearchParams?.seriesId);
  const searchQuery = pickText(resolvedSearchParams?.q);
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const activeFilter = normalizeRecordFilter(resolvedSearchParams?.filter);

  const { supabase, user } = await requireLoggedInUser("/record");
  const discoverableSeries = await fetchDiscoverableSeries(supabase);
  const myRequests = await fetchMyRecordingRequests(user.id, supabase);
  const latestRequestMap = buildLatestRequestMap(myRequests);

  const catalogItems = discoverableSeries
    .map((series) => buildCatalogItem(series, latestRequestMap))
    .sort((a, b) => {
      if (Number(b.isReady) !== Number(a.isReady)) {
        return Number(b.isReady) - Number(a.isReady);
      }

      const aPending = a.latestStatus === "pending" ? 1 : 0;
      const bPending = b.latestStatus === "pending" ? 1 : 0;
      if (bPending !== aPending) {
        return bPending - aPending;
      }

      return (
        getCreatedAtScore(b.series.created_at) - getCreatedAtScore(a.series.created_at)
      );
    });

  const openCount = catalogItems.filter((item) => item.permissionMode === "open").length;
  const approvalCount = catalogItems.filter(
    (item) => item.permissionMode === "approval_required"
  ).length;
  const readyCount = catalogItems.filter((item) => item.isReady).length;
  const pendingCount = catalogItems.filter((item) => item.latestStatus === "pending").length;
  const approvedCount = catalogItems.filter(
    (item) => item.latestStatus === "approved"
  ).length;

  const filteredCatalogItems = catalogItems.filter((item) => {
    return (
      matchesFilter(item, activeFilter) &&
      matchesSearch(item, normalizedSearchQuery)
    );
  });

  const latestRequestEntries = Array.from(latestRequestMap.entries())
    .map(([seriesId, request]) => {
      const series = catalogItems.find((item) => item.series.id === seriesId)?.series ?? null;
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

  const focusedItem = focusedSeriesId
    ? catalogItems.find((item) => item.series.id === focusedSeriesId) ?? null
    : null;

  const activeFilterMeta =
    FILTER_OPTIONS.find((option) => option.value === activeFilter) ?? FILTER_OPTIONS[0];

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
              作品ページでは朗読可否を確認し、このページで検索、申請、承認状況確認、朗読制作開始へ進む。
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
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">OPEN</p>
                <p className="mt-2 text-3xl font-semibold text-white">{openCount}</p>
                <p className="mt-2 text-sm text-neutral-400">
                  申請なしで制作開始できる作品
                </p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">APPROVAL</p>
                <p className="mt-2 text-3xl font-semibold text-white">{approvalCount}</p>
                <p className="mt-2 text-sm text-neutral-400">
                  承認制で申請が必要な作品
                </p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">READY</p>
                <p className="mt-2 text-3xl font-semibold text-white">{readyCount}</p>
                <p className="mt-2 text-sm text-neutral-400">
                  今すぐ朗読制作へ進める作品
                </p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">PENDING</p>
                <p className="mt-2 text-3xl font-semibold text-white">{pendingCount}</p>
                <p className="mt-2 text-sm text-neutral-400">
                  自分が承認待ちの作品
                </p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">APPROVED</p>
                <p className="mt-2 text-3xl font-semibold text-white">{approvedCount}</p>
                <p className="mt-2 text-sm text-neutral-400">
                  自分が承認済みの作品
                </p>
              </div>
            </section>

            <SectionCard
              label="SEARCH"
              title="朗読可能作品を探す"
              description="検索語とフィルタで、自由朗読・承認制・自分の申請状況をまとめて探せるようにする。"
            >
              <form action="/record" method="get" className="grid gap-4">
                {focusedSeriesId ? (
                  <input type="hidden" name="seriesId" value={focusedSeriesId} />
                ) : null}

                {activeFilter !== "all" ? (
                  <input type="hidden" name="filter" value={activeFilter} />
                ) : null}

                <div className="flex flex-col gap-3 lg:flex-row">
                  <input
                    type="search"
                    name="q"
                    defaultValue={searchQuery}
                    placeholder="作品名や概要で検索"
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-white/20"
                  />
                  <button
                    type="submit"
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                  >
                    検索する
                  </button>
                </div>
              </form>

              <div className="mt-4 flex flex-wrap gap-2">
                {FILTER_OPTIONS.map((option) => {
                  const isActive = activeFilter === option.value;
                  return (
                    <Link
                      key={option.value}
                      href={buildPortalPath({
                        seriesId: focusedSeriesId,
                        q: searchQuery,
                        filter: option.value,
                      })}
                      className={[
                        "rounded-full border px-4 py-2 text-sm transition",
                        isActive
                          ? "border-white bg-white text-black"
                          : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white hover:text-black",
                      ].join(" ")}
                    >
                      {option.label}
                    </Link>
                  );
                })}
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-neutral-300">
                現在の絞り込み: {activeFilterMeta.label}
                <br />
                {activeFilterMeta.description}
                <br />
                検索語: {searchQuery ? `「${searchQuery}」` : "未入力"}
                <br />
                表示件数: {filteredCatalogItems.length}件 / 全{catalogItems.length}件
              </div>
            </SectionCard>

            {focusedItem ? (
              <SectionCard
                label="FOCUS"
                title="この作品の朗読導線"
                description="作品ページから来た時の最小入口。ここから申請か制作開始へ分岐する。"
              >
                <RecordCatalogCard item={focusedItem} />
              </SectionCard>
            ) : null}

            <SectionCard
              label="CATALOG"
              title="朗読作品カタログ"
              description="承認制作品も同じ一覧に置き、許可状態と自分の申請状態をカード上で見分けられるようにする。"
            >
              <div className="grid gap-4">
                {filteredCatalogItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-neutral-400">
                    条件に合う作品はまだない。
                    <br />
                    検索語やフィルタを切り替えて確認する。
                  </div>
                ) : (
                  filteredCatalogItems.map((item) => (
                    <RecordCatalogCard key={item.series.id} item={item} />
                  ))
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

                            <p className="mt-2 text-sm leading-7 text-neutral-400">
                              {getRequestStatusDescription(latestStatus)}
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