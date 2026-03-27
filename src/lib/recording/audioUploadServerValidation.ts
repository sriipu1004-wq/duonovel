import {
  AUDIO_UPLOAD_MAX_FILE_BYTES,
  buildPassedAudioUploadResult,
  buildRejectedAudioUploadResult,
  getAudioFileExtension,
  isSupportedAudioFile,
  type AudioUploadCheckResult,
} from "@/lib/recording/audioUploadPolicy";

type AudioContainer =
  | "wav"
  | "mp3"
  | "ogg"
  | "flac"
  | "mp4"
  | "webm"
  | "aac"
  | "unknown";

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  return Array.from(bytes.slice(start, start + length))
    .map((value) => String.fromCharCode(value))
    .join("");
}

function detectAudioContainer(bytes: Uint8Array): AudioContainer {
  if (bytes.length >= 12) {
    if (readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 4) === "WAVE") {
      return "wav";
    }

    if (readAscii(bytes, 0, 4) === "OggS") {
      return "ogg";
    }

    if (readAscii(bytes, 0, 4) === "fLaC") {
      return "flac";
    }

    if (readAscii(bytes, 4, 4) === "ftyp") {
      return "mp4";
    }
  }

  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "webm";
  }

  if (bytes.length >= 3 && readAscii(bytes, 0, 3) === "ID3") {
    return "mp3";
  }

  if (bytes.length >= 2) {
    const first = bytes[0] ?? 0;
    const second = bytes[1] ?? 0;

    if (first === 0xff && (second & 0xf0) === 0xf0) {
      if ((second & 0x06) === 0x00) {
        return "aac";
      }

      return "mp3";
    }
  }

  return "unknown";
}

function getAcceptedContainersFromExtension(fileName: string): AudioContainer[] {
  const extension = getAudioFileExtension(fileName);

  switch (extension) {
    case "wav":
      return ["wav"];
    case "mp3":
      return ["mp3"];
    case "ogg":
      return ["ogg"];
    case "flac":
      return ["flac"];
    case "m4a":
      return ["mp4"];
    case "webm":
      return ["webm"];
    case "aac":
      return ["aac"];
    default:
      return [];
  }
}

function getAcceptedContainersFromMimeType(mimeType: string): AudioContainer[] {
  const lower = mimeType.trim().toLowerCase();

  switch (lower) {
    case "audio/wav":
    case "audio/x-wav":
    case "audio/wave":
      return ["wav"];
    case "audio/mpeg":
    case "audio/mp3":
      return ["mp3"];
    case "audio/ogg":
    case "application/ogg":
      return ["ogg"];
    case "audio/flac":
    case "audio/x-flac":
      return ["flac"];
    case "audio/webm":
      return ["webm"];
    case "audio/mp4":
    case "audio/x-m4a":
    case "audio/m4a":
      return ["mp4"];
    case "audio/aac":
    case "audio/aacp":
      return ["aac"];
    default:
      return [];
  }
}

function hasConsistentDeclaration(file: File, container: AudioContainer): boolean {
  const acceptedByExtension = getAcceptedContainersFromExtension(file.name);
  if (
    acceptedByExtension.length > 0 &&
    !acceptedByExtension.includes(container)
  ) {
    return false;
  }

  const acceptedByMimeType = getAcceptedContainersFromMimeType(file.type);
  if (
    acceptedByMimeType.length > 0 &&
    !acceptedByMimeType.includes(container)
  ) {
    return false;
  }

  return true;
}

async function sniffAudioContainer(file: File): Promise<AudioContainer> {
  const headerBytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  return detectAudioContainer(headerBytes);
}

export async function analyzeAudioUploadServer(
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

  let container: AudioContainer;

  try {
    container = await sniffAudioContainer(file);
  } catch {
    return buildRejectedAudioUploadResult(file, "decode_failed");
  }

  if (container === "unknown") {
    return buildRejectedAudioUploadResult(file, "decode_failed");
  }

  if (!hasConsistentDeclaration(file, container)) {
    return buildRejectedAudioUploadResult(file, "unsupported_type");
  }

  return buildPassedAudioUploadResult(
    file,
    "server 側の保存前チェックを通過。保存本体に接続する時も、この helper を最終入口として再利用する。",
    [
      "保存本体では upload 前に必ずこの server helper を再実行する",
      "client 側仮判定は UX 用で、最終判断は server 側で持つ",
    ],
    null
  );
}