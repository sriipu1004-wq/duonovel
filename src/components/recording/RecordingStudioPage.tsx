"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { RecordingPermissionMode } from "@/lib/recording/recordingEntry";

type EpisodeItem = {
  id: string;
  episodeNumber: number;
  title: string;
  body: string;
  preview: string;
  readHref: string;
};

type RecordingStudioPageProps = {
  seriesId: string;
  seriesTitle: string;
  permissionMode: RecordingPermissionMode;
  worksHref: string;
  bgmHref: string;
  episodes: EpisodeItem[];
};

function getPermissionLabel(mode: RecordingPermissionMode): string {
  if (mode === "open") return "自由朗読";
  if (mode === "approval_required") return "承認制";
  return "朗読停止";
}

export function RecordingStudioPage({
  seriesId,
  seriesTitle,
  permissionMode,
  worksHref,
  bgmHref,
  episodes,
}: RecordingStudioPageProps) {
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>(
    episodes[0]?.id ?? ""
  );
  const [recordingTitle, setRecordingTitle] = useState<string>(`${seriesTitle} 朗読`);
  const [bgmMode, setBgmMode] = useState<"none" | "select-later">("none");
  const [showMicGuide, setShowMicGuide] = useState(true);
  const [showReadingMemo, setShowReadingMemo] = useState(true);
  const [memo, setMemo] = useState("");

  const selectedEpisode = useMemo(() => {
    return episodes.find((episode) => episode.id === selectedEpisodeId) ?? episodes[0];
  }, [episodes, selectedEpisodeId]);

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
      <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
        <p className="text-xs tracking-[0.18em] text-neutral-500">EPISODES</p>
        <h2 className="mt-2 text-xl font-semibold text-white">話を選ぶ</h2>
        <p className="mt-3 text-sm leading-7 text-neutral-400">
          route は series 単位のままにして、制作対象の話をここで切り替える。
        </p>

        <div className="mt-5 space-y-3">
          {episodes.length > 0 ? (
            episodes.map((episode) => {
              const isActive = episode.id === selectedEpisode?.id;

              return (
                <button
                  key={episode.id}
                  type="button"
                  onClick={() => setSelectedEpisodeId(episode.id)}
                  className={[
                    "w-full rounded-[24px] border p-4 text-left transition",
                    isActive
                      ? "border-emerald-400/30 bg-emerald-400/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white">
                      第{episode.episodeNumber}話
                    </span>
                    {isActive ? (
                      <span className="rounded-full bg-emerald-400 px-2.5 py-1 text-[11px] font-semibold text-black">
                        制作対象
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-2 text-sm font-medium text-neutral-200">
                    {episode.title}
                  </p>

                  <p className="mt-3 text-xs leading-6 text-neutral-500">
                    {episode.preview || "本文プレビューなし"}
                  </p>
                </button>
              );
            })
          ) : (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-neutral-500">
              まだ話データがないので、制作対象を選べない。
            </div>
          )}
        </div>

        <div className="mt-5 space-y-3 border-t border-white/10 pt-5">
          <Link
            href={worksHref}
            className="block rounded-full bg-white px-5 py-3 text-center text-sm font-semibold text-black transition hover:opacity-90"
          >
            作品ページへ戻る
          </Link>

          {selectedEpisode ? (
            <Link
              href={selectedEpisode.readHref}
              className="block rounded-full border border-white/10 bg-white/5 px-5 py-3 text-center text-sm text-neutral-200 transition hover:bg-white hover:text-black"
            >
              読む画面で確認する
            </Link>
          ) : null}

          <Link
            href={bgmHref}
            className="block rounded-full border border-white/10 bg-white/5 px-5 py-3 text-center text-sm text-neutral-200 transition hover:bg-white hover:text-black"
          >
            BGM素材ページを見る
          </Link>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
        <div className="flex flex-wrap gap-3">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-neutral-300">
            対象作品: {seriesTitle}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-neutral-300">
            許可状態: {getPermissionLabel(permissionMode)}
          </span>
          {selectedEpisode ? (
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-sm text-emerald-200">
              選択中: 第{selectedEpisode.episodeNumber}話
            </span>
          ) : null}
        </div>

        <div className="mt-5 rounded-[24px] border border-amber-400/20 bg-amber-400/10 p-5 text-sm leading-7 text-amber-100">
          <p className="text-xs tracking-[0.18em] text-amber-200">BEFORE RECORDING</p>
          <h2 className="mt-2 text-xl font-semibold text-white">録音開始前の最小案内</h2>
          <ul className="mt-3 space-y-1">
            <li>・今回は録音UIの外枠まで。保存やアップロード本体はまだ未実装</li>
            <li>・マイク使用前に雑音、通知音、周囲の環境音を確認する</li>
            <li>・本文と音声の自動同期や追尾は次段階で追加する</li>
          </ul>
        </div>

        <div className="mt-5">
          <p className="text-xs tracking-[0.18em] text-neutral-500">SCRIPT</p>
          <h2 className="mt-2 text-xl font-semibold text-white">本文を見ながら制作する</h2>
          <p className="mt-3 text-sm leading-7 text-neutral-400">
            将来ここに同期ポイント、読み位置マーカー、録音状態連動を足す。
          </p>
        </div>

        {selectedEpisode ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-neutral-500">EPISODE</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">
                    第{selectedEpisode.episodeNumber}話 {selectedEpisode.title}
                  </h3>
                </div>

                <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-neutral-400">
                  seriesId: {seriesId}
                </span>
              </div>
            </div>

            <div className="min-h-[520px] rounded-[24px] border border-white/10 bg-[#0f0f12] p-5">
              {selectedEpisode.body.trim() ? (
                <div className="whitespace-pre-wrap text-[15px] leading-8 text-neutral-200">
                  {selectedEpisode.body}
                </div>
              ) : (
                <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-neutral-500">
                  本文データが空なので、ここにはまだ表示できる内容がない。
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-neutral-500">
            制作対象の話を選ぶと、ここに本文が表示される。
          </div>
        )}
      </section>

      <aside className="space-y-6">
        <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
          <p className="text-xs tracking-[0.18em] text-neutral-500">SETTINGS</p>
          <h2 className="mt-2 text-xl font-semibold text-white">最小設定枠</h2>
          <p className="mt-3 text-sm leading-7 text-neutral-400">
            今回は保存先ではなく、設定の受け皿だけを先に置く。
          </p>

          <div className="mt-5 space-y-4">
            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">朗読タイトル</span>
              <input
                value={recordingTitle}
                onChange={(event) => setRecordingTitle(event.target.value)}
                placeholder="例: 第1話 しっとり読み"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">BGM設定</span>
              <select
                value={bgmMode}
                onChange={(event) =>
                  setBgmMode(event.target.value as "none" | "select-later")
                }
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="none" className="bg-[#111] text-white">
                  今は使わない
                </option>
                <option value="select-later" className="bg-[#111] text-white">
                  あとで /bgm から選ぶ
                </option>
              </select>
            </label>

            <label className="flex items-start gap-3 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
              <input
                type="checkbox"
                checked={showMicGuide}
                onChange={(event) => setShowMicGuide(event.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span className="text-sm leading-6 text-neutral-300">
                マイク確認案内を表示する
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
              <input
                type="checkbox"
                checked={showReadingMemo}
                onChange={(event) => setShowReadingMemo(event.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span className="text-sm leading-6 text-neutral-300">
                読み方メモの補助枠を使う
              </span>
            </label>

            {showReadingMemo ? (
              <label className="grid gap-2">
                <span className="text-sm text-neutral-300">制作メモ</span>
                <textarea
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  placeholder="読み分け、間の取り方、BGM候補など"
                  rows={6}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                />
              </label>
            ) : null}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
          <p className="text-xs tracking-[0.18em] text-neutral-500">RECORDING UI</p>
          <h2 className="mt-2 text-xl font-semibold text-white">録音UI外枠</h2>

          <div className="mt-5 space-y-3">
            <button
              type="button"
              disabled
              className="w-full cursor-not-allowed rounded-full bg-white px-5 py-3 text-sm font-semibold text-black opacity-50"
            >
              録音開始（次回実装）
            </button>

            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-neutral-500">
              将来ここに
              <br />
              ・録音開始 / 一時停止 / 再開
              <br />
              ・レベルメーター / 波形
              <br />
              ・本文同期ポイント
              <br />
              ・アップロード前チェック
              <br />
              を置く。
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
          <p className="text-xs tracking-[0.18em] text-neutral-500">SCOPE</p>
          <h2 className="mt-2 text-xl font-semibold text-white">今回の到達範囲</h2>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-neutral-400">
            <li>・作品と話の確認</li>
            <li>・本文を見ながら制作準備</li>
            <li>・録音開始前の最小案内</li>
            <li>・BGM素材ページへの導線</li>
            <li>・将来設定枠と録音UI差し込み土台</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}