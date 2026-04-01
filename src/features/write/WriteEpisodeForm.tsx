"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  getEpisodeBody,
  getEpisodeNumber,
  isPublishedEpisode,
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
  is_published: boolean;
};

function createEpisodePayload(args: {
  seriesId: string;
  episodeNumber: number;
  title: string;
  body: string;
  isPublished: boolean;
}): EpisodePayload {
  const { seriesId, episodeNumber, title, body, isPublished } = args;

  return {
    series_id: seriesId,
    episode_number: episodeNumber,
    title,
    body,
    is_published: isPublished,
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
const [isPublished, setIsPublished] = useState(
  mode === "edit" && episode ? isPublishedEpisode(episode) : false
);
const [saveState, setSaveState] = useState<SaveState>("idle");
const [errorMessage, setErrorMessage] = useState("");
const [successMessage, setSuccessMessage] = useState("");

const parsedEpisodeNumber = Number(episodeNumber);
const safeEpisodeNumber =
  Number.isFinite(parsedEpisodeNumber) && parsedEpisodeNumber > 0
    ? parsedEpisodeNumber
    : null;

const readHref =
  safeEpisodeNumber && isPublished
    ? `/read/${seriesId}/${safeEpisodeNumber}`
    : null;
  const characterCount = body.length;
  const lineCount = body.length === 0 ? 0 : body.split(/\r?\n/).length;
  const currentEpisodeLabel =
    mode === "edit" && episode
      ? `第${getEpisodeNumber(episode)}話`
      : safeEpisodeNumber
        ? `第${safeEpisodeNumber}話`
        : "-";

  const isSaving = saveState === "saving";

  function resetNotice() {
    setSaveState("idle");
    setErrorMessage("");
    setSuccessMessage("");
  }

async function handleSubmit(destination: "workspace" | "effects" = "workspace") {
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
  isPublished,
});

  if (mode === "create") {
    const result = await supabase
      .from("episodes")
      .insert(payload)
      .select("id")
      .single();

    if (!result.error && result.data?.id) {
      setSaveState("success");
      setSuccessMessage("話を作成した。");
      router.push(
        destination === "effects"
          ? `/write/series/${seriesId}/episodes/${result.data.id}/effects`
          : `/write/series/${seriesId}`
      );
      router.refresh();
      return;
    }

    setSaveState("error");
    setErrorMessage(result.error?.message ?? "話作成に失敗した。");
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
      ? "話数、タイトル、本文だけを最小で作成する。作成後は作品ワークスペースへ戻る。"
      : "本文そのものに集中する画面。作品全体の設定は作品ワークスペース側で扱う。";

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div className="mb-3 text-sm text-neutral-500">
          <span className="text-neutral-300">本文編集</span>
        </div>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-5 sm:px-8 sm:py-6">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ EPISODE EDITOR
            </p>
            <h1 className="mt-3 text-3xl font-bold text-white">{heading}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-400">{sub}</p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/write/series/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                作品ワークスペースへ
              </Link>

              <Link
                href={`/works/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                作品ページを見る
              </Link>

{mode === "edit" && episode ? (
  <Link
    href={`/write/series/${seriesId}/episodes/${episode.id}/effects`}
    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
  >
    この話の演出・BGMへ
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

              {mode === "edit" ? (
                <Link
                  href={`/write/series/${seriesId}/episodes/new`}
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                >
                  次の話を追加
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="border-b border-white/10 bg-black/20 lg:border-b-0 lg:border-r lg:border-white/10">
              <div className="flex h-full flex-col gap-5 p-5 sm:p-6 lg:min-h-0 lg:overflow-y-auto">
                <div className="grid gap-4">
                  <label className="grid gap-2">
                    <span className="text-sm text-neutral-300">話数</span>
                    <input
                      value={episodeNumber}
                      onChange={(event) => {
                        setEpisodeNumber(event.target.value);
                        resetNotice();
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
                        resetNotice();
                      }}
                      placeholder="第1話 など"
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                    />
                  </label>

<label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
  <input
    type="checkbox"
    checked={isPublished}
    onChange={(event) => {
      setIsPublished(event.target.checked);
      resetNotice();
    }}
    className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5"
  />
  <div>
    <p className="text-sm font-semibold text-white">公開する</p>
    <p className="mt-2 text-sm leading-7 text-neutral-400">
      ON の時は作品ページ、読む画面、朗読制作ページに出す。
      OFF の時は下書きとして作者ワークスペースにだけ残す。
    </p>
  </div>
</label>

                </div>

<div className="flex flex-wrap gap-3">
  <button
    type="button"
    onClick={() => handleSubmit("workspace")}
    disabled={isSaving}
    className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
  >
    {isSaving
      ? "保存中..."
      : mode === "create"
        ? "作成してワークスペースへ戻る"
        : "保存して続ける"}
  </button>

{mode === "create" ? (
  <button
    type="button"
    onClick={() => handleSubmit("effects")}
    disabled={isSaving}
    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
  >
    作成して演出・BGMへ
  </button>
) : null}

  <Link
    href={`/write/series/${seriesId}`}
    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
  >
    ワークスペースへ戻る
  </Link>
</div>

<div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-4 text-sm leading-7 text-amber-100">
  公開 canonical は <code>episodes.is_published</code>。
  OFF の時は下書きとして保存し、作品ページや読む画面には出さない。
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

                <section className="grid grid-cols-3 gap-3 lg:grid-cols-1">
                  <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                    <p className="text-xs tracking-[0.18em] text-neutral-500">EPISODE</p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {currentEpisodeLabel}
                    </p>
                    <p className="mt-2 text-xs leading-6 text-neutral-400">
                      編集中の話番号
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                    <p className="text-xs tracking-[0.18em] text-neutral-500">CHARACTERS</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{characterCount}</p>
                    <p className="mt-2 text-xs leading-6 text-neutral-400">
                      本文文字数の目安
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                    <p className="text-xs tracking-[0.18em] text-neutral-500">LINES</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{lineCount}</p>
                    <p className="mt-2 text-xs leading-6 text-neutral-400">
                      改行ベースの行数目安
                    </p>
                  </div>
                </section>

                <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    EDITOR STRUCTURE
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-white">
                    本文フレーム中心に寄せた
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-neutral-400">
                    左側は話数、タイトル、保存などの固定寄り情報。
                    右側は本文入力を優先し、長文でも本文だけを扱いやすくした。
                  </p>
                </div>
              </div>
            </aside>

            <section className="min-h-0 bg-black/10">
              <div className="flex h-full min-h-[520px] flex-col lg:min-h-0">
                <div className="border-b border-white/10 px-4 py-4 sm:px-6">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-xs tracking-[0.18em] text-neutral-500">BODY EDITOR</p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">
                        {currentEpisodeLabel} の本文
                      </h2>
                      <p className="mt-2 text-sm leading-7 text-neutral-400">
                        本文フレームは固定しやすい形に寄せ、長くなったら本文欄の中でスクロールする。
                      </p>
                    </div>

                    <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-neutral-300">
                      本文中心レイアウト
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 p-4 sm:p-6">
                  <label className="flex h-full min-h-0 flex-col gap-3">
                    <span className="text-sm text-neutral-300">本文</span>
                    <textarea
                      value={body}
                      onChange={(event) => {
                        setBody(event.target.value);
                        resetNotice();
                      }}
                      placeholder="本文を入力"
                      className="h-full min-h-[420px] flex-1 resize-none overflow-y-auto rounded-[28px] border border-white/10 bg-white/5 px-5 py-4 text-sm leading-8 text-white outline-none placeholder:text-neutral-500 lg:min-h-0"
                    />
                  </label>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
