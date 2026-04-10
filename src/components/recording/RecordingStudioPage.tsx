"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { RecordingPermissionMode } from "@/lib/recording/recordingEntry";
import { NemoGenerateCard } from "@/components/recording/NemoGenerateCard";
import {
  AUDIO_UPLOAD_ALLOWED_EXTENSIONS,
  analyzeAudioUploadClient,
  type AudioUploadCheckResult,
  type AudioUploadDecision,
} from "@/lib/recording/audioUploadValidation";

type EpisodeItem = {
  id: string;
  episodeNumber: number;
  title: string;
  body: string;
  preview: string;
  readHref: string;
  bgmSummary: string;
};

type RecordingStudioPageProps = {
  seriesId: string;
  seriesTitle: string;
  permissionMode: RecordingPermissionMode;
  worksHref: string;
  bgmHref: string;
  episodes: EpisodeItem[];
  manageBgmHref: string;
};

type UploadCheckApiResponse = {
  ok: boolean;
  result?: AudioUploadCheckResult;
  error?: string;
};

type HumanPublishResponse = {
  ok: boolean;
  recordingId?: string;
  audioStoragePath?: string;
  readerName?: string;
  error?: string;
  detail?: string;
  validationResult?: AudioUploadCheckResult;
};

type PreparedAudioSource = "none" | "browser_recording" | "file_upload";

function getPermissionLabel(mode: RecordingPermissionMode): string {
  if (mode === "open") return "自由朗読";
  if (mode === "approval_required") return "承認制";
  return "朗読停止";
}

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

function getPreparedSourceLabel(source: PreparedAudioSource): string {
  if (source === "browser_recording") return "ブラウザ録音";
  if (source === "file_upload") return "ファイルアップロード";
  return "未選択";
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }

  if (typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function guessExtensionFromMimeType(mimeType: string): string {
  const lower = mimeType.toLowerCase();

  if (lower.includes("webm")) return "webm";
  if (lower.includes("ogg")) return "ogg";
  if (lower.includes("mp4") || lower.includes("m4a")) return "m4a";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
  if (lower.includes("wav")) return "wav";
  if (lower.includes("aac")) return "aac";
  if (lower.includes("flac")) return "flac";

  return "webm";
}

function buildRecordedFileName(episodeNumber: number, extension: string): string {
  return `libread-episode-${String(episodeNumber).padStart(3, "0")}.${extension}`;
}

function buildReaderSpecificHref(baseHref: string, readerName: string): string {
  const [pathname, rawQuery = ""] = baseHref.split("?");
  const params = new URLSearchParams(rawQuery);

  params.set("readerName", readerName);

  const nextQuery = params.toString();
  return `${pathname}${nextQuery ? `?${nextQuery}` : ""}`;
}

export function RecordingStudioPage({
  seriesId,
  seriesTitle,
  permissionMode,
  worksHref,
  bgmHref,
  episodes,
  manageBgmHref,
}: RecordingStudioPageProps) {
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>(
    episodes[0]?.id ?? ""
  );
  const [recordingTitle, setRecordingTitle] = useState<string>(
    `${seriesTitle} 朗読`
  );
  const [readerName, setReaderName] = useState<string>("");
  const [bgmMode, setBgmMode] = useState<"none" | "select-later">("none");
  const [showMicGuide, setShowMicGuide] = useState(true);
  const [showReadingMemo, setShowReadingMemo] = useState(true);
  const [memo, setMemo] = useState("");
  const [recordingStatus, setRecordingStatus] = useState<
    "idle" | "requesting" | "recording" | "stopping"
  >("idle");
  const [recordingMessage, setRecordingMessage] = useState(
    "録音するか、既存ファイルをアップロードするかを選ぶ。"
  );

  const [preparedAudioFile, setPreparedAudioFile] = useState<File | null>(null);
  const [preparedAudioSource, setPreparedAudioSource] =
    useState<PreparedAudioSource>("none");
  const [preparedAudioPreviewUrl, setPreparedAudioPreviewUrl] = useState("");
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
  const [unexpectedUploadError, setUnexpectedUploadError] = useState("");

  const [publishStatus, setPublishStatus] = useState<
    "idle" | "publishing" | "success" | "error"
  >("idle");
  const [publishMessage, setPublishMessage] = useState(
    "保存前チェックを通した音源だけ publish できる。"
  );
  const [publishResult, setPublishResult] = useState<HumanPublishResponse | null>(
    null
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const selectedEpisode = useMemo(() => {
    return (
      episodes.find((episode) => episode.id === selectedEpisodeId) ?? episodes[0]
    );
  }, [episodes, selectedEpisodeId]);

  const canRecordInBrowser = useMemo(() => {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined"
    );
  }, []);

  const finalDecision = useMemo<AudioUploadDecision>(() => {
    if (unexpectedUploadError) return "rejected";
    if (serverDecision === "checking") return "checking";
    if (serverDecision !== "idle") return serverDecision;
    return clientDecision;
  }, [clientDecision, serverDecision, unexpectedUploadError]);

  const retryHints = useMemo(() => {
    if (serverResult?.retryHints?.length) return serverResult.retryHints;
    if (clientResult?.retryHints?.length) return clientResult.retryHints;
    return [];
  }, [clientResult, serverResult]);

  const canPublish = useMemo(() => {
    return (
      !!selectedEpisode &&
      !!preparedAudioFile &&
      clientResult?.decision === "passed" &&
      serverResult?.decision === "passed" &&
      publishStatus !== "publishing"
    );
  }, [clientResult, preparedAudioFile, publishStatus, selectedEpisode, serverResult]);

  const publishedReadHref = useMemo(() => {
    if (!selectedEpisode) return "";
    if (!publishResult?.readerName) return selectedEpisode.readHref;

    return buildReaderSpecificHref(
      selectedEpisode.readHref,
      publishResult.readerName
    );
  }, [publishResult?.readerName, selectedEpisode]);

  useEffect(() => {
    return () => {
      if (preparedAudioPreviewUrl) {
        URL.revokeObjectURL(preparedAudioPreviewUrl);
      }
    };
  }, [preparedAudioPreviewUrl]);

  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function stopCurrentStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  async function runServerPrecheck(file: File): Promise<AudioUploadCheckResult> {
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
      return payload.result;
    }

    throw new Error(
      payload?.error ||
        "server 側保存前チェック route から想定外レスポンスが返った。"
    );
  }

  async function prepareFileForPublish(
    file: File,
    source: PreparedAudioSource
  ): Promise<void> {
    setUnexpectedUploadError("");
    setClientResult(null);
    setServerResult(null);
    setClientDecision("checking");
    setServerDecision("idle");
    setPublishStatus("idle");
    setPublishResult(null);
    setPublishMessage("保存前チェックを実行中。");

    setPreparedAudioSource(source);
    setPreparedAudioFile(file);

    const nextPreviewUrl = URL.createObjectURL(file);
    setPreparedAudioPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return nextPreviewUrl;
    });

    try {
      const nextClientResult = await analyzeAudioUploadClient(file);
      setClientResult(nextClientResult);
      setClientDecision(nextClientResult.decision);

      if (nextClientResult.decision !== "passed") {
        setPublishMessage(nextClientResult.message);
        return;
      }

      const nextServerResult = await runServerPrecheck(file);
      setServerResult(nextServerResult);
      setServerDecision(nextServerResult.decision);
      setPublishMessage(nextServerResult.message);
    } catch (error) {
      console.error("audio file prepare failed", error);
      setServerDecision("rejected");
      setUnexpectedUploadError(
        "保存前チェック中に想定外エラーが出た。今は安全側で publish 停止にしている。"
      );
      setPublishMessage(
        "保存前チェック中に想定外エラーが出た。今は安全側で publish 停止にしている。"
      );
    }
  }

  async function handleUploadFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      setPreparedAudioFile(null);
      setPreparedAudioSource("none");
      setClientResult(null);
      setServerResult(null);
      setClientDecision("idle");
      setServerDecision("idle");
      setUnexpectedUploadError("");
      setPublishStatus("idle");
      setPublishResult(null);
      setPublishMessage("保存前チェックを通した音源だけ publish できる。");
      setPreparedAudioPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return "";
      });
      return;
    }

    setRecordingMessage("既存ファイルを選択した。保存前チェックへ進む。");
    await prepareFileForPublish(file, "file_upload");
  }

  async function startBrowserRecording() {
    if (!selectedEpisode) {
      setRecordingMessage("先に制作対象の話を選ぶ。");
      return;
    }

    if (!canRecordInBrowser) {
      setRecordingMessage(
        "この端末ではブラウザ録音が難しそう。既存音声ファイルアップロードへ切り替える。"
      );
      return;
    }

    setRecordingStatus("requesting");
    setRecordingMessage("マイク許可を要求中。");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = pickRecorderMimeType();
      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);

      recordedChunksRef.current = [];
      mediaRecorderRef.current = recorder;
      mediaStreamRef.current = stream;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setRecordingStatus("idle");
        setRecordingMessage("録音中にエラーが出た。");
        stopCurrentStream();
        mediaRecorderRef.current = null;
      };

      recorder.onstop = async () => {
        const actualMimeType =
          recorder.mimeType || preferredMimeType || "audio/webm";
        const extension = guessExtensionFromMimeType(actualMimeType);
        const blob = new Blob(recordedChunksRef.current, {
          type: actualMimeType,
        });

        stopCurrentStream();
        mediaRecorderRef.current = null;
        setRecordingStatus("idle");

        if (blob.size <= 0) {
          setRecordingMessage("録音データが空だった。もう一度録音して。");
          return;
        }

        const file = new File(
          [blob],
          buildRecordedFileName(selectedEpisode.episodeNumber, extension),
          {
            type: actualMimeType,
            lastModified: Date.now(),
          }
        );

        setRecordingMessage(
          "録音停止。プレビューと保存前チェックを通してから publish へ進める。"
        );
        await prepareFileForPublish(file, "browser_recording");
      };

      recorder.start();
      setRecordingStatus("recording");
      setRecordingMessage("録音中。終わったら停止してプレビュー確認へ進む。");
    } catch (error) {
      console.error("browser recording start failed", error);
      stopCurrentStream();
      mediaRecorderRef.current = null;
      setRecordingStatus("idle");
      setRecordingMessage(
        "マイクを使えなかった。権限か端末制約を確認するか、既存ファイルアップロードへ切り替える。"
      );
    }
  }

  function stopBrowserRecording() {
    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      setRecordingStatus("idle");
      setRecordingMessage("停止できる録音が無い。");
      return;
    }

    if (recorder.state === "inactive") {
      setRecordingStatus("idle");
      setRecordingMessage("録音はすでに停止済み。");
      return;
    }

    setRecordingStatus("stopping");
    setRecordingMessage("録音停止中。音源をまとめている。");
    recorder.stop();
  }

  async function handlePublish() {
    if (!selectedEpisode || !preparedAudioFile) {
      return;
    }

    setPublishStatus("publishing");
    setPublishResult(null);
    setPublishMessage("audio 保存 → recordings 接続 → 既存 row 上書き確認を実行中。");

    try {
      const formData = new FormData();
      formData.append("seriesId", seriesId);
      formData.append("episodeId", selectedEpisode.id);
      formData.append("recordingTitle", recordingTitle);
      formData.append("readerName", readerName.trim());
      formData.append("audio", preparedAudioFile);

      const response = await fetch("/api/recordings/human-publish", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | HumanPublishResponse
        | null;

      if (!response.ok || !payload?.ok) {
        if (payload?.validationResult) {
          setServerResult(payload.validationResult);
          setServerDecision(payload.validationResult.decision);
        }

        setPublishStatus("error");
        setPublishResult(payload);
        setPublishMessage(
          payload?.detail
            ? `${payload?.error || "publish に失敗した。"}\n${payload.detail}`
            : payload?.error || "publish に失敗した。"
        );
        return;
      }

      setPublishStatus("success");
      setPublishResult(payload);
      setPublishMessage(
        "publish 完了。recordings に接続されたので、読む画面と作品導線から確認できる。"
      );
    } catch (error) {
      console.error("human publish failed", error);
      setPublishStatus("error");
      setPublishResult(null);
      setPublishMessage("通信中に想定外エラーが出た。");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
      <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
        <p className="text-xs tracking-[0.18em] text-neutral-500">EPISODES</p>
        <h2 className="mt-2 text-xl font-semibold text-white">話を選ぶ</h2>
        <p className="mt-3 text-sm leading-7 text-neutral-400">
          route は series 単位のままにして、制作対象の話をここで切り替える。
        </p>

        <div className="mt-5 space-y-3">
          {episodes.length > 0 ? (
            episodes.map((episode) => {
              const isActive = episode.id === selectedEpisode?.id;

              return (
                <button
                  key={episode.id}
                  type="button"
                  onClick={() => setSelectedEpisodeId(episode.id)}
                  className={[
                    "w-full rounded-[24px] border p-4 text-left transition",
                    isActive
                      ? "border-emerald-400/30 bg-emerald-400/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white">
                      第{episode.episodeNumber}話
                    </span>
                    {isActive ? (
                      <span className="rounded-full bg-emerald-400 px-2.5 py-1 text-[11px] font-semibold text-black">
                        制作対象
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-2 text-sm font-medium text-neutral-200">
                    {episode.title}
                  </p>

                  <p className="mt-3 text-xs leading-6 text-neutral-500">
                    {episode.preview || "本文プレビューなし"}
                  </p>
                </button>
              );
            })
          ) : (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-neutral-500">
              まだ話データがないので、制作対象を選べない。
            </div>
          )}
        </div>

        <div className="mt-5 space-y-3 border-t border-white/10 pt-5">
          <Link
            href={worksHref}
            className="block rounded-full bg-white px-5 py-3 text-center text-sm font-semibold text-black transition hover:opacity-90"
          >
            作品ページへ戻る
          </Link>

          {selectedEpisode ? (
            <Link
              href={selectedEpisode.readHref}
              className="block rounded-full border border-white/10 bg-white/5 px-5 py-3 text-center text-sm text-neutral-200 transition hover:bg-white hover:text-black"
            >
              読む画面で確認する
            </Link>
          ) : null}

          <Link
            href={bgmHref}
            className="block rounded-full border border-white/10 bg-white/5 px-5 py-3 text-center text-sm text-neutral-200 transition hover:bg-white hover:text-black"
          >
            BGM素材ページを見る
          </Link>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
        <div className="flex flex-wrap gap-3">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-neutral-300">
            対象作品: {seriesTitle}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-neutral-300">
            許可状態: {getPermissionLabel(permissionMode)}
          </span>
          {selectedEpisode ? (
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-sm text-emerald-200">
              選択中: 第{selectedEpisode.episodeNumber}話
            </span>
          ) : null}
        </div>

        <div className="mt-5 rounded-[24px] border border-sky-400/20 bg-sky-400/10 p-5 text-sm leading-7 text-sky-100">
          <p className="text-xs tracking-[0.18em] text-sky-200">
            RECORDING FLOW
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            今回の最小朗読導線
          </h2>
          <ul className="mt-3 space-y-1">
            <li>・ブラウザ録音か既存音声アップロードのどちらでも進める</li>
            <li>・file 選択直後に client 仮判定、その後 server 側保存前チェックを通す</li>
            <li>・publish 時だけ storage 保存と recordings 接続を行う</li>
            <li>・same episode / same reader は上書きする</li>
          </ul>
        </div>

        <div className="mt-5">
          <p className="text-xs tracking-[0.18em] text-neutral-500">SCRIPT</p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            本文を見ながら制作する
          </h2>
          <p className="mt-3 text-sm leading-7 text-neutral-400">
            録音やアップロードの対象は、いま選んでいる話へ接続される。
          </p>
        </div>

        {selectedEpisode ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    EPISODE
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">
                    第{selectedEpisode.episodeNumber}話 {selectedEpisode.title}
                  </h3>
                </div>

                <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-neutral-400">
                  seriesId: {seriesId}
                </span>
              </div>
            </div>

            <div className="min-h-[520px] rounded-[24px] border border-white/10 bg-[#0f0f12] p-5">
              {selectedEpisode.body.trim() ? (
                <div className="whitespace-pre-wrap text-[15px] leading-8 text-neutral-200">
                  {selectedEpisode.body}
                </div>
              ) : (
                <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-neutral-500">
                  本文データが空なので、ここにはまだ表示できる内容がない。
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-neutral-500">
            制作対象の話を選ぶと、ここに本文が表示される。
          </div>
        )}
      </section>

      <aside className="space-y-6">
        <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
          <p className="text-xs tracking-[0.18em] text-neutral-500">
            SETTINGS
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">最小設定枠</h2>
          <p className="mt-3 text-sm leading-7 text-neutral-400">
            タイトルと表示名は今段階では軽い入力だけ持たせる。上書き判定は user
            id 側で行う。
          </p>

          <div className="mt-5 space-y-4">
            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">朗読タイトル</span>
              <input
                value={recordingTitle}
                onChange={(event) => setRecordingTitle(event.target.value)}
                placeholder="例: 第1話 しっとり読み"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">朗読者表示名</span>
              <input
                value={readerName}
                onChange={(event) => setReaderName(event.target.value)}
                placeholder="未入力ならアカウント名ベースで自動補完"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">BGM設定</span>
              <select
                value={bgmMode}
                onChange={(event) =>
                  setBgmMode(event.target.value as "none" | "select-later")
                }
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="none" className="bg-[#111] text-white">
                  今は使わない
                </option>
                <option value="select-later" className="bg-[#111] text-white">
                  あとで /bgm から選ぶ
                </option>
              </select>
            </label>

            <label className="flex items-start gap-3 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
              <input
                type="checkbox"
                checked={showMicGuide}
                onChange={(event) => setShowMicGuide(Boolean(event.target.checked))}
                className="mt-1 h-4 w-4"
              />
              <span className="text-sm leading-6 text-neutral-300">
                マイク確認案内を表示する
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
              <input
                type="checkbox"
                checked={showReadingMemo}
                onChange={(event) =>
                  setShowReadingMemo(Boolean(event.target.checked))
                }
                className="mt-1 h-4 w-4"
              />
              <span className="text-sm leading-6 text-neutral-300">
                読み方メモの補助枠を使う
              </span>
            </label>

            {showReadingMemo ? (
              <label className="grid gap-2">
                <span className="text-sm text-neutral-300">制作メモ</span>
                <textarea
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  placeholder="読み分け、間の取り方、BGM候補など"
                  rows={6}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                />
              </label>
            ) : null}

            {selectedEpisode ? (
              <div className="rounded-[20px] border border-white/10 bg-black/20 p-4 text-sm leading-7 text-neutral-300">
                <p className="text-xs tracking-[0.18em] text-neutral-500">
                  EFFECTIVE BGM
                </p>
                <p className="mt-2">{selectedEpisode.bgmSummary}</p>

                <Link
                  href={manageBgmHref}
                  className="mt-4 inline-block rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                >
                  BGM管理へ移動
                </Link>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
          <p className="text-xs tracking-[0.18em] text-neutral-500">
            BROWSER RECORDING
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            ブラウザ録音
          </h2>
          <p className="mt-3 text-sm leading-7 text-neutral-400">
            PC はここから録音主導。スマホで MediaRecorder が厳しい端末は、下のファイルアップロードへ回す。
          </p>

          {showMicGuide ? (
            <div className="mt-4 rounded-[20px] border border-white/10 bg-black/20 p-4 text-sm leading-7 text-neutral-300">
              録音前に、入力デバイス、ブラウザのマイク許可、静かな環境を確認する。
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={startBrowserRecording}
              disabled={
                recordingStatus === "requesting" ||
                recordingStatus === "recording" ||
                recordingStatus === "stopping" ||
                !canRecordInBrowser
              }
              className={[
                "rounded-full px-5 py-3 text-sm font-semibold transition",
                canRecordInBrowser &&
                recordingStatus !== "requesting" &&
                recordingStatus !== "recording" &&
                recordingStatus !== "stopping"
                  ? "bg-white text-black hover:opacity-90"
                  : "cursor-not-allowed bg-white text-black opacity-40",
              ].join(" ")}
            >
              録音開始
            </button>

            <button
              type="button"
              onClick={stopBrowserRecording}
              disabled={recordingStatus !== "recording"}
              className={[
                "rounded-full px-5 py-3 text-sm font-semibold transition",
                recordingStatus === "recording"
                  ? "border border-white/10 bg-white/5 text-neutral-200 hover:bg-white hover:text-black"
                  : "cursor-not-allowed border border-white/10 bg-white/5 text-neutral-500 opacity-50",
              ].join(" ")}
            >
              録音停止
            </button>
          </div>

          <div className="mt-4 rounded-[20px] border border-white/10 bg-black/20 p-4 text-sm leading-7 text-neutral-300">
            <p className="text-xs tracking-[0.18em] text-neutral-500">
              RECORD STATUS
            </p>
            <p className="mt-2">
              状態:{" "}
              {recordingStatus === "idle"
                ? "待機"
                : recordingStatus === "requesting"
                ? "許可待ち"
                : recordingStatus === "recording"
                ? "録音中"
                : "停止処理中"}
            </p>
            <p className="mt-2">{recordingMessage}</p>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
          <p className="text-xs tracking-[0.18em] text-neutral-500">
            UPLOAD / PUBLISH
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            音声を選んで publish する
          </h2>
          <p className="mt-3 text-sm leading-7 text-neutral-400">
            録音した音源でも既存ファイルでも、ここで保存前チェックを通したものだけ publish できる。
          </p>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium text-neutral-200">
              音声ファイルを選ぶ
            </span>
            <input
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg,.aac,.flac"
              onChange={handleUploadFileChange}
              className="block w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-neutral-200 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black"
            />
          </label>

          <p className="mt-3 text-xs leading-6 text-neutral-500">
            対応想定: {AUDIO_UPLOAD_ALLOWED_EXTENSIONS.join(" / ")}
          </p>

          {preparedAudioPreviewUrl ? (
            <div className="mt-4 rounded-[20px] border border-white/10 bg-black/20 p-4">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                PREVIEW
              </p>
              <audio
                controls
                src={preparedAudioPreviewUrl}
                className="mt-3 w-full"
              />
            </div>
          ) : null}

          <div
            className={[
              "mt-4 rounded-[24px] border p-4",
              getDecisionTone(finalDecision),
            ].join(" ")}
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
                {preparedAudioFile?.name || "未選択"}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
                <p className="text-xs tracking-[0.14em] text-neutral-500">SOURCE</p>
                <p className="mt-2">{getPreparedSourceLabel(preparedAudioSource)}</p>
                <p className="mt-1 text-xs text-neutral-400">
                  {preparedAudioFile
                    ? formatFileSize(preparedAudioFile.size)
                    : "0 B"}
                </p>
              </div>

              <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
                <p className="text-xs tracking-[0.14em] text-neutral-500">RESULT</p>
                <p className="mt-2">
                  {unexpectedUploadError ||
                    serverResult?.message ||
                    clientResult?.message ||
                    "ファイルを選ぶとここに判定結果が出る"}
                </p>
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
                onClick={handlePublish}
                disabled={!canPublish}
                className={[
                  "rounded-full px-5 py-3 text-sm font-semibold transition",
                  canPublish
                    ? "bg-white text-black hover:opacity-90"
                    : "cursor-not-allowed bg-white text-black opacity-40",
                ].join(" ")}
              >
                {publishStatus === "publishing"
                  ? "publish 中..."
                  : "publish して recordings へ接続"}
              </button>

              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-neutral-300">
                接続先:{" "}
                {selectedEpisode
                  ? `第${selectedEpisode.episodeNumber}話`
                  : "話未選択"}
              </span>
            </div>
          </div>

          <div
            className={[
              "mt-4 rounded-[24px] border p-4",
              publishStatus === "success"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                : publishStatus === "error"
                ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
                : publishStatus === "publishing"
                ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                : "border-white/10 bg-white/[0.03] text-neutral-300",
            ].join(" ")}
          >
            <p className="text-xs tracking-[0.18em] opacity-80">PUBLISH STATUS</p>
            <h3 className="mt-2 text-lg font-semibold text-white">
              {publishMessage}
            </h3>

            {publishResult?.recordingId ? (
              <div className="mt-4 rounded-[20px] border border-white/10 bg-black/20 p-4 text-sm leading-7 text-neutral-200">
                <p>recordingId: {publishResult.recordingId}</p>
                <p className="mt-2 break-all">
                  audioStoragePath: {publishResult.audioStoragePath}
                </p>
                <p className="mt-2">
                  readerName: {publishResult.readerName || "未設定"}
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href={publishedReadHref}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    読む画面で確認する
                  </Link>

                  <Link
                    href={worksHref}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    作品ページへ戻る
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
          <p className="text-xs tracking-[0.18em] text-neutral-500">
            NEMO GENERATION
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            VOICEVOX Nemo 自動生成
          </h2>
          <p className="mt-3 text-sm leading-7 text-neutral-400">
            人力朗読とは別系統の既存導線として残す。今回の追加実装でここは壊さない。
          </p>

          {selectedEpisode ? (
            <NemoGenerateCard
              seriesId={seriesId}
              episodeId={selectedEpisode.id}
              episodeNumber={selectedEpisode.episodeNumber}
              episodeTitle={selectedEpisode.title}
              readHref={selectedEpisode.readHref}
            />
          ) : (
            <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-neutral-500">
              話を選ぶと、ここから Nemo 自動生成を実行できる。
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
          <p className="text-xs tracking-[0.18em] text-neutral-500">SCOPE</p>
          <h2 className="mt-2 text-xl font-semibold text-white">今回の到達範囲</h2>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-neutral-400">
            <li>・話選択</li>
            <li>・本文を見ながら制作準備</li>
            <li>・ブラウザ録音</li>
            <li>・既存音声ファイルアップロード</li>
            <li>・client / server 保存前チェック</li>
            <li>・publish 時の recordings 接続</li>
            <li>・same episode / same reader 上書き</li>
            <li>・Nemo 導線維持</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}