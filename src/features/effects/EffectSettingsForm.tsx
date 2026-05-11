"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import EffectPreviewRenderer from "@/features/effects/EffectPreviewRenderer";
import {
  EFFECT_BACKGROUND_PRESETS,
  getBackgroundPresetMeta,
  EFFECT_ILLUSTRATION_PLACEMENTS,
  EFFECT_INLINE_MARK_KINDS,
  emptyEffectSettings,
  mergeEffectSettings,
  parseEffectSettingsFromRow,
  serializeEffectSettingsForSave,
  type EffectBackgroundPreset,
  type EffectIllustrationPlacement,
  type EffectInlineMarkKind,
  type EffectSettings,
} from "@/lib/effects/effectSettings";
import {
  hideGlobalLoadingFeedback,
  showGlobalLoadingFeedback,
} from "@/lib/client/loadingFeedback";

type BackgroundPresetSelectValue =
  "" | Exclude<EffectBackgroundPreset, null>;

type PreviewMode = "text" | "preview";
type SaveState = "idle" | "saving" | "success" | "error";
type UploadState = "idle" | "uploading" | "success" | "error";
type EffectPanelKey = "background" | "inline" | "illustration" | null;


const EFFECT_BACKGROUND_COLOR_OPTIONS = [
  { value: "", label: "未設定", className: "bg-white text-neutral-700" },
  { value: "#ffffff", label: "白", className: "bg-white text-black" },
  { value: "#f7edd8", label: "生成り", className: "bg-[#f7edd8] text-[#2f2416]" },
  { value: "#eef5f7", label: "薄い青紙", className: "bg-[#eef5f7] text-[#1f2b33]" },
  { value: "#f2eadb", label: "しわ紙", className: "bg-[#f2eadb] text-[#2d261b]" },
  { value: "#dfc48c", label: "古紙", className: "bg-[#dfc48c] text-[#2d1d0f]" },
  { value: "#111827", label: "黒", className: "bg-[#111827] text-white" },
  { value: "#fef2f2", label: "薄赤", className: "bg-red-50 text-red-800" },
  { value: "#eff6ff", label: "薄青", className: "bg-blue-50 text-blue-800" },
  { value: "#f0fdf4", label: "薄緑", className: "bg-green-50 text-green-800" },
] as const;

function getBackgroundPresetLabel(
  preset: BackgroundPresetSelectValue | EffectBackgroundPreset
): string {
  if (!preset) return "未設定";
  return getBackgroundPresetMeta(preset)?.label ?? "未設定";
}


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
  libraryTracks?: unknown[];
  initialBgmTitle?: string;
  initialBgmAudioPath?: string;
  initialBgmSettings?: unknown;
  embedded?: boolean;
};

type AppliedEffectListItem = {
  title: string;
  detail: string;
  deleteKey?: "background" | "inline" | "illustration";
  effectId?: string;
};

function StatusBadge({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-700">
        保存中...
      </span>
    );
  }

  if (state === "success") {
    return (
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
        保存済み
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700">
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

function getInlineMarkKindLabel(kind: EffectInlineMarkKind): string {
  if (kind === "ruby") return "ルビ";
  if (kind === "bold") return "太字";
  if (kind === "italic") return "斜体";
  if (kind === "color") return "文字色";
  if (kind === "dot_emphasis") return "傍点";
  if (kind === "line_emphasis") return "下線";
  if (kind === "shake") return "震え";
  if (kind === "typing") return "タイプ表示";
  if (kind === "fade_out") return "薄くする";
  return kind;
}

function getInlineValueHelp(kind: EffectInlineMarkKind): string {
  if (kind === "ruby") return "ルビとして表示する読みを入れる。例: かんだた";
  if (kind === "color") return "色を入れる。例: 赤 / 青 / red / #ef4444";
  if (kind === "shake") return "任意。強さのメモとして small / normal / strong など。";
  if (kind === "typing") return "任意。表示速度のメモとして slow / normal / fast など。";
  if (kind === "fade_out") return "任意。薄さのメモとして 0.5 など。";
  if (kind === "bold" || kind === "italic" || kind === "dot_emphasis" || kind === "line_emphasis") {
    return "この演出では補助値なしでも使える。";
  }

  return "必要に応じて補助値を入れる。";
}

function buildSafeFileName(fileName: string): string {
  return fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "illustration";
}

function normalizeInlineValue(kind: EffectInlineMarkKind, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (kind !== "color") {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  const colorMap: Record<string, string> = {
    red: "#ef4444",
    crimson: "#dc2626",
    blue: "#2563eb",
    sky: "#0284c7",
    green: "#16a34a",
    yellow: "#ca8a04",
    amber: "#d97706",
    orange: "#ea580c",
    purple: "#9333ea",
    violet: "#7c3aed",
    pink: "#db2777",
    black: "#111827",
    white: "#ffffff",
    gray: "#6b7280",
    grey: "#6b7280",
    赤: "#ef4444",
    青: "#2563eb",
    緑: "#16a34a",
    黄: "#ca8a04",
    黄色: "#ca8a04",
    橙: "#ea580c",
    オレンジ: "#ea580c",
    紫: "#9333ea",
    桃: "#db2777",
    ピンク: "#db2777",
    黒: "#111827",
    白: "#ffffff",
    灰: "#6b7280",
    灰色: "#6b7280",
  };

  return colorMap[lower] ?? colorMap[trimmed] ?? trimmed;
}

function compactEffectText(value: string, maxLength = 48): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}…`;
}

function buildAppliedEffectList(settings: EffectSettings): AppliedEffectListItem[] {
  const items: AppliedEffectListItem[] = [];

  if (settings.backgroundPreset) {
    items.push({
      title: "背景",
      detail: `背景プリセット: ${getBackgroundPresetLabel(settings.backgroundPreset)}`,
      deleteKey: "background",
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
      deleteKey: "background",
    });
  }

  for (const inlineMark of settings.inlineMarks) {
    const parts = [
      `対象: ${compactEffectText(inlineMark.targetText)}`,
      `種別: ${getInlineMarkKindLabel(inlineMark.kind)}`,
    ];

    if (inlineMark.value) {
      parts.push(`補助値: ${compactEffectText(inlineMark.value)}`);
    }

    items.push({
      title: "文字演出",
      detail: parts.join(" / "),
      deleteKey: "inline",
      effectId: inlineMark.id,
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
      deleteKey: "illustration",
      effectId: illustration.id,
    });
  }

  return items;
}

function AppliedEffectList({
  title,
  items,
  emptyText,
  onDeleteItem,
}: {
  title: string;
  items: AppliedEffectListItem[];
  emptyText: string;
  onDeleteItem?: (item: AppliedEffectListItem) => void;
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
              <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
                <p className="min-w-0 flex-1 text-sm leading-7 text-neutral-800">
                  {item.detail}
                </p>

                {onDeleteItem && item.deleteKey ? (
                  <button
                    type="button"
                    onClick={() => onDeleteItem(item)}
                    className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700 transition hover:bg-red-100"
                  >
                    削除
                  </button>
                ) : null}
              </div>
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
      className={[
        "rounded-full px-4 py-2 text-sm transition",
        active
          ? "bg-white text-black"
          : "text-neutral-700 hover:bg-white hover:text-black",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export default function EffectSettingsForm({
  scope,
  tableName,
  recordId,
  seriesId,
  title,
  backHref,
  workspaceHref,
  initialSettings,
  inheritedSettings = null,
  previewText,
  previewTextLabel,
  embedded = false,
}: EffectSettingsFormProps) {
  const firstInlineMark = initialSettings.inlineMarks[0] ?? null;
  const firstIllustration = initialSettings.illustrations[0] ?? null;

  const [previewMode, setPreviewMode] = useState<PreviewMode>("text");
  const [backgroundPreset, setBackgroundPreset] =
    useState<BackgroundPresetSelectValue>(
      (initialSettings.backgroundPreset ?? "") as BackgroundPresetSelectValue
    );
  const [fontFamily, setFontFamily] = useState(
    initialSettings.typography.fontFamily ?? ""
  );
  const [fontSize, setFontSize] = useState(
    initialSettings.typography.fontSize ?? ""
  );
  const [backgroundColor, setBackgroundColor] = useState(
    initialSettings.backgroundColor ?? ""
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
  const [selectedBodyText, setSelectedBodyText] = useState("");
  const [selectedCursorAnchorText, setSelectedCursorAnchorText] = useState("");
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
  const [illustrationUploadState, setIllustrationUploadState] =
    useState<UploadState>("idle");
  const [illustrationUploadMessage, setIllustrationUploadMessage] = useState("");
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
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [activeEffectPanel, setActiveEffectPanel] =
    useState<EffectPanelKey>(null);
  const [backgroundSelectorOpen, setBackgroundSelectorOpen] = useState(false);
  const [savedLocalSettings, setSavedLocalSettings] =
    useState<EffectSettings>(() => initialSettings);
  const [pendingPreviewSettings, setPendingPreviewSettings] =
    useState<EffectSettings>(() => emptyEffectSettings());

  useEffect(() => {
    function handleBodySelection(event: Event) {
      const customEvent = event as CustomEvent<{
        selectedText?: unknown;
        cursorAnchorText?: unknown;
      }>;

      const nextSelectedText =
        typeof customEvent.detail?.selectedText === "string"
          ? customEvent.detail.selectedText.trim()
          : "";

      const nextCursorAnchorText =
        typeof customEvent.detail?.cursorAnchorText === "string"
          ? customEvent.detail.cursorAnchorText.trim()
          : "";

      if (nextSelectedText) {
        setSelectedBodyText(nextSelectedText);
      }

      if (nextCursorAnchorText) {
        setSelectedCursorAnchorText(nextCursorAnchorText);
      }
    }

    window.addEventListener(
      "libread:episode-body-selection",
      handleBodySelection
    );

    return () => {
      window.removeEventListener(
        "libread:episode-body-selection",
        handleBodySelection
      );
    };
  }, []);

  function resetSaveUi() {
    setSaveState("idle");
    setErrorMessage("");
    setSuccessMessage("");
  }

  function buildDraftSettings(): EffectSettings {
    return parseEffectSettingsFromRow({
      version: 1,
      backgroundPreset: backgroundPreset || null,
      backgroundColor: backgroundColor.trim() || null,
      typography: {
        fontFamily: fontFamily.trim() || null,
        fontSize: fontSize.trim() || null,
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
              value: normalizeInlineValue(inlineKind, inlineValue),
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
      sceneCues: [],
      sentenceTimestamps: savedLocalSettings.sentenceTimestamps,
      notes: savedLocalSettings.notes ?? "",
    });
  }

  const savedPreviewSettings = mergeEffectSettings(
    inheritedSettings,
    savedLocalSettings
  );
  const effectivePreviewSettings = mergeEffectSettings(
    inheritedSettings,
    savedLocalSettings,
    pendingPreviewSettings
  );

  const previewBody = previewText;
  const previewCharacterCount = previewBody.length;
  const previewLineCount =
    previewBody.length === 0 ? 0 : previewBody.split(/\r?\n/).length;

  const hasUnsavedPreviewChanges =
    serializeEffectSettingsForSave(pendingPreviewSettings) !== null;

  const savedAppliedEffectItems = buildAppliedEffectList(savedPreviewSettings);
  const unsavedAppliedEffectItems = hasUnsavedPreviewChanges
    ? buildAppliedEffectList(pendingPreviewSettings)
    : [];

  function buildCurrentPanelDraftSettings(): EffectSettings | null {
    if (activeEffectPanel === "background") {
      if (!backgroundPreset) {
        return null;
      }

      return parseEffectSettingsFromRow({
        version: 1,
        backgroundPreset: backgroundPreset || null,
        backgroundColor: null,
        typography: {
          fontFamily: null,
          fontSize: null,
          textColor: null,
          bold: false,
          italic: false,
        },
        inlineMarks: [],
        illustrations: [],
        sceneCues: [],
        sentenceTimestamps: [],
        notes: "",
      });
    }

    if (activeEffectPanel === "inline") {
      const targetText = inlineTargetText.trim() || selectedBodyText.trim();

      if (!targetText) {
        return null;
      }

      return parseEffectSettingsFromRow({
        version: 1,
        backgroundPreset: null,
        backgroundColor: null,
        typography: {
          fontFamily: null,
          fontSize: null,
          textColor: null,
          bold: false,
          italic: false,
        },
        inlineMarks: [
          {
            id: `inline-${Date.now()}`,
            targetText,
            kind: inlineKind,
            value: normalizeInlineValue(inlineKind, inlineValue),
            note: "",
          },
        ],
        illustrations: [],
        sceneCues: [],
        sentenceTimestamps: [],
        notes: "",
      });
    }

    if (activeEffectPanel === "illustration") {
      if (!illustrationUrl.trim()) {
        return null;
      }

      return parseEffectSettingsFromRow({
        version: 1,
        backgroundPreset: null,
        backgroundColor: null,
        typography: {
          fontFamily: null,
          fontSize: null,
          textColor: null,
          bold: false,
          italic: false,
        },
        inlineMarks: [],
        illustrations: [
          {
            id: `illustration-${Date.now()}`,
            imageUrl: illustrationUrl.trim(),
            caption: illustrationCaption.trim(),
            placement: "scene_break",
            anchorText:
              illustrationAnchorText.trim() ||
              selectedCursorAnchorText.trim() ||
              null,
          },
        ],
        sceneCues: [],
        sentenceTimestamps: [],
        notes: "",
      });
    }

    return null;
  }

  function resetCurrentPanelFields() {
    if (activeEffectPanel === "background") {
      setBackgroundPreset("");
      setBackgroundColor("");
    }

    if (activeEffectPanel === "inline") {
      setInlineTargetText("");
      setInlineValue("");
      setInlineKind("ruby");
    }

    if (activeEffectPanel === "illustration") {
      setIllustrationUrl("");
      setIllustrationCaption("");
      setIllustrationPlacement("scene_break");
      setIllustrationAnchorText("");
      setIllustrationUploadState("idle");
      setIllustrationUploadMessage("");
    }
  }

  function handleApplyPreview() {
    const panelDraftSettings = buildCurrentPanelDraftSettings();

    if (!panelDraftSettings) {
      setErrorMessage("反映できる内容がない。");
      setSuccessMessage("");
      setSaveState("error");
      return;
    }

    const nextPendingSettings = mergeEffectSettings(
      pendingPreviewSettings,
      panelDraftSettings
    );
    const nextPreviewSettings = mergeEffectSettings(
      inheritedSettings,
      savedLocalSettings,
      nextPendingSettings
    );

    setPendingPreviewSettings(nextPendingSettings);
    setPreviewMode("preview");
    setBackgroundSelectorOpen(false);

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("libread:episode-effect-preview", {
          detail: {
            settings: nextPreviewSettings,
          },
        })
      );
    }

    resetCurrentPanelFields();
    setSuccessMessage("プレビューに反映した。保存はまだ。");
    setErrorMessage("");
    setSaveState("idle");
  }

  async function handleIllustrationFileChange(file: File | null) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setIllustrationUploadState("error");
      setIllustrationUploadMessage("画像ファイルを選んで。");
      return;
    }

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      setIllustrationUploadState("error");
      setIllustrationUploadMessage("画像は5MB以内にして。");
      return;
    }

    setIllustrationUploadState("uploading");
    setIllustrationUploadMessage("画像をアップロード中...");

    const extension = file.name.includes(".")
      ? file.name.split(".").pop()
      : "png";
    const safeName = buildSafeFileName(file.name.replace(/\.[^.]+$/, ""));
    const storagePath = [
      "effects",
      seriesId,
      recordId,
      `${Date.now()}-${safeName}.${extension}`,
    ].join("/");

    const { error } = await supabase.storage
      .from("illustrations")
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      setIllustrationUploadState("error");
      setIllustrationUploadMessage(error.message);
      return;
    }

    const { data } = supabase.storage
      .from("illustrations")
      .getPublicUrl(storagePath);

    setIllustrationUrl(data.publicUrl);
    setIllustrationUploadState("success");
    setIllustrationUploadMessage("画像を挿絵に設定した。");
    resetSaveUi();
  }

  function handleDeleteUnsavedEffect(item: AppliedEffectListItem) {
    setPendingPreviewSettings((current) => {
      const next = parseEffectSettingsFromRow({
        ...current,
        backgroundPreset:
          item.deleteKey === "background" ? null : current.backgroundPreset,
        backgroundColor:
          item.deleteKey === "background" ? null : current.backgroundColor,
        typography:
          item.deleteKey === "background"
            ? {
                fontFamily: null,
                fontSize: null,
                textColor: null,
                bold: false,
                italic: false,
              }
            : current.typography,
        inlineMarks:
          item.deleteKey === "inline"
            ? current.inlineMarks.filter(
                (inlineMark) => inlineMark.id !== item.effectId
              )
            : current.inlineMarks,
        illustrations:
          item.deleteKey === "illustration"
            ? current.illustrations.filter(
                (illustration) => illustration.id !== item.effectId
              )
            : current.illustrations,
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("libread:episode-effect-preview", {
            detail: {
              settings: mergeEffectSettings(
                inheritedSettings,
                savedLocalSettings,
                next
              ),
            },
          })
        );
      }

      return next;
    });

    resetSaveUi();
  }

  async function handleSave() {
    showGlobalLoadingFeedback("保存中...", 8000);
    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    const settingsToSave = mergeEffectSettings(
      savedLocalSettings,
      pendingPreviewSettings
    );

    const { error } = await supabase
      .from(tableName)
      .update({
        effect_settings: serializeEffectSettingsForSave(settingsToSave),
      })
      .eq("id", recordId);

    hideGlobalLoadingFeedback();

    if (error) {
      setSaveState("error");
      setErrorMessage(error.message);
      return;
    }

    setSavedLocalSettings(settingsToSave);
    setPendingPreviewSettings(emptyEffectSettings());

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("libread:episode-effect-preview", {
          detail: {
            settings: mergeEffectSettings(inheritedSettings, settingsToSave),
          },
        })
      );
    }

    setSaveState("success");
    setSuccessMessage(
      scope === "series" ? "作品演出を保存した。" : "話の演出を保存した。"
    );
  }

  const effectPanelItems: Array<{
    key: Exclude<EffectPanelKey, null>;
    label: string;
    value: string;
  }> = [
    {
      key: "background",
      label: "背景",
      value: backgroundPreset || "未設定",
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

  const panelBody = (
    <div className="grid gap-4 px-4 py-5 sm:px-5">
      {activeEffectPanel === "background" ? (
        <section className="rounded-[24px] border border-black/10 bg-neutral-50 p-4">
          <p className="text-xs tracking-[0.18em] text-neutral-500">
            BACKGROUND
          </p>
          <h3 className="mt-1 text-lg font-semibold text-black">背景</h3>

          <div className="mt-4 rounded-2xl border border-black/10 bg-white">
            <button
              type="button"
              onClick={() => setBackgroundSelectorOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="min-w-0">
                <p className="text-xs tracking-[0.16em] text-neutral-500">
                  現在の設定
                </p>
                <p className="mt-1 text-sm font-semibold text-black">
                  {getBackgroundPresetLabel(backgroundPreset)}
                </p>
              </div>

              <div
                className="h-12 w-20 shrink-0 rounded-xl border border-black/10 bg-cover bg-center"
                style={{
                  backgroundImage: backgroundPreset
                    ? `url(${getBackgroundPresetMeta(backgroundPreset)?.assetPath})`
                    : undefined,
                  backgroundColor: backgroundPreset ? undefined : "#f5f5f5",
                }}
              />
            </button>

            {backgroundSelectorOpen ? (
              <div className="grid gap-3 border-t border-black/10 p-4 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  type="button"
                  onClick={() => {
                    setBackgroundPreset("");
                    resetSaveUi();
                  }}
                  className={[
                    "rounded-2xl border px-4 py-3 text-left text-sm transition",
                    !backgroundPreset
                      ? "border-sky-300 bg-sky-50 ring-2 ring-sky-100"
                      : "border-black/10 bg-white hover:bg-neutral-50",
                  ].join(" ")}
                >
                  未設定
                </button>

                {EFFECT_BACKGROUND_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => {
                      setBackgroundPreset(
                        preset.value as BackgroundPresetSelectValue
                      );
                      resetSaveUi();
                    }}
                    className={[
                      "overflow-hidden rounded-2xl border bg-white text-left transition hover:bg-neutral-50",
                      backgroundPreset === preset.value
                        ? "border-sky-300 ring-2 ring-sky-100"
                        : "border-black/10",
                    ].join(" ")}
                  >
                    <div
                      className="h-20 w-full bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${preset.assetPath})`,
                      }}
                    />
                    <div className="px-4 py-3 text-sm font-semibold text-black">
                      {preset.label}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleApplyPreview}
              disabled={!backgroundPreset}
              className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-black transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-black/10 disabled:bg-neutral-100 disabled:text-neutral-400"
            >
              プレビューに反映
            </button>
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
            <div className="rounded-2xl border border-black/10 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs tracking-[0.16em] text-neutral-500">
                    SELECTED TEXT
                  </p>
                  <p className="mt-1 break-words text-sm text-neutral-700">
                    {selectedBodyText || "本文で文字を選択するとここに表示される。"}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={!selectedBodyText}
                  onClick={() => {
                    setInlineTargetText(selectedBodyText);
                    resetSaveUi();
                  }}
                  className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-black transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-black/10 disabled:bg-neutral-100 disabled:text-neutral-400"
                >
                  本文で選択中の文字を使う
                </button>
              </div>
            </div>

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
                      {getInlineMarkKindLabel(kind)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm text-neutral-700">補助値</span>
                <p className="text-xs leading-6 text-neutral-500">
                  {getInlineValueHelp(inlineKind)}
                </p>
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

            <div className="flex flex-wrap gap-2" data-inline-preview-apply-marker>
              <button
                type="button"
                onClick={handleApplyPreview}
                className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-black transition hover:bg-sky-100"
              >
                プレビューに反映
              </button>
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
            <div className="rounded-2xl border border-black/10 bg-white p-4">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-neutral-700">
                  画像ファイルを選ぶ
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    void handleIllustrationFileChange(
                      event.target.files?.[0] ?? null
                    );
                    event.currentTarget.value = "";
                  }}
                  className="block w-full cursor-pointer rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 file:mr-4 file:rounded-full file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                />
              </label>

              {illustrationUploadMessage ? (
                <p
                  className={[
                    "mt-3 rounded-2xl border px-4 py-3 text-sm leading-6",
                    illustrationUploadState === "error"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : illustrationUploadState === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-black/10 bg-neutral-50 text-neutral-600",
                  ].join(" ")}
                >
                  {illustrationUploadMessage}
                </p>
              ) : null}
            </div>

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

            <div className="rounded-2xl border border-black/10 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs tracking-[0.16em] text-neutral-500">
                    CURSOR POSITION
                  </p>
                  <p className="mt-1 break-words text-sm text-neutral-700">
                    {selectedCursorAnchorText || "本文編集欄にカーソルを置くと、ここに差し込み候補が出る。"}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={!selectedCursorAnchorText}
                  onClick={() => {
                    setIllustrationPlacement("scene_break");
                    setIllustrationAnchorText(selectedCursorAnchorText);
                    resetSaveUi();
                  }}
                  className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-black transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-black/10 disabled:bg-neutral-100 disabled:text-neutral-400"
                >
                  本文カーソル位置を使う
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleApplyPreview}
                disabled={!illustrationUrl}
                className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-black transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-black/10 disabled:bg-neutral-100 disabled:text-neutral-400"
              >
                プレビューに反映
              </button>
            </div>
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
            title="未保存"
            items={unsavedAppliedEffectItems}
            emptyText="未保存の変更はない。"
            onDeleteItem={handleDeleteUnsavedEffect}
          />

          <AppliedEffectList
            title="保存済"
            items={savedAppliedEffectItems}
            emptyText="保存済の演出はまだない。"
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
  );

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
          <div
            className={
              embedded
                ? "border-b border-black/10 px-4 py-4 sm:px-5"
                : "border-b border-black/10 px-5 py-6 sm:px-8"
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="text-xs tracking-[0.22em] text-neutral-500">
                  LIB READ EFFECT FOUNDATION
                </p>
                <h1 className={embedded ? "mt-1 text-xl font-semibold text-black" : "mt-3 text-3xl font-bold text-black"}>
                  {embedded ? "演出編集" : title}
                </h1>
              </div>

              <StatusBadge state={saveState} />
            </div>

            {embedded ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
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
            ) : (
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
            )}
          </div>

          {!embedded ? (
            <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5 m-5 sm:m-8">
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
                      className={[
                        "rounded-full border px-3 py-1 text-xs",
                        hasUnsavedPreviewChanges
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700",
                      ].join(" ")}
                    >
                      {hasUnsavedPreviewChanges
                        ? "未保存変更を反映中"
                        : "保存済み表示と一致"}
                    </span>
                  </div>
                </div>

                <div className="h-[520px] min-h-0 p-4 sm:p-6">
                  {previewMode === "text" ? (
                    <div className="h-full min-h-0 overflow-y-auto rounded-[28px] border border-black/10 bg-neutral-50 px-5 py-5">
                      {previewBody.trim().length > 0 ? (
                        <div className="whitespace-pre-wrap break-words text-sm leading-8 text-neutral-800">
                          {previewBody}
                        </div>
                      ) : (
                        <div className="text-sm leading-7 text-neutral-500">
                          まだ本文がない。
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
          ) : null}

          {panelBody}
        </section>
      </div>
    </main>
  );
}
