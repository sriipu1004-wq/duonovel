export type StoredWebSpeechSettings = {
  voiceURI: string;
  pitch: number;
  volume: number;
  rate: number;
  autoAdvance: boolean;
};

export type StoredWebSpeechDisplaySettings = {
  fontScale: number;
  lineHeight: "compact" | "normal" | "wide";
  hideEffects: boolean;
  showMarker: boolean;
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

const DEFAULT_DISPLAY_SETTINGS: StoredWebSpeechDisplaySettings = {
  fontScale: 1.06,
  lineHeight: "normal",
  hideEffects: false,
  showMarker: true,
};

const GLOBAL_NARRATION_STOPPED_KEY = "duonovel:web-speech-stopped";
const GLOBAL_SPEECH_SETTINGS_KEY = "duonovel:web-speech-settings";
const GLOBAL_DISPLAY_SETTINGS_KEY = "duonovel:web-speech-display";

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 1;
}

export function narrationStoppedStorageKey(seriesId: string): string {
  void seriesId;
  return GLOBAL_NARRATION_STOPPED_KEY;
}

export function readNarrationStopped(seriesId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const globalValue = window.localStorage.getItem(GLOBAL_NARRATION_STOPPED_KEY);
    if (globalValue !== null) return globalValue === "true";
    const legacyValue = window.localStorage.getItem(
      `duonovel:web-speech-stopped:${seriesId}`
    );
    if (legacyValue !== null) {
      window.localStorage.setItem(GLOBAL_NARRATION_STOPPED_KEY, legacyValue);
      return legacyValue === "true";
    }
    return false;
  } catch {
    return false;
  }
}

export function writeNarrationStopped(seriesId: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      GLOBAL_NARRATION_STOPPED_KEY,
      value ? "true" : "false"
    );
    window.dispatchEvent(
      new CustomEvent(NARRATION_STOPPED_CHANGED_EVENT, {
        detail: { value },
      })
    );
  } catch {
    // preference persistence is non-critical
  }
}

export function readWebSpeechSettings(seriesId: string): StoredWebSpeechSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw =
      window.localStorage.getItem(GLOBAL_SPEECH_SETTINGS_KEY) ??
      window.localStorage.getItem(`duonovel:web-speech-settings:${seriesId}`);
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

export function writeWebSpeechSettings(
  value: StoredWebSpeechSettings
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      GLOBAL_SPEECH_SETTINGS_KEY,
      JSON.stringify({
        voiceURI: value.voiceURI,
        pitch: clamp(Number(value.pitch), 0.8, 1.3),
        volume: clamp(Number(value.volume), 0, 1),
        rate: clamp(Number(value.rate), 0.7, 1.5),
        autoAdvance: value.autoAdvance !== false,
      })
    );
  } catch {
    // preference persistence is non-critical
  }
}

export function readWebSpeechDisplaySettings(
  seriesId: string
): StoredWebSpeechDisplaySettings {
  if (typeof window === "undefined") return DEFAULT_DISPLAY_SETTINGS;
  try {
    const raw =
      window.localStorage.getItem(GLOBAL_DISPLAY_SETTINGS_KEY) ??
      window.localStorage.getItem(`duonovel:web-speech-display:${seriesId}`);
    if (!raw) return DEFAULT_DISPLAY_SETTINGS;
    const value = JSON.parse(raw) as Partial<StoredWebSpeechDisplaySettings>;
    return {
      fontScale: clamp(Number(value.fontScale ?? 1.06), 0.9, 1.4),
      lineHeight:
        value.lineHeight === "compact" ||
        value.lineHeight === "wide" ||
        value.lineHeight === "normal"
          ? value.lineHeight
          : "normal",
      hideEffects: value.hideEffects === true,
      showMarker: value.showMarker !== false,
    };
  } catch {
    return DEFAULT_DISPLAY_SETTINGS;
  }
}

export function writeWebSpeechDisplaySettings(
  value: StoredWebSpeechDisplaySettings
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      GLOBAL_DISPLAY_SETTINGS_KEY,
      JSON.stringify(value)
    );
  } catch {
    // preference persistence is non-critical
  }
}
