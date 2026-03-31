"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import BgmLibraryPicker from "@/features/bgm/BgmLibraryPicker";
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

type EpisodeItem = {
  id: string;
  episodeNumber: number;
  title: string;
  bgmTitle: string;
  bgmAudioPath: string;
  bgmSettings: BgmSettings;
  selectedTrackId: string;
};

type BgmManageFormProps = {
  seriesId: string;
  seriesTitle: string;
  initialSeriesBgmTitle: string;
  initialSeriesBgmAudioPath: string;
  initialSeriesBgmSettings: BgmSettings;
  episodes: Array<{
    id: string;
    episodeNumber: number;
    title: string;
    bgmTitle: string;
    bgmAudioPath: string;
    bgmSettings: BgmSettings;
  }>;
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

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-neutral-300">
          予約場面切り替え {value.sceneCues.length}件
        </span>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-neutral-400">
          今回は保存枠のみ
        </span>
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
  episodes,
  libraryTracks,
}: BgmManageFormProps) {
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
  const [seriesSaveState, setSeriesSaveState] = useState<SaveState>("idle");
  const [seriesError, setSeriesError] = useState("");

  const [episodeRows, setEpisodeRows] = useState<EpisodeItem[]>(() =>
    episodes.map((episode) => ({
      ...episode,
      selectedTrackId: resolveBgmLibraryTrackId(libraryTracks, {
        title: episode.bgmTitle,
        audioPath: episode.bgmAudioPath,
      }),
    }))
  );
  const [episodeSaveStates, setEpisodeSaveStates] = useState<
    Record<string, SaveState>
  >({});
  const [episodeErrors, setEpisodeErrors] = useState<Record<string, string>>({});

  function resetSeriesSaveUi() {
    setSeriesSaveState("idle");
    setSeriesError("");
  }

  function handleSelectSeriesTrack(nextTrackId: string) {
    const nextTrack = findBgmLibraryTrack(libraryTracks, nextTrackId);

    setSeriesSelectedTrackId(nextTrackId);
    setSeriesBgmTitle(nextTrack?.title ?? "");
    setSeriesBgmAudioPath(nextTrack?.audioPath ?? "");
    resetSeriesSaveUi();
  }

  function handleClearSeriesTrack() {
    setSeriesSelectedTrackId("");
    setSeriesBgmTitle("");
    setSeriesBgmAudioPath("");
    resetSeriesSaveUi();
  }

  async function handleSaveSeries() {
    setSeriesSaveState("saving");
    setSeriesError("");

    const { error } = await supabase
      .from("series")
      .update({
        bgm_title: seriesBgmTitle.trim() || null,
        bgm_audio_path: seriesBgmAudioPath.trim() || null,
        bgm_settings: serializeBgmSettingsForSave(seriesBgmSettings),
      })
      .eq("id", seriesId);

    if (error) {
      setSeriesSaveState("error");
      setSeriesError(error.message);
      return;
    }

    setSeriesSaveState("success");
  }

  function updateEpisodeRow(
    episodeId: string,
    updater: (current: EpisodeItem) => EpisodeItem
  ) {
    setEpisodeRows((prev) =>
      prev.map((episode) =>
        episode.id === episodeId ? updater(episode) : episode
      )
    );
    setEpisodeSaveStates((prev) => ({
      ...prev,
      [episodeId]: "idle",
    }));
    setEpisodeErrors((prev) => ({
      ...prev,
      [episodeId]: "",
    }));
  }

  function handleSelectEpisodeTrack(episodeId: string, nextTrackId: string) {
    const nextTrack = findBgmLibraryTrack(libraryTracks, nextTrackId);

    updateEpisodeRow(episodeId, (current) => ({
      ...current,
      selectedTrackId: nextTrackId,
      bgmTitle: nextTrack?.title ?? "",
      bgmAudioPath: nextTrack?.audioPath ?? "",
    }));
  }

  async function handleSaveEpisode(episodeId: string) {
    const target = episodeRows.find((episode) => episode.id === episodeId);
    if (!target) return;

    setEpisodeSaveStates((prev) => ({
      ...prev,
      [episodeId]: "saving",
    }));
    setEpisodeErrors((prev) => ({
      ...prev,
      [episodeId]: "",
    }));

    const { error } = await supabase
      .from("episodes")
      .update({
        bgm_title: target.bgmTitle.trim() || null,
        bgm_audio_path: target.bgmAudioPath.trim() || null,
        bgm_settings: serializeBgmSettingsForSave(target.bgmSettings),
      })
      .eq("id", episodeId);

    if (error) {
      setEpisodeSaveStates((prev) => ({
        ...prev,
        [episodeId]: "error",
      }));
      setEpisodeErrors((prev) => ({
        ...prev,
        [episodeId]: error.message,
      }));
      return;
    }

    setEpisodeSaveStates((prev) => ({
      ...prev,
      [episodeId]: "success",
    }));
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-300">作品BGM管理</span>
        </div>

        <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ WORKSPACE BGM
            </p>
            <h1 className="mt-3 text-3xl font-bold text-white">{seriesTitle}</h1>
            <p className="mt-3 text-sm leading-7 text-neutral-400">
              作品ワークスペースから入るBGM管理ページ。
              作品共通BGMと各話BGMに加えて、フェード設定の最小土台をここで持つ。
              話側が空欄なら作品共通設定へフォールバックする。
            </p>

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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    SERIES BGM
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
                    作品共通BGM
                  </h2>
                </div>
                <StatusBadge state={seriesSaveState} />
              </div>

              <div className="mt-5 grid gap-4">
                <BgmLibraryPicker
                  tracks={libraryTracks}
                  selectedTrackId={seriesSelectedTrackId}
                  onSelectTrack={handleSelectSeriesTrack}
                  onClear={handleClearSeriesTrack}
                  label="作品共通BGM素材"
                  placeholder="作品共通BGMを選ぶ"
                  helperText="BGM素材ライブラリから選ぶ。今はサイト用意素材のみを使う前提。"
                  clearLabel="作品共通BGMを解除"
                  fallbackTitle={seriesBgmTitle}
                  fallbackAudioPath={seriesBgmAudioPath}
                />

                <BgmSettingFields
                  value={seriesBgmSettings}
                  onChange={(next) => {
                    setSeriesBgmSettings(next);
                    resetSeriesSaveUi();
                  }}
                  fallbackText="話ごとのフェードが空欄なら、この作品共通フェードを使う。"
                />

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSaveSeries}
                    className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                  >
                    作品共通BGMを保存
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleClearSeriesTrack();
                      setSeriesBgmSettings(emptyBgmSettings());
                      setSeriesSaveState("idle");
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white/10"
                  >
                    BGMとフェードを初期化
                  </button>
                </div>

                {seriesError ? (
                  <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                    {seriesError}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div>
                <p className="text-xs tracking-[0.18em] text-neutral-500">
                  EPISODE BGM
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  話ごとのBGM
                </h2>
              </div>

              <div className="mt-5 grid gap-4">
                {episodeRows.map((episode) => (
                  <div
                    key={episode.id}
                    className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-neutral-500">
                          第{episode.episodeNumber}話
                        </p>
                        <h3 className="mt-1 text-lg font-semibold text-white">
                          {episode.title}
                        </h3>
                      </div>

                      <StatusBadge
                        state={episodeSaveStates[episode.id] ?? "idle"}
                      />
                    </div>

                    <div className="mt-4 grid gap-4">
                      <BgmLibraryPicker
                        tracks={libraryTracks}
                        selectedTrackId={episode.selectedTrackId}
                        onSelectTrack={(nextTrackId) =>
                          handleSelectEpisodeTrack(episode.id, nextTrackId)
                        }
                        onClear={() =>
                          updateEpisodeRow(episode.id, (current) => ({
                            ...current,
                            selectedTrackId: "",
                            bgmTitle: "",
                            bgmAudioPath: "",
                          }))
                        }
                        label="話ごとのBGM素材"
                        placeholder="空なら作品共通BGM"
                        helperText="ここが未選択なら、作品共通BGMへフォールバックする。"
                        clearLabel="話ごとBGMを解除"
                        fallbackTitle={episode.bgmTitle}
                        fallbackAudioPath={episode.bgmAudioPath}
                      />

                      <BgmSettingFields
                        value={episode.bgmSettings}
                        onChange={(next) =>
                          updateEpisodeRow(episode.id, (current) => ({
                            ...current,
                            bgmSettings: next,
                          }))
                        }
                        fallbackText="ここが空欄なら、作品共通のフェード設定を使う。"
                      />

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => handleSaveEpisode(episode.id)}
                          className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                        >
                          この話のBGMを保存
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            updateEpisodeRow(episode.id, (current) => ({
                              ...current,
                              selectedTrackId: "",
                              bgmTitle: "",
                              bgmAudioPath: "",
                              bgmSettings: emptyBgmSettings(),
                            }))
                          }
                          className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white/10"
                        >
                          話ごとBGMとフェードを解除
                        </button>
                      </div>

                      {episodeErrors[episode.id] ? (
                        <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                          {episodeErrors[episode.id]}
                        </div>
                      ) : null}

                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-neutral-400">
                        話ごとBGMと話ごとフェードが空欄なら、作品共通BGMと作品共通フェードへフォールバックする。
                      </div>
                    </div>
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