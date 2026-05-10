"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import EffectPreviewRenderer from "@/features/effects/EffectPreviewRenderer";
import {
  EFFECT_BACKGROUND_PRESETS,
  EFFECT_ILLUSTRATION_PLACEMENTS,
  EFFECT_INLINE_MARK_KINDS,
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
type EffectPanelKey = "background" | "inline" | "illustration" | null;

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

  function buildDraftSettings(): EffectSettings {
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
      sceneCues: [],
      sentenceTimestamps: initialSettings.sentenceTimestamps,
      notes: initialSettings.notes ?? "",
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

  const hasUnsavedPreviewChanges =
    JSON.stringify(serializeEffectSettingsForSave(draftSettings)) !==
    JSON.stringify(serializeEffectSettingsForSave(initialSettings));

  const savedAppliedEffectItems = buildAppliedEffectList(savedPreviewSettings);
  const draftAppliedEffectItems = buildAppliedEffectList(effectivePreviewSettings);
  const unsavedAppliedEffectItems = hasUnsavedPreviewChanges
    ? draftAppliedEffectItems
    : [];

  async function handleSave() {
    showGlobalLoadingFeedback("保存中...", 8000);
    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from(tableName)
      .update({
        effect_settings: serializeEffectSettingsForSave(draftSettings),
      })
      .eq("id", recordId);

    hideGlobalLoadingFeedback();

    if (error) {
      setSaveState("error");
      setErrorMessage(error.message);
      return;
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

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm text-neutral-700">背景プリセット</span>
              <select
                value={backgroundPreset}
                onChange={(event) => {
                  setBackgroundPreset(
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
