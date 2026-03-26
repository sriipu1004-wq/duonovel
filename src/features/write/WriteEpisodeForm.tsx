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

type EpisodePayload = Record<string, unknown>;

function createEpisodePayloads(args: {
  seriesId: string;
  episodeNumber: number;
  title: string;
  body: string;
  isPublished: boolean;
}): EpisodePayload[] {
  const { seriesId, episodeNumber, title, body, isPublished } = args;

  return [
    {
      series_id: seriesId,
      episode_number: episodeNumber,
      title,
      body,
      is_published: isPublished,
    },
    {
      series_id: seriesId,
      episode_number: episodeNumber,
      title,
      content: body,
      is_published: isPublished,
    },
    {
      series_id: seriesId,
      episode_number: episodeNumber,
      title,
      text: body,
      is_published: isPublished,
    },
    {
      series_id: seriesId,
      episode_number: episodeNumber,
      title,
      novel_text: body,
      is_published: isPublished,
    },
    {
      series_id: seriesId,
      episode_number: episodeNumber,
      title,
      body_text: body,
      is_published: isPublished,
    },
    {
      series_id: seriesId,
      episode_number: episodeNumber,
      title,
      body,
      published: isPublished,
    },
    {
      series_id: seriesId,
      episode_number: episodeNumber,
      title,
      content: body,
      published: isPublished,
    },
    {
      seriesId: seriesId,
      episodeNumber: episodeNumber,
      title,
      body,
      published: isPublished,
    },
    {
      seriesId: seriesId,
      episodeNumber: episodeNumber,
      title,
      content: body,
      published: isPublished,
    },
    {
      seriesId: seriesId,
      episodeNumber: episodeNumber,
      title,
      text: body,
      published: isPublished,
    },
  ];
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
  const [body, setBody] = useState(
  episode ? getEpisodeBody(episode) : ""
);
  const [isPublished, setIsPublished] = useState(
    episode ? isPublishedEpisode(episode) : false
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSubmit() {
    const parsedEpisodeNumber = Number(episodeNumber);
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();

    if (!Number.isFinite(parsedEpisodeNumber) || parsedEpisodeNumber <= 0) {
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

    const payloads = createEpisodePayloads({
      seriesId,
      episodeNumber: parsedEpisodeNumber,
      title: trimmedTitle,
      body: trimmedBody,
      isPublished,
    });

    let lastError = "話の保存に失敗した。";

    for (const payload of payloads) {
      const builder =
        mode === "create"
          ? supabase.from("episodes").insert(payload).select("id").single()
          : supabase.from("episodes").update(payload).eq("id", episode?.id ?? "");

      const result = await builder;

      if (!result.error) {
        const targetEpisodeId =
          mode === "create"
            ? (result.data as { id?: string } | null)?.id ?? null
            : episode?.id ?? null;

        setSaveState("success");
        setSuccessMessage(mode === "create" ? "話を作成した。" : "話を保存した。");

        if (targetEpisodeId) {
          router.push(`/write/series/${seriesId}/episodes/${targetEpisodeId}`);
        } else {
          router.push(`/write/series/${seriesId}`);
        }
        router.refresh();
        return;
      }

      lastError = result.error.message;
    }

    setSaveState("error");
    setErrorMessage(lastError);
  }

  const heading = mode === "create" ? "新しい話を追加する" : "話本文を編集する";
  const readHref =
    mode === "edit" && Number.isFinite(Number(episodeNumber)) && Number(episodeNumber) > 0
      ? `/read/${seriesId}/${Number(episodeNumber)}`
      : null;

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
            <p className="mt-3 text-sm leading-7 text-neutral-400">
              ここでは本文と公開状態を最小編集する。作品全体設定は管理画面に分離する。
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/write/series/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                作品執筆トップへ
              </Link>

              <Link
                href={`/manage/series/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                作品管理へ
              </Link>

              {readHref ? (
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

                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                  <input
                    type="checkbox"
                    checked={isPublished}
                    onChange={(event) => {
                      setIsPublished(event.target.checked);
                      setSaveState("idle");
                      setErrorMessage("");
                      setSuccessMessage("");
                    }}
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">公開する</p>
                    <p className="text-sm text-neutral-400">
                      オフなら下書き扱い。オンなら読む画面に出せる状態を狙う。
                    </p>
                  </div>
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
                      ? "話を作成"
                      : "話を保存"}
                </button>

                <Link
                  href={`/write/series/${seriesId}`}
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                >
                  一覧へ戻る
                </Link>
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

            {mode === "edit" && episode ? (
              <section className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">EPISODE</p>
                  <p className="mt-2 text-3xl font-semibold text-white">第{getEpisodeNumber(episode)}話</p>
                  <p className="mt-2 text-sm text-neutral-400">現在の話数</p>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">STATUS</p>
                  <p className="mt-2 text-3xl font-semibold text-white">
                    {isPublished ? "公開" : "下書き"}
                  </p>
                  <p className="mt-2 text-sm text-neutral-400">現在の公開状態</p>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">CHARACTERS</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{body.length}</p>
                  <p className="mt-2 text-sm text-neutral-400">本文文字数の目安</p>
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
