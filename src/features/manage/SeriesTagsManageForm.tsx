"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SeriesTagsManageFormProps = {
  seriesId: string;
  seriesTitle: string;
  initialTags: string[];
};

type SaveState = "idle" | "saving" | "success" | "error";

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

function toEditorValue(tags: string[]): string {
  return tags.join("\n");
}

function parseTagInput(value: string): string[] {
  return value
    .split(/[\n,、]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export default function SeriesTagsManageForm({
  seriesId,
  seriesTitle,
  initialTags,
}: SeriesTagsManageFormProps) {
  const [editorValue, setEditorValue] = useState(toEditorValue(initialTags));
  const [savedTags, setSavedTags] = useState(initialTags);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const parsedTags = useMemo(() => parseTagInput(editorValue), [editorValue]);

  function handleChange(value: string) {
    setEditorValue(value);
    setSaveState("idle");
    setErrorMessage("");
    setSuccessMessage("");
  }

  function handleReset() {
    setEditorValue(toEditorValue(savedTags));
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

    const nextTags = parseTagInput(editorValue);

    const { error } = await supabase
      .from("series")
      .update({
        tags: nextTags,
      })
      .eq("id", seriesId);

    if (error) {
      setSaveState("error");
      setErrorMessage(error.message);
      return;
    }

    setSavedTags(nextTags);
    setEditorValue(toEditorValue(nextTags));
    setSaveState("success");
    setSuccessMessage(
      nextTags.length > 0
        ? `作品タグを保存した。現在 ${nextTags.length} 件。`
        : "作品タグを空配列として保存した。"
    );
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-700">作品タグ管理</span>
        </div>

        <section className="rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ MANAGE
            </p>

            <h1 className="mt-3 text-3xl font-bold text-black">{seriesTitle}</h1>

            <p className="mt-3 text-sm leading-7 text-neutral-600">
              作品タグの canonical source は <code>series.tags</code>。
              今回の保存先もここだけに固定する。<br />
              保存時の整形は、前後空白除去と空文字除外だけに留める。
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/manage"
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
              >
                管理トップへ
              </Link>

              <Link
                href={`/manage/series/${seriesId}`}
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
              >
                管理ハブへ戻る
              </Link>

              <Link
                href={`/manage/bgm/${seriesId}`}
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
              >
                BGM管理へ
              </Link>

              <Link
                href={`/works/${seriesId}`}
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
              >
                作品ページを見る
              </Link>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    SERIES TAGS
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-black">
                    作品タグ編集
                  </h2>
                </div>

                <StatusBadge state={saveState} />
              </div>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm text-neutral-700">タグ入力欄</span>

                  <textarea
                    value={editorValue}
                    onChange={(event) => handleChange(event.target.value)}
                    rows={8}
                    placeholder={"1行1タグ推奨\n例:\n異世界\n恋愛\nダークファンタジー"}
                    className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-7 text-black outline-none placeholder:text-neutral-500"
                  />
                </label>

                <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-7 text-neutral-600">
                  改行・カンマ・読点で区切って保存できる。<br />
                  今回やる整形は、trim と空文字除外のみ。<br />
                  重複除去、小文字統一、slug化、保存先追加はやらない。
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                  >
                    作品タグを保存
                  </button>

                  <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
                  >
                    直前保存状態へ戻す
                  </button>

                  <button
                    type="button"
                    onClick={handleClear}
                    className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
                  >
                    入力クリア
                  </button>
                </div>

                {errorMessage ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMessage}
                  </div>
                ) : null}

                {successMessage ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {successMessage}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                PREVIEW
              </p>
              <h2 className="mt-2 text-xl font-semibold text-black">
                保存前プレビュー
              </h2>

              <p className="mt-3 text-sm leading-7 text-neutral-600">
                このプレビューが、そのまま <code>series.tags</code> に保存される形。
              </p>

              <div className="mt-5 rounded-[24px] border border-black/10 bg-white p-4">
                <div className="flex flex-wrap gap-2">
                  {parsedTags.length > 0 ? (
                    parsedTags.map((tag, index) => (
                      <span
                        key={`${tag}-${index}`}
                        className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-sm text-neutral-800"
                      >
                        #{tag}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-sm text-neutral-500">
                      タグ未設定
                    </span>
                  )}
                </div>

                <p className="mt-4 text-xs leading-6 text-neutral-500">
                  件数: {parsedTags.length} 件
                </p>
              </div>
            </section>

            <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                CANONICAL SOURCE
              </p>
              <h2 className="mt-2 text-xl font-semibold text-black">
                今回の保存先
              </h2>

              <div className="mt-4 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-7 text-neutral-600">
                保存先は <code>series.tags</code> のみ。<br />
                <code>recordings.tags</code> は朗読側文脈で扱い、今回の作品タグ保存先には使わない。
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}