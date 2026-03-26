"use client";

import { useMemo, useState } from "react";
import {
  AUDIO_UPLOAD_ALLOWED_EXTENSIONS,
  analyzeAudioUploadClient,
  canProceedWithAudioUpload,
  type AudioUploadCheckResult,
  type AudioUploadDecision,
} from "@/lib/recording/audioUploadValidation";

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function formatSeconds(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return `${value.toFixed(1)}秒`;
}

function getDecisionLabel(decision: AudioUploadDecision): string {
  if (decision === "passed") return "通過";
  if (decision === "review_required") return "要再確認";
  if (decision === "rejected") return "停止";
  if (decision === "checking") return "検査中";
  return "未検査";
}

function getDecisionTone(decision: AudioUploadDecision): string {
  if (decision === "passed") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
  }

  if (decision === "review_required") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  }

  if (decision === "rejected") {
    return "border-rose-400/30 bg-rose-400/10 text-rose-100";
  }

  return "border-white/10 bg-white/[0.03] text-neutral-300";
}

export function RecordingUploadGuardCard() {
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFileSize, setSelectedFileSize] = useState(0);
  const [result, setResult] = useState<AudioUploadCheckResult | null>(null);
  const [decision, setDecision] = useState<AudioUploadDecision>("idle");
  const [unexpectedError, setUnexpectedError] = useState("");

  const canProceed = useMemo(() => canProceedWithAudioUpload(result), [result]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setUnexpectedError("");
    setResult(null);

    if (!file) {
      setDecision("idle");
      setSelectedFileName("");
      setSelectedFileSize(0);
      return;
    }

    setSelectedFileName(file.name);
    setSelectedFileSize(file.size);
    setDecision("checking");

    try {
      const nextResult = await analyzeAudioUploadClient(file);
      setResult(nextResult);
      setDecision(nextResult.decision);
    } catch (error) {
      console.error("audio upload validation failed", error);
      setDecision("rejected");
      setUnexpectedError(
        "検査中に想定外エラーが出た。今は安全側で保存停止にしている。"
      );
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm leading-7 text-neutral-300">
          ここでは、音声ファイル選択後に最小チェックを走らせる。今は upload 本体未実装なので、
          実際に保存はしない。ただし UI 上は「保存前に止める」動きを先に確認できる。
        </p>

        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-medium text-neutral-200">
            音声ファイルを選ぶ
          </span>
          <input
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg,.aac,.flac"
            onChange={handleFileChange}
            className="block w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-neutral-200 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black"
          />
        </label>

        <p className="mt-3 text-xs leading-6 text-neutral-500">
          対応想定: {AUDIO_UPLOAD_ALLOWED_EXTENSIONS.join(" / ")}
        </p>
      </div>

      <div
        className={["rounded-[24px] border p-4", getDecisionTone(decision)].join(
          " "
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.18em] opacity-80">
              UPLOAD CHECK STATUS
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white">
              保存前判定: {getDecisionLabel(decision)}
            </h3>
          </div>

          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-neutral-200">
            {selectedFileName ? selectedFileName : "未選択"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
            <p className="text-xs tracking-[0.14em] text-neutral-500">FILE</p>
            <p className="mt-2">{selectedFileName || "まだ選択なし"}</p>
            <p className="mt-1 text-xs text-neutral-400">
              {formatFileSize(selectedFileSize)}
            </p>
          </div>

          <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
            <p className="text-xs tracking-[0.14em] text-neutral-500">RESULT</p>
            <p className="mt-2">
              {unexpectedError ||
                result?.message ||
                "ファイルを選ぶとここに仮判定が出る"}
            </p>
          </div>
        </div>

        {result?.metrics ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
              <p className="text-xs tracking-[0.14em] text-neutral-500">長さ</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatSeconds(result.metrics.durationSeconds)}
              </p>
            </div>

            <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
              <p className="text-xs tracking-[0.14em] text-neutral-500">
                声らしい区間
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatPercent(result.metrics.speechWindowRatio)}
              </p>
            </div>

            <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
              <p className="text-xs tracking-[0.14em] text-neutral-500">
                無音割合
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatPercent(result.metrics.pauseRatio)}
              </p>
            </div>

            <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
              <p className="text-xs tracking-[0.14em] text-neutral-500">
                音が入っている割合
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatPercent(result.metrics.activeRatio)}
              </p>
            </div>

            <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
              <p className="text-xs tracking-[0.14em] text-neutral-500">
                環境音っぽさ
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatPercent(result.metrics.noisyWindowRatio)}
              </p>
            </div>

            <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
              <p className="text-xs tracking-[0.14em] text-neutral-500">
                連続音っぽさ
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatPercent(result.metrics.continuousSoundRatio)}
              </p>
            </div>
          </div>
        ) : null}

        {result?.retryHints?.length ? (
          <div className="mt-4 rounded-[20px] border border-white/10 bg-black/20 p-4">
            <p className="text-xs tracking-[0.14em] text-neutral-500">
              RETRY GUIDE
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-200">
              {result.retryHints.map((hint) => (
                <li key={hint}>・{hint}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!canProceed}
            className={[
              "rounded-full px-5 py-3 text-sm font-semibold transition",
              canProceed
                ? "bg-white text-black hover:opacity-90"
                : "cursor-not-allowed bg-white text-black opacity-40",
            ].join(" ")}
          >
            {canProceed
              ? "この音源は保存前チェック通過"
              : "この音源では今は保存しない"}
          </button>

          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-neutral-300">
            将来は upload route 側でも再検査する前提
          </span>
        </div>
      </div>
    </div>
  );
}