export const AUDIO_UPLOAD_ALLOWED_EXTENSIONS = [
  "mp3",
  "m4a",
  "wav",
  "webm",
  "ogg",
  "aac",
  "flac",
] as const;

export const AUDIO_UPLOAD_MIN_DURATION_SECONDS = 8;
export const AUDIO_UPLOAD_MAX_FILE_BYTES = 1024 * 1024 * 1024;

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

export type AudioUploadFileLike = {
  name: string;
  size: number;
  type: string;
};

export function getAudioFileExtension(fileName: string): string {
  const lower = fileName.trim().toLowerCase();
  const dotIndex = lower.lastIndexOf(".");

  if (dotIndex < 0) return "";
  return lower.slice(dotIndex + 1);
}

function hasAllowedExtension(fileName: string): boolean {
  const extension = getAudioFileExtension(fileName);
  return AUDIO_UPLOAD_ALLOWED_EXTENSIONS.some((item) => item === extension);
}

export function isSupportedAudioFile(file: AudioUploadFileLike): boolean {
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
      return "ファイルが大きすぎる。今の内部上限を超えている。";
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
        "今の内部上限を超えているので、より短い音源にする",
        "通常の長尺音源なら、そのまま送っても内部で分割アップロードへ切り替わる",
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

export function buildRejectedAudioUploadResult(
  file: AudioUploadFileLike,
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

export function buildReviewRequiredAudioUploadResult(
  file: AudioUploadFileLike,
  message: string,
  retryHints: string[],
  metrics: AudioUploadMetrics | null = null
): AudioUploadCheckResult {
  return {
    decision: "review_required",
    issueCode: null,
    message,
    retryHints,
    metrics,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
  };
}

export function buildPassedAudioUploadResult(
  file: AudioUploadFileLike,
  message: string,
  retryHints: string[],
  metrics: AudioUploadMetrics | null = null
): AudioUploadCheckResult {
  return {
    decision: "passed",
    issueCode: null,
    message,
    retryHints,
    metrics,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
  };
}