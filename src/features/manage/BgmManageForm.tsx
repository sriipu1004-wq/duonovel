"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type EpisodeItem = {
  id: string;
  episodeNumber: number;
  title: string;
  bgmTitle: string;
  bgmAudioPath: string;
};

type BgmManageFormProps = {
  seriesId: string;
  seriesTitle: string;
  initialSeriesBgmTitle: string;
  initialSeriesBgmAudioPath: string;
  episodes: EpisodeItem[];
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

export default function BgmManageForm({
  seriesId,
  seriesTitle,
  initialSeriesBgmTitle,
  initialSeriesBgmAudioPath,
  episodes,
}: BgmManageFormProps) {
  const [seriesBgmTitle, setSeriesBgmTitle] = useState(initialSeriesBgmTitle);
  const [seriesBgmAudioPath, setSeriesBgmAudioPath] = useState(
    initialSeriesBgmAudioPath
  );
  const [seriesSaveState, setSeriesSaveState] = useState<SaveState>("idle");
  const [seriesError, setSeriesError] = useState("");

  const [episodeRows, setEpisodeRows] = useState(episodes);
  const [episodeSaveStates, setEpisodeSaveStates] = useState<
    Record<string, SaveState>
  >({});
  const [episodeErrors, setEpisodeErrors] = useState<Record<string, string>>({});

  async function handleSaveSeries() {
    setSeriesSaveState("saving");
    setSeriesError("");

    const { error } = await supabase
      .from("series")
      .update({
        bgm_title: seriesBgmTitle.trim() || null,
        bgm_audio_path: seriesBgmAudioPath.trim() || null,
      })
      .eq("id", seriesId);

    if (error) {
      setSeriesSaveState("error");
      setSeriesError(error.message);
      return;
    }

    setSeriesSaveState("success");
  }

  function updateEpisodeField(
    episodeId: string,
    field: "bgmTitle" | "bgmAudioPath",
    value: string
  ) {
    setEpisodeRows((prev) =>
      prev.map((episode) =>
        episode.id === episodeId ? { ...episode, [field]: value } : episode
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
          <span className="text-neutral-300">BGM管理</span>
        </div>

        <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              DUONOVEL MANAGE
            </p>
            <h1 className="mt-3 text-3xl font-bold text-white">{seriesTitle}</h1>
            <p className="mt-3 text-sm leading-7 text-neutral-400">
              作品共通BGMと、各話BGMをここで管理する。
              話ごとBGMが空欄なら、作品共通BGMが使われる。
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/manage/tags/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                作品タグ管理へ
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
                <label className="grid gap-2">
                  <span className="text-sm text-neutral-300">BGMタイトル</span>
                  <input
                    value={seriesBgmTitle}
                    onChange={(event) => {
                      setSeriesBgmTitle(event.target.value);
                      setSeriesSaveState("idle");
                    }}
                    placeholder="例: 作品共通BGM"
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm text-neutral-300">BGMパス</span>
                  <input
                    value={seriesBgmAudioPath}
                    onChange={(event) => {
                      setSeriesBgmAudioPath(event.target.value);
                      setSeriesSaveState("idle");
                    }}
                    placeholder="/test-audio/demo-bgm.mp3"
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                  />
                </label>

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
                      setSeriesBgmTitle("");
                      setSeriesBgmAudioPath("");
                      setSeriesSaveState("idle");
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white/10"
                  >
                    入力クリア
                  </button>
                </div>

                {seriesError ? (
                  <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                    {seriesError}
                  </div>
                ) : null}

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
                  例:
                  <br />
                  タイトル → 作品共通BGM
                  <br />
                  パス → /test-audio/demo-bgm.mp3
                </div>
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
                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-300">BGMタイトル</span>
                        <input
                          value={episode.bgmTitle}
                          onChange={(event) =>
                            updateEpisodeField(
                              episode.id,
                              "bgmTitle",
                              event.target.value
                            )
                          }
                          placeholder="空なら作品共通BGM"
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm text-neutral-300">BGMパス</span>
                        <input
                          value={episode.bgmAudioPath}
                          onChange={(event) =>
                            updateEpisodeField(
                              episode.id,
                              "bgmAudioPath",
                              event.target.value
                            )
                          }
                          placeholder="空なら作品共通BGM"
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                        />
                      </label>

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
                          onClick={() => {
                            updateEpisodeField(episode.id, "bgmTitle", "");
                            updateEpisodeField(episode.id, "bgmAudioPath", "");
                          }}
                          className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white/10"
                        >
                          話ごとBGMを解除
                        </button>
                      </div>

                      {episodeErrors[episode.id] ? (
                        <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                          {episodeErrors[episode.id]}
                        </div>
                      ) : null}

                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-neutral-400">
                        話ごとBGMが空欄なら、作品共通BGMへフォールバックする。
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