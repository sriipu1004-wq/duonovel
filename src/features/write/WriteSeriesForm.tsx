"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  pickText,
  type SeriesRow,
  type EpisodeRow,
  getEpisodeNumber,
  isPublishedEpisode,
  sortEpisodes,
} from "@/features/write/writeShared";

type Mode = "create" | "edit";

type WriteSeriesFormProps = {
  mode: Mode;
  currentUserId: string;
  series?: SeriesRow | null;
  episodes?: EpisodeRow[];
};

type SaveState = "idle" | "saving" | "success" | "error";

function buildSummaryValue(summary: string) {
  const trimmed = summary.trim();
  return [
    { summary: trimmed, description: trimmed, catch_copy: trimmed },
    { summary: trimmed },
    { description: trimmed },
    { catch_copy: trimmed },
  ];
}

function getTitle(series?: SeriesRow | null): string {
  return pickText(series?.title);
}

function getSummary(series?: SeriesRow | null): string {
  return pickText(series?.summary, series?.description, series?.catch_copy);
}

export default function WriteSeriesForm({
  mode,
  currentUserId,
  series,
  episodes = [],
}: WriteSeriesFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(getTitle(series));
  const [summary, setSummary] = useState(getSummary(series));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const sortedEpisodes = sortEpisodes(episodes);
  const publishedCount = sortedEpisodes.filter(isPublishedEpisode).length;
  const draftCount = sortedEpisodes.length - publishedCount;

  async function handleCreate() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setSaveState("error");
      setErrorMessage("タイトルは必須。");
      setSuccessMessage("");
      return;
    }

    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    const summaryVariants = buildSummaryValue(summary);
    const payloads = summaryVariants.map((summaryFields) => ({
      title: trimmedTitle,
      author_id: currentUserId,
      ...summaryFields,
    }));

    payloads.push({
      title: trimmedTitle,
      author_id: currentUserId,
    });

    let lastError = "作品作成に失敗した。";

    for (const payload of payloads) {
      const result = await supabase
        .from("series")
        .insert(payload)
        .select("id")
        .single();

      if (!result.error && result.data?.id) {
        setSaveState("success");
        setSuccessMessage("作品を作成した。");
        router.push(`/write/series/${result.data.id}`);
        router.refresh();
        return;
      }

      if (result.error) {
        lastError = result.error.message;
      }
    }

    setSaveState("error");
    setErrorMessage(lastError);
  }

  async function handleUpdate() {
    if (!series?.id) {
      setSaveState("error");
      setErrorMessage("作品IDが取れない。");
      setSuccessMessage("");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setSaveState("error");
      setErrorMessage("タイトルは必須。");
      setSuccessMessage("");
      return;
    }

    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    const summaryVariants = buildSummaryValue(summary);
    const payloads = summaryVariants.map((summaryFields) => ({
      title: trimmedTitle,
      ...summaryFields,
    }));

    payloads.push({
      title: trimmedTitle,
    });

    let lastError = "作品更新に失敗した。";

    for (const payload of payloads) {
      const result = await supabase.from("series").update(payload).eq("id", series.id);

      if (!result.error) {
        setSaveState("success");
        setSuccessMessage("作品情報を保存した。");
        router.refresh();
        return;
      }

      lastError = result.error.message;
    }

    setSaveState("error");
    setErrorMessage(lastError);
  }

  async function handleSubmit() {
    if (mode === "create") {
      await handleCreate();
      return;
    }

    await handleUpdate();
  }

  const heading = mode === "create" ? "新しい作品を作る" : "作品を編集する";
  const sub =
    mode === "create"
      ? "まずはタイトルとあらすじだけで作品を作成する。詳細設定は管理画面側に分離する。"
      : "ここでは本文執筆導線の起点として、作品タイトルとあらすじを最小編集する。";

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-300">執筆ページ</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">LIB READ WRITE</p>
            <h1 className="mt-3 text-3xl font-bold text-white">{heading}</h1>
            <p className="mt-3 text-sm leading-7 text-neutral-400">{sub}</p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/write"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                執筆トップへ
              </Link>

              <Link
                href="/manage"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                管理トップへ
              </Link>

              {series?.id ? (
                <>
                  <Link
                    href={`/manage/series/${series.id}`}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    作品管理へ
                  </Link>

                  <Link
                    href={`/works/${series.id}`}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    作品ページを見る
                  </Link>
                </>
              ) : null}
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div className="grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm text-neutral-300">作品タイトル</span>
                  <input
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      setSaveState("idle");
                      setErrorMessage("");
                      setSuccessMessage("");
                    }}
                    placeholder="作品タイトル"
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm text-neutral-300">あらすじ</span>
                  <textarea
                    value={summary}
                    onChange={(event) => {
                      setSummary(event.target.value);
                      setSaveState("idle");
                      setErrorMessage("");
                      setSuccessMessage("");
                    }}
                    rows={8}
                    placeholder="作品の概要を書く"
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-white outline-none placeholder:text-neutral-500"
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                >
                  {saveState === "saving"
                    ? "保存中..."
                    : mode === "create"
                      ? "作品を作成"
                      : "作品情報を保存"}
                </button>

                {series?.id ? (
                  <Link
                    href={`/write/series/${series.id}/episodes/new`}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    新しい話を追加
                  </Link>
                ) : null}
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

            {series?.id ? (
              <section className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">EPISODES</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{sortedEpisodes.length}話</p>
                  <p className="mt-2 text-sm text-neutral-400">この作品に紐づく話数の合計</p>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">PUBLISHED</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{publishedCount}話</p>
                  <p className="mt-2 text-sm text-neutral-400">公開状態として読める話数</p>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">DRAFT</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{draftCount}話</p>
                  <p className="mt-2 text-sm text-neutral-400">まだ公開していない話数</p>
                </div>
              </section>
            ) : null}

            {series?.id ? (
              <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs tracking-[0.18em] text-neutral-500">EPISODE LIST</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">この作品の話一覧</h2>
                  </div>

                  <Link
                    href={`/write/series/${series.id}/episodes/new`}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    話を追加
                  </Link>
                </div>

                <div className="mt-4 grid gap-3">
                  {sortedEpisodes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-neutral-400">
                      まだ話はない。まずは1話目を作る。
                    </div>
                  ) : (
                    sortedEpisodes.map((episode) => {
                      const episodeNumber = getEpisodeNumber(episode);
                      const label = isPublishedEpisode(episode) ? "公開" : "下書き";

                      return (
                        <div
                          key={episode.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4"
                        >
                          <div>
                            <p className="text-sm text-neutral-500">第{episodeNumber}話</p>
                            <p className="mt-1 text-base font-semibold text-white">
                              {pickText(episode.title) || `第${episodeNumber}話`}
                            </p>
                            <p className="mt-1 text-sm text-neutral-400">{label}</p>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <Link
                              href={`/write/series/${series.id}/episodes/${episode.id}`}
                              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                            >
                              編集
                            </Link>

                            {episodeNumber > 0 ? (
                              <Link
                                href={`/read/${series.id}/${episodeNumber}`}
                                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                              >
                                読む
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
