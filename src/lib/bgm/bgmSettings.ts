export type BgmSceneCue = {
  id: string;
  label: string;
  triggerText: string;
  nextBgmTitle: string | null;
  nextBgmAudioPath: string | null;
  transitionMode: "cut" | "crossfade";
  fadeOutSeconds: number | null;
  fadeInSeconds: number | null;
};

export type BgmSettings = {
  version: 1;
  fadeInSeconds: number | null;
  fadeOutSeconds: number | null;
  sceneCues: BgmSceneCue[];
};

const MAX_BGM_FADE_SECONDS = 20;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function clampBgmSeconds(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  return Math.min(MAX_BGM_FADE_SECONDS, roundToOneDecimal(parsed));
}

export function emptyBgmSettings(): BgmSettings {
  return {
    version: 1,
    fadeInSeconds: null,
    fadeOutSeconds: null,
    sceneCues: [],
  };
}

function normalizeSceneCue(value: unknown, index: number): BgmSceneCue | null {
  if (!isPlainObject(value)) return null;

  return {
    id:
      typeof value.id === "string" && value.id.trim().length > 0
        ? value.id
        : `scene-${index + 1}`,
    label: typeof value.label === "string" ? value.label : "",
    triggerText: typeof value.triggerText === "string" ? value.triggerText : "",
    nextBgmTitle:
      typeof value.nextBgmTitle === "string" && value.nextBgmTitle.trim().length > 0
        ? value.nextBgmTitle
        : null,
    nextBgmAudioPath:
      typeof value.nextBgmAudioPath === "string" &&
      value.nextBgmAudioPath.trim().length > 0
        ? value.nextBgmAudioPath
        : null,
    transitionMode: value.transitionMode === "crossfade" ? "crossfade" : "cut",
    fadeOutSeconds: clampBgmSeconds(value.fadeOutSeconds),
    fadeInSeconds: clampBgmSeconds(value.fadeInSeconds),
  };
}

export function normalizeBgmSettings(value: unknown): BgmSettings {
  if (!isPlainObject(value)) return emptyBgmSettings();

  const rawSceneCues = Array.isArray(value.sceneCues) ? value.sceneCues : [];

  return {
    version: 1,
    fadeInSeconds: clampBgmSeconds(value.fadeInSeconds),
    fadeOutSeconds: clampBgmSeconds(value.fadeOutSeconds),
    sceneCues: rawSceneCues
      .map((item, index) => normalizeSceneCue(item, index))
      .filter((item): item is BgmSceneCue => item !== null),
  };
}

export function parseBgmSettingsFromRow(...values: unknown[]): BgmSettings {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;

    if (typeof value === "string") {
      try {
        return normalizeBgmSettings(JSON.parse(value));
      } catch {
        continue;
      }
    }

    return normalizeBgmSettings(value);
  }

  return emptyBgmSettings();
}

export function mergeBgmSettings(
  base: BgmSettings,
  override: BgmSettings
): BgmSettings {
  return {
    version: 1,
    fadeInSeconds: override.fadeInSeconds ?? base.fadeInSeconds,
    fadeOutSeconds: override.fadeOutSeconds ?? base.fadeOutSeconds,
    sceneCues: override.sceneCues.length > 0 ? override.sceneCues : base.sceneCues,
  };
}

export function serializeBgmSettingsForSave(value: unknown): BgmSettings | null {
  const normalized = normalizeBgmSettings(value);

  if (
    normalized.fadeInSeconds === null &&
    normalized.fadeOutSeconds === null &&
    normalized.sceneCues.length === 0
  ) {
    return null;
  }

  return normalized;
}

export function formatBgmSeconds(value: number | null | undefined): string {
  const normalized = clampBgmSeconds(value);
  return normalized === null ? "0秒" : `${normalized.toFixed(1)}秒`;
}