type ParsedWav = {
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  pcmData: Uint8Array;
};

type WavSegment = {
  wavBytes: Uint8Array;
  pauseAfterMs: number;
};

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  let result = "";

  for (let index = 0; index < length; index += 1) {
    result += String.fromCharCode(bytes[start + index]);
  }

  return result;
}

function parseWav(wavBytes: Uint8Array): ParsedWav {
  if (wavBytes.byteLength < 44) {
    throw new Error("nemo_wav_parse_failed:too_small");
  }

  const view = new DataView(
    wavBytes.buffer,
    wavBytes.byteOffset,
    wavBytes.byteLength
  );

  if (
    readAscii(wavBytes, 0, 4) !== "RIFF" ||
    readAscii(wavBytes, 8, 4) !== "WAVE"
  ) {
    throw new Error("nemo_wav_parse_failed:invalid_header");
  }

  let offset = 12;
  let audioFormat = 0;
  let numChannels = 0;
  let sampleRate = 0;
  let byteRate = 0;
  let blockAlign = 0;
  let bitsPerSample = 0;
  let pcmData: Uint8Array | null = null;

  while (offset + 8 <= wavBytes.byteLength) {
    const chunkId = readAscii(wavBytes, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;

    if (chunkEnd > wavBytes.byteLength) {
      break;
    }

    if (chunkId === "fmt ") {
      audioFormat = view.getUint16(chunkStart, true);
      numChannels = view.getUint16(chunkStart + 2, true);
      sampleRate = view.getUint32(chunkStart + 4, true);
      byteRate = view.getUint32(chunkStart + 8, true);
      blockAlign = view.getUint16(chunkStart + 12, true);
      bitsPerSample = view.getUint16(chunkStart + 14, true);
    }

    if (chunkId === "data") {
      pcmData = wavBytes.slice(chunkStart, chunkEnd);
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (
    !pcmData ||
    !audioFormat ||
    !numChannels ||
    !sampleRate ||
    !byteRate ||
    !blockAlign ||
    !bitsPerSample
  ) {
    throw new Error("nemo_wav_parse_failed:missing_chunks");
  }

  if (audioFormat !== 1) {
    throw new Error("nemo_wav_parse_failed:unsupported_format");
  }

  return {
    audioFormat,
    numChannels,
    sampleRate,
    byteRate,
    blockAlign,
    bitsPerSample,
    pcmData,
  };
}

function createSilencePcm(durationMs: number, format: ParsedWav): Uint8Array {
  if (durationMs <= 0) {
    return new Uint8Array();
  }

  const frameCount = Math.max(
    1,
    Math.round((format.sampleRate * durationMs) / 1000)
  );

  return new Uint8Array(frameCount * format.blockAlign);
}

function buildWav(format: ParsedWav, pcmData: Uint8Array): Uint8Array {
  const wavBytes = new Uint8Array(44 + pcmData.byteLength);
  const view = new DataView(wavBytes.buffer);

  wavBytes.set([82, 73, 70, 70], 0);
  view.setUint32(4, 36 + pcmData.byteLength, true);
  wavBytes.set([87, 65, 86, 69], 8);
  wavBytes.set([102, 109, 116, 32], 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, format.audioFormat, true);
  view.setUint16(22, format.numChannels, true);
  view.setUint32(24, format.sampleRate, true);
  view.setUint32(28, format.byteRate, true);
  view.setUint16(32, format.blockAlign, true);
  view.setUint16(34, format.bitsPerSample, true);
  wavBytes.set([100, 97, 116, 97], 36);
  view.setUint32(40, pcmData.byteLength, true);
  wavBytes.set(pcmData, 44);

  return wavBytes;
}

export function getNemoWavDurationSeconds(wavBytes: Uint8Array): number {
  const parsed = parseWav(wavBytes);
  return parsed.pcmData.byteLength / parsed.byteRate;
}

export function concatNemoWavs(segments: WavSegment[]): Uint8Array {
  if (segments.length === 0) {
    throw new Error("nemo_wav_concat_failed:empty");
  }

  const parsedSegments = segments.map((segment) => ({
    format: parseWav(segment.wavBytes),
    pauseAfterMs: segment.pauseAfterMs,
  }));

  const base = parsedSegments[0].format;

  for (const segment of parsedSegments.slice(1)) {
    const next = segment.format;

    if (
      next.audioFormat !== base.audioFormat ||
      next.numChannels !== base.numChannels ||
      next.sampleRate !== base.sampleRate ||
      next.byteRate !== base.byteRate ||
      next.blockAlign !== base.blockAlign ||
      next.bitsPerSample !== base.bitsPerSample
    ) {
      throw new Error("nemo_wav_format_mismatch");
    }
  }

  const pcmParts: Uint8Array[] = [];

  for (const segment of parsedSegments) {
    pcmParts.push(segment.format.pcmData);

    if (segment.pauseAfterMs > 0) {
      pcmParts.push(createSilencePcm(segment.pauseAfterMs, base));
    }
  }

  const totalLength = pcmParts.reduce(
    (sum, part) => sum + part.byteLength,
    0
  );

  const mergedPcm = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of pcmParts) {
    mergedPcm.set(part, offset);
    offset += part.byteLength;
  }

  return buildWav(base, mergedPcm);
}