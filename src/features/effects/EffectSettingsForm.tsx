"use client";

import Link from "next/link";
import { useState } from "react";
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
  type EffectSettings,
  type EffectTextAnimationKind,
} from "@/lib/effects/effectSettings";
import {
  findBgmLibraryTrack,
  resolveBgmLibraryTrackId,
  type BgmLibraryTrack,
} from "@/lib/bgm/bgmLibrary";
import BgmLibraryPicker from "@/features/bgm/BgmLibraryPicker";

type BackgroundPresetSelectValue =
  "" | Exclude<EffectBackgroundPreset, null>;

type TextAnimationSelectValue =
  "" | Exclude<EffectTextAnimationKind, null>;

type PreviewMode = "text" | "preview";
type SaveState = "idle" | "saving" | "success" | "error";

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
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-500">
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-neutral-300">
      {label}: <span className="font-semibold text-white">{value}</span>
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
          : "text-neutral-300 hover:bg-white/10 hover:text-white"
      }`}
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
  subtitle,
  backHref,
  workspaceHref,
  initialSettings,
  inheritedSettings = null,
  previewText,
  previewTextLabel,
  libraryTracks,
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

  const [notes, setNotes] = useState(initialSettings.notes ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  function resetSaveUi() {
    setSaveState("idle");
    setErrorMessage("");
    setSuccessMessage("");
  }

  function buildDraftSettings(): EffectSettings {
    const selectedTrack = findBgmLibraryTrack(libraryTracks, sceneTrackId);

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

  async function handleSave() {
    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from(tableName)
      .update({
        effect_settings: serializeEffectSettingsForSave(draftSettings),
      })
      .eq("id", recordId);

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

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-300">演出編集</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="text-xs tracking-[0.22em] text-neutral-500">
                  LIB READ EFFECT FOUNDATION
                </p>
                <h1 className="mt-3 text-3xl font-bold text-white">{title}</h1>
                <p className="mt-3 text-sm leading-7 text-neutral-400">
                  {subtitle}
                </p>
              </div>

              <StatusBadge state={saveState} />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={workspaceHref}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                作品ワークスペースへ
              </Link>

              <Link
                href={backHref}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                直前の編集画面へ
              </Link>

              <Link
                href={`/works/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                作品ページを見る
              </Link>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
<section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div className="max-w-3xl">
      <p className="text-xs tracking-[0.18em] text-neutral-500">
        BODY / PREVIEW
      </p>
      <h2 className="mt-2 text-xl font-semibold text-white">
        本文とプレビュー
      </h2>
      <p className="mt-2 text-sm leading-7 text-neutral-400">
        本文表示と演出付きプレビューを同じ位置で切り替える。
        プレビューは保存済み設定だけでなく、今フォームに入れている未保存変更も反映する。
      </p>
    </div>

    <div className="inline-flex rounded-full border border-white/10 bg-black/20 p-1">
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

  <div className="mt-4 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03]">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
      <div>
        <p className="text-xs tracking-[0.18em] text-neutral-500">
          PREVIEW SOURCE
        </p>
        <p className="mt-2 text-sm text-neutral-200">
          {previewTextLabel}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-neutral-300">
          {previewCharacterCount}文字
        </span>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-neutral-300">
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

    <div className="h-[560px] min-h-0 p-4 sm:p-6">
      {previewMode === "text" ? (
        <div className="h-full min-h-0 overflow-y-auto rounded-[28px] border border-white/10 bg-black/20 px-5 py-5">
          {previewBody.trim().length > 0 ? (
            <div className="whitespace-pre-wrap break-words text-sm leading-8 text-neutral-200">
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
                <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    BACKGROUND / TYPOGRAPHY
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
                    背景と既定文字演出
                  </h2>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm text-neutral-300">背景プリセット</span>
                      <select
                        value={backgroundPreset}
                        onChange={(event) => {
                          setBackgroundPreset(
                            event.target.value as BackgroundPresetSelectValue
                          );
                          resetSaveUi();
                        }}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
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
                      <span className="text-sm text-neutral-300">既定フォント名</span>
                      <input
                        value={fontFamily}
                        onChange={(event) => {
                          setFontFamily(event.target.value);
                          resetSaveUi();
                        }}
                        placeholder="例: serif / 'Yu Mincho' / sans-serif"
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm text-neutral-300">既定文字色</span>
                      <input
                        value={textColor}
                        onChange={(event) => {
                          setTextColor(event.target.value);
                          resetSaveUi();
                        }}
                        placeholder="例: #f5f5f5"
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                      />
                    </label>

                    <div className="grid gap-3">
                      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <input
                          type="checkbox"
                          checked={defaultBold}
                          onChange={(event) => {
                            setDefaultBold(event.target.checked);
                            resetSaveUi();
                          }}
                        />
                        <span className="text-sm text-neutral-300">既定で太字</span>
                      </label>

                      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <input
                          type="checkbox"
                          checked={defaultItalic}
                          onChange={(event) => {
                            setDefaultItalic(event.target.checked);
                            resetSaveUi();
                          }}
                        />
                        <span className="text-sm text-neutral-300">既定で斜体</span>
                      </label>
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    INLINE EFFECT
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
                    文字演出の最小サンプル
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-neutral-400">
                    今回のMVPでは、対象文字列ベースで 1件ずつ見た目確認できる形を先に通す。
                    ルビ、色、太字、斜体、点強調、線強調はここで試し見できる。
                  </p>

                  <div className="mt-4 grid gap-4">
                    <label className="grid gap-2">
                      <span className="text-sm text-neutral-300">対象文字列</span>
                      <input
                        value={inlineTargetText}
                        onChange={(event) => {
                          setInlineTargetText(event.target.value);
                          resetSaveUi();
                        }}
                        placeholder="本文中にある文字列を入れる"
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                      />
                    </label>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-300">演出種別</span>
                        <select
                          value={inlineKind}
                          onChange={(event) => {
                            setInlineKind(event.target.value as EffectInlineMarkKind);
                            resetSaveUi();
                          }}
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                        >
                          {EFFECT_INLINE_MARK_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {kind}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-300">補助値</span>
                        <input
                          value={inlineValue}
                          onChange={(event) => {
                            setInlineValue(event.target.value);
                            resetSaveUi();
                          }}
                          placeholder="ruby なら ふりがな / color なら 色コード"
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                        />
                      </label>
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    ILLUSTRATION
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
                    挿絵の最小土台
                  </h2>

                  <div className="mt-4 grid gap-4">
                    <label className="grid gap-2">
                      <span className="text-sm text-neutral-300">画像URL</span>
                      <input
                        value={illustrationUrl}
                        onChange={(event) => {
                          setIllustrationUrl(event.target.value);
                          resetSaveUi();
                        }}
                        placeholder="https://..."
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                      />
                    </label>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-300">キャプション</span>
                        <input
                          value={illustrationCaption}
                          onChange={(event) => {
                            setIllustrationCaption(event.target.value);
                            resetSaveUi();
                          }}
                          placeholder="例: 夜明けの街並み"
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-300">配置</span>
                        <select
                          value={illustrationPlacement}
                          onChange={(event) => {
                            setIllustrationPlacement(
                              event.target.value as EffectIllustrationPlacement
                            );
                            resetSaveUi();
                          }}
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                        >
                          {EFFECT_ILLUSTRATION_PLACEMENTS.map((placement) => (
                            <option key={placement} value={placement}>
                              {placement}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    SCENE CUE
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
                    場面転換 cue の最小土台
                  </h2>

                  <div className="mt-4 grid gap-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-300">cue 名</span>
                        <input
                          value={sceneLabel}
                          onChange={(event) => {
                            setSceneLabel(event.target.value);
                            resetSaveUi();
                          }}
                          placeholder="例: 夜明けへ切り替え"
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-300">発火文字列</span>
                        <input
                          value={sceneTriggerText}
                          onChange={(event) => {
                            setSceneTriggerText(event.target.value);
                            resetSaveUi();
                          }}
                          placeholder="例: 夜が明けた"
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                        />
                      </label>
                    </div>

                    <BgmLibraryPicker
                      tracks={libraryTracks}
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
                      helperText="今回は cue の保存とプレビュー要約だけ先に通す。再生制御本体は後段。"
                      clearLabel="場面転換BGMを解除"
                      fallbackTitle=""
                      fallbackAudioPath=""
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-300">切替後背景</span>
                        <select
                          value={sceneBackgroundPreset}
                          onChange={(event) => {
                            setSceneBackgroundPreset(
                              event.target.value as BackgroundPresetSelectValue
                            );
                            resetSaveUi();
                          }}
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
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
                        <span className="text-sm text-neutral-300">切替後文字動作</span>
                        <select
                          value={sceneTextAnimation}
                          onChange={(event) => {
                            setSceneTextAnimation(
                              event.target.value as TextAnimationSelectValue
                            );
                            resetSaveUi();
                          }}
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
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

                <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    NOTES
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
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
                    className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-white outline-none placeholder:text-neutral-500"
                  />
                </section>
              </div>

              <div className="grid gap-6">
                <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    SAVE TARGET
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
                    今回の保存先
                  </h2>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
                    保存先は <code>{tableName}.effect_settings</code>。<br />
                    作品共通演出は series、話単位演出は episodes に分ける。<br />
                    プレビューでは保存済み設定に加えて、今フォームに入れている未保存変更もその場で見られる。
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSave}
                      className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
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

                <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    CURRENT SUMMARY
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
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
                  </div>
                </section>

                <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    PREVIEW COMPOSITION
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
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

                <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    CONNECTION
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
                    接続方針
                  </h2>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
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