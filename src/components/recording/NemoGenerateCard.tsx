"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";

type NemoGenerateCardProps = {
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  episodeTitle: string;
  readHref: string;
};

type NemoGenerateResponse = {
  ok: boolean;
  recordingId?: string;
  audioStoragePath?: string;
  narratorName?: string;
  episodeNumber?: number;
  episodeTitle?: string;
  speakerId?: number;
  error?: string;
  detail?: string;
};

function buildReaderSpecificHref(baseHref: string, readerName: string): string {
  const [pathname, rawQuery = ""] = baseHref.split("?");
  const params = new URLSearchParams(rawQuery);

  params.set("readerName", readerName);

  const nextQuery = params.toString();
  return `${pathname}${nextQuery ? `?${nextQuery}` : ""}`;
}

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

export function NemoGenerateCard({
  seriesId,
  episodeId,
  episodeNumber,
  episodeTitle,
  readHref,
}: NemoGenerateCardProps) {
  const [narratorName, setNarratorName] = useState("VOICEVOX Nemo / ノーマル");
  const [speakerId, setSpeakerId] = useState("10005");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">(
    "idle"
  );
  const [message, setMessage] = useState(
    "選択中の話本文から、VOICEVOX Nemo で public recording を自動生成する。"
  );
  const [result, setResult] = useState<NemoGenerateResponse | null>(null);

  const submitLabel = useMemo(() => {
    if (status === "submitting") return "生成中...";
    return "VOICEVOX Nemo で生成する";
  }, [status]);

  function handleNarratorNameChange(event: ChangeEvent<HTMLInputElement>) {
    setNarratorName(event.target.value);
  }

  function handleSpeakerIdChange(event: ChangeEvent<HTMLInputElement>) {
    setSpeakerId(event.target.value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setStatus("submitting");
    setResult(null);
    setMessage(
      "Nemo Engine で音声生成 → storage 保存 → recordings 登録を順に実行中。"
    );

    try {
      const formData = new FormData();
      formData.append("seriesId", seriesId);
      formData.append("episodeId", episodeId);
      formData.append("narratorName", narratorName.trim() || "VOICEVOX Nemo / ノーマル");
      formData.append("speakerId", speakerId.trim() || "0");

      const response = await fetch("/api/recordings/nemo-generate", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | NemoGenerateResponse
        | null;

      if (!response.ok || !payload?.ok) {
        setStatus("error");
        setResult(payload);
        setMessage(
          payload?.detail
            ? `${payload?.error || "Nemo 生成に失敗した。"}\n${payload.detail}`
            : payload?.error || "Nemo 生成に失敗した。"
        );
        return;
      }

      setStatus("success");
      setResult(payload);
      setMessage(
        "生成成功。既存の works / read 導線からそのまま確認できる状態。"
      );
    } catch {
      setStatus("error");
      setResult(null);
      setMessage("通信中に想定外エラーが出た。");
    }
  }

  const resolvedReaderName = result?.narratorName || narratorName || "VOICEVOX Nemo / ノーマル";
  const generatedReadHref = buildReaderSpecificHref(readHref, resolvedReaderName);

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
              onChange={handleNarratorNameChange}
              placeholder="例: VOICEVOX Nemo / ノーマル"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-neutral-200">
              speakerId
            </span>
            <input
              value={speakerId}
              onChange={handleSpeakerIdChange}
              inputMode="numeric"
              placeholder="例: 0"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
            />
          </label>

          <div className="rounded-[20px] border border-white/10 bg-black/20 p-4 text-sm leading-7 text-neutral-300">
            この段階では 1話単位で本文全体をそのまま Nemo へ送る。
            長すぎる話の chunk 分割や再試行は、次段階でやる。
          </div>

          <div className="rounded-[20px] border border-white/10 bg-black/20 p-4 text-sm leading-7 text-neutral-300">
            公開前にはクレジット表記として
            「VOICEVOX」「VOICEVOX Nemo」を外向きページへ入れる前提。
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
              href={generatedReadHref}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
            >
              読む画面で確認する
            </Link>
          </div>
        </form>
      </div>

      <div
        className={[
          "rounded-[24px] border p-4",
          getToneClass(status),
        ].join(" ")}
      >
        <p className="text-xs tracking-[0.18em] opacity-80">
          NEMO GENERATION STATUS
        </p>
        <h3 className="mt-2 text-lg font-semibold text-white">{message}</h3>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
            <p className="text-xs tracking-[0.14em] text-neutral-500">NARRATOR</p>
            <p className="mt-2">{resolvedReaderName}</p>
          </div>

          <div className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">
            <p className="text-xs tracking-[0.14em] text-neutral-500">SPEAKER</p>
            <p className="mt-2">{result?.speakerId ?? speakerId}</p>
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
                href={generatedReadHref}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                生成した朗読で読む
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}