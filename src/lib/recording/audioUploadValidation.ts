import {
  AUDIO_UPLOAD_MAX_FILE_BYTES,
  AUDIO_UPLOAD_MIN_DURATION_SECONDS,
  buildPassedAudioUploadResult,
  buildRejectedAudioUploadResult,
  buildReviewRequiredAudioUploadResult,
  isSupportedAudioFile,
  type AudioUploadCheckResult,
  type AudioUploadMetrics,
} from "@/lib/recording/audioUploadPolicy";

export {
  AUDIO_UPLOAD_ALLOWED_EXTENSIONS,
  AUDIO_UPLOAD_MAX_FILE_BYTES,
  AUDIO_UPLOAD_MIN_DURATION_SECONDS,
  canProceedWithAudioUpload,
  getAudioUploadIssueMessage,
  getAudioUploadRetryHints,
  isSupportedAudioFile,
  type AudioUploadCheckResult,
  type AudioUploadDecision,
  type AudioUploadFileLike,
  type AudioUploadIssueCode,
  type AudioUploadMetrics,
} from "@/lib/recording/audioUploadPolicy";

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
    windows.reduce((sum, item) => sum + item.rms, 0) / windows.length;
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
    return buildRejectedAudioUploadResult(file, "unsupported_type");
  }

  if (file.size <= 0) {
    return buildRejectedAudioUploadResult(file, "empty_file");
  }

  if (file.size > AUDIO_UPLOAD_MAX_FILE_BYTES) {
    return buildRejectedAudioUploadResult(file, "file_too_large");
  }

  let buffer: AudioBuffer;

  try {
    buffer = await decodeAudioFile(file);
  } catch {
    return buildRejectedAudioUploadResult(file, "decode_failed");
  }

  const metrics = collectMetrics(buffer);

  if (metrics.durationSeconds < AUDIO_UPLOAD_MIN_DURATION_SECONDS) {
    return buildRejectedAudioUploadResult(file, "too_short", metrics);
  }

  if (metrics.averageRms < ABSOLUTE_SILENCE_RMS || metrics.activeRatio < 0.08) {
    return buildRejectedAudioUploadResult(file, "silent", metrics);
  }

  if (
    metrics.speechWindowRatio < 0.12 &&
    metrics.continuousSoundRatio >= 0.72 &&
    metrics.pauseRatio < 0.08
  ) {
    return buildRejectedAudioUploadResult(file, "bgm_dominant", metrics);
  }

  if (
    metrics.speechWindowRatio < 0.18 &&
    metrics.noisyWindowRatio >= 0.22
  ) {
    return buildRejectedAudioUploadResult(file, "environment_dominant", metrics);
  }

  if (metrics.speechWindowRatio < 0.24) {
    return buildRejectedAudioUploadResult(file, "mostly_non_voice", metrics);
  }

  if (metrics.speechWindowRatio < 0.32 || metrics.pauseRatio < 0.03) {
    return buildReviewRequiredAudioUploadResult(
      file,
      "声は入っていそうだけど、声主体と断定するには弱い。今段階では危険側で保存停止に寄せる。",
      [
        "BGM や効果音を抜いた声だけの音源で再確認する",
        "冒頭や末尾の無音を整理してから再書き出しする",
      ],
      metrics
    );
  }

  return buildPassedAudioUploadResult(
    file,
    "仮判定では声中心の音源として通せる。保存前の最小チェックを通過。",
    [
      "将来の保存本体でも server 側で同系統の再検査を行う",
      "BGM は声ファイルに混ぜず、サイト側設定で後付けする前提に保つ",
    ],
    metrics
  );
}