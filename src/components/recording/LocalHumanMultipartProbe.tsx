"use client";

// Issue #137: manual NONPRODUCTION Studio staging probe, NOT a publish control.
// Existing Human publish flow remains unchanged and is deliberately separate.
import { useRef, useState } from "react";
import {
  stageHumanMultipartLocally,
  abortHumanMultipartLocally,
  type LocalHumanStageLease,
  type LocalHumanStageProgress,
} from "@/lib/recording/localHumanMultipartClient";

export function LocalHumanMultipartProbe({
  file, seriesId, episodeId,
}: {
  file: File | null;
  seriesId: string;
  episodeId: string;
}) {
  const lease = useRef<LocalHumanStageLease | null>(null);
  const [running, setRunning] = useState(false);
  const key = `issue137-b2-local:${seriesId}:${episodeId}`;
  function loadLease(): LocalHumanStageLease | null {
    try {
      const raw = window.sessionStorage.getItem(key);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const p = parsed as LocalHumanStageLease;
      if (typeof p.sessionId !== "string" ||
          typeof p.fileFingerprint !== "string" ||
          p.seriesId !== seriesId || p.episodeId !== episodeId) return null;
      return p;
    } catch { return null; }
  }
  function clearLease() {
    lease.current = null;
    try { window.sessionStorage.removeItem(key); } catch {}
  }
  const [finished, setFinished] = useState(false);
  const [message, setMessage] = useState("未実施");
  const [progress, setProgress] = useState<LocalHumanStageProgress | null>(null);

  // The Route Handler also hard-denies even if this UI were accidentally
  // rendered by a Preview/Production bundle.
  if (process.env.NODE_ENV !== "development") return null;
  const supported = !!file &&
    file.size > 4 * 1024 * 1024 && file.size <= 1024 * 1024 * 1024 &&
    !!seriesId && !!episodeId;

  async function stageOnly() {
    if (!file || !supported || running) return;
    setRunning(true);
    setFinished(false);
    if (!lease.current) lease.current = loadLease();
    setMessage("開発環境のPRIVATE分割転送を確認中。投稿・公開は行わない。");
    try {
      await stageHumanMultipartLocally({
        file, seriesId, episodeId,
        previousLease: lease.current,
        onLease: (value) => {
          lease.current = value;
          try { window.sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
        },
        onProgress: setProgress,
      });
      setFinished(true);
      setMessage("検証用PRIVATE分割保存完了。朗読は未投稿・未公開。");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `検証停止: ${error.message}。同じ音源の再試行だけが可能。`
          : "検証停止。安全な再試行条件を確認できなかった。"
      );
    } finally {
      setRunning(false);
    }
  }

  async function discard() {
    if (running) return;
    const active = lease.current ?? loadLease();
    if (!active) {
      setMessage("削除対象のローカルチケットがない。");
      return;
    }
    setRunning(true);
    try {
      const n = await abortHumanMultipartLocally({ lease: active });
      clearLease();
      setFinished(false);
      setProgress(null);
      setMessage(`検証用PRIVATEパート${n}件を物理確認して破棄した。`);
    } catch {
      setMessage("削除状態を保証できないためHOLD。再試行が必要。");
    } finally { setRunning(false); }
  }
  return (
    <section aria-label="ローカル分割アップロード検証"
      className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-neutral-800">
      <p className="font-semibold">開発専用：Human PRIVATE分割転送の検証</p>
      <p className="mt-2 leading-6">
        8MiBごとにSHAを照合し、失敗時は同じファイル・チケットで再開する。
        通常の「保存して作品へ接続」とは別の操作で、公開・録音登録は行わない。
      </p>
      <button type="button" onClick={stageOnly}
        disabled={!supported || running || finished}
        className="mt-3 rounded-full border border-amber-400 bg-white px-4 py-2 font-semibold disabled:opacity-40">
        {running ? "検証中..." : finished ? "PRIVATE保存検証済み" : "開発用PRIVATE転送を試す"}
      </button>
      <button type="button" onClick={discard} disabled={running}
        className="ml-2 mt-3 rounded-full border border-rose-300 bg-white px-4 py-2 font-semibold disabled:opacity-40">
        PRIVATE検証パートを破棄
      </button>
      {progress && (
        <p role="status" className="mt-3">
          進捗：{progress.completedParts}/{progress.totalParts} パート
          （{Math.floor(100 * progress.bytesCompleted / progress.totalBytes)}%）
        </p>
      )}
      <p className="mt-2 break-words text-xs" role="status">{message}</p>
      {!supported && <p className="mt-2 text-xs">
        対象は4MiB超〜1GiB以下の音声ファイルと選択済みの話のみ。
      </p>}
    </section>
  );
}
