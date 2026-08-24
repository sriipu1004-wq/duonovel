"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";

type BilingualDividerProps = {
  splitRatio: number;
  onSplitRatioChange: (ratio: number) => void;
  onSwapLanguages: () => void;
};

function clampRatio(value: number): number {
  return Math.min(80, Math.max(20, value));
}

export default function BilingualDivider({
  splitRatio,
  onSplitRatioChange,
  onSwapLanguages,
}: BilingualDividerProps) {
  const draggingRef = useRef(false);

  function resolveRatio(event: ReactPointerEvent<HTMLDivElement>): number | null {
    const parent = event.currentTarget.parentElement;
    if (!parent) return null;

    const rect = parent.getBoundingClientRect();
    const usableHeight = Math.max(1, rect.height - 44);
    const relativeY = event.clientY - rect.top - 22;
    return clampRatio((relativeY / usableHeight) * 100);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const nextRatio = resolveRatio(event);
    if (nextRatio !== null) onSplitRatioChange(nextRatio);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const nextRatio = resolveRatio(event);
    if (nextRatio !== null) onSplitRatioChange(nextRatio);
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      role="separator"
      aria-label="原文と対訳の表示比率"
      aria-valuemin={20}
      aria-valuemax={80}
      aria-valuenow={Math.round(splitRatio)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      className="relative z-20 flex h-11 touch-none select-none items-center justify-center bg-white"
    >
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-black/15" />
      <button
        type="button"
        aria-label="原文と対訳の上下を入れ替える"
        title="上下を入れ替える"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onSwapLanguages();
        }}
        className="relative z-10 flex h-11 min-w-14 items-center justify-center rounded-full border border-black/15 bg-white px-4 text-sm font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50 active:scale-95"
      >
        ⇅
      </button>
    </div>
  );
}
