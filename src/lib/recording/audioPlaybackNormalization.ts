import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAudioFileExtension } from "@/lib/recording/audioUploadPolicy";

const require = createRequire(import.meta.url);

export const PLAYBACK_AUDIO_EXTENSION = "m4a";
export const PLAYBACK_AUDIO_CONTENT_TYPE = "audio/mp4";

export type NormalizedPlaybackAudio = {
  bytes: Uint8Array;
  extension: typeof PLAYBACK_AUDIO_EXTENSION;
  contentType: typeof PLAYBACK_AUDIO_CONTENT_TYPE;
};

function guessSourceExtension(fileName: string, mimeType: string): string {
  const byName = getAudioFileExtension(fileName);
  if (byName) {
    return byName;
  }

  const lowerMimeType = mimeType.trim().toLowerCase();

  if (lowerMimeType.includes("mpeg") || lowerMimeType.includes("mp3")) {
    return "mp3";
  }

  if (
    lowerMimeType.includes("mp4") ||
    lowerMimeType.includes("m4a") ||
    lowerMimeType.includes("x-m4a")
  ) {
    return "m4a";
  }

  if (lowerMimeType.includes("wav")) {
    return "wav";
  }

  if (lowerMimeType.includes("webm")) {
    return "webm";
  }

  if (lowerMimeType.includes("ogg")) {
    return "ogg";
  }

  if (lowerMimeType.includes("aac")) {
    return "aac";
  }

  if (lowerMimeType.includes("flac")) {
    return "flac";
  }

  return "bin";
}

function resolveFfmpegCommand(): string {
  const explicitPath = process.env.FFMPEG_PATH?.trim();
  if (explicitPath) {
    return explicitPath;
  }

  try {
    const resolved = require("ffmpeg-static") as string | null;

    if (typeof resolved === "string" && resolved.trim().length > 0) {
      return resolved;
    }
  } catch {
  }

  throw new Error("ffmpeg_unavailable");
}

async function runFfmpeg(args: string[]): Promise<void> {
  const command = resolveFfmpegCommand();

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `playback_transcode_failed:${error.message || "ffmpeg spawn error"}`
        )
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const detail =
        stderr.trim() || `ffmpeg exited with code ${String(code ?? "unknown")}`;

      reject(new Error(`playback_transcode_failed:${detail}`));
    });
  });
}

export async function normalizeAudioForPlayback({
  sourceBytes,
  sourceFileName,
  sourceMimeType,
}: {
  sourceBytes: Uint8Array;
  sourceFileName: string;
  sourceMimeType: string;
}): Promise<NormalizedPlaybackAudio> {
  const tempDir = await mkdtemp(join(tmpdir(), "libread-playback-"));
  const sourceExtension = guessSourceExtension(sourceFileName, sourceMimeType);
  const inputPath = join(tempDir, `input.${sourceExtension}`);
  const outputPath = join(tempDir, `playback.${PLAYBACK_AUDIO_EXTENSION}`);

  try {
    await writeFile(inputPath, sourceBytes);

    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-vn",
      "-map_metadata",
      "-1",
      "-ac",
      "1",
      "-ar",
      "44100",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    const outputBytes = new Uint8Array(await readFile(outputPath));

    if (outputBytes.byteLength <= 0) {
      throw new Error("playback_transcode_failed:normalized output is empty");
    }

    return {
      bytes: outputBytes,
      extension: PLAYBACK_AUDIO_EXTENSION,
      contentType: PLAYBACK_AUDIO_CONTENT_TYPE,
    };
  } finally {
    await rm(tempDir, {
      recursive: true,
      force: true,
    }).catch(() => undefined);
  }
}