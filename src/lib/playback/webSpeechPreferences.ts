export type StoredWebSpeechSettings = {
  voiceURI: string;
  pitch: number;
  volume: number;
  rate: number;
  autoAdvance: boolean;
};

export const NARRATION_STOPPED_CHANGED_EVENT =
  "duonovel:narration-stopped-changed";

const DEFAULT_SETTINGS: StoredWebSpeechSettings = {
  voiceURI: "",
  pitch: 1,
  volume: 1,
  rate: 1,
  autoAdvance: true,
};

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 1;
}

export function narrationStoppedStorageKey(seriesId: string): string {
  return `duonovel:web-speech-stopped:${seriesId}`;
}

export function readNarrationStopped(seriesId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(narrationStoppedStorageKey(seriesId)) === "true";
  } catch {
    return false;
  }
}

export function writeNarrationStopped(seriesId: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      narrationStoppedStorageKey(seriesId),
      value ? "true" : "false"
    );
    window.dispatchEvent(
      new CustomEvent(NARRATION_STOPPED_CHANGED_EVENT, {
        detail: { seriesId, value },
      })
    );
  } catch {
    // preference persistence is non-critical
  }
}

export function readWebSpeechSettings(seriesId: string): StoredWebSpeechSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(`duonovel:web-speech-settings:${seriesId}`);
    if (!raw) return DEFAULT_SETTINGS;
    const value = JSON.parse(raw) as Partial<StoredWebSpeechSettings>;
    return {
      voiceURI: typeof value.voiceURI === "string" ? value.voiceURI : "",
      pitch: clamp(Number(value.pitch ?? 1), 0.8, 1.3),
      volume: clamp(Number(value.volume ?? 1), 0, 1),
      rate: clamp(Number(value.rate ?? 1), 0.7, 1.5),
      autoAdvance: value.autoAdvance !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
