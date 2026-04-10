const OPENAI_TRANSCRIPTION_ENDPOINT =
  "https://api.openai.com/v1/audio/transcriptions";

const MAX_TRANSCRIPTION_FILE_BYTES = 25 * 1024 * 1024;

export type HumanRecordingTranscriptionSegment = {
  id: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  text: string;
};

export type HumanRecordingTranscriptionWord = {
  word: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
};

export type HumanRecordingTranscriptionResult = {
  text: string;
  language: string;
  durationSeconds: number;
  segments: HumanRecordingTranscriptionSegment[];
  words: HumanRecordingTranscriptionWord[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copyUint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copied = new Uint8Array(bytes.byteLength);
  copied.set(bytes);
  return copied.buffer;
}

function pickText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pickNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function resolveTranscriptionErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as unknown;

    if (isPlainObject(payload) && isPlainObject(payload.error)) {
      const message = pickText(payload.error.message);
      if (message) {
        return message;
      }
    }

    if (isPlainObject(payload)) {
      const message = pickText(payload.message);
      if (message) {
        return message;
      }
    }
  } catch {
  }

  try {
    const text = (await response.text()).trim();
    if (text) {
      return text;
    }
  } catch {
  }

  return `status ${response.status}`;
}

export async function transcribeHumanPlaybackAudio({
  audioBytes,
  fileName,
  mimeType,
}: {
  audioBytes: Uint8Array;
  fileName: string;
  mimeType: string;
}): Promise<HumanRecordingTranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("openai_api_key_missing");
  }

  if (audioBytes.byteLength <= 0) {
    throw new Error("human_transcription_empty");
  }

  if (audioBytes.byteLength > MAX_TRANSCRIPTION_FILE_BYTES) {
    throw new Error("transcription_input_too_large");
  }

  const formData = new FormData();
  const audioFile = new File(
    [copyUint8ArrayToArrayBuffer(audioBytes)],
    fileName,
    {
      type: mimeType,
    }
  );

  formData.append("file", audioFile);
  formData.append("model", "whisper-1");
  formData.append("language", "ja");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "segment");
  formData.append("timestamp_granularities[]", "word");

  const response = await fetch(OPENAI_TRANSCRIPTION_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const detail = await resolveTranscriptionErrorMessage(response);

    throw new Error(
      `transcription_request_failed:${response.status}:${detail}`
    );
  }

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!isPlainObject(payload)) {
    throw new Error("human_transcription_empty");
  }

  const text = pickText(payload.text);
  const language = pickText(payload.language) || "ja";
  const durationSeconds = pickNumber(payload.duration) ?? 0;

  const segments = Array.isArray(payload.segments)
    ? payload.segments
        .map((item, index) => {
          if (!isPlainObject(item)) {
            return null;
          }

          const start = pickNumber(item.start);
          const end = pickNumber(item.end);
          const segmentText = pickText(item.text);

          if (
            start === null ||
            end === null ||
            end < start ||
            segmentText.length === 0
          ) {
            return null;
          }

          return {
            id: Number.isInteger(pickNumber(item.id)) ? Number(item.id) : index,
            startTimeSeconds: start,
            endTimeSeconds: end,
            text: segmentText,
          } satisfies HumanRecordingTranscriptionSegment;
        })
        .filter(
          (item): item is HumanRecordingTranscriptionSegment => item !== null
        )
    : [];

  const words = Array.isArray(payload.words)
    ? payload.words
        .map((item) => {
          if (!isPlainObject(item)) {
            return null;
          }

          const start = pickNumber(item.start);
          const end = pickNumber(item.end);
          const word = pickText(item.word);

          if (start === null || end === null || end < start || word.length === 0) {
            return null;
          }

          return {
            word,
            startTimeSeconds: start,
            endTimeSeconds: end,
          } satisfies HumanRecordingTranscriptionWord;
        })
        .filter(
          (item): item is HumanRecordingTranscriptionWord => item !== null
        )
    : [];

  if (segments.length === 0) {
    if (!text) {
      throw new Error("human_transcription_empty");
    }

    return {
      text,
      language,
      durationSeconds,
      segments: [
        {
          id: 0,
          startTimeSeconds: 0,
          endTimeSeconds: Math.max(durationSeconds, 0),
          text,
        },
      ],
      words,
    };
  }

  return {
    text,
    language,
    durationSeconds,
    segments,
    words,
  };
}