"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import EffectPreviewRenderer from "@/features/effects/EffectPreviewRenderer";
import {
  EFFECT_BACKGROUND_PRESETS,
  EFFECT_ILLUSTRATION_PLACEMENTS,
  EFFECT_INLINE_MARK_KINDS,
  EFFECT_TEXT_ANIMATIONS,
  mergeEffectSettings,
  parseEffectSettingsFromRow,
  serializeEffectSettingsForSave,
  type EffectBackgroundPreset,
  type EffectIllustrationPlacement,
  type EffectInlineMarkKind,
  type EffectSentenceTimestamp,
  type EffectSettings,
  type EffectTextAnimationKind,
} from "@/lib/effects/effectSettings";
import {
  findBgmLibraryTrack,
  resolveBgmLibraryTrackId,
  type BgmLibraryTrack,
} from "@/lib/bgm/bgmLibrary";
import {
  clampBgmSeconds,
  emptyBgmSettings,
  parseBgmSettingsFromRow,
  serializeBgmSettingsForSave,
  type BgmSettings,
} from "@/lib/bgm/bgmSettings";
import BgmLibraryPicker from "@/features/bgm/BgmLibraryPicker";
import {
  hideGlobalLoadingFeedback,
  showGlobalLoadingFeedback,
} from "@/lib/client/loadingFeedback";

type BackgroundPresetSelectValue =
  "" | Exclude<EffectBackgroundPreset, null>;

type TextAnimationSelectValue =
  "" | Exclude<EffectTextAnimationKind, null>;

type PreviewMode = "text" | "preview";
type SaveState = "idle" | "saving" | "success" | "error";
type EffectPanelKey = "background" | "sound" | "inline" | "illustration" | null;

type BgmLibraryTracksResponse = {
  ok?: boolean;
  tracks?: BgmLibraryTrack[];
  error?: string;
};

type EffectSettingsFormProps = {
  scope: "series" | "episode";
  tableName: "series" | "episodes";
  recordId: string;
  seriesId: string;
  title: string;
  subtitle: string;
  backHref: string;
  workspaceHref: string;
  initialSettings: EffectSettings;
  inheritedSettings?: EffectSettings | null;
  previewText: string;
  previewTextLabel: string;
  libraryTracks: BgmLibraryTrack[];
  initialBgmTitle?: string;
  initialBgmAudioPath?: string;
  initialBgmSettings?: BgmSettings | null;
  embedded?: boolean;
};

function StatusBadge({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-200">
        保存中...
      </span>
    );
  }

  if (state === "success") {
    return (
      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
        保存済み
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-xs text-red-200">
        保存失敗
      </span>
    );
  }

  return (
    <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-500">
      未保存
    </span>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-neutral-700">
      {label}: <span className="font-semibold text-black">{value}</span>
    </div>
  );
}


type AppliedEffectListItem = {
  title: string;
  detail: string;
};

function compactEffectText(value: string, maxLength = 48): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}…`;
}

function describeBgmSettings(settings: BgmSettings | null | undefined): string {
  if (!settings) {
    return "";
  }

  const parts: string[] = [];

  if (typeof settings.fadeInSeconds === "number") {
    parts.push(`フェードイン ${settings.fadeInSeconds}秒`);
  }

  if (typeof settings.fadeOutSeconds === "number") {
    parts.push(`フェードアウト ${settings.fadeOutSeconds}秒`);
  }

  return parts.join(" / ");
}

function buildAppliedEffectList(args: {
  settings: EffectSettings;
  bgmTitle?: string;
  bgmAudioPath?: string;
  bgmSettings?: BgmSettings | null;
}): AppliedEffectListItem[] {
  const items: AppliedEffectListItem[] = [];
  const { settings } = args;

  if (settings.backgroundPreset) {
    items.push({
      title: "背景",
      detail: `背景プリセット: ${settings.backgroundPreset}`,
    });
  }

  const typographyParts: string[] = [];

  if (settings.typography.fontFamily) {
    typographyParts.push(`フォント: ${settings.typography.fontFamily}`);
  }

  if (settings.typography.textColor) {
    typographyParts.push(`文字色: ${settings.typography.textColor}`);
  }

  if (settings.typography.bold) {
    typographyParts.push("太字");
  }

  if (settings.typography.italic) {
    typographyParts.push("斜体");
  }

  if (typographyParts.length > 0) {
    items.push({
      title: "文字表示",
      detail: typographyParts.join(" / "),
    });
  }

  for (const inlineMark of settings.inlineMarks) {
    const parts = [
      `対象: ${compactEffectText(inlineMark.targetText)}`,
      `種別: ${inlineMark.kind}`,
    ];

    if (inlineMark.value) {
      parts.push(`補助値: ${compactEffectText(inlineMark.value)}`);
    }

    items.push({
      title: "文字演出",
      detail: parts.join(" / "),
    });
  }

  for (const illustration of settings.illustrations) {
    const parts = [
      illustration.caption
        ? `説明: ${compactEffectText(illustration.caption)}`
        : "画像設定あり",
      `配置: ${illustration.placement}`,
    ];

    if (illustration.anchorText) {
      parts.push(`差し込み: ${compactEffectText(illustration.anchorText)}`);
    }

    items.push({
      title: "挿絵",
      detail: parts.join(" / "),
    });
  }

  for (const sceneCue of settings.sceneCues) {
    const parts = [
      `cue: ${compactEffectText(sceneCue.label || "場面転換")}`,
    ];

    if (sceneCue.triggerText) {
      parts.push(`発火: ${compactEffectText(sceneCue.triggerText)}`);
    }

    if (sceneCue.nextBgmTitle) {
      parts.push(`切替後BGM: ${compactEffectText(sceneCue.nextBgmTitle)}`);
    }

    if (sceneCue.backgroundPreset) {
      parts.push(`切替後背景: ${sceneCue.backgroundPreset}`);
    }

    if (sceneCue.textAnimation) {
      parts.push(`文字動作: ${sceneCue.textAnimation}`);
    }

    items.push({
      title: "音・場面演出",
      detail: parts.join(" / "),
    });
  }

  const bgmParts: string[] = [];
  const bgmTitle = args.bgmTitle?.trim() ?? "";
  const bgmAudioPath = args.bgmAudioPath?.trim() ?? "";
  const bgmSettingText = describeBgmSettings(args.bgmSettings);

  if (bgmTitle) {
    bgmParts.push(`素材: ${compactEffectText(bgmTitle)}`);
  } else if (bgmAudioPath) {
    bgmParts.push("素材: 設定あり");
  }

  if (bgmSettingText) {
    bgmParts.push(bgmSettingText);
  }

  if (bgmParts.length > 0) {
    items.push({
      title: "音・場面演出",
      detail: `BGM / ${bgmParts.join(" / ")}`,
    });
  }

  return items;
}

function AppliedEffectList({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: AppliedEffectListItem[];
  emptyText: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <p className="text-sm font-semibold text-black">{title}</p>

      {items.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {items.map((item, index) => (
            <div
              key={`${item.title}-${index}`}
              className="rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3"
            >
              <p className="text-xs tracking-[0.14em] text-neutral-500">
                {item.title}
              </p>
              <p className="mt-1 text-sm leading-7 text-neutral-800">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-2xl border border-dashed border-black/10 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
          {emptyText}
        </p>
      )}
    </div>
  );
}

function PreviewToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm transition ${
        active
          ? "bg-white text-black"
          : "text-neutral-700 hover:bg-white/10 hover:text-black"
      }`}
    >
      {children}
    </button>
  );
}

function formatSentenceTimestampLines(
  sentenceTimestamps: EffectSentenceTimestamp[]
): string {
  return sentenceTimestamps
    .map((sentenceTimestamp) => {
      return `${sentenceTimestamp.timeSeconds}|${sentenceTimestamp.targetText}`;
    })
    .join("\n");
}

function parseSentenceTimestampLines(
  value: string
): EffectSentenceTimestamp[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const [timePart = "", ...restParts] = line.split(/[|｜]/);
      const timeSeconds = Number(timePart.trim());
      const targetText = restParts.join("|").trim();

      if (!Number.isFinite(timeSeconds) || timeSeconds < 0 || !targetText) {
        return null;
      }

      return {
        id: `timestamp-${index + 1}`,
        targetText,
        timeSeconds: Math.round(timeSeconds * 10) / 10,
      };
    })
    .filter(
      (sentenceTimestamp): sentenceTimestamp is EffectSentenceTimestamp =>
        sentenceTimestamp !== null
    );
}

export default function EffectSettingsForm({
  scope,
  tableName,
  recordId,
  seriesId,
  title,
  subtitle,
  backHref,
  workspaceHref,
  initialSettings,
  inheritedSettings = null,
  previewText,
  previewTextLabel,
  libraryTracks,
  initialBgmTitle = "",
  initialBgmAudioPath = "",
  initialBgmSettings = null,
  embedded = false,
}: EffectSettingsFormProps) {
  const firstInlineMark = initialSettings.inlineMarks[0] ?? null;
  const firstIllustration = initialSettings.illustrations[0] ?? null;
  const firstSceneCue = initialSettings.sceneCues[0] ?? null;

  const [previewMode, setPreviewMode] = useState<PreviewMode>("text");

  const [backgroundPreset, setBackgroundPreset] =
    useState<BackgroundPresetSelectValue>(
      (initialSettings.backgroundPreset ?? "") as BackgroundPresetSelectValue
    );

  const [fontFamily, setFontFamily] = useState(
    initialSettings.typography.fontFamily ?? ""
  );
  const [textColor, setTextColor] = useState(
    initialSettings.typography.textColor ?? ""
  );
  const [defaultBold, setDefaultBold] = useState(
    initialSettings.typography.bold
  );
  const [defaultItalic, setDefaultItalic] = useState(
    initialSettings.typography.italic
  );

  const [inlineTargetText, setInlineTargetText] = useState(
    firstInlineMark?.targetText ?? ""
  );
  const [inlineKind, setInlineKind] = useState<EffectInlineMarkKind>(
    firstInlineMark?.kind ?? "ruby"
  );
  const [inlineValue, setInlineValue] = useState(firstInlineMark?.value ?? "");

  const [illustrationUrl, setIllustrationUrl] = useState(
    firstIllustration?.imageUrl ?? ""
  );
  const [illustrationCaption, setIllustrationCaption] = useState(
    firstIllustration?.caption ?? ""
  );
  const [illustrationPlacement, setIllustrationPlacement] =
    useState<EffectIllustrationPlacement>(
      firstIllustration?.placement ?? "top"
    );

  const [illustrationAnchorText, setIllustrationAnchorText] = useState(
    firstIllustration?.anchorText ?? ""
  );    

  const [sceneLabel, setSceneLabel] = useState(firstSceneCue?.label ?? "");
  const [sceneTriggerText, setSceneTriggerText] = useState(
    firstSceneCue?.triggerText ?? ""
  );
  const [sceneTrackId, setSceneTrackId] = useState(
    resolveBgmLibraryTrackId(libraryTracks, {
      title: firstSceneCue?.nextBgmTitle ?? "",
      audioPath: firstSceneCue?.nextBgmAudioPath ?? "",
    })
  );
  const [sceneBackgroundPreset, setSceneBackgroundPreset] =
    useState<BackgroundPresetSelectValue>(
      (firstSceneCue?.backgroundPreset ?? "") as BackgroundPresetSelectValue
    );
  const [sceneTextAnimation, setSceneTextAnimation] =
    useState<TextAnimationSelectValue>(
      (firstSceneCue?.textAnimation ?? "") as TextAnimationSelectValue
    );

      const [episodeBgmTitle, setEpisodeBgmTitle] = useState(initialBgmTitle);
  const [episodeBgmAudioPath, setEpisodeBgmAudioPath] = useState(
    initialBgmAudioPath
  );
  const [episodeSelectedTrackId, setEpisodeSelectedTrackId] = useState(() =>
    resolveBgmLibraryTrackId(libraryTracks, {
      title: initialBgmTitle,
      audioPath: initialBgmAudioPath,
    })
  );
  const [episodeBgmSettings, setEpisodeBgmSettings] = useState<BgmSettings>(
    initialBgmSettings ?? emptyBgmSettings()
  );
  const [availableLibraryTracks, setAvailableLibraryTracks] =
    useState<BgmLibraryTrack[]>(libraryTracks);
  const [libraryTrackLoadState, setLibraryTrackLoadState] = useState<
    "idle" | "loading" | "loaded" | "error"
  >(libraryTracks.length > 0 ? "loaded" : "idle");
  const [libraryTrackLoadMessage, setLibraryTrackLoadMessage] = useState("");

  const [sentenceTimestampLines, setSentenceTimestampLines] = useState(
    formatSentenceTimestampLines(initialSettings.sentenceTimestamps)
  );  

  const [notes, setNotes] = useState(initialSettings.notes ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [activeEffectPanel, setActiveEffectPanel] =
    useState<EffectPanelKey>(null);

  function resetSaveUi() {
    setSaveState("idle");
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function loadBgmLibraryTracks() {
    if (
      libraryTrackLoadState === "loading" ||
      libraryTrackLoadState === "loaded"
    ) {
      return;
    }

    setLibraryTrackLoadState("loading");
    setLibraryTrackLoadMessage("BGM素材を読み込み中...");

    try {
      const response = await fetch("/api/bgm-library/tracks", {
        method: "GET",
      });
      const payload = (await response.json().catch(() => null)) as
        | BgmLibraryTracksResponse
        | null;

      if (!response.ok || !payload?.ok) {
        setLibraryTrackLoadState("error");
        setLibraryTrackLoadMessage(
          payload?.error || "BGM素材の取得に失敗した。"
        );
        return;
      }

      const nextTracks = payload.tracks ?? [];
      setAvailableLibraryTracks(nextTracks);
      setSceneTrackId((current) =>
        current ||
        resolveBgmLibraryTrackId(nextTracks, {
          title: firstSceneCue?.nextBgmTitle ?? "",
          audioPath: firstSceneCue?.nextBgmAudioPath ?? "",
        })
      );
      setEpisodeSelectedTrackId((current) =>
        current ||
        resolveBgmLibraryTrackId(nextTracks, {
          title: initialBgmTitle,
          audioPath: initialBgmAudioPath,
        })
      );
      setLibraryTrackLoadState("loaded");
      setLibraryTrackLoadMessage("");
    } catch (error) {
      console.error("BGM library lazy load failed", error);
      setLibraryTrackLoadState("error");
      setLibraryTrackLoadMessage("BGM素材の取得中に想定外エラーが出た。");
    }
  }

  useEffect(() => {
    if (activeEffectPanel === "sound") {
      void loadBgmLibraryTracks();
    }
  }, [activeEffectPanel]);

  function buildDraftSettings(): EffectSettings {
    const selectedTrack = findBgmLibraryTrack(availableLibraryTracks, sceneTrackId);

    return parseEffectSettingsFromRow({
      version: 1,
      backgroundPreset: backgroundPreset || null,
      typography: {
        fontFamily: fontFamily.trim() || null,
        textColor: textColor.trim() || null,
        bold: defaultBold,
        italic: defaultItalic,
      },
      inlineMarks: inlineTargetText.trim()
        ? [
            {
              id: "inline-1",
              targetText: inlineTargetText.trim(),
              kind: inlineKind,
              value: inlineValue.trim() || null,
              note: "",
            },
          ]
        : [],
      illustrations: illustrationUrl.trim()
        ? [
            {
              id: "illustration-1",
              imageUrl: illustrationUrl.trim(),
              caption: illustrationCaption.trim(),
              placement: illustrationPlacement,
              anchorText:
                illustrationPlacement === "scene_break"
                  ? illustrationAnchorText.trim() || null
                  : null,
            },
          ]
        : [],
      sceneCues:
        sceneLabel.trim() ||
        sceneTriggerText.trim() ||
        sceneTrackId ||
        sceneBackgroundPreset ||
        sceneTextAnimation
          ? [
              {
                id: "scene-1",
                label: sceneLabel.trim() || "場面転換1",
                triggerText: sceneTriggerText.trim(),
                nextBgmTrackId: sceneTrackId || null,
                nextBgmTitle: selectedTrack?.title ?? null,
                nextBgmAudioPath: selectedTrack?.audioPath ?? null,
                backgroundPreset: sceneBackgroundPreset || null,
                textAnimation: sceneTextAnimation || null,
              },
            ]
          : [],
      sentenceTimestamps: parseSentenceTimestampLines(sentenceTimestampLines),          
      notes: notes.trim(),
    });
  }

  const draftSettings = buildDraftSettings();
  const savedPreviewSettings = mergeEffectSettings(inheritedSettings, initialSettings);
  const effectivePreviewSettings = mergeEffectSettings(
    inheritedSettings,
    draftSettings
  );

  const previewBody = previewText;
  const previewCharacterCount = previewBody.length;
  const previewLineCount =
    previewBody.length === 0 ? 0 : previewBody.split(/\r?\n/).length;

  const inheritedExists = serializeEffectSettingsForSave(inheritedSettings) !== null;
  const hasUnsavedPreviewChanges =
    JSON.stringify(serializeEffectSettingsForSave(draftSettings)) !==
    JSON.stringify(serializeEffectSettingsForSave(initialSettings));


  const savedBgmSettings = initialBgmSettings ?? emptyBgmSettings();
  const selectedEpisodeBgmTrack = findBgmLibraryTrack(
    libraryTracks,
    episodeSelectedTrackId
  );
  const currentEpisodeBgmTitle =
    selectedEpisodeBgmTrack?.title ?? episodeBgmTitle;

  const hasUnsavedBgmChanges =
    scope === "episode" &&
    ((episodeBgmTitle.trim() || "") !== (initialBgmTitle.trim() || "") ||
      (episodeBgmAudioPath.trim() || "") !==
        (initialBgmAudioPath.trim() || "") ||
      JSON.stringify(serializeBgmSettingsForSave(episodeBgmSettings)) !==
        JSON.stringify(serializeBgmSettingsForSave(savedBgmSettings)));

  const savedAppliedEffectItems = buildAppliedEffectList({
    settings: savedPreviewSettings,
    bgmTitle: scope === "episode" ? initialBgmTitle : "",
    bgmAudioPath: scope === "episode" ? initialBgmAudioPath : "",
    bgmSettings: scope === "episode" ? savedBgmSettings : null,
  });

  const draftAppliedEffectItems = buildAppliedEffectList({
    settings: effectivePreviewSettings,
    bgmTitle: scope === "episode" ? currentEpisodeBgmTitle : "",
    bgmAudioPath: scope === "episode" ? episodeBgmAudioPath : "",
    bgmSettings: scope === "episode" ? episodeBgmSettings : null,
  });

  const unsavedAppliedEffectItems =
    hasUnsavedPreviewChanges || hasUnsavedBgmChanges
      ? draftAppliedEffectItems
      : [];

  async function handleSave() {
    showGlobalLoadingFeedback("保存中...", 8000);
    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    const payload: Record<string, unknown> = {
      effect_settings: serializeEffectSettingsForSave(draftSettings),
    };

    if (scope === "episode") {
      payload.bgm_title = episodeBgmTitle.trim() || null;
      payload.bgm_audio_path = episodeBgmAudioPath.trim() || null;
      payload.bgm_settings = serializeBgmSettingsForSave(episodeBgmSettings);
    }

    const { error } = await supabase
      .from(tableName)
      .update(payload)
      .eq("id", recordId);

    if (error) {
      hideGlobalLoadingFeedback();
      setSaveState("error");
      setErrorMessage(error.message);
      return;
    }

    hideGlobalLoadingFeedback();
    setSaveState("success");
    setSuccessMessage(
      scope === "series" ? "作品演出を保存した。" : "話の演出・BGMを保存した。"
    );
  }


  if (embedded) {
    const effectPanelItems: Array<{ key: EffectPanelKey; label: string; value: string }> = [
      {
        key: "background",
        label: "背景",
        value: backgroundPreset || "未設定",
      },
      {
        key: "sound",
        label: "音・場面演出",
        value: currentEpisodeBgmTitle || sceneLabel || sceneTriggerText || "未設定",
      },
      {
        key: "inline",
        label: "文字演出",
        value: inlineTargetText || "未設定",
      },
      {
        key: "illustration",
        label: "挿絵",
        value: illustrationUrl || "未設定",
      },
    ];

    return (
      <main className="bg-white text-black">
        <section className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs tracking-[0.18em] text-neutral-500">
                  EFFECT SETTINGS
                </p>
                <h2 className="mt-1 text-xl font-semibold text-black">
                  演出・BGM編集
                </h2>
              </div>

              <StatusBadge state={saveState} />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {effectPanelItems.map((item) => {
                const active = activeEffectPanel === item.key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() =>
                      setActiveEffectPanel((current) =>
                        current === item.key ? null : item.key
                      )
                    }
                    className={[
                      "rounded-2xl border px-3 py-3 text-left transition",
                      active
                        ? "border-sky-200 bg-sky-50"
                        : "border-black/10 bg-white hover:bg-neutral-50",
                    ].join(" ")}
                    aria-expanded={active}
                  >
                    <span className="block text-[11px] tracking-[0.16em] text-neutral-500">
                      {item.label}
                    </span>
                    <span className="mt-1 block truncate text-sm font-semibold text-black">
                      {item.value}
                    </span>
                    <span className="mt-2 block text-xs text-neutral-500">
                      {active ? "閉じる" : "開く"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 px-4 py-5 sm:px-5">
            {activeEffectPanel === "background" ? (
              <section className="rounded-[24px] border border-black/10 bg-neutral-50 p-4">
                <p className="text-xs tracking-[0.18em] text-neutral-500">
                  BACKGROUND
                </p>
                <h3 className="mt-1 text-lg font-semibold text-black">背景</h3>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm text-neutral-700">背景プリセット</span>
                    <select
                      value={backgroundPreset}
                      onChange={(event) => {
                        setBackgroundPreset(event.target.value as BackgroundPresetSelectValue);
                        resetSaveUi();
                      }}
                      className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none"
                    >
                      <option value="">未設定</option>
                      {EFFECT_BACKGROUND_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm text-neutral-700">文字色</span>
                    <input
                      value={textColor}
                      onChange={(event) => {
                        setTextColor(event.target.value);
                        resetSaveUi();
                      }}
                      placeholder="例: #111827"
                      className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm text-neutral-700">フォント</span>
                    <input
                      value={fontFamily}
                      onChange={(event) => {
                        setFontFamily(event.target.value);
                        resetSaveUi();
                      }}
                      placeholder="例: serif"
                      className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                    />
                  </label>

                  <div className="grid gap-2">
                    <span className="text-sm text-neutral-700">文字装飾</span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="flex items-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-neutral-700">
                        <input
                          type="checkbox"
                          checked={defaultBold}
                          onChange={(event) => {
                            setDefaultBold(event.target.checked);
                            resetSaveUi();
                          }}
                        />
                        太字
                      </label>

                      <label className="flex items-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-neutral-700">
                        <input
                          type="checkbox"
                          checked={defaultItalic}
                          onChange={(event) => {
                            setDefaultItalic(event.target.checked);
                            resetSaveUi();
                          }}
                        />
                        斜体
                      </label>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {activeEffectPanel === "sound" ? (
              <section className="rounded-[24px] border border-black/10 bg-neutral-50 p-4">
                <p className="text-xs tracking-[0.18em] text-neutral-500">
                  SOUND / SCENE
                </p>
                <h3 className="mt-1 text-lg font-semibold text-black">
                  音・場面演出
                </h3>

                <div className="mt-4 grid gap-4">
                  {libraryTrackLoadMessage ? (
                    <div
                      className={[
                        "rounded-2xl border px-4 py-3 text-sm leading-6",
                        libraryTrackLoadState === "error"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-black/10 bg-white text-neutral-600",
                      ].join(" ")}
                    >
                      {libraryTrackLoadMessage}
                    </div>
                  ) : null}

                  <BgmLibraryPicker
                    tracks={availableLibraryTracks}
                    selectedTrackId={episodeSelectedTrackId}
                    onSelectTrack={(nextTrackId) => {
                      const nextTrack = findBgmLibraryTrack(availableLibraryTracks, nextTrackId);

                      setEpisodeSelectedTrackId(nextTrackId);
                      setEpisodeBgmTitle(nextTrack?.title ?? "");
                      setEpisodeBgmAudioPath(nextTrack?.audioPath ?? "");
                      resetSaveUi();
                    }}
                    onClear={() => {
                      setEpisodeSelectedTrackId("");
                      setEpisodeBgmTitle("");
                      setEpisodeBgmAudioPath("");
                      resetSaveUi();
                    }}
                    label="BGM素材"
                    placeholder="空なら共通BGM"
                    helperText=""
                    clearLabel="BGMを解除"
                    fallbackTitle={episodeBgmTitle}
                    fallbackAudioPath={episodeBgmAudioPath}
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm text-neutral-700">フェードイン秒数</span>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        step={0.1}
                        value={episodeBgmSettings.fadeInSeconds ?? ""}
                        onChange={(event) => {
                          setEpisodeBgmSettings({
                            ...episodeBgmSettings,
                            fadeInSeconds: clampBgmSeconds(event.target.value),
                          });
                          resetSaveUi();
                        }}
                        placeholder="例: 1.5"
                        className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm text-neutral-700">フェードアウト秒数</span>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        step={0.1}
                        value={episodeBgmSettings.fadeOutSeconds ?? ""}
                        onChange={(event) => {
                          setEpisodeBgmSettings({
                            ...episodeBgmSettings,
                            fadeOutSeconds: clampBgmSeconds(event.target.value),
                          });
                          resetSaveUi();
                        }}
                        placeholder="例: 2.0"
                        className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                      />
                    </label>
                  </div>

                  <div className="rounded-[22px] border border-black/10 bg-white p-4">
                    <p className="text-sm font-semibold text-black">場面転換</p>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-700">cue名</span>
                        <input
                          value={sceneLabel}
                          onChange={(event) => {
                            setSceneLabel(event.target.value);
                            resetSaveUi();
                          }}
                          placeholder="例: 夜明けへ切り替え"
                          className="rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-700">発火文字列</span>
                        <input
                          value={sceneTriggerText}
                          onChange={(event) => {
                            setSceneTriggerText(event.target.value);
                            resetSaveUi();
                          }}
                          placeholder="例: 夜が明けた"
                          className="rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                        />
                      </label>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-700">切替後背景</span>
                        <select
                          value={sceneBackgroundPreset}
                          onChange={(event) => {
                            setSceneBackgroundPreset(
                              event.target.value as BackgroundPresetSelectValue
                            );
                            resetSaveUi();
                          }}
                          className="rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3 text-sm text-black outline-none"
                        >
                          <option value="">変更しない</option>
                          {EFFECT_BACKGROUND_PRESETS.map((preset) => (
                            <option key={preset} value={preset}>
                              {preset}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-700">文字動作</span>
                        <select
                          value={sceneTextAnimation}
                          onChange={(event) => {
                            setSceneTextAnimation(
                              event.target.value as TextAnimationSelectValue
                            );
                            resetSaveUi();
                          }}
                          className="rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3 text-sm text-black outline-none"
                        >
                          <option value="">変更しない</option>
                          {EFFECT_TEXT_ANIMATIONS.map((animation) => (
                            <option key={animation} value={animation}>
                              {animation}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="mt-4">
                      <BgmLibraryPicker
                        tracks={availableLibraryTracks}
                        selectedTrackId={sceneTrackId}
                        onSelectTrack={(nextTrackId) => {
                          setSceneTrackId(nextTrackId);
                          resetSaveUi();
                        }}
                        onClear={() => {
                          setSceneTrackId("");
                          resetSaveUi();
                        }}
                        label="切替後BGM"
                        placeholder="変更しない"
                        helperText=""
                        clearLabel="切替後BGMを解除"
                        fallbackTitle={firstSceneCue?.nextBgmTitle ?? ""}
                        fallbackAudioPath={firstSceneCue?.nextBgmAudioPath ?? ""}
                      />
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {activeEffectPanel === "inline" ? (
              <section className="rounded-[24px] border border-black/10 bg-neutral-50 p-4">
                <p className="text-xs tracking-[0.18em] text-neutral-500">
                  INLINE EFFECT
                </p>
                <h3 className="mt-1 text-lg font-semibold text-black">文字演出</h3>

                <div className="mt-4 grid gap-4">
                  <label className="grid gap-2">
                    <span className="text-sm text-neutral-700">対象文字列</span>
                    <input
                      value={inlineTargetText}
                      onChange={(event) => {
                        setInlineTargetText(event.target.value);
                        resetSaveUi();
                      }}
                      placeholder="本文中にある文字列を入れる"
                      className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                    />
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm text-neutral-700">演出種別</span>
                      <select
                        value={inlineKind}
                        onChange={(event) => {
                          setInlineKind(event.target.value as EffectInlineMarkKind);
                          resetSaveUi();
                        }}
                        className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none"
                      >
                        {EFFECT_INLINE_MARK_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {kind}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm text-neutral-700">補助値</span>
                      <input
                        value={inlineValue}
                        onChange={(event) => {
                          setInlineValue(event.target.value);
                          resetSaveUi();
                        }}
                        placeholder="ルビ、色、補足値など"
                        className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                      />
                    </label>
                  </div>
                </div>
              </section>
            ) : null}

            {activeEffectPanel === "illustration" ? (
              <section className="rounded-[24px] border border-black/10 bg-neutral-50 p-4">
                <p className="text-xs tracking-[0.18em] text-neutral-500">
                  ILLUSTRATION
                </p>
                <h3 className="mt-1 text-lg font-semibold text-black">挿絵</h3>

                <div className="mt-4 grid gap-4">
                  <label className="grid gap-2">
                    <span className="text-sm text-neutral-700">画像URL</span>
                    <input
                      value={illustrationUrl}
                      onChange={(event) => {
                        setIllustrationUrl(event.target.value);
                        resetSaveUi();
                      }}
                      placeholder="https://..."
                      className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                    />
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm text-neutral-700">キャプション</span>
                      <input
                        value={illustrationCaption}
                        onChange={(event) => {
                          setIllustrationCaption(event.target.value);
                          resetSaveUi();
                        }}
                        placeholder="例: 夜明けの街並み"
                        className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm text-neutral-700">配置</span>
                      <select
                        value={illustrationPlacement}
                        onChange={(event) => {
                          setIllustrationPlacement(
                            event.target.value as EffectIllustrationPlacement
                          );
                          resetSaveUi();
                        }}
                        className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none"
                      >
                        {EFFECT_ILLUSTRATION_PLACEMENTS.map((placement) => (
                          <option key={placement} value={placement}>
                            {placement}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {illustrationPlacement === "scene_break" ? (
                    <label className="grid gap-2">
                      <span className="text-sm text-neutral-700">
                        差し込み対象文字列
                      </span>
                      <input
                        value={illustrationAnchorText}
                        onChange={(event) => {
                          setIllustrationAnchorText(event.target.value);
                          resetSaveUi();
                        }}
                        placeholder="例: 夜が明けた"
                        className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                      />
                    </label>
                  ) : null}
                </div>
              </section>
            ) : null}


            <section className="rounded-[24px] border border-black/10 bg-neutral-50 p-4">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                APPLIED EFFECTS
              </p>
              <h3 className="mt-1 text-lg font-semibold text-black">
                反映演出一覧
              </h3>

              <div className="mt-4 grid gap-4">
                <AppliedEffectList
                  title="保存済"
                  items={savedAppliedEffectItems}
                  emptyText="保存済の演出はまだない。"
                />

                <AppliedEffectList
                  title="未保存"
                  items={unsavedAppliedEffectItems}
                  emptyText="未保存の変更はない。"
                />

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saveState === "saving"}
                    className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saveState === "saving" ? "保存中..." : "演出を保存"}
                  </button>

                  {errorMessage ? (
                    <span className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                      {errorMessage}
                    </span>
                  ) : null}

                  {successMessage ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                      {successMessage}
                    </span>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      className={
        embedded ? "bg-white text-black" : "min-h-screen bg-white text-black"
      }
    >
      <div
        className={
          embedded
            ? "w-full"
            : "mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"
        }
      >
        <div className={embedded ? "hidden" : "mb-4 text-sm text-neutral-500"}>
          <span className="text-neutral-700">演出編集</span>
        </div>

        <section
          className={
            embedded
              ? "overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-sm"
              : "overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm"
          }
        >
          <div className={embedded ? "hidden" : "border-b border-black/10 px-5 py-6 sm:px-8"}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="text-xs tracking-[0.22em] text-neutral-500">
                  LIB READ EFFECT FOUNDATION
                </p>
                <h1 className="mt-3 text-3xl font-bold text-black">{title}</h1>
              </div>

              <StatusBadge state={saveState} />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={workspaceHref}
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
              >
                作品ワークスペースへ
              </Link>

              <Link
                href={backHref}
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
              >
                直前の編集画面へ
              </Link>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
<section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div className="max-w-3xl">
      <p className="text-xs tracking-[0.18em] text-neutral-500">
        BODY / PREVIEW
      </p>
      <h2 className="mt-2 text-xl font-semibold text-black">
        本文とプレビュー
      </h2>
      
    </div>

    <div className="inline-flex rounded-full border border-black/10 bg-neutral-50 p-1">
      <PreviewToggleButton
        active={previewMode === "text"}
        onClick={() => setPreviewMode("text")}
      >
        本文
      </PreviewToggleButton>
      <PreviewToggleButton
        active={previewMode === "preview"}
        onClick={() => setPreviewMode("preview")}
      >
        プレビュー
      </PreviewToggleButton>
    </div>
  </div>

  <div className="mt-4 overflow-hidden rounded-[28px] border border-black/10 bg-white">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
      <div>
        <p className="text-xs tracking-[0.18em] text-neutral-500">
          PREVIEW SOURCE
        </p>
        <p className="mt-2 text-sm text-neutral-800">
          {previewTextLabel}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-xs text-neutral-700">
          {previewCharacterCount}文字
        </span>
        <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-xs text-neutral-700">
          {previewLineCount}行
        </span>
        <span
          className={`rounded-full border px-3 py-1 text-xs ${
            hasUnsavedPreviewChanges
              ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
              : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
          }`}
        >
          {hasUnsavedPreviewChanges
            ? "未保存変更を反映中"
            : "保存済み表示と一致"}
        </span>
      </div>
    </div>

    <div className={embedded ? "h-[360px] min-h-0 p-4" : "h-[560px] min-h-0 p-4 sm:p-6"}>
      {previewMode === "text" ? (
        <div className="h-full min-h-0 overflow-y-auto rounded-[28px] border border-black/10 bg-neutral-50 px-5 py-5">
          {previewBody.trim().length > 0 ? (
            <div className="whitespace-pre-wrap break-words text-sm leading-8 text-neutral-800">
              {previewBody}
            </div>
          ) : (
            <div className="text-sm leading-7 text-neutral-500">
              まだ本文が無い。本文を保存すると、ここに本文表示とプレビュー表示を切り替えて確認できる。
            </div>
          )}
        </div>
      ) : (
        <div className="h-full min-h-0 overflow-y-auto pr-1">
          <EffectPreviewRenderer
            body={previewBody}
            settings={effectivePreviewSettings}
          />
        </div>
      )}
    </div>
  </div>
</section>

            <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="grid gap-6">
                <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    {scope === "episode" ? "EPISODE BACKGROUND" : "DEFAULT SETTINGS"}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-black">
                    {scope === "episode" ? "この話の背景設定" : "既定設定の扱い"}
                  </h2>

                  {scope === "episode" ? (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      ...
                    </div>
                  ) : null}
                </section>

                <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">

                {scope === "episode" ? (
                  <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
                    <p className="text-xs tracking-[0.18em] text-neutral-500">
                      SOUND / SCENE
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-black">
                      音・場面演出
                    </h2>
                    

                    <div className="mt-4 grid gap-4">
                      <BgmLibraryPicker
                        tracks={availableLibraryTracks}
                        selectedTrackId={episodeSelectedTrackId}
                        onSelectTrack={(nextTrackId) => {
                          const nextTrack = findBgmLibraryTrack(
                            libraryTracks,
                            nextTrackId
                          );

                          setEpisodeSelectedTrackId(nextTrackId);
                          setEpisodeBgmTitle(nextTrack?.title ?? "");
                          setEpisodeBgmAudioPath(nextTrack?.audioPath ?? "");
                          resetSaveUi();
                        }}
                        onClear={() => {
                          setEpisodeSelectedTrackId("");
                          setEpisodeBgmTitle("");
                          setEpisodeBgmAudioPath("");
                          resetSaveUi();
                        }}
                        label="音・場面演出素材"
                        placeholder="空なら共通BGM"
                        helperText="お気に入りした素材が上に出る。ここが未選択なら、既定演出設定ページの共通BGMを使う。"
                        clearLabel="音・場面演出を解除"
                        fallbackTitle={episodeBgmTitle}
                        fallbackAudioPath={episodeBgmAudioPath}
                      />

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="grid gap-2">
                          <span className="text-sm text-neutral-700">フェードイン秒数</span>
                          <input
                            type="number"
                            min={0}
                            max={20}
                            step={0.1}
                            value={episodeBgmSettings.fadeInSeconds ?? ""}
                            onChange={(event) => {
                              setEpisodeBgmSettings({
                                ...episodeBgmSettings,
                                fadeInSeconds: clampBgmSeconds(event.target.value),
                              });
                              resetSaveUi();
                            }}
                            placeholder="例: 1.5"
                            className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                          />
                        </label>

                        <label className="grid gap-2">
                          <span className="text-sm text-neutral-700">フェードアウト秒数</span>
                          <input
                            type="number"
                            min={0}
                            max={20}
                            step={0.1}
                            value={episodeBgmSettings.fadeOutSeconds ?? ""}
                            onChange={(event) => {
                              setEpisodeBgmSettings({
                                ...episodeBgmSettings,
                                fadeOutSeconds: clampBgmSeconds(event.target.value),
                              });
                              resetSaveUi();
                            }}
                            placeholder="例: 2.0"
                            className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                          />
                        </label>
                      </div>

                      
                    </div>
                  </section>
                ) : null}

                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    INLINE EFFECT
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-black">
                    文字演出の最小サンプル
                  </h2>
                  

                  <div className="mt-4 grid gap-4">
                    <label className="grid gap-2">
                      <span className="text-sm text-neutral-700">対象文字列</span>
                      <input
                        value={inlineTargetText}
                        onChange={(event) => {
                          setInlineTargetText(event.target.value);
                          resetSaveUi();
                        }}
                        placeholder="本文中にある文字列を入れる"
                        className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                      />
                    </label>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-700">演出種別</span>
                        <select
                          value={inlineKind}
                          onChange={(event) => {
                            setInlineKind(event.target.value as EffectInlineMarkKind);
                            resetSaveUi();
                          }}
                          className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none"
                        >
                          {EFFECT_INLINE_MARK_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {kind}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-700">補助値</span>
                        <input
                          value={inlineValue}
                          onChange={(event) => {
                            setInlineValue(event.target.value);
                            resetSaveUi();
                          }}
                          placeholder="ruby なら ふりがな / color なら 色コード"
                          className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                        />
                      </label>
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    ILLUSTRATION
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-black">
                    挿絵の最小土台
                  </h2>

                  <div className="mt-4 grid gap-4">
                    <label className="grid gap-2">
                      <span className="text-sm text-neutral-700">画像URL</span>
                      <input
                        value={illustrationUrl}
                        onChange={(event) => {
                          setIllustrationUrl(event.target.value);
                          resetSaveUi();
                        }}
                        placeholder="https://..."
                        className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                      />
                    </label>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-700">キャプション</span>
                        <input
                          value={illustrationCaption}
                          onChange={(event) => {
                            setIllustrationCaption(event.target.value);
                            resetSaveUi();
                          }}
                          placeholder="例: 夜明けの街並み"
                          className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-700">配置</span>
                        <select
                          value={illustrationPlacement}
                          onChange={(event) => {
                            setIllustrationPlacement(
                              event.target.value as EffectIllustrationPlacement
                            );
                            resetSaveUi();
                          }}
                          className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none"
                        >
                          {EFFECT_ILLUSTRATION_PLACEMENTS.map((placement) => (
                            <option key={placement} value={placement}>
                              {placement}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {illustrationPlacement === "scene_break" ? (
                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-700">
                          差し込み対象文字列
                        </span>
                        <input
                          value={illustrationAnchorText}
                          onChange={(event) => {
                            setIllustrationAnchorText(event.target.value);
                            resetSaveUi();
                          }}
                          placeholder="例: 夜が明けた"
                          className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                        />
                        <span className="text-xs leading-6 text-neutral-500">
                          scene_break の時だけ使う。本文中でこの文字列を含む文の直後へ差し込む。
                        </span>
                      </label>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    SOUND / SCENE CUE
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-black">
                    場面転換
                  </h2>

                  <div className="mt-4 grid gap-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-700">cue 名</span>
                        <input
                          value={sceneLabel}
                          onChange={(event) => {
                            setSceneLabel(event.target.value);
                            resetSaveUi();
                          }}
                          placeholder="例: 夜明けへ切り替え"
                          className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-700">発火文字列</span>
                        <input
                          value={sceneTriggerText}
                          onChange={(event) => {
                            setSceneTriggerText(event.target.value);
                            resetSaveUi();
                          }}
                          placeholder="例: 夜が明けた"
                          className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                        />
                      </label>
                    </div>

                    <BgmLibraryPicker
                      tracks={availableLibraryTracks}
                      selectedTrackId={sceneTrackId}
                      onSelectTrack={(nextTrackId) => {
                        setSceneTrackId(nextTrackId);
                        resetSaveUi();
                      }}
                      onClear={() => {
                        setSceneTrackId("");
                        resetSaveUi();
                      }}
                      label="場面転換後BGM"
                      placeholder="場面転換後のBGMを選ぶ"
                      helperText="お気に入りした素材が上に出る。今回は cue の保存とプレビュー要約だけ先に通し、再生制御本体は後段で扱う。"
                      clearLabel="場面転換BGMを解除"
                      fallbackTitle=""
                      fallbackAudioPath=""
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-700">切替後背景</span>
                        <select
                          value={sceneBackgroundPreset}
                          onChange={(event) => {
                            setSceneBackgroundPreset(
                              event.target.value as BackgroundPresetSelectValue
                            );
                            resetSaveUi();
                          }}
                          className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none"
                        >
                          <option value="">未設定</option>
                          {EFFECT_BACKGROUND_PRESETS.map((preset) => (
                            <option key={preset} value={preset}>
                              {preset}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-700">切替後文字動作</span>
                        <select
                          value={sceneTextAnimation}
                          onChange={(event) => {
                            setSceneTextAnimation(
                              event.target.value as TextAnimationSelectValue
                            );
                            resetSaveUi();
                          }}
                          className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none"
                        >
                          <option value="">未設定</option>
                          {EFFECT_TEXT_ANIMATIONS.map((animation) => (
                            <option key={animation} value={animation}>
                              {animation}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </section>

                <section className="hidden"><p className="text-xs tracking-[0.18em] text-neutral-500">TIMESTAMPS</p>
                  <h2 className="mt-2 text-xl font-semibold text-black">
                    文単位 timestamp
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-neutral-600">
                    1行ごとに <code>秒数|対象文字列</code> の形で入れる。
                    read 側ではこの情報を優先して現在文判定に使い、無い時だけ比率推定へ戻る。
                  </p>

                  <textarea
                    value={sentenceTimestampLines}
                    onChange={(event) => {
                      setSentenceTimestampLines(event.target.value);
                      resetSaveUi();
                    }}
                    rows={8}
                    placeholder={`0|最初の文\n3.2|夜が明けた\n8.5|彼は立ち上がった`}
                    className="mt-4 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-7 text-black outline-none placeholder:text-neutral-500"
                  />

                  <div className="mt-4 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-7 text-neutral-600">
                    対象文字列は本文中の文に含まれている必要がある。
                    最初は最小構成として文字列一致で sentence index へ解決する。
                  </div>
                </section>                

                <section className="hidden"><p className="text-xs tracking-[0.18em] text-neutral-500">NOTES</p>
                  <h2 className="mt-2 text-xl font-semibold text-black">
                    補足メモ
                  </h2>

                  <textarea
                    value={notes}
                    onChange={(event) => {
                      setNotes(event.target.value);
                      resetSaveUi();
                    }}
                    rows={6}
                    placeholder="将来のアニメーションや配置改善に回したい補足を書いておく"
                    className="mt-4 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-7 text-black outline-none placeholder:text-neutral-500"
                  />
                </section>
              </div>

              <div className="grid gap-6">
                <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    SAVE TARGET
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-black">
                    今回の保存先
                  </h2>

                  

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSave}
                      className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                    >
                      演出を保存
                    </button>
                  </div>

                  {errorMessage ? (
                    <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                      {errorMessage}
                    </div>
                  ) : null}

                  {successMessage ? (
                    <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                      {successMessage}
                    </div>
                  ) : null}
                </section>

                
                <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    APPLIED EFFECTS
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-black">
                    反映演出一覧
                  </h2>

                  <div className="mt-4 grid gap-4">
                    <AppliedEffectList
                      title="保存済"
                      items={savedAppliedEffectItems}
                      emptyText="保存済の演出はまだない。"
                    />

                    <AppliedEffectList
                      title="未保存"
                      items={unsavedAppliedEffectItems}
                      emptyText="未保存の変更はない。"
                    />
                  </div>
                </section>

                <section className="hidden"><p className="text-xs tracking-[0.18em] text-neutral-500">CURRENT SUMMARY</p>
                  <h2 className="mt-2 text-xl font-semibold text-black">
                    今回の表示内容
                  </h2>

                  <div className="mt-4 grid gap-3">
                    <SummaryRow
                      label="背景"
                      value={effectivePreviewSettings.backgroundPreset ?? "未設定"}
                    />
                    <SummaryRow
                      label="既定フォント"
                      value={
                        effectivePreviewSettings.typography.fontFamily ?? "未設定"
                      }
                    />
                    <SummaryRow
                      label="既定文字色"
                      value={
                        effectivePreviewSettings.typography.textColor ?? "未設定"
                      }
                    />
                    <SummaryRow
                      label="文字演出"
                      value={`${effectivePreviewSettings.inlineMarks.length}件`}
                    />
                    <SummaryRow
                      label="挿絵"
                      value={`${effectivePreviewSettings.illustrations.length}件`}
                    />
                    <SummaryRow
                      label="場面転換 cue"
                      value={`${effectivePreviewSettings.sceneCues.length}件`}
                    />
                    <SummaryRow
                      label="文単位timestamp"
                      value={`${effectivePreviewSettings.sentenceTimestamps.length}件`}
                    />                    
                  </div>
                </section>

                <section className="hidden"><p className="text-xs tracking-[0.18em] text-neutral-500">PREVIEW COMPOSITION</p>
                  <h2 className="mt-2 text-xl font-semibold text-black">
                    プレビュー合成
                  </h2>

                  <div className="mt-4 grid gap-3">
                    <SummaryRow
                      label="表示対象"
                      value={previewMode === "text" ? "本文" : "プレビュー"}
                    />
                    <SummaryRow
                      label="共通演出の合成"
                      value={
                        scope === "episode"
                          ? inheritedExists
                            ? "作品共通 + 話単位"
                            : "話単位のみ"
                          : "作品共通のみ"
                      }
                    />
                    <SummaryRow
                      label="未保存変更"
                      value={hasUnsavedPreviewChanges ? "反映中" : "なし"}
                    />
                    <SummaryRow
                      label="保存済み比較"
                      value={`${savedPreviewSettings.inlineMarks.length}件の保存済み文字演出`}
                    />
                  </div>
                </section>

                <section className="hidden"><p className="text-xs tracking-[0.18em] text-neutral-500">CONNECTION</p>
                  <h2 className="mt-2 text-xl font-semibold text-black">
                    接続方針
                  </h2>

                  <div className="mt-4 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-7 text-neutral-600">
                    新規作品作成時は「作品を作成して演出へ」。<br />
                    次話投稿時は「作成して演出へ」。<br />
                    作品ワークスペースからは常設リンクで入る。<br />
                    今回は本文 / プレビュー切替と静的演出確認を優先し、重い動的演出は後回しにする。
                  </div>
                </section>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}