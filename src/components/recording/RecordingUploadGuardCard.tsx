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

function getStageDecisionLabel(
  decision: AudioUploadDecision,
  idleLabel = "未実行"
): string {
  if (decision === "idle") return idleLabel;
  return getDecisionLabel(decision);
}

type UploadCheckApiResponse = {
  ok: boolean;
  result?: AudioUploadCheckResult;
  error?: string;
};

export function RecordingUploadGuardCard() {
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFileSize, setSelectedFileSize] = useState(0);

  const [clientResult, setClientResult] = useState<AudioUploadCheckResult | null>(
    null
  );
  const [clientDecision, setClientDecision] =
    useState<AudioUploadDecision>("idle");

  const [serverResult, setServerResult] = useState<AudioUploadCheckResult | null>(
    null
  );
  const [serverDecision, setServerDecision] =
    useState<AudioUploadDecision>("idle");

  const [unexpectedError, setUnexpectedError] = useState("");

  const finalDecision = useMemo<AudioUploadDecision>(() => {
    if (unexpectedError) return "rejected";
    if (serverDecision === "checking") return "checking";
    if (serverDecision !== "idle") return serverDecision;
    return clientDecision;
  }, [clientDecision, serverDecision, unexpectedError]);

  const canProceed = useMemo(() => {
    return (
      canProceedWithAudioUpload(clientResult) &&
      serverResult?.decision === "passed"
    );
  }, [clientResult, serverResult]);

  const resultMessage = useMemo(() => {
    if (unexpectedError) return unexpectedError;
    if (serverDecision === "checking") {
      return "client 仮判定は通過。続けて server 側保存前チェックを実行中。";
    }
    return (
      serverResult?.message ||
      clientResult?.message ||
      "ファイルを選ぶとここに判定結果が出る"
    );
  }, [clientResult, serverDecision, serverResult, unexpectedError]);

  const retryHints = useMemo(() => {
    if (serverResult?.retryHints?.length) return serverResult.retryHints;
    if (clientResult?.retryHints?.length) return clientResult.retryHints;
    return [];
  }, [clientResult, serverResult]);

  async function runServerPrecheck(file: File): Promise<void> {
    setServerDecision("checking");
    setServerResult(null);

    const formData = new FormData();
    formData.append("audio", file);

    const response = await fetch("/api/recordings/upload-check", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json().catch(() => null)) as
      | UploadCheckApiResponse
      | null;

    if (payload?.result) {
      setServerResult(payload.result);
      setServerDecision(payload.result.decision);
      return;
    }

    throw new Error(
      payload?.error ||
        "server 側保存前チェック route から想定外レスポンスが返った。"
    );
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setUnexpectedError("");
    setClientResult(null);
    setServerResult(null);
    setClientDecision("idle");
    setServerDecision("idle");

    if (!file) {
      setSelectedFileName("");
      setSelectedFileSize(0);
      return;
    }

    setSelectedFileName(file.name);
    setSelectedFileSize(file.size);
    setClientDecision("checking");

    try {
      const nextClientResult = await analyzeAudioUploadClient(file);
      setClientResult(nextClientResult);
      setClientDecision(nextClientResult.decision);

      if (nextClientResult.decision !== "passed") {
        setServerDecision("idle");
        return;
      }

      await runServerPrecheck(file);
    } catch (error) {
      console.error("audio upload validation failed", error);
      setServerDecision("rejected");
      setUnexpectedError(
        "server 側保存前チェック中に想定外エラーが出た。今は安全側で保存停止にしている。"
      );
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm leading-7 text-neutral-300">
          ここでは、ファイル選択直後に client 仮判定を走らせ、そのあと server
          側保存前チェックも通す。今は保存本体未実装なので実保存はしないが、
          二段階で止める動きを先に確認できる。
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
        className={["rounded-[24px] border p-4", getDecisionTone(finalDecision)].join(
          " "
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.18em] opacity-80">
              UPLOAD CHECK STATUS
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white">
              保存前最終判定: {getDecisionLabel(finalDecision)}
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
            <p className="mt-2">{resultMessage}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
            <p className="text-xs tracking-[0.14em] text-neutral-500">
              CLIENT 仮判定
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {getDecisionLabel(clientDecision)}
            </p>
          </div>

          <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
            <p className="text-xs tracking-[0.14em] text-neutral-500">
              SERVER 保存前チェック
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {getStageDecisionLabel(serverDecision)}
            </p>
          </div>
        </div>

        {clientResult?.metrics ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
              <p className="text-xs tracking-[0.14em] text-neutral-500">長さ</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatSeconds(clientResult.metrics.durationSeconds)}
              </p>
            </div>

            <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
              <p className="text-xs tracking-[0.14em] text-neutral-500">
                声らしい区間
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatPercent(clientResult.metrics.speechWindowRatio)}
              </p>
            </div>

            <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
              <p className="text-xs tracking-[0.14em] text-neutral-500">
                無音割合
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatPercent(clientResult.metrics.pauseRatio)}
              </p>
            </div>

            <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
              <p className="text-xs tracking-[0.14em] text-neutral-500">
                音が入っている割合
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatPercent(clientResult.metrics.activeRatio)}
              </p>
            </div>

            <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
              <p className="text-xs tracking-[0.14em] text-neutral-500">
                環境音っぽさ
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatPercent(clientResult.metrics.noisyWindowRatio)}
              </p>
            </div>

            <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
              <p className="text-xs tracking-[0.14em] text-neutral-500">
                連続音っぽさ
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {formatPercent(clientResult.metrics.continuousSoundRatio)}
              </p>
            </div>
          </div>
        ) : null}

        {retryHints.length ? (
          <div className="mt-4 rounded-[20px] border border-white/10 bg-black/20 p-4">
            <p className="text-xs tracking-[0.14em] text-neutral-500">
              RETRY GUIDE
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-200">
              {retryHints.map((hint) => (
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
              ? "client / server 両方の保存前チェック通過"
              : "この音源では今は保存しない"}
          </button>

          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-neutral-300">
            保存本体でも server helper を再利用する前提
          </span>
        </div>
      </div>
    </div>
  );
}