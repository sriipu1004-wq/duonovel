"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import BgmLibraryPicker from "@/features/bgm/BgmLibraryPicker";
import EffectPreviewRenderer from "@/features/effects/EffectPreviewRenderer";
import {
  clampBgmSeconds,
  emptyBgmSettings,
  serializeBgmSettingsForSave,
  type BgmSettings,
} from "@/lib/bgm/bgmSettings";
import {
  findBgmLibraryTrack,
  resolveBgmLibraryTrackId,
  type BgmLibraryTrack,
} from "@/lib/bgm/bgmLibrary";
import {
  EFFECT_BACKGROUND_PRESETS,
  parseEffectSettingsFromRow,
  serializeEffectSettingsForSave,
  type EffectBackgroundPreset,
  type EffectSettings,
} from "@/lib/effects/effectSettings";

type PreviewMode = "text" | "preview";
type BackgroundPresetSelectValue =
  "" | Exclude<EffectBackgroundPreset, null>;

type PreviewEpisodeItem = {
  id: string;
  episodeNumber: number;
  title: string;
  body: string;
};

type BgmManageFormProps = {
  seriesId: string;
  seriesTitle: string;
  initialSeriesBgmTitle: string;
  initialSeriesBgmAudioPath: string;
  initialSeriesBgmSettings: BgmSettings;
  initialSeriesEffectSettings: EffectSettings;
  previewEpisodes: PreviewEpisodeItem[];
  libraryTracks: BgmLibraryTrack[];
};

type SaveState = "idle" | "saving" | "success" | "error";

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

function BgmSettingFields({
  value,
  onChange,
  fallbackText,
}: {
  value: BgmSettings;
  onChange: (next: BgmSettings) => void;
  fallbackText: string;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-sm text-neutral-300">フェードイン秒数</span>
          <input
            type="number"
            min={0}
            max={20}
            step={0.1}
            value={value.fadeInSeconds ?? ""}
            onChange={(event) =>
              onChange({
                ...value,
                fadeInSeconds: clampBgmSeconds(event.target.value),
              })
            }
            placeholder="例: 1.5"
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm text-neutral-300">フェードアウト秒数</span>
          <input
            type="number"
            min={0}
            max={20}
            step={0.1}
            value={value.fadeOutSeconds ?? ""}
            onChange={(event) =>
              onChange({
                ...value,
                fadeOutSeconds: clampBgmSeconds(event.target.value),
              })
            }
            placeholder="例: 2.0"
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
          />
        </label>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
        今回の読む画面で反映するのは
        <br />
        ・再生開始時のフェードイン
        <br />
        ・一時停止 / 終了時のフェードアウト
        <br />
        まで。
        <br />
        {fallbackText}
      </div>
    </div>
  );
}

export default function BgmManageForm({
  seriesId,
  seriesTitle,
  initialSeriesBgmTitle,
  initialSeriesBgmAudioPath,
  initialSeriesBgmSettings,
  initialSeriesEffectSettings,
  previewEpisodes,
  libraryTracks,
}: BgmManageFormProps) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>("text");
  const [selectedPreviewEpisodeId, setSelectedPreviewEpisodeId] = useState(
    previewEpisodes[0]?.id ?? ""
  );

  const [seriesBgmTitle, setSeriesBgmTitle] = useState(initialSeriesBgmTitle);
  const [seriesBgmAudioPath, setSeriesBgmAudioPath] = useState(
    initialSeriesBgmAudioPath
  );
  const [seriesSelectedTrackId, setSeriesSelectedTrackId] = useState(() =>
    resolveBgmLibraryTrackId(libraryTracks, {
      title: initialSeriesBgmTitle,
      audioPath: initialSeriesBgmAudioPath,
    })
  );
  const [seriesBgmSettings, setSeriesBgmSettings] = useState<BgmSettings>(
    initialSeriesBgmSettings
  );

  const [defaultBackgroundPreset, setDefaultBackgroundPreset] =
    useState<BackgroundPresetSelectValue>(
      (initialSeriesEffectSettings.backgroundPreset ??
        "") as BackgroundPresetSelectValue
    );
  const [defaultFontFamily, setDefaultFontFamily] = useState(
    initialSeriesEffectSettings.typography.fontFamily ?? ""
  );
  const [defaultTextColor, setDefaultTextColor] = useState(
    initialSeriesEffectSettings.typography.textColor ?? ""
  );

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const selectedPreviewEpisode =
    previewEpisodes.find((episode) => episode.id === selectedPreviewEpisodeId) ??
    previewEpisodes[0] ??
    null;

  const previewBody = selectedPreviewEpisode?.body ?? "";
  const previewTextLabel = selectedPreviewEpisode
    ? `${selectedPreviewEpisode.title} の本文`
    : "本文未設定";

  function resetSaveUi() {
    setSaveState("idle");
    setErrorMessage("");
    setSuccessMessage("");
  }

  function handleSelectSeriesTrack(nextTrackId: string) {
    const nextTrack = findBgmLibraryTrack(libraryTracks, nextTrackId);

    setSeriesSelectedTrackId(nextTrackId);
    setSeriesBgmTitle(nextTrack?.title ?? "");
    setSeriesBgmAudioPath(nextTrack?.audioPath ?? "");
    resetSaveUi();
  }

  function handleClearSeriesTrack() {
    setSeriesSelectedTrackId("");
    setSeriesBgmTitle("");
    setSeriesBgmAudioPath("");
    resetSaveUi();
  }

  const previewSettings = useMemo(() => {
    const next = {
      ...initialSeriesEffectSettings,
      backgroundPreset: defaultBackgroundPreset || null,
      typography: {
        ...initialSeriesEffectSettings.typography,
        fontFamily: defaultFontFamily.trim() || null,
        textColor: defaultTextColor.trim() || null,
      },
    };

    return parseEffectSettingsFromRow(next);
  }, [
    defaultBackgroundPreset,
    defaultFontFamily,
    defaultTextColor,
    initialSeriesEffectSettings,
  ]);

  async function handleSave() {
    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    const effectSettingsToSave = parseEffectSettingsFromRow({
      ...initialSeriesEffectSettings,
      backgroundPreset: defaultBackgroundPreset || null,
      typography: {
        ...initialSeriesEffectSettings.typography,
        fontFamily: defaultFontFamily.trim() || null,
        textColor: defaultTextColor.trim() || null,
      },
    });

    const { error } = await supabase
      .from("series")
      .update({
        bgm_title: seriesBgmTitle.trim() || null,
        bgm_audio_path: seriesBgmAudioPath.trim() || null,
        bgm_settings: serializeBgmSettingsForSave(seriesBgmSettings),
        effect_settings: serializeEffectSettingsForSave(effectSettingsToSave),
      })
      .eq("id", seriesId);

    if (error) {
      setSaveState("error");
      setErrorMessage(error.message);
      return;
    }

    setSaveState("success");
    setSuccessMessage("既定演出設定を保存した。");
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-300">既定演出設定ページ</span>
        </div>

        <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="text-xs tracking-[0.22em] text-neutral-500">
                  LIB READ DEFAULT EFFECT SETTINGS
                </p>
                <h1 className="mt-3 text-3xl font-bold text-white">{seriesTitle}</h1>
                <p className="mt-3 text-sm leading-7 text-neutral-400">
                  作品共通の既定演出をここで決める。
                  共通BGM、既定フォント、既定文字色、既定背景を作品単位で持ち、
                  プレビュー本文には任意のエピソードを読み込んで見え方を確認する。
                </p>
              </div>

              <StatusBadge state={saveState} />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/write"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                作品ワークスペース一覧へ
              </Link>

              <Link
                href={`/write/series/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                この作品のワークスペースへ
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
                    プレビュー元のエピソードを切り替えて、本文とプレビューを同じ位置で確認する。
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

              <div className="mt-4 grid gap-4">
                <label className="grid gap-2 max-w-md">
                  <span className="text-sm text-neutral-300">プレビュー元エピソード</span>
                  <select
                    value={selectedPreviewEpisodeId}
                    onChange={(event) => setSelectedPreviewEpisodeId(event.target.value)}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                  >
                    {previewEpisodes.map((episode) => (
                      <option key={episode.id} value={episode.id}>
                        第{episode.episodeNumber}話 / {episode.title}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03]">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
                    <div>
                      <p className="text-xs tracking-[0.18em] text-neutral-500">
                        PREVIEW SOURCE
                      </p>
                      <p className="mt-2 text-sm text-neutral-200">
                        {previewTextLabel}
                      </p>
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
                            このエピソードには本文が無い。
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-full min-h-0 overflow-y-auto pr-1">
                        <EffectPreviewRenderer
                          body={previewBody}
                          settings={previewSettings}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                DEFAULT SETTINGS
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                既定演出設定
              </h2>

              <div className="mt-5 grid gap-5">
                <BgmLibraryPicker
                  tracks={libraryTracks}
                  selectedTrackId={seriesSelectedTrackId}
                  onSelectTrack={handleSelectSeriesTrack}
                  onClear={handleClearSeriesTrack}
                  label="共通BGM"
                  placeholder="作品共通BGMを選ぶ"
                  helperText="お気に入りした素材が上に出る。ここで選んだBGMが、各話BGM未設定時の既定になる。"
                  clearLabel="共通BGMを解除"
                  fallbackTitle={seriesBgmTitle}
                  fallbackAudioPath={seriesBgmAudioPath}
                />

                <BgmSettingFields
                  value={seriesBgmSettings}
                  onChange={(next) => {
                    setSeriesBgmSettings(next);
                    resetSaveUi();
                  }}
                  fallbackText="各話側のフェードが空欄なら、ここで保存した作品共通フェードを使う。"
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm text-neutral-300">既定フォント</span>
                    <input
                      value={defaultFontFamily}
                      onChange={(event) => {
                        setDefaultFontFamily(event.target.value);
                        resetSaveUi();
                      }}
                      placeholder="例: serif / 'Yu Mincho'"
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm text-neutral-300">既定文字色</span>
                    <input
                      value={defaultTextColor}
                      onChange={(event) => {
                        setDefaultTextColor(event.target.value);
                        resetSaveUi();
                      }}
                      placeholder="例: #f5f5f5"
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                    />
                  </label>

                  <label className="grid gap-2 md:col-span-2">
                    <span className="text-sm text-neutral-300">既定背景</span>
                    <select
                      value={defaultBackgroundPreset}
                      onChange={(event) => {
                        setDefaultBackgroundPreset(
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
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                  >
                    既定演出設定を保存
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleClearSeriesTrack();
                      setSeriesBgmSettings(emptyBgmSettings());
                      setDefaultFontFamily("");
                      setDefaultTextColor("");
                      setDefaultBackgroundPreset("");
                      resetSaveUi();
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white/10"
                  >
                    共通設定を初期化
                  </button>
                </div>

                {errorMessage ? (
                  <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                    {errorMessage}
                  </div>
                ) : null}

                {successMessage ? (
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                    {successMessage}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                EPISODE ENTRY
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                各話BGMの入口
              </h2>
              <p className="mt-2 text-sm leading-7 text-neutral-400">
                各話BGMは、ここで直接編集するのではなく各話演出編集ページから扱う。
              </p>

              <div className="mt-5 grid gap-3">
                {previewEpisodes.map((episode) => (
                  <div
                    key={episode.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4"
                  >
                    <div>
                      <p className="text-sm text-neutral-500">
                        第{episode.episodeNumber}話
                      </p>
                      <p className="mt-1 text-base font-semibold text-white">
                        {episode.title}
                      </p>
                    </div>

                    <Link
                      href={`/write/series/${seriesId}/episodes/${episode.id}/effects`}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                    >
                      この話の演出・BGMへ
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}