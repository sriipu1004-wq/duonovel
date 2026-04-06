"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";

type VoicepeakImportCardProps = {
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  episodeTitle: string;
  readHref: string;
};

type VoicepeakImportResponse = {
  ok: boolean;
  recordingId?: string;
  audioStoragePath?: string;
  narratorName?: string;
  episodeNumber?: number;
  episodeTitle?: string;
  error?: string;
  result?: {
    message?: string;
  };
};

function getToneClass(status: "idle" | "submitting" | "success" | "error") {
  if (status === "success") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
  }

  if (status === "error") {
    return "border-rose-400/30 bg-rose-400/10 text-rose-100";
  }

  if (status === "submitting") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  }

  return "border-white/10 bg-white/[0.03] text-neutral-300";
}

export function VoicepeakImportCard({
  seriesId,
  episodeId,
  episodeNumber,
  episodeTitle,
  readHref,
}: VoicepeakImportCardProps) {
  const [narratorName, setNarratorName] = useState("VOICEPEAK / 女声1");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">(
    "idle"
  );
  const [message, setMessage] = useState(
    "VOICEPEAK で作った声だけの音源を、そのまま public recording として登録する。"
  );
  const [result, setResult] = useState<VoicepeakImportResponse | null>(null);

  const submitLabel = useMemo(() => {
    if (status === "submitting") return "取り込み中...";
    return "VOICEPEAK 音声を登録する";
  }, [status]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setResult(null);
    setStatus("idle");
    setMessage(
      file
        ? "ファイルを選んだ。登録すると server 側で再チェックしてから storage + recordings へ載せる。"
        : "VOICEPEAK で作った声だけの音源を、そのまま public recording として登録する。"
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile) {
      setStatus("error");
      setResult(null);
      setMessage("先に音声ファイルを選んで。");
      return;
    }

    setStatus("submitting");
    setResult(null);
    setMessage("server 側で保存前チェック → storage 保存 → recordings 登録を順に実行中。");

    try {
      const formData = new FormData();
      formData.append("seriesId", seriesId);
      formData.append("episodeId", episodeId);
      formData.append("narratorName", narratorName.trim() || "VOICEPEAK");
      formData.append("audio", selectedFile);

      const response = await fetch("/api/recordings/voicepeak-import", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | VoicepeakImportResponse
        | null;

      if (!response.ok || !payload?.ok) {
        setStatus("error");
        setResult(payload);
        setMessage(
          payload?.error ||
            payload?.result?.message ||
            "取り込みに失敗した。"
        );
        return;
      }

      setStatus("success");
      setResult(payload);
      setMessage(
        "取り込み成功。既存の works / read 導線からそのまま確認できる状態。"
      );
    } catch {
      setStatus("error");
      setResult(null);
      setMessage("通信中に想定外エラーが出た。");
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-300">
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
            対象話: 第{episodeNumber}話
          </span>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
            {episodeTitle}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-neutral-200">
              朗読者表示名
            </span>
            <input
              value={narratorName}
              onChange={(event) => setNarratorName(event.target.value)}
              placeholder="例: VOICEPEAK / 女声1"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-neutral-200">
              音声ファイル
            </span>
            <input
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg,.aac,.flac"
              onChange={handleFileChange}
              className="block w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-neutral-200 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black"
            />
          </label>

          <div className="rounded-[20px] border border-white/10 bg-black/20 p-4 text-sm leading-7 text-neutral-300">
            BGM は音源に混ぜず、VOICEPEAK の声だけを書き出して登録する。
            既存 BGM が必要なら作品 / 話側の設定で後付けする前提に戻す。
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={status === "submitting"}
              className={[
                "rounded-full px-5 py-3 text-sm font-semibold transition",
                status === "submitting"
                  ? "cursor-wait bg-white text-black opacity-70"
                  : "bg-white text-black hover:opacity-90",
              ].join(" ")}
            >
              {submitLabel}
            </button>

            <Link
              href={readHref}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
            >
              読む画面で確認する
            </Link>
          </div>

          <p className="text-xs leading-6 text-neutral-500">
            ここでは public recording として登録する最小導線だけ扱う。
          </p>
        </form>
      </div>

      <div
        className={[
          "rounded-[24px] border p-4",
          getToneClass(status),
        ].join(" ")}
      >
        <p className="text-xs tracking-[0.18em] opacity-80">VOICEPEAK IMPORT STATUS</p>
        <h3 className="mt-2 text-lg font-semibold text-white">{message}</h3>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
            <p className="text-xs tracking-[0.14em] text-neutral-500">FILE</p>
            <p className="mt-2">{selectedFile?.name || "未選択"}</p>
          </div>

          <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
            <p className="text-xs tracking-[0.14em] text-neutral-500">NARRATOR</p>
            <p className="mt-2">{narratorName || "未入力"}</p>
          </div>
        </div>

        {result?.recordingId ? (
          <div className="mt-4 rounded-[20px] border border-white/10 bg-black/20 p-4 text-sm leading-7 text-neutral-200">
            <p>recordingId: {result.recordingId}</p>
            <p className="mt-2 break-all">
              audioStoragePath: {result.audioStoragePath}
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={readHref}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                読む画面へ
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}