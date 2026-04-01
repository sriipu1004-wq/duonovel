"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type RecordingPermissionMode = "open" | "closed" | "approval_required";
type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
type SaveState = "idle" | "saving" | "success" | "error";

type SeriesRecordingRequestFormProps = {
  seriesId: string;
  seriesTitle: string;
  currentUserId: string;
  permissionMode: RecordingPermissionMode;
  initialLatestStatus: RequestStatus | null;
  initialLatestMessage: string;
  initialLatestCreatedAt: string | null;
};

function StatusBadge({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-200">
        送信中...
      </span>
    );
  }

  if (state === "success") {
    return (
      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
        送信済み
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-xs text-red-200">
        送信失敗
      </span>
    );
  }

  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-500">
      未送信
    </span>
  );
}

function getPermissionLabel(mode: RecordingPermissionMode): string {
  if (mode === "open") return "無条件許可";
  if (mode === "approval_required") return "承認制";
  return "非許可";
}

function getPermissionDescription(mode: RecordingPermissionMode): string {
  if (mode === "open") {
    return "この作品は申請不要。朗読申請ページを使わなくてもよい状態。";
  }
  if (mode === "approval_required") {
    return "この作品は承認制。申請後、作者側の承認待ちになる。";
  }
  return "この作品は現在、第三者朗読を受け付けていない。";
}

function getLatestStatusLabel(status: RequestStatus | null): string {
  if (status === "pending") return "申請中";
  if (status === "approved") return "承認済み";
  if (status === "rejected") return "却下";
  if (status === "cancelled") return "取消済み";
  return "申請なし";
}

function getLatestStatusClass(status: RequestStatus | null): string {
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

function formatDateTime(value: string | null): string {
  if (!value) return "未記録";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP");
}

export default function SeriesRecordingRequestForm({
  seriesId,
  seriesTitle,
  currentUserId,
  permissionMode,
  initialLatestStatus,
  initialLatestMessage,
  initialLatestCreatedAt,
}: SeriesRecordingRequestFormProps) {
  const [message, setMessage] = useState("");
  const [latestStatus, setLatestStatus] =
    useState<RequestStatus | null>(initialLatestStatus);
  const [latestMessage, setLatestMessage] = useState(initialLatestMessage);
  const [latestCreatedAt, setLatestCreatedAt] =
    useState<string | null>(initialLatestCreatedAt);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const submitDisabled = useMemo(() => {
    if (permissionMode !== "approval_required") return true;
    if (latestStatus === "pending") return true;
    if (saveState === "saving") return true;
    return false;
  }, [permissionMode, latestStatus, saveState]);

  async function handleSubmit() {
    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    if (permissionMode !== "approval_required") {
      setSaveState("error");
      setErrorMessage("この作品は承認制ではないため、申請は送れない。");
      return;
    }

    if (latestStatus === "pending") {
      setSaveState("error");
      setErrorMessage("この作品には、すでに申請中のリクエストがある。");
      return;
    }

    const trimmedMessage = message.trim();

    const { error } = await supabase.from("series_recording_requests").insert({
      series_id: seriesId,
      requester_user_id: currentUserId,
      status: "pending",
      request_message: trimmedMessage,
    });

    if (error) {
      setSaveState("error");

      if (error.code === "23505") {
        setErrorMessage("同じ作品に対する申請中リクエストがすでにある。");
        return;
      }

      setErrorMessage(error.message);
      return;
    }

    const now = new Date().toISOString();

    setLatestStatus("pending");
    setLatestMessage(trimmedMessage);
    setLatestCreatedAt(now);
    setMessage("");
    setSaveState("success");
    setSuccessMessage("朗読申請を送信した。現在は承認待ち。");
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-300">朗読申請</span>
        </div>

        <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ REQUEST
            </p>

            <h1 className="mt-3 text-3xl font-bold text-white">{seriesTitle}</h1>

            <p className="mt-3 text-sm leading-7 text-neutral-400">
              承認制作品に対して、第三者朗読の申請を送る最小ページ。
              <br />
              今回は pending の作成までを対象にしていて、作者側の承認UIはまだない。
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/works/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                作品ページへ戻る
              </Link>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                CURRENT RULE
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                現在の朗読可否
              </h2>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span
                  className={[
                    "rounded-full border px-3 py-1 text-sm",
                    permissionMode === "approval_required"
                      ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
                      : permissionMode === "open"
                        ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                        : "border-white/10 bg-white/5 text-neutral-300",
                  ].join(" ")}
                >
                  {getPermissionLabel(permissionMode)}
                </span>
              </div>

              <p className="mt-3 text-sm leading-7 text-neutral-400">
                {getPermissionDescription(permissionMode)}
              </p>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    LATEST REQUEST
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
                    直近の申請状態
                  </h2>
                </div>

                <span
                  className={[
                    "rounded-full border px-3 py-1 text-sm",
                    getLatestStatusClass(latestStatus),
                  ].join(" ")}
                >
                  {getLatestStatusLabel(latestStatus)}
                </span>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
                直近申請日時: {formatDateTime(latestCreatedAt)}
                <br />
                申請文:
                <br />
                {latestMessage ? latestMessage : "まだ申請文はない。"}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    REQUEST FORM
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
                    朗読申請を送る
                  </h2>
                </div>

                <StatusBadge state={saveState} />
              </div>

              {permissionMode !== "approval_required" ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
                  この作品は承認制ではないため、このページからの申請は使わない。
                </div>
              ) : latestStatus === "pending" ? (
                <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-7 text-amber-200">
                  すでに申請中のリクエストがあるため、新しい pending は送れない。
                </div>
              ) : (
                <div className="mt-4 grid gap-4">
                  <label className="grid gap-2">
                    <span className="text-sm text-neutral-300">申請メッセージ</span>
                    <textarea
                      value={message}
                      onChange={(event) => {
                        setMessage(event.target.value);
                        setSaveState("idle");
                        setErrorMessage("");
                        setSuccessMessage("");
                      }}
                      rows={8}
                      placeholder={"朗読したい理由や公開予定、方針などを自由に書く"}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-white outline-none placeholder:text-neutral-500"
                    />
                  </label>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={submitDisabled}
                      className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      朗読申請を送信
                    </button>
                  </div>
                </div>
              )}

              {errorMessage ? (
                <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                  {errorMessage}
                </div>
              ) : null}

              {successMessage ? (
                <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                  {successMessage}
                </div>
              ) : null}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}