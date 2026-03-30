export const EFFECT_BACKGROUND_PRESETS = [
  "paper",
  "glass",
  "plastic",
  "stone",
  "wood",
] as const;

export const EFFECT_INLINE_MARK_KINDS = [
  "ruby",
  "bold",
  "italic",
  "color",
  "dot_emphasis",
  "line_emphasis",
  "shake",
  "typing",
  "fade_out",
] as const;

export const EFFECT_ILLUSTRATION_PLACEMENTS = [
  "top",
  "inline",
  "scene_break",
] as const;

export const EFFECT_TEXT_ANIMATIONS = [
  "typing",
  "shake",
  "fade_out",
] as const;

export type EffectBackgroundPreset =
  | (typeof EFFECT_BACKGROUND_PRESETS)[number]
  | null;

export type EffectInlineMarkKind =
  (typeof EFFECT_INLINE_MARK_KINDS)[number];

export type EffectIllustrationPlacement =
  (typeof EFFECT_ILLUSTRATION_PLACEMENTS)[number];

export type EffectTextAnimationKind =
  | (typeof EFFECT_TEXT_ANIMATIONS)[number]
  | null;

export type EffectTypographySettings = {
  fontFamily: string | null;
  textColor: string | null;
  bold: boolean;
  italic: boolean;
};

export type EffectInlineMark = {
  id: string;
  targetText: string;
  kind: EffectInlineMarkKind;
  value: string | null;
  note: string;
};

export type EffectIllustration = {
  id: string;
  imageUrl: string;
  caption: string;
  placement: EffectIllustrationPlacement;
};

export type EffectSceneCue = {
  id: string;
  label: string;
  triggerText: string;
  nextBgmTrackId: string | null;
  nextBgmTitle: string | null;
  nextBgmAudioPath: string | null;
  backgroundPreset: EffectBackgroundPreset;
  textAnimation: EffectTextAnimationKind;
};

export type EffectSettings = {
  version: 1;
  backgroundPreset: EffectBackgroundPreset;
  typography: EffectTypographySettings;
  inlineMarks: EffectInlineMark[];
  illustrations: EffectIllustration[];
  sceneCues: EffectSceneCue[];
  notes: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBackgroundPreset(value: unknown): EffectBackgroundPreset {
  return EFFECT_BACKGROUND_PRESETS.includes(
    value as (typeof EFFECT_BACKGROUND_PRESETS)[number]
  )
    ? (value as (typeof EFFECT_BACKGROUND_PRESETS)[number])
    : null;
}

function normalizeInlineKind(value: unknown): EffectInlineMarkKind {
  return EFFECT_INLINE_MARK_KINDS.includes(
    value as (typeof EFFECT_INLINE_MARK_KINDS)[number]
  )
    ? (value as (typeof EFFECT_INLINE_MARK_KINDS)[number])
    : "ruby";
}

function normalizeIllustrationPlacement(
  value: unknown
): EffectIllustrationPlacement {
  return EFFECT_ILLUSTRATION_PLACEMENTS.includes(
    value as (typeof EFFECT_ILLUSTRATION_PLACEMENTS)[number]
  )
    ? (value as (typeof EFFECT_ILLUSTRATION_PLACEMENTS)[number])
    : "top";
}

function normalizeTextAnimation(value: unknown): EffectTextAnimationKind {
  return EFFECT_TEXT_ANIMATIONS.includes(
    value as (typeof EFFECT_TEXT_ANIMATIONS)[number]
  )
    ? (value as (typeof EFFECT_TEXT_ANIMATIONS)[number])
    : null;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

function emptyTypography(): EffectTypographySettings {
  return {
    fontFamily: null,
    textColor: null,
    bold: false,
    italic: false,
  };
}

export function emptyEffectSettings(): EffectSettings {
  return {
    version: 1,
    backgroundPreset: null,
    typography: emptyTypography(),
    inlineMarks: [],
    illustrations: [],
    sceneCues: [],
    notes: "",
  };
}

function normalizeInlineMark(value: unknown, index: number): EffectInlineMark | null {
  if (!isPlainObject(value)) return null;

  const targetText = pickText(value.targetText);
  if (!targetText) return null;

  return {
    id: pickText(value.id) || `inline-${index + 1}`,
    targetText,
    kind: normalizeInlineKind(value.kind),
    value: pickText(value.value) || null,
    note: pickText(value.note),
  };
}

function normalizeIllustration(
  value: unknown,
  index: number
): EffectIllustration | null {
  if (!isPlainObject(value)) return null;

  const imageUrl = pickText(value.imageUrl);
  if (!imageUrl) return null;

  return {
    id: pickText(value.id) || `illustration-${index + 1}`,
    imageUrl,
    caption: pickText(value.caption),
    placement: normalizeIllustrationPlacement(value.placement),
  };
}

function normalizeSceneCue(value: unknown, index: number): EffectSceneCue | null {
  if (!isPlainObject(value)) return null;

  const label = pickText(value.label);
  const triggerText = pickText(value.triggerText);
  const nextBgmTrackId = pickText(value.nextBgmTrackId);
  const nextBgmTitle = pickText(value.nextBgmTitle);
  const nextBgmAudioPath = pickText(value.nextBgmAudioPath);

  if (!label && !triggerText && !nextBgmTrackId && !nextBgmTitle && !nextBgmAudioPath) {
    return null;
  }

  return {
    id: pickText(value.id) || `scene-${index + 1}`,
    label: label || `場面転換${index + 1}`,
    triggerText,
    nextBgmTrackId: nextBgmTrackId || null,
    nextBgmTitle: nextBgmTitle || null,
    nextBgmAudioPath: nextBgmAudioPath || null,
    backgroundPreset: normalizeBackgroundPreset(value.backgroundPreset),
    textAnimation: normalizeTextAnimation(value.textAnimation),
  };
}

export function normalizeEffectSettings(value: unknown): EffectSettings {
  if (!isPlainObject(value)) return emptyEffectSettings();

  const rawTypography = isPlainObject(value.typography) ? value.typography : {};

  const inlineMarks = Array.isArray(value.inlineMarks)
    ? value.inlineMarks
        .map((item, index) => normalizeInlineMark(item, index))
        .filter((item): item is EffectInlineMark => item !== null)
    : [];

  const illustrations = Array.isArray(value.illustrations)
    ? value.illustrations
        .map((item, index) => normalizeIllustration(item, index))
        .filter((item): item is EffectIllustration => item !== null)
    : [];

  const sceneCues = Array.isArray(value.sceneCues)
    ? value.sceneCues
        .map((item, index) => normalizeSceneCue(item, index))
        .filter((item): item is EffectSceneCue => item !== null)
    : [];

  return {
    version: 1,
    backgroundPreset: normalizeBackgroundPreset(value.backgroundPreset),
    typography: {
      fontFamily: pickText(rawTypography.fontFamily) || null,
      textColor: pickText(rawTypography.textColor) || null,
      bold: normalizeBoolean(rawTypography.bold),
      italic: normalizeBoolean(rawTypography.italic),
    },
    inlineMarks,
    illustrations,
    sceneCues,
    notes: pickText(value.notes),
  };
}

export function parseEffectSettingsFromRow(...values: unknown[]): EffectSettings {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;

    if (typeof value === "string") {
      try {
        return normalizeEffectSettings(JSON.parse(value));
      } catch {
        continue;
      }
    }

    return normalizeEffectSettings(value);
  }

  return emptyEffectSettings();
}

export function serializeEffectSettingsForSave(
  value: unknown
): EffectSettings | null {
  const normalized = normalizeEffectSettings(value);

  const isEmpty =
    normalized.backgroundPreset === null &&
    normalized.typography.fontFamily === null &&
    normalized.typography.textColor === null &&
    normalized.typography.bold === false &&
    normalized.typography.italic === false &&
    normalized.inlineMarks.length === 0 &&
    normalized.illustrations.length === 0 &&
    normalized.sceneCues.length === 0 &&
    normalized.notes.trim().length === 0;

  return isEmpty ? null : normalized;
}