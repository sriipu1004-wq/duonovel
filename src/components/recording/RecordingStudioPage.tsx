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
import {
  AUDIO_UPLOAD_ALLOWED_EXTENSIONS,
  analyzeAudioUploadClient,
  type AudioUploadCheckResult,
  type AudioUploadDecision,
} from "@/lib/recording/audioUploadValidation";
import { supabase } from "@/lib/supabaseClient";

type EpisodeItem = {
  id: string;
  episodeNumber: number;
  title: string;
  body: string;
  preview: string;
  readHref: string;
};

type ExistingRecordingSeed = {
  episodeId: string;
  audioStoragePath: string;
  readerName: string;
};

type RecordingStudioPageProps = {
  seriesId: string;
  seriesTitle: string;
  permissionMode: RecordingPermissionMode;
  worksHref: string;
  episodes: EpisodeItem[];
  existingRecordings: ExistingRecordingSeed[];
  fixedReaderName: string;
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

type HumanDeleteResponse = {
  ok: boolean;
  deletedCount?: number;
  error?: string;
  detail?: string;
};

type HumanMultipartSignedPart = {
  index: number;
  objectPath: string;
  byteOffsetStart: number;
  byteOffsetEndExclusive: number;
  expectedSizeBytes: number;
  token: string;
};

type HumanUploadSessionResponse = {
  ok: boolean;
  uploadMode?: "single" | "multipart";
  uploadSessionId?: string;
  bucketName?: string;
  sourceExtension?: string;
  totalSizeBytes?: number;
  partSizeBytes?: number;
  tempPrefix?: string;
  parts?: HumanMultipartSignedPart[];
  error?: string;
  detail?: string;
};

type PreparedAudioSource =
  | "none"
  | "browser_recording"
  | "file_upload"
  | "existing"
  | "published";

type PreviewHistoryItem = {
  id: string;
  source: PreparedAudioSource;
  name: string;
  url: string;
  file: File | null;
  revokable: boolean;
  clientResult: AudioUploadCheckResult | null;
  serverResult: AudioUploadCheckResult | null;
  clientDecision: AudioUploadDecision;
  serverDecision: AudioUploadDecision;
  unexpectedUploadError: string;
  statusMessage: string;
};

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

function getDecisionLabel(decision: AudioUploadDecision): string {
  if (decision === "passed") return "通過";
  if (decision === "review_required") return "要再確認";
  if (decision === "rejected") return "停止";
  if (decision === "checking") return "検査中";
  return "未検査";
}

function getDecisionTone(decision: AudioUploadDecision): string {
  if (decision === "passed") {
    return "border-sky-200 bg-sky-50 text-black";
  }

  if (decision === "review_required") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (decision === "rejected") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-black/10 bg-neutral-50 text-neutral-700";
}

function getPreparedSourceLabel(source: PreparedAudioSource): string {
  if (source === "browser_recording") return "ブラウザ録音";
  if (source === "file_upload") return "ファイルアップロード";
  if (source === "existing") return "既存朗読";
  if (source === "published") return "保存済み朗読";
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

function buildExistingPreviewItem(
  existing: ExistingRecordingSeed
): PreviewHistoryItem {
  return {
    id: `existing-${existing.episodeId}`,
    source: "existing",
    name: "既存の朗読",
    url: existing.audioStoragePath,
    file: null,
    revokable: false,
    clientResult: null,
    serverResult: null,
    clientDecision: "idle",
    serverDecision: "idle",
    unexpectedUploadError: "",
    statusMessage:
      "既存の朗読を表示中。新しく録音するか音声ファイルを選ぶと、この朗読の上書き候補へ切り替わる。",
  };
}

function revokePreviewItems(items: PreviewHistoryItem[]) {
  for (const item of items) {
    if (item.revokable) {
      URL.revokeObjectURL(item.url);
    }
  }
}

export function RecordingStudioPage({
  seriesId,
  seriesTitle,
  permissionMode,
  worksHref,
  episodes,
  existingRecordings,
  fixedReaderName,
}: RecordingStudioPageProps) {
  const safeEpisodes = Array.isArray(episodes) ? episodes : [];
  const safeExistingRecordings = Array.isArray(existingRecordings)
    ? existingRecordings
    : [];
  const safeFixedReaderName =
    typeof fixedReaderName === "string" && fixedReaderName.trim().length > 0
      ? fixedReaderName.trim()
      : "ユーザー朗読";

  const [existingRecordingMap, setExistingRecordingMap] = useState<
    Record<string, ExistingRecordingSeed>
  >(() =>
    Object.fromEntries(
      safeExistingRecordings.map((item) => [item.episodeId, item] as const)
    )
  );

  const recordedEpisodeIdSet = useMemo(
    () => new Set(Object.keys(existingRecordingMap)),
    [existingRecordingMap]
  );

  const firstSelectableEpisodeId = useMemo(() => {
    const firstUnrecorded = safeEpisodes.find(
      (episode) => !recordedEpisodeIdSet.has(episode.id)
    );
    return firstUnrecorded?.id ?? safeEpisodes[0]?.id ?? "";
  }, [safeEpisodes, recordedEpisodeIdSet]);

  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>(
    firstSelectableEpisodeId
  );

  const recordingTitle = `${seriesTitle} 朗読`;

  const [recordingStatus, setRecordingStatus] = useState<
    "idle" | "requesting" | "recording" | "stopping"
  >("idle");
  const [recordingMessage, setRecordingMessage] = useState(
    "録音するか、既存ファイルをアップロードするかを選ぶ。"
  );

  const [previewItems, setPreviewItems] = useState<PreviewHistoryItem[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);

  const [publishStatus, setPublishStatus] = useState<
    "idle" | "publishing" | "success" | "error"
  >("idle");
  const [publishMessage, setPublishMessage] = useState(
    "保存前チェックを通した音源だけ publish できる。"
  );
  const [publishResult, setPublishResult] = useState<HumanPublishResponse | null>(
    null
  );
  const [deleteStatus, setDeleteStatus] = useState<
    "idle" | "deleting" | "error"
  >("idle");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const previewItemsRef = useRef<PreviewHistoryItem[]>([]);

  const selectedEpisode = useMemo(() => {
    return (
      safeEpisodes.find((episode) => episode.id === selectedEpisodeId) ??
      safeEpisodes[0]
    );
  }, [safeEpisodes, selectedEpisodeId]);

  const selectedExistingRecording = useMemo(() => {
    if (!selectedEpisode) {
      return null;
    }

    return existingRecordingMap[selectedEpisode.id] ?? null;
  }, [existingRecordingMap, selectedEpisode]);  

  const currentPreviewItem = previewItems[previewIndex] ?? null;

  useEffect(() => {
    previewItemsRef.current = previewItems;
  }, [previewItems]);

  useEffect(() => {
    return () => {
      revokePreviewItems(previewItemsRef.current);
    };
  }, []);

  useEffect(() => {
    if (!selectedEpisodeId && firstSelectableEpisodeId) {
      setSelectedEpisodeId(firstSelectableEpisodeId);
      return;
    }

    const exists = safeEpisodes.some(
      (episode) => episode.id === selectedEpisodeId
    );
    if (!exists && firstSelectableEpisodeId) {
      setSelectedEpisodeId(firstSelectableEpisodeId);
    }
  }, [safeEpisodes, firstSelectableEpisodeId, selectedEpisodeId]);

  useEffect(() => {
    if (!selectedEpisode) {
      revokePreviewItems(previewItemsRef.current);
      setPreviewItems([]);
      setPreviewIndex(0);
      setPublishStatus("idle");
      setPublishResult(null);
      setPublishMessage("保存前チェックを通した音源だけ publish できる。");
      return;
    }

    const existing = existingRecordingMap[selectedEpisode.id] ?? null;
    revokePreviewItems(previewItemsRef.current);

    const nextItems = existing ? [buildExistingPreviewItem(existing)] : [];
    previewItemsRef.current = nextItems;
    setPreviewItems(nextItems);
    setPreviewIndex(0);
    setPublishStatus("idle");
    setPublishResult(null);
    setDeleteStatus("idle");
    setPublishMessage(
      existing
        ? "既存の朗読を表示中。新しく録音するか音声ファイルを選ぶと上書き候補へ切り替わる。"
        : "保存前チェックを通した音源だけ publish できる。"
    );

  }, [existingRecordingMap, selectedEpisode?.id]);

  const [canRecordInBrowser, setCanRecordInBrowser] = useState(false);
  const [browserRecordingBlockedReason, setBrowserRecordingBlockedReason] =
    useState("判定前");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (!window.isSecureContext && !isLocalhost) {
      setCanRecordInBrowser(false);
      setBrowserRecordingBlockedReason(
        "このページが安全なコンテキストで開かれていない。localhost か https で開く。"
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCanRecordInBrowser(false);
      setBrowserRecordingBlockedReason(
        "このブラウザでは getUserMedia が使えない。"
      );
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setCanRecordInBrowser(false);
      setBrowserRecordingBlockedReason(
        "このブラウザでは MediaRecorder が使えない。"
      );
      return;
    }

    setCanRecordInBrowser(true);
    setBrowserRecordingBlockedReason("");
  }, []);

  const finalDecision = useMemo<AudioUploadDecision>(() => {
    if (!currentPreviewItem) {
      return "idle";
    }

    if (currentPreviewItem.unexpectedUploadError) {
      return "rejected";
    }

    if (currentPreviewItem.serverDecision === "checking") {
      return "checking";
    }

    if (currentPreviewItem.serverDecision !== "idle") {
      return currentPreviewItem.serverDecision;
    }

    return currentPreviewItem.clientDecision;
  }, [currentPreviewItem]);

  const currentStatusMessage = useMemo(() => {
    if (!currentPreviewItem) {
      return "音声をまだ選んでいない。";
    }

    return (
      currentPreviewItem.unexpectedUploadError ||
      currentPreviewItem.serverResult?.message ||
      currentPreviewItem.clientResult?.message ||
      currentPreviewItem.statusMessage
    );
  }, [currentPreviewItem]);

  const canPublish = useMemo(() => {
    return (
      !!selectedEpisode &&
      !!currentPreviewItem?.file &&
      currentPreviewItem.clientResult?.decision === "passed" &&
      currentPreviewItem.serverResult?.decision === "passed" &&
      publishStatus !== "publishing"
    );
  }, [currentPreviewItem, publishStatus, selectedEpisode]);

  const publishedReadHref = useMemo(() => {
    if (!selectedEpisode) return "";
    if (!publishResult?.readerName) return selectedEpisode.readHref;

    return buildReaderSpecificHref(
      selectedEpisode.readHref,
      publishResult.readerName
    );
  }, [publishResult?.readerName, selectedEpisode]);

  const footerRecordButtonLabel =
    recordingStatus === "recording"
      ? "録音停止"
      : recordingStatus === "requesting"
        ? "許可待ち"
        : recordingStatus === "stopping"
          ? "停止中"
          : "録音開始";

  const footerRecordButtonDisabled =
    recordingStatus === "requesting" || recordingStatus === "stopping";

  function stopCurrentStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  function replacePreviewHistory(nextItems: PreviewHistoryItem[]) {
    revokePreviewItems(previewItemsRef.current);
    previewItemsRef.current = nextItems;
    setPreviewItems(nextItems);
    setPreviewIndex(nextItems.length > 0 ? nextItems.length - 1 : 0);
  }

  function pushPreviewHistory(nextItem: PreviewHistoryItem) {
    const base = previewItems.slice(0, previewIndex + 1);
    const discardedFuture = previewItems.slice(previewIndex + 1);

    revokePreviewItems(discardedFuture);

    let nextItems = [...base, nextItem];

    if (nextItems.length > 5) {
      const overflow = nextItems.length - 5;
      const removed = nextItems.slice(0, overflow);
      revokePreviewItems(removed);
      nextItems = nextItems.slice(overflow);
    }

    previewItemsRef.current = nextItems;
    setPreviewItems(nextItems);
    setPreviewIndex(nextItems.length - 1);
  }

  async function createHumanUploadSession(args: {
    seriesId: string;
    episodeId: string;
    file: File;
  }): Promise<HumanUploadSessionResponse> {
    const response = await fetch("/api/recordings/human-upload-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        seriesId: args.seriesId,
        episodeId: args.episodeId,
        fileName: args.file.name,
        mimeType: args.file.type,
        totalSizeBytes: args.file.size,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | HumanUploadSessionResponse
      | null;

    if (!response.ok || !payload?.ok) {
      throw new Error(
        payload?.detail || payload?.error || "upload session 作成に失敗した。"
      );
    }

    return payload;
  }

  async function uploadHumanFileMultipartDirect(args: {
    bucketName: string;
    file: File;
    parts: HumanMultipartSignedPart[];
  }) {
    for (const part of args.parts) {
      const blob = args.file.slice(
        part.byteOffsetStart,
        part.byteOffsetEndExclusive
      );

      const { error } = await supabase.storage
        .from(args.bucketName)
        .uploadToSignedUrl(part.objectPath, part.token, blob, {
          contentType: args.file.type || "application/octet-stream",
        });

      if (error) {
        throw new Error(
          `multipart_part_upload_failed:${part.index + 1}:${error.message}`
        );
      }
    }
  }  

  async function runServerPrecheck(file: File): Promise<AudioUploadCheckResult> {
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
    source: "browser_recording" | "file_upload"
  ): Promise<void> {
    setPublishStatus("idle");
    setPublishResult(null);
    setPublishMessage("保存前チェックを実行中。");

    const previewUrl = URL.createObjectURL(file);

    let clientResult: AudioUploadCheckResult | null = null;
    let serverResult: AudioUploadCheckResult | null = null;
    let clientDecision: AudioUploadDecision = "checking";
    let serverDecision: AudioUploadDecision = "idle";
    let unexpectedUploadError = "";
    let statusMessage = "保存前チェックを実行中。";

    try {
      clientResult = await analyzeAudioUploadClient(file);
      clientDecision = clientResult.decision;
      statusMessage = clientResult.message;

      if (clientResult.decision === "passed") {
        serverDecision = "checking";
        serverResult = await runServerPrecheck(file);
        serverDecision = serverResult.decision;
        statusMessage = serverResult.message;
      }
    } catch (error) {
      console.error("audio file prepare failed", error);
      serverDecision = "rejected";
      unexpectedUploadError =
        "保存前チェック中に想定外エラーが出た。今は安全側で publish 停止にしている。";
      statusMessage = unexpectedUploadError;
    }

    const nextItem: PreviewHistoryItem = {
      id: `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source,
      name: file.name,
      url: previewUrl,
      file,
      revokable: true,
      clientResult,
      serverResult,
      clientDecision,
      serverDecision,
      unexpectedUploadError,
      statusMessage,
    };

    pushPreviewHistory(nextItem);
  }

  async function handleUploadFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
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
        browserRecordingBlockedReason ||
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

  async function handleFooterRecord() {
    if (recordingStatus === "recording") {
      stopBrowserRecording();
      return;
    }

    if (footerRecordButtonDisabled) {
      return;
    }

    await startBrowserRecording();
  }

  async function handlePublish() {
    if (!selectedEpisode || !currentPreviewItem?.file) {
      return;
    }

    setPublishStatus("publishing");
    setPublishResult(null);
    setPublishMessage("audio 保存 → recordings 接続 → 既存 row 上書き確認を実行中。");

      const uploadSession = await createHumanUploadSession({
        seriesId,
        episodeId: selectedEpisode.id,
        file: currentPreviewItem.file,
      });

      if (uploadSession.uploadMode === "multipart") {
        setPublishMessage(
          "大きい音源なので、storage へ内部分割アップロード中。"
        );

        await uploadHumanFileMultipartDirect({
          bucketName: uploadSession.bucketName || "recording-audio",
          file: currentPreviewItem.file,
          parts: uploadSession.parts || [],
        });

        setPublishStatus("error");
        setPublishResult(null);
        setPublishMessage(
          "multipart upload 基盤までは入った。次段の finalize 実装がまだなので、この音源の publish 完了までは今の返答では進めていない。ここで止める。"
        );
        return;
      }

    try {
      const formData = new FormData();
      formData.append("seriesId", seriesId);
      formData.append("episodeId", selectedEpisode.id);
      formData.append("episodeNumber", String(selectedEpisode.episodeNumber));
      formData.append("recordingTitle", recordingTitle);
      formData.append("audio", currentPreviewItem.file);

      const response = await fetch("/api/recordings/human-publish", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | HumanPublishResponse
        | null;

      if (!response.ok || !payload?.ok) {
        setPublishStatus("error");
        setPublishResult(payload);
        setPublishMessage(
          payload?.detail
            ? `${payload?.error || "publish に失敗した。"}\n${payload.detail}`
            : payload?.error || "publish に失敗した。"
        );
        return;
      }

      const nextReaderName =
        payload.readerName?.trim() || safeFixedReaderName;

      setPublishStatus("success");
      setPublishResult(payload);
      setPublishMessage(
        "保存完了。recordings に接続されたので、読む画面と作品導線から確認できる。"
      );

      setExistingRecordingMap((current) => ({
        ...current,
        [selectedEpisode.id]: {
          episodeId: selectedEpisode.id,
          audioStoragePath: payload.audioStoragePath || "",
          readerName: nextReaderName,
        },
      }));
    } catch (error) {
      console.error("human publish failed", error);
      setPublishStatus("error");
      setPublishResult(null);
      setPublishMessage("通信中に想定外エラーが出た。");
    }
  }

  async function handleDeleteExistingRecording() {
    if (!selectedEpisode || !selectedExistingRecording) {
      return;
    }

    setDeleteStatus("deleting");
    setPublishStatus("idle");
    setPublishResult(null);
    setPublishMessage("保存済み朗読を削除中。");

    try {
      const response = await fetch("/api/recordings/human-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seriesId,
          episodeId: selectedEpisode.id,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | HumanDeleteResponse
        | null;

      if (!response.ok || !payload?.ok) {
        setDeleteStatus("error");
        setPublishMessage(payload?.error || "朗読削除に失敗した。");
        return;
      }

      setDeleteStatus("idle");
      setExistingRecordingMap((current) => {
        const next = { ...current };
        delete next[selectedEpisode.id];
        return next;
      });

      if (currentPreviewItem?.source === "existing") {
        revokePreviewItems(previewItemsRef.current);
        previewItemsRef.current = [];
        setPreviewItems([]);
        setPreviewIndex(0);
      }

      setPublishMessage(
        "保存済み朗読を削除した。必要なら新しく録音またはアップロードして publish できる。"
      );
    } catch (error) {
      console.error("human delete failed", error);
      setDeleteStatus("error");
      setPublishMessage("朗読削除中に想定外エラーが出た。");
    }
  }  

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.18em] text-neutral-500">EPISODES</p>
            <h2 className="mt-2 text-xl font-semibold text-black">話を選ぶ</h2>
          </div>

          <Link
            href={worksHref}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            作品ページへ
          </Link>
        </div>

        <p className="mt-3 text-sm leading-7 text-neutral-600">
          制作対象の話を選ぶ。朗読済みの話は表示だけ残し、未朗読の最も若い話を初期選択する。
        </p>

        <div className="mt-5 max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {safeEpisodes.length > 0 ? (
            safeEpisodes.map((episode) => {
              const isActive = episode.id === selectedEpisode?.id;
              const isRecorded = recordedEpisodeIdSet.has(episode.id);

              return (
                <button
                  key={episode.id}
                  type="button"
                  onClick={() => setSelectedEpisodeId(episode.id)}
                  className={[
                    "w-full rounded-[18px] border p-3 text-left transition",
                    isActive
                      ? "border-sky-200 bg-sky-50"
                      : "border-black/10 bg-white hover:bg-neutral-50",
                  ].join(" ")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-black">
                      第{episode.episodeNumber}話　{episode.title}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {isRecorded ? (
                        <span className="rounded-full border border-black/10 bg-neutral-100 px-2.5 py-1 text-[11px] text-neutral-700">
                          朗読済み
                        </span>
                      ) : null}

                      {isActive ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] text-black">
                          制作対象
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <p
                    className="mt-2 text-xs leading-6 text-neutral-500"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {episode.preview || "本文プレビューなし"}
                  </p>
                </button>
              );
            })
          ) : (
            <div className="rounded-[24px] border border-dashed border-black/15 bg-neutral-50 p-4 text-sm leading-7 text-neutral-500">
              まだ話データがないので、制作対象を選べない。
            </div>
          )}
        </div>
      </section>

      <div className="space-y-6">
        <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-sm text-neutral-700">
              対象作品: {seriesTitle}
            </span>
            <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-sm text-neutral-700">
              許可状態: {getPermissionLabel(permissionMode)}
            </span>
            {selectedEpisode ? (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm text-black">
                制作対象:{" "}
                {recordedEpisodeIdSet.has(selectedEpisode.id)
                  ? `第${selectedEpisode.episodeNumber}話（朗読済み）`
                  : `第${selectedEpisode.episodeNumber}話`}
              </span>
            ) : null}
          </div>

          <div className="mt-5">
            <p className="text-xs tracking-[0.18em] text-neutral-500">SCRIPT</p>
            <h2 className="mt-2 text-xl font-semibold text-black">
              プレビューを見ながら制作する
            </h2>
            <p className="mt-3 text-sm leading-7 text-neutral-600">
              録音やアップロードの対象は、いま選んでいる話へ接続される。
            </p>
          </div>

          {selectedEpisode ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-[24px] border border-black/10 bg-neutral-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs tracking-[0.18em] text-neutral-500">
                      EPISODE
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold text-black">
                      第{selectedEpisode.episodeNumber}話 {selectedEpisode.title}
                    </h3>
                  </div>

                  <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-500">
                    seriesId: {seriesId}
                  </span>
                </div>
              </div>

              <div className="h-[560px] overflow-y-auto rounded-[24px] border border-black/10 bg-[#fafafa] p-5">
                {selectedEpisode.preview.trim() ? (
                  <div className="whitespace-pre-wrap text-[15px] leading-8 text-neutral-800">
                    {selectedEpisode.preview}
                  </div>
                ) : (
                  <div className="rounded-[20px] border border-dashed border-black/15 bg-white p-4 text-sm leading-7 text-neutral-500">
                    プレビューが空なので、ここにはまだ表示できる内容がない。
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 p-5 text-sm leading-7 text-neutral-500">
              制作対象の話を選ぶと、ここにプレビューが表示される。
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                UPLOAD / PUBLISH
              </p>
              <h2 className="mt-2 text-xl font-semibold text-black">
                音声を選んで作品へ接続する
              </h2>
            </div>

            {currentPreviewItem ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setPreviewIndex((current) => Math.max(0, current - 1))
                  }
                  disabled={previewIndex <= 0}
                  className={[
                    "rounded-full border px-3 py-1 text-sm transition",
                    previewIndex > 0
                      ? "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50"
                      : "cursor-not-allowed border-black/10 bg-neutral-100 text-neutral-400",
                  ].join(" ")}
                >
                  ←
                </button>

                <span className="text-sm text-neutral-500">
                  {previewItems.length > 0 ? `${previewIndex + 1}/${previewItems.length}` : "0/0"}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setPreviewIndex((current) =>
                      Math.min(previewItems.length - 1, current + 1)
                    )
                  }
                  disabled={previewIndex >= previewItems.length - 1}
                  className={[
                    "rounded-full border px-3 py-1 text-sm transition",
                    previewIndex < previewItems.length - 1
                      ? "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50"
                      : "cursor-not-allowed border-black/10 bg-neutral-100 text-neutral-400",
                  ].join(" ")}
                >
                  →
                </button>
              </div>
            ) : null}
          </div>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-medium text-neutral-700">
              音声ファイルを選ぶ
            </span>
            <input
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg,.aac,.flac"
              onChange={handleUploadFileChange}
              className="block w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-neutral-700 file:mr-4 file:rounded-full file:border-0 file:bg-sky-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black"
            />
          </label>

          <p className="mt-3 text-xs leading-6 text-neutral-500">
            対応想定: {AUDIO_UPLOAD_ALLOWED_EXTENSIONS.join(" / ")}
          </p>

          <div className="mt-4 rounded-[20px] border border-black/10 bg-neutral-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs tracking-[0.18em] text-neutral-500">PREVIEW</p>
                <p className="mt-2 text-sm text-neutral-700">
                  {currentPreviewItem
                    ? `${getPreparedSourceLabel(currentPreviewItem.source)} / ${currentPreviewItem.name}`
                    : "表示できる音声がまだない"}
                </p>
              </div>

              {currentPreviewItem ? (
                <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-500">
                  {currentPreviewItem.file
                    ? formatFileSize(currentPreviewItem.file.size)
                    : "既存音声"}
                </span>
              ) : null}
            </div>

            {currentPreviewItem ? (
              <audio controls src={currentPreviewItem.url} className="mt-3 w-full" />
            ) : (
              <div className="mt-3 rounded-[16px] border border-dashed border-black/15 bg-white p-4 text-sm leading-7 text-neutral-500">
                既存朗読があればここに表示される。新しく録音またはファイル選択した場合は、そちらがプレビューへ追加される。
              </div>
            )}
          </div>

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
                <h3 className="mt-2 text-lg font-semibold">
                  保存前最終判定: {getDecisionLabel(finalDecision)}
                </h3>
              </div>

              <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-500">
                {currentPreviewItem?.name || "未選択"}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[20px] border border-black/10 bg-white p-3 text-sm text-neutral-700">
                <p className="text-xs tracking-[0.14em] text-neutral-500">SOURCE</p>
                <p className="mt-2">
                  {currentPreviewItem
                    ? getPreparedSourceLabel(currentPreviewItem.source)
                    : "未選択"}
                </p>
              </div>

              <div className="rounded-[20px] border border-black/10 bg-white p-3 text-sm text-neutral-700">
                <p className="text-xs tracking-[0.14em] text-neutral-500">RESULT</p>
                <p className="mt-2">{currentStatusMessage}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handlePublish}
                disabled={!canPublish}
                className={[
                  "rounded-full px-5 py-3 text-sm font-semibold transition",
                  canPublish
                    ? "border border-sky-200 bg-sky-50 text-black hover:bg-sky-100"
                    : "cursor-not-allowed border border-black/10 bg-neutral-100 text-neutral-400",
                ].join(" ")}
              >
                {publishStatus === "publishing"
                  ? "保存中..."
                  : "保存して作品へ接続"}
              </button>

              <span className="rounded-full border border-black/10 bg-white px-4 py-3 text-sm text-neutral-700">
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
                ? "border-sky-200 bg-sky-50 text-black"
                : publishStatus === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : publishStatus === "publishing"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-black/10 bg-neutral-50 text-neutral-700",
            ].join(" ")}
          >
            <p className="text-xs tracking-[0.18em] opacity-80">PUBLISH STATUS</p>
            <h3 className="mt-2 whitespace-pre-wrap text-lg font-semibold">
              {publishMessage}
            </h3>

            {publishResult?.recordingId ? (
              <div className="mt-4 rounded-[20px] border border-black/10 bg-white p-4 text-sm leading-7 text-neutral-700">
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
                    className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
                  >
                    読む画面で確認する
                  </Link>

                  <Link
                    href={worksHref}
                    className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
                  >
                    作品ページへ戻る
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {selectedEpisode && selectedExistingRecording ? (
          <section className="rounded-[28px] border border-rose-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs tracking-[0.18em] text-rose-500">
                  DELETE RECORDING
                </p>
                <h2 className="mt-2 text-xl font-semibold text-black">
                  保存済み朗読を削除する
                </h2>
              </div>

              <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-sm text-neutral-700">
                第{selectedEpisode.episodeNumber}話
              </span>
            </div>

            <p className="mt-3 text-sm leading-7 text-neutral-600">
              この話には保存済み朗読がある。ここから削除すると、作品への接続と保存済み音声をまとめて外す。
            </p>

            <div className="mt-4 rounded-[20px] border border-black/10 bg-neutral-50 p-4 text-sm leading-7 text-neutral-700">
              <p>対象話: 第{selectedEpisode.episodeNumber}話 {selectedEpisode.title}</p>
              <p className="mt-2 break-all">
                保存済み音声: {selectedExistingRecording.audioStoragePath}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleDeleteExistingRecording}
                disabled={deleteStatus === "deleting"}
                className={[
                  "rounded-full px-5 py-3 text-sm font-semibold transition",
                  deleteStatus === "deleting"
                    ? "cursor-not-allowed border border-black/10 bg-neutral-100 text-neutral-400"
                    : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
                ].join(" ")}
              >
                {deleteStatus === "deleting" ? "削除中..." : "朗読を削除"}
              </button>
            </div>
          </section>
        ) : null}        

        <div className="sticky bottom-4 z-20">
          <div className="mx-auto flex max-w-[260px] items-center justify-center rounded-[24px] border border-black/10 bg-white/95 p-3 shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={handleFooterRecord}
              disabled={footerRecordButtonDisabled}
              className={[
                "w-full rounded-2xl px-4 py-3 text-sm font-medium transition",
                recordingStatus === "recording"
                  ? "border border-sky-200 bg-sky-50 text-black"
                  : footerRecordButtonDisabled
                    ? "cursor-not-allowed border border-black/10 bg-neutral-100 text-neutral-400"
                    : "border border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
              ].join(" ")}
            >
              {footerRecordButtonLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}