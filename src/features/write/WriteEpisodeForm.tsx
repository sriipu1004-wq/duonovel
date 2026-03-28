"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  getEpisodeBody,
  getEpisodeNumber,
  pickText,
  type EpisodeRow,
} from "@/features/write/writeShared";

type Mode = "create" | "edit";
type SaveState = "idle" | "saving" | "success" | "error";

type WriteEpisodeFormProps = {
  mode: Mode;
  seriesId: string;
  episode?: EpisodeRow | null;
  initialEpisodeNumber: number;
};

type EpisodePayload = {
  series_id: string;
  episode_number: number;
  title: string;
  body: string;
};

function createEpisodePayload(args: {
  seriesId: string;
  episodeNumber: number;
  title: string;
  body: string;
}): EpisodePayload {
  const { seriesId, episodeNumber, title, body } = args;

  return {
    series_id: seriesId,
    episode_number: episodeNumber,
    title,
    body,
  };
}

export default function WriteEpisodeForm({
  mode,
  seriesId,
  episode,
  initialEpisodeNumber,
}: WriteEpisodeFormProps) {
  const router = useRouter();

  const [episodeNumber, setEpisodeNumber] = useState(String(initialEpisodeNumber));
  const [title, setTitle] = useState(pickText(episode?.title));
  const [body, setBody] = useState(episode ? getEpisodeBody(episode) : "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const parsedEpisodeNumber = Number(episodeNumber);
  const safeEpisodeNumber =
    Number.isFinite(parsedEpisodeNumber) && parsedEpisodeNumber > 0
      ? parsedEpisodeNumber
      : null;

  const readHref = safeEpisodeNumber ? `/read/${seriesId}/${safeEpisodeNumber}` : null;
  const characterCount = body.length;
  const lineCount = body.length === 0 ? 0 : body.split(/\r?\n/).length;
  const currentEpisodeLabel =
    mode === "edit" && episode
      ? `第${getEpisodeNumber(episode)}話`
      : safeEpisodeNumber
        ? `第${safeEpisodeNumber}話`
        : "-";

  async function handleSubmit() {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();

    if (!safeEpisodeNumber) {
      setSaveState("error");
      setErrorMessage("話数は1以上の数字で入れる。");
      setSuccessMessage("");
      return;
    }

    if (!trimmedTitle) {
      setSaveState("error");
      setErrorMessage("話タイトルは必須。");
      setSuccessMessage("");
      return;
    }

    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    const payload = createEpisodePayload({
      seriesId,
      episodeNumber: safeEpisodeNumber,
      title: trimmedTitle,
      body: trimmedBody,
    });

    if (mode === "create") {
      const result = await supabase.from("episodes").insert(payload);

      if (!result.error) {
        setSaveState("success");
        setSuccessMessage("話を作成した。");
        router.push(`/write/series/${seriesId}`);
        router.refresh();
        return;
      }

      setSaveState("error");
      setErrorMessage(result.error.message);
      return;
    }

    const result = await supabase
      .from("episodes")
      .update(payload)
      .eq("id", episode?.id ?? "");

    if (!result.error) {
      setSaveState("success");
      setSuccessMessage("話を保存した。");
      router.refresh();
      return;
    }

    setSaveState("error");
    setErrorMessage(result.error.message);
  }

  const heading = mode === "create" ? "新しい話を追加する" : "話本文を編集する";
  const sub =
    mode === "create"
      ? "ここは作品ワークスペース配下の話作成ページ。話数、タイトル、本文を最小編集し、作成後は作品ワークスペースへ戻る。"
      : "ここは作品ワークスペース配下の本文編集ページ。本文そのものに集中し、作品全体の設定はワークスペース側で扱う。";

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-300">本文編集</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ EPISODE EDITOR
            </p>
            <h1 className="mt-3 text-3xl font-bold text-white">{heading}</h1>
            <p className="mt-3 text-sm leading-7 text-neutral-400">{sub}</p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/write/series/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                作品ワークスペースへ
              </Link>

              <Link
                href={`/manage/bgm/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                BGM / 演出詳細へ
              </Link>

              <Link
                href={`/works/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                作品ページを見る
              </Link>

              {mode === "edit" ? (
                <Link
                  href={`/write/series/${seriesId}/episodes/new`}
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                >
                  次の話を追加
                </Link>
              ) : null}

              {mode === "edit" && readHref ? (
                <Link
                  href={readHref}
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                >
                  読む画面を見る
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div className="grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm text-neutral-300">話数</span>
                  <input
                    value={episodeNumber}
                    onChange={(event) => {
                      setEpisodeNumber(event.target.value);
                      setSaveState("idle");
                      setErrorMessage("");
                      setSuccessMessage("");
                    }}
                    inputMode="numeric"
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm text-neutral-300">話タイトル</span>
                  <input
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      setSaveState("idle");
                      setErrorMessage("");
                      setSuccessMessage("");
                    }}
                    placeholder="第1話 など"
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm text-neutral-300">本文</span>
                  <textarea
                    value={body}
                    onChange={(event) => {
                      setBody(event.target.value);
                      setSaveState("idle");
                      setErrorMessage("");
                      setSuccessMessage("");
                    }}
                    rows={20}
                    placeholder="本文を入力"
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-8 text-white outline-none placeholder:text-neutral-500"
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
                      ? "作成してワークスペースへ戻る"
                      : "保存して続ける"}
                </button>

                <Link
                  href={`/write/series/${seriesId}`}
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                >
                  ワークスペースへ戻る
                </Link>
              </div>

              <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-4 text-sm leading-7 text-amber-100">
                今のDBでは公開 / 下書きの保存列がまだ無い。
                この画面では当面、話数・タイトル・本文だけを保存する。
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

            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">EPISODE</p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {currentEpisodeLabel}
                </p>
                <p className="mt-2 text-sm text-neutral-400">
                  現在編集中の話番号
                </p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">CHARACTERS</p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {characterCount}
                </p>
                <p className="mt-2 text-sm text-neutral-400">
                  本文文字数の目安
                </p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">LINES</p>
                <p className="mt-2 text-3xl font-semibold text-white">{lineCount}</p>
                <p className="mt-2 text-sm text-neutral-400">改行ベースの行数目安</p>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">NEXT ACTION</p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  {mode === "create" ? "まず話を作る" : "この話の修正を続ける"}
                </h2>
                <p className="mt-3 text-sm leading-7 text-neutral-400">
                  {mode === "create"
                    ? "まず作成して作品ワークスペースへ戻り、一覧から今の話を開いて続きを整える。"
                    : "本文とタイトルを保存しながら、ワークスペースと往復して整える。"}
                </p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">
                  BACK TO WORKSPACE
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  作品全体へ戻る
                </h2>
                <p className="mt-3 text-sm leading-7 text-neutral-400">
                  本文編集が終わったら、作品ワークスペースへ戻って次話、共通BGM、基本演出、タグ導線を確認する。
                </p>
                <div className="mt-4">
                  <Link
                    href={`/write/series/${seriesId}`}
                    className="inline-flex rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    作品ワークスペースへ
                  </Link>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">PUBLIC CHECK</p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  見え方を確認する
                </h2>
                <p className="mt-3 text-sm leading-7 text-neutral-400">
                  作品ページや読む画面で、保存した本文の見え方を確認する。
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href={`/works/${seriesId}`}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    作品ページ
                  </Link>

                  {mode === "edit" && readHref ? (
                    <Link
                      href={readHref}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                    >
                      読む画面
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>

            {mode === "edit" && episode ? (
              <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">QUICK LINKS</p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  このあとよく使う導線
                </h2>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href={`/write/series/${seriesId}/episodes/new`}
                    className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                  >
                    次の話を追加
                  </Link>
                  <Link
                    href={`/write/series/${seriesId}`}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    作品ワークスペースへ
                  </Link>
                  <Link
                    href={`/manage/bgm/${seriesId}`}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    BGM / 演出詳細へ
                  </Link>
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}