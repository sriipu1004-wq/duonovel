type NemoAudioQuery = Record<string, unknown> & {
  speedScale?: number;
  pitchScale?: number;
  intonationScale?: number;
  volumeScale?: number;
  prePhonemeLength?: number;
  postPhonemeLength?: number;
};

type SynthesizeNemoWavInput = {
  text: string;
  speaker: number;
  speedScale?: number;
  pitchScale?: number;
  intonationScale?: number;
  volumeScale?: number;
  prePhonemeLength?: number;
  postPhonemeLength?: number;
};

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function clampNumber(
  value: number | undefined,
  min: number,
  max: number
): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }

  return Math.min(max, Math.max(min, value));
}

export function getNemoEngineBaseUrl(): string {
  const raw =
    process.env.VOICEVOX_NEMO_ENGINE_URL?.trim() || "http://127.0.0.1:50121";

  return trimTrailingSlash(raw);
}

export async function synthesizeNemoWav({
  text,
  speaker,
  speedScale,
  pitchScale,
  intonationScale,
  volumeScale,
  prePhonemeLength,
  postPhonemeLength,
}: SynthesizeNemoWavInput): Promise<Uint8Array> {
  const normalizedText = text.trim();

  if (!normalizedText) {
    throw new Error("nemo_text_empty");
  }

  if (!Number.isInteger(speaker) || speaker < 0) {
    throw new Error("nemo_speaker_invalid");
  }

  const baseUrl = getNemoEngineBaseUrl();

  const audioQueryUrl = new URL("/audio_query", baseUrl);
  audioQueryUrl.searchParams.set("speaker", String(speaker));
  audioQueryUrl.searchParams.set("text", normalizedText);

  const audioQueryResponse = await fetch(audioQueryUrl.toString(), {
    method: "POST",
  });

  if (!audioQueryResponse.ok) {
    const message = await audioQueryResponse.text().catch(() => "");
    throw new Error(
      `nemo_audio_query_failed:${audioQueryResponse.status}:${message}`
    );
  }

  const audioQuery = (await audioQueryResponse.json()) as NemoAudioQuery;

  const nextSpeedScale = clampNumber(speedScale, 0.5, 2);
  const nextPitchScale = clampNumber(pitchScale, -0.15, 0.15);
  const nextIntonationScale = clampNumber(intonationScale, 0, 2);
  const nextVolumeScale = clampNumber(volumeScale, 0, 2);
  const nextPrePhonemeLength = clampNumber(prePhonemeLength, 0, 1.5);
  const nextPostPhonemeLength = clampNumber(postPhonemeLength, 0, 1.5);

  if (nextSpeedScale !== undefined) audioQuery.speedScale = nextSpeedScale;
  if (nextPitchScale !== undefined) audioQuery.pitchScale = nextPitchScale;
  if (nextIntonationScale !== undefined) {
    audioQuery.intonationScale = nextIntonationScale;
  }
  if (nextVolumeScale !== undefined) audioQuery.volumeScale = nextVolumeScale;
  if (nextPrePhonemeLength !== undefined) {
    audioQuery.prePhonemeLength = nextPrePhonemeLength;
  }
  if (nextPostPhonemeLength !== undefined) {
    audioQuery.postPhonemeLength = nextPostPhonemeLength;
  }

  const synthesisUrl = new URL("/synthesis", baseUrl);
  synthesisUrl.searchParams.set("speaker", String(speaker));

  const synthesisResponse = await fetch(synthesisUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(audioQuery),
  });

  if (!synthesisResponse.ok) {
    const message = await synthesisResponse.text().catch(() => "");
    throw new Error(
      `nemo_synthesis_failed:${synthesisResponse.status}:${message}`
    );
  }

  const wavBytes = new Uint8Array(await synthesisResponse.arrayBuffer());

  if (wavBytes.byteLength === 0) {
    throw new Error("nemo_audio_empty");
  }

  return wavBytes;
}