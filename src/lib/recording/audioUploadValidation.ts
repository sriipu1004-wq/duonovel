export const AUDIO_UPLOAD_ALLOWED_EXTENSIONS = [
  "mp3",
  "m4a",
  "wav",
  "webm",
  "ogg",
  "aac",
  "flac",
] as const;

export type AudioUploadDecision =
  | "idle"
  | "checking"
  | "passed"
  | "review_required"
  | "rejected";

export type AudioUploadIssueCode =
  | "unsupported_type"
  | "empty_file"
  | "file_too_large"
  | "too_short"
  | "decode_failed"
  | "silent"
  | "mostly_non_voice"
  | "bgm_dominant"
  | "environment_dominant";

export type AudioUploadMetrics = {
  durationSeconds: number;
  averageRms: number;
  activeRatio: number;
  pauseRatio: number;
  speechWindowRatio: number;
  noisyWindowRatio: number;
  continuousSoundRatio: number;
};

export type AudioUploadCheckResult = {
  decision: AudioUploadDecision;
  issueCode: AudioUploadIssueCode | null;
  message: string;
  retryHints: string[];
  metrics: AudioUploadMetrics | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

const MIN_DURATION_SECONDS = 8;
const MAX_FILE_BYTES = 80 * 1024 * 1024;
const WINDOW_MS = 200;
const STEP_MS = 100;
const ABSOLUTE_SILENCE_RMS = 0.004;
const ACTIVE_RMS = 0.012;

type WindowStats = {
  rms: number;
  zcr: number;
};

function clampRatio(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function hasAllowedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return AUDIO_UPLOAD_ALLOWED_EXTENSIONS.some((extension) =>
    lower.endsWith(`.${extension}`)
  );
}

export function isSupportedAudioFile(file: File): boolean {
  if (!file) return false;
  if (typeof file.type === "string" && file.type.startsWith("audio/")) {
    return true;
  }
  return hasAllowedExtension(file.name);
}

export function canProceedWithAudioUpload(
  result: AudioUploadCheckResult | null
): boolean {
  return result?.decision === "passed";
}

export function getAudioUploadIssueMessage(
  issueCode: AudioUploadIssueCode
): string {
  switch (issueCode) {
    case "unsupported_type":
      return "このファイル形式はまだ検査できない。mp3 / m4a / wav / webm / ogg などを使って。";
    case "empty_file":
      return "ファイルが空なので保存前チェックを続けられない。";
    case "file_too_large":
      return "ファイルが大きすぎるので、今の最小チェック枠では扱えない。";
    case "too_short":
      return "音源が短すぎる。テスト断片ではなく、最低限まとまった朗読を入れて。";
    case "decode_failed":
      return "音声データを解析できなかった。別形式で書き出してから再度試して。";
    case "silent":
      return "無音か、ほぼ無音として判定された。";
    case "mostly_non_voice":
      return "声が主成分とは言いにくいので、今は保存停止にする。";
    case "bgm_dominant":
      return "BGM主体っぽいので、朗読用音声としては通さない。";
    case "environment_dominant":
      return "環境音主体っぽいので、朗読用音声としては通さない。";
  }
}

export function getAudioUploadRetryHints(
  issueCode: AudioUploadIssueCode
): string[] {
  switch (issueCode) {
    case "unsupported_type":
      return [
        "mp3 / m4a / wav / webm / ogg のどれかで書き出す",
        "録音アプリ側で標準的な音声形式に変換する",
      ];
    case "empty_file":
      return ["録音失敗や書き出し失敗がないか確認する"];
    case "file_too_large":
      return [
        "長すぎる音源は分割する",
        "無劣化にこだわりすぎず、配信用の標準書き出しにする",
      ];
    case "too_short":
      return [
        "冒頭だけでなく、数文以上を含む状態で再書き出しする",
        "録音停止直後の切れすぎに注意する",
      ];
    case "decode_failed":
      return [
        "別アプリで mp3 か m4a に書き出し直す",
        "壊れたファイルになっていないか確認する",
      ];
    case "silent":
      return [
        "マイク入力が入っているか確認する",
        "録音後に波形が立っているか確認する",
      ];
    case "mostly_non_voice":
      return [
        "BGM や効果音を抜いた、声だけの元音源で再提出する",
        "朗読以外の素材を混ぜずに書き出す",
      ];
    case "bgm_dominant":
      return [
        "BGM を外した朗読だけの音源にする",
        "BGM は将来のサイト内設定で後付けする前提に戻す",
      ];
    case "environment_dominant":
      return [
        "扇風機、生活音、外音の少ない場所で再録音する",
        "ノイズ抑制後ではなく、生の声が主役の状態で再書き出しする",
      ];
  }
}

function summarizeRejectedResult(
  file: File,
  issueCode: AudioUploadIssueCode,
  metrics: AudioUploadMetrics | null = null
): AudioUploadCheckResult {
  return {
    decision: "rejected",
    issueCode,
    message: getAudioUploadIssueMessage(issueCode),
    retryHints: getAudioUploadRetryHints(issueCode),
    metrics,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
  };
}

function getAudioContextCtor(): typeof AudioContext {
  const scopedWindow = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };

  const ctor = scopedWindow.AudioContext ?? scopedWindow.webkitAudioContext;
  if (!ctor) {
    throw new Error("AudioContext is not supported in this browser.");
  }

  return ctor;
}

async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextCtor = getAudioContextCtor();
  const context = new AudioContextCtor();

  try {
    return await context.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await context.close();
  }
}

function mixdownToMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);
  const channels = buffer.numberOfChannels;

  for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex);
    for (let i = 0; i < channel.length; i += 1) {
      mono[i] += channel[i] / channels;
    }
  }

  return mono;
}

function analyzeWindow(
  samples: Float32Array,
  start: number,
  end: number
): WindowStats {
  let squareSum = 0;
  let crossings = 0;
  let prev = samples[start] ?? 0;

  for (let i = start; i < end; i += 1) {
    const value = samples[i] ?? 0;
    squareSum += value * value;

    if ((prev >= 0 && value < 0) || (prev < 0 && value >= 0)) {
      crossings += 1;
    }

    prev = value;
  }

  const length = Math.max(1, end - start);

  return {
    rms: Math.sqrt(squareSum / length),
    zcr: crossings / length,
  };
}

function collectMetrics(buffer: AudioBuffer): AudioUploadMetrics {
  const mono = mixdownToMono(buffer);
  const windowSize = Math.max(
    512,
    Math.floor((buffer.sampleRate * WINDOW_MS) / 1000)
  );
  const stepSize = Math.max(
    256,
    Math.floor((buffer.sampleRate * STEP_MS) / 1000)
  );

  const windows: WindowStats[] = [];
  for (let start = 0; start + windowSize <= mono.length; start += stepSize) {
    windows.push(analyzeWindow(mono, start, start + windowSize));
  }

  if (windows.length === 0) {
    return {
      durationSeconds: buffer.duration,
      averageRms: 0,
      activeRatio: 0,
      pauseRatio: 1,
      speechWindowRatio: 0,
      noisyWindowRatio: 0,
      continuousSoundRatio: 0,
    };
  }

  const averageRms =
    windows.reduce((sum, window) => sum + window.rms, 0) / windows.length;
  const activeThreshold = Math.max(ACTIVE_RMS, averageRms * 0.8);

  let activeCount = 0;
  let pauseCount = 0;
  let speechCount = 0;
  let noisyCount = 0;
  let continuousCount = 0;

  for (let index = 0; index < windows.length; index += 1) {
    const current = windows[index]!;
    const previous = windows[index - 1];
    const delta = previous ? Math.abs(current.rms - previous.rms) : current.rms;
    const isActive = current.rms >= activeThreshold;
    const isPause =
      current.rms <= Math.max(ABSOLUTE_SILENCE_RMS, averageRms * 0.35);
    const looksSpeechLike =
      isActive &&
      current.zcr >= 0.015 &&
      current.zcr <= 0.18 &&
      delta >= 0.004;
    const looksNoisy = isActive && current.zcr > 0.18;
    const looksContinuous = isActive && delta < 0.0035;

    if (isActive) activeCount += 1;
    if (isPause) pauseCount += 1;
    if (looksSpeechLike) speechCount += 1;
    if (looksNoisy) noisyCount += 1;
    if (looksContinuous) continuousCount += 1;
  }

  return {
    durationSeconds: buffer.duration,
    averageRms,
    activeRatio: clampRatio(activeCount / windows.length),
    pauseRatio: clampRatio(pauseCount / windows.length),
    speechWindowRatio: clampRatio(speechCount / windows.length),
    noisyWindowRatio: clampRatio(noisyCount / windows.length),
    continuousSoundRatio: clampRatio(continuousCount / windows.length),
  };
}

export async function analyzeAudioUploadClient(
  file: File
): Promise<AudioUploadCheckResult> {
  if (!isSupportedAudioFile(file)) {
    return summarizeRejectedResult(file, "unsupported_type");
  }

  if (file.size <= 0) {
    return summarizeRejectedResult(file, "empty_file");
  }

  if (file.size > MAX_FILE_BYTES) {
    return summarizeRejectedResult(file, "file_too_large");
  }

  let buffer: AudioBuffer;

  try {
    buffer = await decodeAudioFile(file);
  } catch {
    return summarizeRejectedResult(file, "decode_failed");
  }

  const metrics = collectMetrics(buffer);

  if (metrics.durationSeconds < MIN_DURATION_SECONDS) {
    return summarizeRejectedResult(file, "too_short", metrics);
  }

  if (metrics.averageRms < ABSOLUTE_SILENCE_RMS || metrics.activeRatio < 0.08) {
    return summarizeRejectedResult(file, "silent", metrics);
  }

  if (
    metrics.speechWindowRatio < 0.12 &&
    metrics.continuousSoundRatio >= 0.72 &&
    metrics.pauseRatio < 0.08
  ) {
    return summarizeRejectedResult(file, "bgm_dominant", metrics);
  }

  if (
    metrics.speechWindowRatio < 0.18 &&
    metrics.noisyWindowRatio >= 0.22
  ) {
    return summarizeRejectedResult(file, "environment_dominant", metrics);
  }

  if (metrics.speechWindowRatio < 0.24) {
    return summarizeRejectedResult(file, "mostly_non_voice", metrics);
  }

  if (metrics.speechWindowRatio < 0.32 || metrics.pauseRatio < 0.03) {
    return {
      decision: "review_required",
      issueCode: null,
      message:
        "声は入っていそうだけど、声主体と断定するには弱い。今段階では危険側で保存停止に寄せる。",
      retryHints: [
        "BGM や効果音を抜いた声だけの音源で再確認する",
        "冒頭や末尾の無音を整理してから再書き出しする",
      ],
      metrics,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    };
  }

  return {
    decision: "passed",
    issueCode: null,
    message:
      "仮判定では声中心の音源として通せる。保存前の最小チェックを通過。",
    retryHints: [
      "将来は route 側でも再検査する前提",
      "BGM は声ファイルに混ぜず、サイト側設定で後付けする前提に保つ",
    ],
    metrics,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
  };
}