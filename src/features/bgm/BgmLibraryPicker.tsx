"use client";

import Link from "next/link";
import {
  findBgmLibraryTrack,
  type BgmLibraryTrack,
} from "@/lib/bgm/bgmLibrary";

type BgmLibraryPickerProps = {
  tracks: BgmLibraryTrack[];
  selectedTrackId: string;
  onSelectTrack: (trackId: string) => void;
  onClear?: () => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
  clearLabel?: string;
  fallbackTitle?: string;
  fallbackAudioPath?: string;
};

export default function BgmLibraryPicker({
  tracks,
  selectedTrackId,
  onSelectTrack,
  onClear,
  label = "BGM素材",
  placeholder = "BGMを選ぶ",
  helperText = "",
  clearLabel = "BGMを解除",
  fallbackTitle = "",
  fallbackAudioPath = "",
}: BgmLibraryPickerProps) {
  const selectedTrack = findBgmLibraryTrack(tracks, selectedTrackId);
  const hasFallbackValue =
    fallbackTitle.trim().length > 0 || fallbackAudioPath.trim().length > 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="grid min-w-[260px] flex-1 gap-2">
          <span className="text-sm text-neutral-300">{label}</span>
          <select
            value={selectedTrackId}
            onChange={(event) => onSelectTrack(event.target.value)}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="" className="bg-[#111] text-white">
              {placeholder}
            </option>

            {tracks.map((track) => (
              <option key={track.id} value={track.id} className="bg-[#111] text-white">
                {track.title} / {track.mood} / {track.useCase}
                {track.isActive ? "" : " / 非公開"}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/bgm#operator-bgm-library"
            target="_blank"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
          >
            素材ページを見る
          </Link>

          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white/10"
            >
              {clearLabel}
            </button>
          ) : null}
        </div>
      </div>

      {helperText ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
          {helperText}
        </div>
      ) : null}

      {selectedTrack ? (
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-white">選択中の素材</p>
              <span
                className={`rounded-full border px-3 py-1 text-xs ${
                  selectedTrack.isActive
                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                    : "border-amber-400/20 bg-amber-400/10 text-amber-200"
                }`}
              >
                {selectedTrack.isActive ? "公開中" : "非公開"}
              </span>
            </div>

            <p className="mt-2 text-base font-semibold text-white">
              {selectedTrack.title}
            </p>
            <p className="mt-2 text-sm leading-7 text-neutral-400">
              {selectedTrack.description || "説明なし"}
            </p>

            <audio
              controls
              preload="none"
              src={selectedTrack.audioPath}
              className="mt-4 w-full"
            >
              お使いのブラウザは audio 要素に対応していません。
            </audio>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-neutral-300">
            <p className="text-sm font-semibold text-white">保存される値</p>
            <dl className="mt-3 grid gap-2">
              <div>
                <dt className="text-neutral-500">タイトル</dt>
                <dd>{selectedTrack.title}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">パス</dt>
                <dd className="break-all text-neutral-200">{selectedTrack.audioPath}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">公開状態</dt>
                <dd>{selectedTrack.isActive ? "公開" : "非公開"}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">並び順</dt>
                <dd>{selectedTrack.sortOrder}</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : hasFallbackValue ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-4 text-sm leading-7 text-amber-100">
          現在保存されているBGM値はライブラリ素材と一致していない。
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-7 text-neutral-400">
          まだ素材は選ばれていない。
        </div>
      )}
    </div>
  );
}