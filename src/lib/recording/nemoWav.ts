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

function readSampleAsFloat(
  view: DataView,
  byteOffset: number,
  bitsPerSample: number
): number {
  if (bitsPerSample === 8) {
    return (view.getUint8(byteOffset) - 128) / 128;
  }

  if (bitsPerSample === 16) {
    return view.getInt16(byteOffset, true) / 32768;
  }

  throw new Error("nemo_wav_downsample_failed:unsupported_bit_depth");
}

function writeSampleFromFloat(
  view: DataView,
  byteOffset: number,
  bitsPerSample: number,
  sample: number
): void {
  const clamped = Math.max(-1, Math.min(1, sample));

  if (bitsPerSample === 8) {
    const encoded = Math.max(0, Math.min(255, Math.round(clamped * 127 + 128)));
    view.setUint8(byteOffset, encoded);
    return;
  }

  if (bitsPerSample === 16) {
    const encoded = Math.max(
      -32768,
      Math.min(32767, Math.round(clamped * 32767))
    );
    view.setInt16(byteOffset, encoded, true);
    return;
  }

  throw new Error("nemo_wav_downsample_failed:unsupported_bit_depth");
}

function downsamplePcmData(
  pcmData: Uint8Array,
  fromSampleRate: number,
  toSampleRate: number,
  numChannels: number,
  bitsPerSample: number
): Uint8Array {
  if (toSampleRate >= fromSampleRate) {
    return pcmData;
  }

  if (numChannels <= 0) {
    throw new Error("nemo_wav_downsample_failed:invalid_channel_count");
  }

  const bytesPerSample = bitsPerSample / 8;
  const frameSize = numChannels * bytesPerSample;

  if (!Number.isInteger(bytesPerSample) || frameSize <= 0) {
    throw new Error("nemo_wav_downsample_failed:invalid_frame_size");
  }

  const inputFrameCount = Math.floor(pcmData.byteLength / frameSize);

  if (inputFrameCount <= 1) {
    return pcmData;
  }

  const outputFrameCount = Math.max(
    1,
    Math.floor((inputFrameCount * toSampleRate) / fromSampleRate)
  );

  const inputView = new DataView(
    pcmData.buffer,
    pcmData.byteOffset,
    pcmData.byteLength
  );

  const output = new Uint8Array(outputFrameCount * frameSize);
  const outputView = new DataView(output.buffer);

  for (let outputFrameIndex = 0; outputFrameIndex < outputFrameCount; outputFrameIndex += 1) {
    const sourceFrameIndex = Math.min(
      inputFrameCount - 1,
      Math.floor((outputFrameIndex * fromSampleRate) / toSampleRate)
    );

    for (let channelIndex = 0; channelIndex < numChannels; channelIndex += 1) {
      const inputOffset =
        sourceFrameIndex * frameSize + channelIndex * bytesPerSample;
      const outputOffset =
        outputFrameIndex * frameSize + channelIndex * bytesPerSample;

      const sample = readSampleAsFloat(
        inputView,
        inputOffset,
        bitsPerSample
      );

      writeSampleFromFloat(
        outputView,
        outputOffset,
        bitsPerSample,
        sample
      );
    }
  }

  return output;
}

export function downsampleNemoWav(
  wavBytes: Uint8Array,
  targetSampleRate: number
): Uint8Array {
  const parsed = parseWav(wavBytes);

  if (
    !Number.isFinite(targetSampleRate) ||
    targetSampleRate <= 0 ||
    targetSampleRate >= parsed.sampleRate
  ) {
    return wavBytes;
  }

  const pcmData = downsamplePcmData(
    parsed.pcmData,
    parsed.sampleRate,
    targetSampleRate,
    parsed.numChannels,
    parsed.bitsPerSample
  );

  const nextByteRate =
    targetSampleRate * parsed.numChannels * (parsed.bitsPerSample / 8);

  return buildWav(
    {
      ...parsed,
      sampleRate: targetSampleRate,
      byteRate: nextByteRate,
      blockAlign: parsed.numChannels * (parsed.bitsPerSample / 8),
      pcmData,
    },
    pcmData
  );
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