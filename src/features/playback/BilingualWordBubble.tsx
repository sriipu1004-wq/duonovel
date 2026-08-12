"use client";

import { useEffect, useRef, useState } from "react";

export type BilingualWordLookup = {
  segmentId: string;
  word: string;
  anchorX: number;
  anchorTop: number;
  anchorBottom: number;
};

type LookupResponse = {
  ok?: boolean;
  headword?: string | null;
  meanings?: string[];
};

export default function BilingualWordBubble({
  lookup,
  onClose,
}: {
  lookup: BilingualWordLookup;
  onClose: () => void;
}) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [headword, setHeadword] = useState<string | null>(null);
  const [meanings, setMeanings] = useState<string[]>([]);
  const showBelow = lookup.anchorTop < 180;

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/bilingual-word-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: lookup.word }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as LookupResponse;
        if (!response.ok || !payload.ok) throw new Error("lookup_failed");
        setHeadword(payload.headword ?? null);
        setMeanings(Array.isArray(payload.meanings) ? payload.meanings : []);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setStatus("error");
      });

    return () => controller.abort();
  }, [lookup.word]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && bubbleRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", onClose);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={bubbleRef}
      role="dialog"
      aria-label={`${lookup.word}の日本語訳`}
      className="fixed z-[70] w-[min(18rem,calc(100vw-1.5rem))] text-white"
      style={{
        left: lookup.anchorX,
        top: showBelow ? lookup.anchorBottom + 10 : lookup.anchorTop - 10,
        transform: showBelow ? "translate(-50%, 0)" : "translate(-50%, -100%)",
      }}
    >
      <span
        aria-hidden="true"
        className={[
          "absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-neutral-900",
          showBelow ? "-top-1.5" : "-bottom-1.5",
        ].join(" ")}
      />

      <div className="relative max-h-56 overflow-y-auto rounded-2xl bg-neutral-900 px-4 py-3 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold leading-6">{lookup.word}</p>
            {headword && headword.toLowerCase() !== lookup.word.toLowerCase() ? (
              <p className="text-[11px] text-neutral-400">原形: {headword}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="単語訳を閉じる"
            onClick={onClose}
            className="-mr-1 shrink-0 rounded-full px-2 py-0.5 text-base text-neutral-300 transition hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="mt-2 text-sm leading-6 text-neutral-100" aria-live="polite">
          {status === "loading" ? (
            <p className="text-neutral-400">辞書を確認中…</p>
          ) : status === "error" ? (
            <p>単語訳を取得できませんでした。</p>
          ) : meanings.length === 0 ? (
            <p>辞書に見つかりませんでした。</p>
          ) : (
            <ul className="space-y-1">
              {meanings.map((meaning) => (
                <li key={meaning} className="break-words">
                  {meaning}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
