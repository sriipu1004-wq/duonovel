"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SeriesGenresManageFormProps = {
  seriesId: string;
  seriesTitle: string;
  initialGenres: string[];
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

function toEditorValue(genres: string[]): string {
  return genres.join("\n");
}

function parseGenreInput(value: string): string[] {
  return value
    .split(/[\n,、]/)
    .map((genre) => genre.trim())
    .filter((genre) => genre.length > 0);
}

export default function SeriesGenresManageForm({
  seriesId,
  seriesTitle,
  initialGenres,
}: SeriesGenresManageFormProps) {
  const [editorValue, setEditorValue] = useState(toEditorValue(initialGenres));
  const [savedGenres, setSavedGenres] = useState(initialGenres);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const parsedGenres = useMemo(() => parseGenreInput(editorValue), [editorValue]);

  function handleChange(value: string) {
    setEditorValue(value);
    setSaveState("idle");
    setErrorMessage("");
    setSuccessMessage("");
  }

  function handleReset() {
    setEditorValue(toEditorValue(savedGenres));
    setSaveState("idle");
    setErrorMessage("");
    setSuccessMessage("");
  }

  function handleClear() {
    setEditorValue("");
    setSaveState("idle");
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handleSave() {
    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    const nextGenres = parseGenreInput(editorValue);

    const { error } = await supabase
      .from("series")
      .update({
        genres: nextGenres,
      })
      .eq("id", seriesId);

    if (error) {
      setSaveState("error");
      setErrorMessage(error.message);
      return;
    }

    setSavedGenres(nextGenres);
    setEditorValue(toEditorValue(nextGenres));
    setSaveState("success");
    setSuccessMessage(
      nextGenres.length > 0
        ? `作品ジャンルを保存した。現在 ${nextGenres.length} 件。`
        : "作品ジャンルを空配列として保存した。"
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-300">作品ジャンル管理</span>
        </div>

        <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ MANAGE
            </p>

            <h1 className="mt-3 text-3xl font-bold text-white">{seriesTitle}</h1>

            <p className="mt-3 text-sm leading-7 text-neutral-400">
              作品ジャンルの canonical source は <code>series.genres</code>。
              今回の保存先もここだけに固定する。<br />
              保存時の整形は、前後空白除去と空文字除外だけに留める。
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/manage"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                管理トップへ
              </Link>

              <Link
                href={`/manage/series/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                管理ハブへ戻る
              </Link>

              <Link
                href={`/manage/tags/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                タグ管理へ
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
                    SERIES GENRES
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
                    作品ジャンル編集
                  </h2>
                </div>

                <StatusBadge state={saveState} />
              </div>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm text-neutral-300">ジャンル入力欄</span>

                  <textarea
                    value={editorValue}
                    onChange={(event) => handleChange(event.target.value)}
                    rows={8}
                    placeholder={"1行1ジャンル推奨\n例:\nファンタジー\n恋愛\nミステリー"}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-white outline-none placeholder:text-neutral-500"
                  />
                </label>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
                  改行・カンマ・読点で区切って保存できる。<br />
                  今回やる整形は、trim と空文字除外のみ。<br />
                  重複除去、小文字統一、slug化、保存先追加はやらない。
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                  >
                    作品ジャンルを保存
                  </button>

                  <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white/10"
                  >
                    直前保存状態へ戻す
                  </button>

                  <button
                    type="button"
                    onClick={handleClear}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white/10"
                  >
                    入力クリア
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
                PREVIEW
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                保存前プレビュー
              </h2>

              <p className="mt-3 text-sm leading-7 text-neutral-400">
                このプレビューが、そのまま <code>series.genres</code> に保存される形。
              </p>

              <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap gap-2">
                  {parsedGenres.length > 0 ? (
                    parsedGenres.map((genre, index) => (
                      <span
                        key={`${genre}-${index}`}
                        className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-neutral-200"
                      >
                        {genre}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-neutral-500">
                      ジャンル未設定
                    </span>
                  )}
                </div>

                <p className="mt-4 text-xs leading-6 text-neutral-500">
                  件数: {parsedGenres.length} 件
                </p>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                CANONICAL SOURCE
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                今回の保存先
              </h2>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
                保存先は <code>series.genres</code> のみ。<br />
                <code>series.tags</code> とは別 canonical として扱う。
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}