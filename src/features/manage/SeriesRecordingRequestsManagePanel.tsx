"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type RecordingPermissionMode = "open" | "closed" | "approval_required";
type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

type SeriesRecordingRequestRow = Record<string, unknown> & {
  id: string;
  requester_user_id?: string | null;
  status?: RequestStatus | null;
  request_message?: string | null;
  review_message?: string | null;
  created_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by_user_id?: string | null;
};

type SeriesRecordingRequestsManagePanelProps = {
  currentUserId: string;
  seriesId: string;
  seriesTitle: string;
  recordingPermissionMode: RecordingPermissionMode;
  requests: SeriesRecordingRequestRow[];
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

function normalizeRequestStatus(value: unknown): RequestStatus | null {
  if (value === "pending") return "pending";
  if (value === "approved") return "approved";
  if (value === "rejected") return "rejected";
  if (value === "cancelled") return "cancelled";
  return null;
}

function getPermissionLabel(mode: RecordingPermissionMode): string {
  if (mode === "open") return "無条件許可";
  if (mode === "approval_required") return "承認制";
  return "非許可";
}

function getStatusLabel(status: RequestStatus | null): string {
  if (status === "pending") return "申請中";
  if (status === "approved") return "承認済み";
  if (status === "rejected") return "却下";
  if (status === "cancelled") return "取消済み";
  return "不明";
}

function getStatusClass(status: RequestStatus | null): string {
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

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "未記録";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP");
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

export default function SeriesRecordingRequestsManagePanel({
  currentUserId,
  seriesId,
  seriesTitle,
  recordingPermissionMode,
  requests,
}: SeriesRecordingRequestsManagePanelProps) {
  const [localRequests, setLocalRequests] =
    useState<SeriesRecordingRequestRow[]>(requests);

  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const request of requests) {
      initial[request.id] = pickText(request.review_message);
    }
    return initial;
  });

  const [savingRequestId, setSavingRequestId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const pendingCount = useMemo(
    () =>
      localRequests.filter(
        (request) => normalizeRequestStatus(request.status) === "pending"
      ).length,
    [localRequests]
  );

  const approvedCount = useMemo(
    () =>
      localRequests.filter(
        (request) => normalizeRequestStatus(request.status) === "approved"
      ).length,
    [localRequests]
  );

  const rejectedCount = useMemo(
    () =>
      localRequests.filter(
        (request) => normalizeRequestStatus(request.status) === "rejected"
      ).length,
    [localRequests]
  );

  function handleReviewDraftChange(requestId: string, value: string) {
    setReviewDrafts((prev) => ({
      ...prev,
      [requestId]: value,
    }));
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handleDecision(
    requestId: string,
    nextStatus: "approved" | "rejected"
  ) {
    const target = localRequests.find((request) => request.id === requestId);
    if (!target) return;

    const currentStatus = normalizeRequestStatus(target.status);
    if (currentStatus !== "pending") {
      setErrorMessage("pending の申請だけ更新できる。");
      setSuccessMessage("");
      return;
    }

    const nextReviewMessage = (reviewDrafts[requestId] ?? "").trim();
    const reviewedAt = new Date().toISOString();

    setSavingRequestId(requestId);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("series_recording_requests")
      .update({
        status: nextStatus,
        review_message: nextReviewMessage,
        reviewed_at: reviewedAt,
        reviewed_by_user_id: currentUserId,
      })
      .eq("id", requestId);

    if (error) {
      setSavingRequestId(null);
      setErrorMessage(error.message);
      setSuccessMessage("");
      return;
    }

    setLocalRequests((prev) =>
      prev.map((request) =>
        request.id === requestId
          ? {
              ...request,
              status: nextStatus,
              review_message: nextReviewMessage,
              reviewed_at: reviewedAt,
              reviewed_by_user_id: currentUserId,
            }
          : request
      )
    );

    setSavingRequestId(null);
    setSuccessMessage(
      nextStatus === "approved"
        ? "申請を承認した。"
        : "申請を却下した。"
    );
    setErrorMessage("");
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-300">朗読申請一覧</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ MANAGE
            </p>

            <h1 className="mt-3 text-3xl font-bold text-white">{seriesTitle}</h1>

            <p className="mt-3 text-sm leading-7 text-neutral-400">
              この作品に届いた朗読申請の一覧。
              <br />
              今回は閲覧だけでなく、pending の申請を承認 / 却下できるようにする。
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/manage/series/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                管理ハブへ戻る
              </Link>

              <Link
                href={`/manage/recording-permission/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                朗読許可管理へ
              </Link>

              <Link
                href={`/works/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                作品ページを見る
              </Link>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="PERMISSION"
                value={getPermissionLabel(recordingPermissionMode)}
                sub="現在の作品ルール"
              />
              <StatCard
                label="PENDING"
                value={`${pendingCount}件`}
                sub="未処理の申請"
              />
              <StatCard
                label="APPROVED"
                value={`${approvedCount}件`}
                sub="承認済み件数"
              />
              <StatCard
                label="REJECTED"
                value={`${rejectedCount}件`}
                sub="却下件数"
              />
            </div>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                GUIDE
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                今回の更新対象
              </h2>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
                pending の申請に対して、
                <code className="mx-1">status</code>
                <code className="mx-1">review_message</code>
                <code className="mx-1">reviewed_at</code>
                <code className="mx-1">reviewed_by_user_id</code>
                を更新する。
              </div>
            </section>

            {errorMessage ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {errorMessage}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                {successMessage}
              </div>
            ) : null}

            <section className="grid gap-4">
              {localRequests.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-neutral-400">
                  まだ申請はない。
                </div>
              ) : (
                localRequests.map((request) => {
                  const status = normalizeRequestStatus(request.status);
                  const requestMessage = pickText(request.request_message);
                  const reviewMessage = pickText(request.review_message);
                  const requesterUserId =
                    pickText(request.requester_user_id) || "不明";
                  const reviewedByUserId =
                    pickText(request.reviewed_by_user_id) || "未記録";
                  const isPending = status === "pending";
                  const isSaving = savingRequestId === request.id;

                  return (
                    <article
                      key={request.id}
                      className="rounded-[28px] border border-white/10 bg-black/20 p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs tracking-[0.18em] text-neutral-500">
                            RECORDING REQUEST
                          </p>
                          <h2 className="mt-2 text-xl font-semibold text-white">
                            申請者 {requesterUserId}
                          </h2>
                        </div>

                        <span
                          className={[
                            "rounded-full border px-3 py-1 text-sm",
                            getStatusClass(status),
                          ].join(" ")}
                        >
                          {getStatusLabel(status)}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
                          申請日時: {formatDateTime(request.created_at)}
                          <br />
                          申請文:
                          <br />
                          {requestMessage ? requestMessage : "申請文なし"}
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
                          レビュー日時: {formatDateTime(request.reviewed_at)}
                          <br />
                          レビュアー: {reviewedByUserId}
                          <br />
                          現在のレビュー文:
                          <br />
                          {reviewMessage ? reviewMessage : "まだレビューなし"}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3">
                        <label className="grid gap-2">
                          <span className="text-sm text-neutral-300">
                            レビュー文
                          </span>
                          <textarea
                            value={reviewDrafts[request.id] ?? ""}
                            onChange={(event) =>
                              handleReviewDraftChange(
                                request.id,
                                event.target.value
                              )
                            }
                            rows={4}
                            disabled={!isPending || isSaving}
                            placeholder="承認理由、却下理由、注意事項などを入力"
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-white outline-none placeholder:text-neutral-500 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </label>

                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              handleDecision(request.id, "approved")
                            }
                            disabled={!isPending || isSaving}
                            className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-5 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isSaving ? "更新中..." : "承認"}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleDecision(request.id, "rejected")
                            }
                            disabled={!isPending || isSaving}
                            className="rounded-full border border-red-400/20 bg-red-400/10 px-5 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isSaving ? "更新中..." : "却下"}
                          </button>
                        </div>

                        {!isPending ? (
                          <p className="text-sm text-neutral-500">
                            この申請はすでに処理済みなので、更新ボタンは使えない。
                          </p>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}